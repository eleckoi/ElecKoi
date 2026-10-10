import { randomUUID } from 'node:crypto'
import type { ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'

type Cell = string | number | null
type Row = Record<string, Cell>

const TABLES = [
  'chat_sessions', 'chat_session_character_snapshots', 'chat_session_variable_states',
  'agent_conversations', 'agent_branches', 'conversation_speakers', 'agent_turns',
  'agent_responses', 'agent_branch_turns', 'agent_openings', 'agent_setting_snapshots'
] as const
type Table = typeof TABLES[number]

export interface ConversationArchiveSnapshot {
  format: 'eleckoi.desktop-conversation'
  version: 1
  characterId: string
  conversationId: string
  tables: Record<Table, Row[]>
}

function rows(value: unknown): Row[] {
  if (!Array.isArray(value) || value.length > 200000) throw new Error('聊天记录数据格式不正确。')
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.values(item).some((cell) => cell !== null && typeof cell !== 'string' && typeof cell !== 'number')) {
      throw new Error('聊天记录数据格式不正确。')
    }
    return item as Row
  })
}

export class ConversationArchiveRepository {
  constructor(private readonly store: ElecKoiSqliteStore) {}

  export(conversationId: string): ConversationArchiveSnapshot {
    const session = this.store.native.prepare('SELECT * FROM chat_sessions WHERE id=?').get(conversationId) as Row | undefined
    if (!session || typeof session.characterId !== 'string' || !session.characterId) {
      throw new Error('找不到所属角色的聊天记录。')
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
    return { format: 'eleckoi.desktop-conversation', version: 1,
      characterId: session.characterId, conversationId, tables }
  }

  parse(value: unknown): ConversationArchiveSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('聊天记录文件格式不正确。')
    const archive = value as Partial<ConversationArchiveSnapshot>
    if (archive.format !== 'eleckoi.desktop-conversation' || archive.version !== 1
      || typeof archive.characterId !== 'string' || !archive.characterId
      || typeof archive.conversationId !== 'string' || !archive.conversationId
      || !archive.tables || typeof archive.tables !== 'object') {
      throw new Error('不支持此聊天记录文件。')
    }
    const tables = {} as Record<Table, Row[]>
    for (const table of TABLES) tables[table] = rows(archive.tables[table])
    if (tables.chat_sessions.length !== 1 || tables.chat_sessions[0]?.id !== archive.conversationId
      || tables.chat_sessions[0]?.characterId !== archive.characterId
      || tables.agent_conversations.length !== 1
      || tables.agent_conversations[0]?.id !== archive.conversationId) {
      throw new Error('聊天记录中的会话身份不一致。')
    }
    const branches = new Set(tables.agent_branches.map((row) => row.id))
    if (!branches.has(tables.agent_conversations[0]?.activeBranchId)) throw new Error('聊天记录缺少活动分支。')
    for (const table of TABLES) {
      if (table === 'agent_branch_turns') {
        if (tables[table].some((row) => !branches.has(row.branchId))) throw new Error('聊天记录分支不匹配。')
        continue
      }
      const key = table === 'chat_sessions' || table === 'agent_conversations' ? 'id'
        : table === 'chat_session_character_snapshots' || table === 'chat_session_variable_states'
          ? 'sessionId' : 'conversationId'
      if (tables[table].some((row) => row[key] !== archive.conversationId)) {
        throw new Error('聊天记录包含其他会话的数据。')
      }
    }
    return { ...archive, tables } as ConversationArchiveSnapshot
  }

  runtimeThreadIds(snapshot: ConversationArchiveSnapshot): string[] {
    return [...new Set([
      snapshot.tables.agent_conversations[0]?.runtimeThreadId,
      ...snapshot.tables.agent_responses.map((row) => row.runtimeThreadId)
    ].filter((id): id is string => typeof id === 'string' && id.length > 0))]
  }

  requiredRuntimeThreadIds(snapshot: ConversationArchiveSnapshot): string[] {
    return [...new Set(snapshot.tables.agent_responses
      .filter((response) => response.dshTurn !== null && typeof response.runtimeThreadId === 'string')
      .map((response) => response.runtimeThreadId as string))]
  }

  import(snapshot: ConversationArchiveSnapshot, characterId: string, runtimeIds: ReadonlyMap<string, string>, conversationId: string = randomUUID(), options: { preserveIds?: boolean } = {}): string {
    if (snapshot.characterId !== characterId) throw new Error('聊天记录与当前角色不匹配。')
    const character = this.store.native.prepare('SELECT id,name,avatar FROM characters WHERE id=?').get(characterId) as
      { id: string; name: string; avatar: string } | undefined
    if (!character) throw new Error('当前角色不存在，无法导入聊天记录。')
    const ids = new Map<string, string>([[snapshot.conversationId, conversationId]])
    for (const table of ['agent_branches', 'conversation_speakers', 'agent_turns', 'agent_responses'] as const) {
      for (const row of snapshot.tables[table]) {
        if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error('聊天记录身份无效。')
        ids.set(row.id, options.preserveIds ? row.id : randomUUID())
      }
    }
    const remap = (key: string, value: Cell): Cell => typeof value === 'string'
      ? key === 'runtimeThreadId' ? runtimeIds.get(value) ?? value : ids.get(value) ?? value
      : value
    const COLUMN_REFS = new Set(['id', 'sessionId', 'conversationId', 'branchId', 'activeBranchId', 'turnId', 'speakerId', 'ownerId', 'runtimeThreadId'])
    this.store.withWriteTx(() => {
      for (const table of TABLES) {
        const columns = (this.store.native.pragma(`table_info(${table})`) as Array<{ name: string }>).map((column) => column.name)
        const allowed = new Set(columns)
        for (const original of snapshot.tables[table]) {
          if (Object.keys(original).some((key) => !allowed.has(key))) throw new Error('聊天记录与当前数据库版本不兼容。')
          const row = { ...original }
          for (const key of COLUMN_REFS) if (key in row) row[key] = remap(key, row[key]!)
          if (table === 'chat_sessions') {
            row.characterName = character.name
            row.characterAvatar = character.avatar
          }
          if (table === 'agent_conversations') {
            if (row.variableVersionId === undefined) {
              const config = this.store.native.prepare('SELECT activeVersionId FROM variable_configs WHERE characterId=?')
                .get(characterId) as { activeVersionId: string } | undefined
              row.variableVersionId = config?.activeVersionId || 'variable-config-default'
            }
            if (typeof row.variableVersionId !== 'string' || !row.variableVersionId
              || (!this.store.native.prepare('SELECT 1 FROM variable_config_versions WHERE characterId=? AND versionId=?')
                .get(characterId, row.variableVersionId) && !(row.variableVersionId === 'variable-config-default'
                  && !this.store.native.prepare('SELECT 1 FROM variable_configs WHERE characterId=?').get(characterId)))) {
              throw new Error('聊天记录绑定的变量版本不存在，请先恢复对应变量配置。')
            }
          }
          const keys = Object.keys(row)
          if (keys.length === 0) throw new Error('聊天记录数据格式不正确。')
          this.store.native.prepare(`INSERT INTO ${table} (${keys.map((key) => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
            .run(...keys.map((key) => row[key]))
        }
      }
    })
    return conversationId
  }
}
