import type { ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import { isDeepStrictEqual } from 'node:util'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { createVariableIdentities, parseVariableIdentities, validateVariableIdentityState } from '@shared/foundation/variables/identity'

export interface ConversationRuntimeState {
  variableStateJson: string
  settingLibraryStateJson: string
  variableIdentityJson?: string
}

export interface ConversationStateSnapshot {
  conversationId: string
  branchId: string
  runtimeSessionId: string
  boundaryType: 'turn' | 'input' | 'reply' | 'opening'
  boundaryId: string
  phase: 'before' | 'after'
  turn: number | null
  variableStateJson: string | null
  settingLibraryStateJson: string | null
  variableIdentityJson?: string
}

export function validateRuntimeState(state: {
  variableStateJson: string | null
  settingLibraryStateJson: string | null
  variableIdentityJson?: string
}): void {
  if (state.variableIdentityJson !== undefined && state.variableStateJson !== null) validateVariableIdentityState(JSON.parse(state.variableStateJson), parseVariableIdentities(state.variableIdentityJson))
  if (state.variableStateJson !== null) {
    const value: unknown = JSON.parse(state.variableStateJson)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '历史变量状态必须是 JSON object。', { what: '历史变量状态' })
  }
  if (state.settingLibraryStateJson !== null) {
    const rows: unknown = JSON.parse(state.settingLibraryStateJson)
    if (!Array.isArray(rows)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '历史设定状态必须是 JSON array。', { what: '历史设定状态' })
    const ids = new Set<string>()
    for (const value of rows) {
      const row = value as Record<string, unknown>
      if (!row || typeof row !== 'object' || Array.isArray(row) || !['entry', 'group'].includes(String(row.targetType))
        || !['upsert', 'delete'].includes(String(row.operation)) || typeof row.targetId !== 'string' || !row.targetId
        || typeof row.payloadJson !== 'string' || typeof row.updatedAt !== 'string' || !row.updatedAt) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '历史设定差异的标识或操作不正确。', { what: '历史设定差异' })
      }
      JSON.parse(row.payloadJson)
      const id = `${row.targetType}:${row.targetId}`
      if (ids.has(id)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, '历史设定差异包含重复目标。', { what: '历史设定差异的目标' })
      ids.add(id)
    }
  }
}

/** 产品状态按正式会话与边界保存；正文和执行轨迹仍属于 DSH Session。 */
export class ConversationStateRepository {
  constructor(private readonly store: ElecKoiSqliteStore) {}

  private branch(conversationId: string): string {
    const row = this.store.native.prepare('SELECT activeBranchId FROM agent_conversations WHERE id=?')
      .get(conversationId) as { activeBranchId: string } | undefined
    if (!row) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到聊天状态所属的会话。', { what: '会话' })
    return row.activeBranchId
  }

  list(conversationId: string): ConversationStateSnapshot[] {
    return this.store.native.prepare(`SELECT * FROM conversation_state_snapshots
      WHERE conversationId=? AND branchId=? ORDER BY runtimeSessionId,turn,phase,boundaryType,boundaryId`)
      .all(conversationId, this.branch(conversationId)) as ConversationStateSnapshot[]
  }

  recordTurn(conversationId: string, runtimeSessionId: string, turn: number,
    phase: 'before' | 'after', state: { variableStateJson: string | null; settingLibraryStateJson: string | null; variableIdentityJson?: string }): void {
    if (!runtimeSessionId || !Number.isSafeInteger(turn) || turn < 1) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '聊天状态缺少有效的 Session 与轮次。', { field: 'runtimeSessionId' })
    validateRuntimeState(state)
    this.insert({ conversationId, branchId: this.branch(conversationId), runtimeSessionId,
      boundaryType: 'turn', boundaryId: String(turn), phase, turn, ...state })
  }

  recordInput(conversationId: string, runtimeSessionId: string, messageId: string,
    state: { variableStateJson: string | null; settingLibraryStateJson: string | null; variableIdentityJson?: string }): void {
    if (!runtimeSessionId || !messageId) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '输入状态缺少正式消息标识。', { field: 'messageId' })
    validateRuntimeState(state)
    this.insert({ conversationId, branchId: this.branch(conversationId), runtimeSessionId,
      boundaryType: 'input', boundaryId: messageId, phase: 'before', turn: null, ...state })
  }

  private insert(snapshot: ConversationStateSnapshot): void {
    snapshot = { ...snapshot, variableIdentityJson: snapshot.variableIdentityJson ?? JSON.stringify(snapshot.variableStateJson === null ? {} : createVariableIdentities(JSON.parse(snapshot.variableStateJson), { versionId: '', objects: [], variables: [] }, 'runtime')) }
    if (snapshot.boundaryType === 'turn' && snapshot.phase === 'after') {
      const existing = this.store.native.prepare(`SELECT variableStateJson,settingLibraryStateJson,variableIdentityJson FROM conversation_state_snapshots
        WHERE conversationId=? AND branchId=? AND runtimeSessionId=? AND boundaryType='turn' AND boundaryId=? AND phase='after'`)
        .get(snapshot.conversationId, snapshot.branchId, snapshot.runtimeSessionId, snapshot.boundaryId) as ConversationRuntimeState | undefined
      const parsed = (raw: string | null) => raw === null ? null : JSON.parse(raw)
      if (existing && (!isDeepStrictEqual(parsed(existing.variableStateJson), parsed(snapshot.variableStateJson))
        || !isDeepStrictEqual(parsed(existing.settingLibraryStateJson), parsed(snapshot.settingLibraryStateJson))
        || (existing.variableIdentityJson || '{}') !== (snapshot.variableIdentityJson || '{}'))) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '已完成轮次的历史状态不能覆盖；重新生成必须先回退该轮次。', { what: '回退这一轮' })
      }
      if (existing) return
    }
    this.store.native.prepare(`INSERT INTO conversation_state_snapshots
      (conversationId,branchId,runtimeSessionId,boundaryType,boundaryId,phase,turn,variableStateJson,settingLibraryStateJson,variableIdentityJson)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(conversationId,branchId,runtimeSessionId,boundaryType,boundaryId,phase)
      DO UPDATE SET turn=excluded.turn,variableStateJson=excluded.variableStateJson,settingLibraryStateJson=excluded.settingLibraryStateJson,variableIdentityJson=excluded.variableIdentityJson`)
      .run(snapshot.conversationId, snapshot.branchId, snapshot.runtimeSessionId, snapshot.boundaryType,
        snapshot.boundaryId, snapshot.phase, snapshot.turn, snapshot.variableStateJson, snapshot.settingLibraryStateJson, snapshot.variableIdentityJson || '{}')
  }

  replace(conversationId: string, snapshots: ConversationStateSnapshot[]): void {
    const branchId = this.branch(conversationId)
    for (const snapshot of snapshots) {
      if (snapshot.conversationId !== conversationId || snapshot.branchId !== branchId) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '历史状态与当前聊天分支不匹配。', { what: '历史状态与当前聊天分支' })
      validateRuntimeState(snapshot)
    }
    this.store.withWriteTx(() => {
      this.store.native.prepare('DELETE FROM conversation_state_snapshots WHERE conversationId=? AND branchId=?')
        .run(conversationId, branchId)
      for (const snapshot of snapshots) this.insert(snapshot)
    })
  }

  private candidates(conversationId: string, runtimeSessionId: string, turn: number, phase: 'before' | 'after') {
    const rows = this.list(conversationId).filter(row => row.runtimeSessionId === runtimeSessionId && row.turn === turn && row.phase === phase)
    const canonical = rows.filter(row => row.boundaryType === 'turn')
    if (canonical.length) return canonical
    if (phase === 'before') return rows.filter(row => row.boundaryType === 'input')
    return rows.filter(row => row.boundaryType === 'reply' && Boolean(this.store.native.prepare(
      "SELECT 1 FROM agent_responses WHERE conversationId=? AND id=? AND status='completed'").get(conversationId, row.boundaryId)))
  }

  variableHistory(conversationId: string, runtimeSessionId: string): Array<{ messageId: string; turn: number; variableStateJson: string }> {
    const rows = this.store.native.prepare(`SELECT s.* FROM conversation_state_snapshots s
      LEFT JOIN agent_responses r ON s.boundaryType='reply' AND r.id=s.boundaryId AND r.conversationId=s.conversationId
      WHERE s.conversationId=? AND s.branchId=? AND s.runtimeSessionId=? AND s.phase='after' AND s.turn IS NOT NULL
        AND (s.boundaryType='turn' OR (s.boundaryType='reply' AND r.status='completed')) ORDER BY s.turn,s.boundaryType,s.boundaryId`)
      .all(conversationId, this.branch(conversationId), runtimeSessionId) as ConversationStateSnapshot[]
    const grouped = new Map<number, ConversationStateSnapshot[]>()
    for (const row of rows) {
      const values = grouped.get(row.turn!) ?? []; values.push(row); grouped.set(row.turn!, values)
    }
    return [...grouped].flatMap(([turn, values]) => {
      const canonical = values.filter(row => row.boundaryType === 'turn')
      return (canonical.length ? canonical : values).filter(row => row.variableStateJson !== null)
        .map(row => ({ messageId: row.boundaryId, turn, variableStateJson: row.variableStateJson! }))
    })
  }

  variablesByTurn(conversationId: string, runtimeSessionId: string): Record<string, string> {
    const grouped = new Map<number, string[]>()
    for (const row of this.variableHistory(conversationId, runtimeSessionId)) {
      const values = grouped.get(row.turn) ?? []
      values.push(row.variableStateJson); grouped.set(row.turn, values)
    }
    return Object.fromEntries([...grouped].filter(([, values]) => values.length === 1).map(([turn, values]) => [String(turn), values[0]!]))
  }

  read(conversationId: string, runtimeSessionId: string, turn: number, phase: 'before' | 'after', inputId?: string): ConversationRuntimeState {
    let rows: ConversationStateSnapshot[] = []
    if (phase === 'before' && inputId) rows = this.list(conversationId).filter(row => row.runtimeSessionId === runtimeSessionId
      && row.boundaryType === 'input' && row.boundaryId === inputId && row.phase === 'before')
    if (!rows.length) rows = this.candidates(conversationId, runtimeSessionId, turn, phase)
    if (rows.length > 1) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, `第 ${turn} 轮对应多个历史状态，不能任意选择；现有数据未修改。`, { what: '这一轮的历史状态' })
    const state = rows[0]
    if (!state || state.variableStateJson === null || state.settingLibraryStateJson === null) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `缺少第 ${turn} 轮${phase === 'before' ? '之前' : '完成后'}的历史运行状态，未修改聊天。`, { what: '这一轮的历史运行状态' })
    }
    validateRuntimeState(state)
    return { variableStateJson: state.variableStateJson, settingLibraryStateJson: state.settingLibraryStateJson, variableIdentityJson: state.variableIdentityJson || '{}' }
  }

  trim(conversationId: string, runtimeSessionId: string, fromTurn: number, retainedInputIds?: readonly string[]): void {
    this.store.native.prepare(`DELETE FROM conversation_state_snapshots WHERE conversationId=? AND branchId=?
      AND runtimeSessionId=? AND (turn>? OR (turn=? AND phase='after'))`)
      .run(conversationId, this.branch(conversationId), runtimeSessionId, fromTurn, fromTurn)
    if (retainedInputIds !== undefined) {
      const retained = new Set(retainedInputIds)
      const remove = this.store.native.prepare(`DELETE FROM conversation_state_snapshots WHERE conversationId=? AND branchId=?
        AND runtimeSessionId=? AND boundaryType='input' AND boundaryId=?`)
      for (const row of this.list(conversationId)) if (row.runtimeSessionId === runtimeSessionId && row.boundaryType === 'input'
        && !retained.has(row.boundaryId)) remove.run(conversationId, row.branchId, runtimeSessionId, row.boundaryId)
    }
  }
}
