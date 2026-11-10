import { randomUUID } from 'node:crypto'
import type { ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import { legacyConversationStates } from './legacyConversationStates'
import { validateRuntimeState } from './ConversationStateRepository'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { createVariableIdentities, parseVariableIdentities } from '@shared/foundation/variables/identity'
import { legacyVariableIdentityConfig, upgradeLegacyOpeningIdentities } from '@product-data/storage/sqlite/migrations/0017VariableIdentity'

type Cell = string | number | null
type Row = Record<string, Cell>

const TABLES = [
  'chat_sessions', 'chat_session_character_snapshots', 'chat_session_variable_states',
  'agent_conversations', 'agent_branches', 'conversation_speakers', 'agent_turns',
  'agent_responses', 'agent_branch_turns', 'agent_openings', 'conversation_state_snapshots'
] as const
type Table = typeof TABLES[number]

export interface ConversationArchiveSnapshot {
  format: 'eleckoi.desktop-conversation'
  version: 3
  characterId: string
  conversationId: string
  settingLibraryStateJson: string | null
  tables: Record<Table, Row[]>
}

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录数据格式不正确。', { what: '聊天记录' })
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.values(item).some((cell) => cell !== null && typeof cell !== 'string' && typeof cell !== 'number')) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录数据格式不正确。', { what: '聊天记录' })
    }
    return item as Row
  })
}

export class ConversationArchiveRepository {
  constructor(private readonly store: ElecKoiSqliteStore, private readonly settings: {
    read(conversationId: string): string
    restore(conversationId: string, stateJson: string): void
  }) {}

  export(conversationId: string): ConversationArchiveSnapshot {
    const session = this.store.native.prepare('SELECT * FROM chat_sessions WHERE id=?').get(conversationId) as Row | undefined
    if (!session || typeof session.characterId !== 'string' || !session.characterId) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到所属角色的聊天记录。', { what: '所属角色的聊天记录' })
    }
    const tables = {} as Record<Table, Row[]>
    for (const table of TABLES) {
      const key = table === 'chat_sessions' || table === 'agent_conversations' ? 'id'
        : table === 'agent_branch_turns' ? ''
          : table === 'chat_session_character_snapshots' || table === 'chat_session_variable_states'
            ? 'sessionId' : 'conversationId'
      tables[table] = table === 'agent_branch_turns'
        ? this.store.native.prepare(`SELECT p.* FROM agent_branch_turns p JOIN agent_branches b ON b.id=p.branchId WHERE b.conversationId=? ORDER BY p.branchId,p.sequence`).all(conversationId) as Row[]
        : this.store.native.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).all(conversationId) as Row[]
    }
    return { format: 'eleckoi.desktop-conversation', version: 3,
      characterId: session.characterId, conversationId, settingLibraryStateJson: this.settings.read(conversationId), tables }
  }

  parse(value: unknown): ConversationArchiveSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录文件格式不正确。', { what: '聊天记录文件' })
    const archive = value as Partial<Omit<ConversationArchiveSnapshot, 'version'>> & { version?: number }
    if (archive.format !== 'eleckoi.desktop-conversation' || ![1, 2, 3].includes(archive.version!)
      || typeof archive.characterId !== 'string' || !archive.characterId
      || typeof archive.conversationId !== 'string' || !archive.conversationId
      || !archive.tables || typeof archive.tables !== 'object') {
      throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '不支持此聊天记录文件。', { what: '聊天记录文件的格式或版本' })
    }
    const tables = {} as Record<Table, Row[]>
    // RETIRE WHEN: 停止导入聊天归档 v1 后，删除此转换、版本白名单中的 1、下方 v1
    // 设定状态分支及专用归档回归；legacyConversationStates 仍有数据库调用时继续保留。
    if (archive.version === 1) {
      const previous = Object.fromEntries([...TABLES.filter(table => table !== 'conversation_state_snapshots'), 'agent_setting_snapshots']
        .map(table => [table, rows((archive.tables as Record<string, unknown>)[table])]))
      const history = legacyConversationStates(previous)
      for (const table of TABLES) {
        tables[table] = table === 'conversation_state_snapshots' ? history
          : table === 'agent_responses' ? previous[table]!.map(({ variableStateJson: _variables, storedRegexRulesJson: _regex, ...row }) => row)
            : previous[table]!
      }
    } else for (const table of TABLES) tables[table] = rows(archive.tables[table])
    // RETIRE WHEN: v1/v2 conversation imports retire; remove this conversion and
    // legacyVariableIdentityConfig once its database migration also retires.
    if (archive.version! < 3) {
      const variableVersionId = tables.agent_conversations[0]?.variableVersionId
      const config = legacyVariableIdentityConfig(this.store.native, '', { characterId: archive.characterId,
        variableVersionId: typeof variableVersionId === 'string' ? variableVersionId : '' })
      for (const row of tables.chat_session_variable_states) row.identityJson = JSON.stringify(createVariableIdentities(JSON.parse(String(row.stateJson)), config, 'runtime'))
      for (const row of tables.conversation_state_snapshots) row.variableIdentityJson = JSON.stringify(row.variableStateJson === null ? {} : createVariableIdentities(JSON.parse(String(row.variableStateJson)), config, 'runtime'))
      for (const row of tables.agent_openings) row.payloadJson = upgradeLegacyOpeningIdentities(this.store.native, archive.characterId, String(row.payloadJson))
    }
    for (const row of tables.chat_session_variable_states) {
      if (typeof row.identityJson !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天归档缺少变量来源。', { what: '变量来源' })
      parseVariableIdentities(row.identityJson)
    }
    if (tables.chat_sessions.length !== 1 || tables.chat_sessions[0]?.id !== archive.conversationId
      || tables.chat_sessions[0]?.characterId !== archive.characterId
      || tables.agent_conversations.length !== 1
      || tables.agent_conversations[0]?.id !== archive.conversationId) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '聊天记录中的会话身份不一致。', { what: '聊天记录里的会话身份' })
    }
    const branches = new Set(tables.agent_branches.map((row) => row.id))
    if (!branches.has(tables.agent_conversations[0]?.activeBranchId)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录缺少活动分支。', { what: '聊天记录的活动分支' })
    for (const table of TABLES) {
      if (table === 'agent_branch_turns') {
        if (tables[table].some((row) => !branches.has(row.branchId))) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '聊天记录分支不匹配。', { what: '聊天记录的分支归属' })
        continue
      }
      const key = table === 'chat_sessions' || table === 'agent_conversations' ? 'id'
        : table === 'chat_session_character_snapshots' || table === 'chat_session_variable_states'
          ? 'sessionId' : 'conversationId'
      if (tables[table].some((row) => row[key] !== archive.conversationId)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '聊天记录包含其他会话的数据。', { what: '其它会话的数据' })
      }
    }
    if (tables.conversation_state_snapshots.some(row => !branches.has(row.branchId))) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '聊天状态的分支归属不匹配。', { what: '聊天状态的分支归属' })
    for (const state of tables.conversation_state_snapshots) {
      if ((state.variableStateJson !== null && typeof state.variableStateJson !== 'string')
        || (state.settingLibraryStateJson !== null && typeof state.settingLibraryStateJson !== 'string')) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '历史状态格式不正确。', { what: '历史状态' })
      validateRuntimeState(state as { variableStateJson: string | null; settingLibraryStateJson: string | null })
    }
    const settingLibraryStateJson = archive.version === 1 ? null : archive.settingLibraryStateJson
    if (archive.version! >= 2 && typeof settingLibraryStateJson !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天归档缺少当前分支设定状态。', { what: '聊天归档的分支设定状态' })
    if (settingLibraryStateJson !== null) validateRuntimeState({ variableStateJson: null, settingLibraryStateJson: settingLibraryStateJson! })
    return { ...archive, version: 3, settingLibraryStateJson, tables } as ConversationArchiveSnapshot
  }

  runtimeThreadIds(snapshot: ConversationArchiveSnapshot): string[] {
    return [...new Set([
      snapshot.tables.agent_conversations[0]?.runtimeThreadId,
      ...snapshot.tables.agent_responses.map((row) => row.runtimeThreadId),
      ...snapshot.tables.conversation_state_snapshots.map(row => row.runtimeSessionId)
    ].filter((id): id is string => typeof id === 'string' && id.length > 0))]
  }

  requiredRuntimeThreadIds(snapshot: ConversationArchiveSnapshot): string[] {
    return this.runtimeThreadIds(snapshot)
  }

  import(snapshot: ConversationArchiveSnapshot, characterId: string, runtimeIds: ReadonlyMap<string, string>, conversationId: string = randomUUID(), options: { preserveIds?: boolean } = {}): string {
    if (snapshot.characterId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '聊天记录与当前角色不匹配。', { what: '聊天记录与角色' })
    const character = this.store.native.prepare('SELECT id,name,avatar FROM characters WHERE id=?').get(characterId) as
      { id: string; name: string; avatar: string } | undefined
    if (!character) throw new DesktopError(ELECKOI_FAILURE_CODES.characterNotFound, '当前角色不存在，无法导入聊天记录。', { what: '当前角色' })
    const ids = new Map<string, string>([[snapshot.conversationId, conversationId]])
    for (const table of ['agent_branches', 'conversation_speakers', 'agent_turns', 'agent_responses'] as const) {
      for (const row of snapshot.tables[table]) {
        if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录身份无效。', { what: '聊天记录的身份' })
        ids.set(row.id, options.preserveIds ? row.id : randomUUID())
      }
    }
    const remap = (key: string, value: Cell): Cell => typeof value === 'string'
      ? key === 'runtimeThreadId' || key === 'runtimeSessionId' ? runtimeIds.get(value) ?? value : ids.get(value) ?? value
      : value
    const COLUMN_REFS = new Set(['id', 'sessionId', 'conversationId', 'branchId', 'activeBranchId', 'turnId', 'speakerId', 'ownerId', 'runtimeThreadId', 'runtimeSessionId'])
    this.store.withWriteTx(() => {
      for (const table of TABLES) {
        const columns = (this.store.native.pragma(`table_info(${table})`) as Array<{ name: string }>).map((column) => column.name)
        const allowed = new Set(columns)
        for (const original of snapshot.tables[table]) {
          if (Object.keys(original).some((key) => !allowed.has(key))) throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '聊天记录与当前数据库版本不兼容。', { what: '聊天记录' })
          const row = { ...original }
          for (const key of COLUMN_REFS) if (key in row) row[key] = remap(key, row[key]!)
          if (table === 'conversation_state_snapshots' && (row.boundaryType === 'reply' || row.boundaryType === 'opening')) {
            row.boundaryId = remap('boundaryId', row.boundaryId!)
          }
          if (table === 'chat_sessions') {
            row.characterName = character.name
            row.characterAvatar = character.avatar
          }
          if (table === 'agent_conversations') {
            if (row.variableVersionId === undefined) {
              row.variableVersionId = ''
            }
            if (typeof row.variableVersionId !== 'string') {
              throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录的变量关联格式不正确。', { what: '聊天记录的变量关联' })
            }
          }
          const keys = Object.keys(row)
          if (keys.length === 0) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录数据格式不正确。', { what: '聊天记录' })
          this.store.native.prepare(`INSERT INTO ${table} (${keys.map((key) => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
            .run(...keys.map((key) => row[key]))
        }
      }
      if (snapshot.settingLibraryStateJson !== null) this.settings.restore(conversationId, snapshot.settingLibraryStateJson)
    })
    return conversationId
  }
}
