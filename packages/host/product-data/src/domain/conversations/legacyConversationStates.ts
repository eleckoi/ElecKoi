import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { validateRuntimeState } from './ConversationStateRepository'

type Row = Record<string, string | number | null>

function stringCell(row: Row, key: string, allowEmpty = false): string {
  const value = row[key]
  if (typeof value !== 'string' || (!allowEmpty && !value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, `旧聊天数据缺少有效字段 ${key}。`, { what: '旧聊天数据' })
  return value
}

/**
 * 只转换旧账本明确保存的值；未记录的设定或轮次保持缺失。
 * RETIRE WHEN: 停止支持 v11 及更早数据库及含旧状态表的开发库升级，且停止导入聊天归档 v1。
 * 删除本转换、0012 的旧表转换调用、归档 v1 分支和专用回归；保留当前状态存储与归档 v2。
 */
export function legacyConversationStates(tables: Record<string, Row[]>): Row[] {
  const conversationRows = (tables.agent_conversations ?? []).map(row => ({ ...row,
    id: stringCell(row, 'id'), runtimeThreadId: stringCell(row, 'runtimeThreadId', true) }))
  const branchRows = (tables.agent_branches ?? []).map(row => ({ ...row,
    id: stringCell(row, 'id'), conversationId: stringCell(row, 'conversationId') }))
  const inputRows = (tables.agent_turns ?? []).map(row => ({ ...row, id: stringCell(row, 'id'),
    conversationId: stringCell(row, 'conversationId'), kind: stringCell(row, 'kind'), variableStateJson: stringCell(row, 'variableStateJson', true) }))
  const replyRows = (tables.agent_responses ?? []).map(row => {
    if (row.dshTurn !== null && (typeof row.dshTurn !== 'number' || !Number.isSafeInteger(row.dshTurn) || row.dshTurn < 1)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧回复的正式轮次不正确。', { what: '旧回复的正式轮次' })
    }
    return { ...row, id: stringCell(row, 'id'), conversationId: stringCell(row, 'conversationId'),
      turnId: stringCell(row, 'turnId'), runtimeThreadId: stringCell(row, 'runtimeThreadId', true),
      dshTurn: row.dshTurn, status: stringCell(row, 'status'), variableStateJson: stringCell(row, 'variableStateJson', true) }
  })
  const conversations = new Map(conversationRows.map(row => [row.id, row]))
  const branches = new Map(branchRows.map(row => [row.id, row]))
  const turns = new Map(inputRows.map(row => [row.id, row]))
  const placements = new Map<string, Array<{ branchId: string; turnId: string }>>()
  for (const row of tables.agent_branch_turns ?? []) {
    const placement = { branchId: stringCell(row, 'branchId'), turnId: stringCell(row, 'turnId') }
    const values = placements.get(placement.turnId) ?? []; values.push(placement); placements.set(placement.turnId, values)
  }
  const responses = new Map<string, typeof replyRows>()
  for (const row of replyRows) {
    const values = responses.get(row.turnId) ?? []; values.push(row); responses.set(row.turnId, values)
  }
  const repliesById = new Map(replyRows.map(row => [row.id, row]))
  const settings = new Map<string, Row>()
  for (const row of tables.agent_setting_snapshots ?? []) {
    const ownerId = stringCell(row, 'ownerId')
    const owner = row.ownerType === 'turn' ? turns.get(ownerId) : row.ownerType === 'response' ? repliesById.get(ownerId) : undefined
    if (!owner || owner.conversationId !== row.conversationId) throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧设定快照缺少明确的消息归属，未删除数据。', { what: '旧设定快照的消息归属' })
    settings.set(`${row.ownerType}:${ownerId}`, row)
  }
  const result: Row[] = []
  for (const input of turns.values()) {
    const conversation = conversations.get(input.conversationId)
    if (!conversation || typeof input.variableStateJson !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧输入状态缺少有效的聊天归属或变量记录。', { what: '旧输入状态的聊天归属或变量记录' })
    const owners = responses.get(input.id) ?? []
    const sessions = new Set(owners.map(row => row.runtimeThreadId).filter((id): id is string => typeof id === 'string' && !!id))
    if (typeof conversation.runtimeThreadId === 'string' && conversation.runtimeThreadId) sessions.add(conversation.runtimeThreadId)
    for (const placement of placements.get(input.id) ?? []) {
      if (branches.get(placement.branchId)?.conversationId !== input.conversationId) throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧输入状态与分支归属不一致。', { what: '旧输入状态与分支归属' })
      for (const runtimeSessionId of sessions) {
        const numbers = new Set(owners.filter(row => row.runtimeThreadId === runtimeSessionId && row.dshTurn !== null).map(row => row.dshTurn))
        const turn = numbers.size === 1 ? [...numbers][0]! : null
        const state = { variableStateJson: input.variableStateJson,
          settingLibraryStateJson: settings.get(`turn:${input.id}`)?.stateJson ?? null }
        if (state.settingLibraryStateJson !== null && typeof state.settingLibraryStateJson !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧设定快照格式不正确。', { what: '旧设定快照' })
        validateRuntimeState(state as { variableStateJson: string; settingLibraryStateJson: string | null })
        if (input.kind !== 'opening' && input.kind !== 'user') throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧输入状态的轮次种类不受支持。', { what: '旧输入状态的轮次种类', expected: 'opening 或 user' })
        result.push({ conversationId: input.conversationId, branchId: placement.branchId, runtimeSessionId,
          boundaryType: input.kind === 'opening' ? 'opening' : 'input', boundaryId: input.id,
          phase: 'before', turn, ...state })
      }
    }
  }
  for (const reply of replyRows) {
    const input = turns.get(reply.turnId)
    if (!input || input.conversationId !== reply.conversationId || typeof reply.variableStateJson !== 'string') {
      throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧回复状态与输入归属不一致。', { what: '旧回复状态的输入归属' })
    }
    const state = { variableStateJson: reply.variableStateJson,
      settingLibraryStateJson: settings.get(`response:${reply.id}`)?.stateJson ?? null }
    if (state.settingLibraryStateJson !== null && typeof state.settingLibraryStateJson !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧设定快照格式不正确。', { what: '旧设定快照' })
    validateRuntimeState(state as { variableStateJson: string; settingLibraryStateJson: string | null })
    for (const placement of placements.get(reply.turnId) ?? []) result.push({
      conversationId: reply.conversationId, branchId: placement.branchId, runtimeSessionId: reply.runtimeThreadId,
      boundaryType: 'reply', boundaryId: reply.id, phase: 'after', turn: reply.dshTurn, ...state
    })
  }
  // 旧回复账本与 DSH 轮次不是一对一。缺少明确绑定或同轮有多个完成回复时，
  // 按当前整理规则丢弃该轮次的旧变量/设定历史；正文和消息关系仍完整保留。
  const completed = new Set(replyRows.filter(row => row.status === 'completed').map(row => row.id))
  const identities = new Map<string, number>()
  const key = (row: Row) => JSON.stringify([row.conversationId, row.branchId, row.runtimeSessionId, row.turn])
  for (const row of result) if (row.boundaryType === 'reply' && typeof row.boundaryId === 'string' && completed.has(row.boundaryId)
    && typeof row.turn === 'number' && row.runtimeSessionId) identities.set(key(row), (identities.get(key(row)) ?? 0) + 1)
  return result.filter(row => row.boundaryType !== 'reply' || (typeof row.boundaryId === 'string' && completed.has(row.boundaryId)
    && typeof row.turn === 'number' && row.runtimeSessionId && identities.get(key(row)) === 1))
}
