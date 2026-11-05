import type { AgentVariableRuntimeContext } from '@shared/contracts/agent/runtime'
import { VARIABLE_INITIALIZATION_OBJECT_ID } from '@shared/contracts/variables/schemas'
import {
  readConversationVariableStates,
  readCurrentConversationVariableState,
  writeCurrentConversationVariableState
} from '@product-data/domain/conversations'
import type { ElecKoiDatabase, ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import type { VariableConfigRepository } from './VariableConfigRepository'
import { loadVariableSchema } from './variableSchema'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

function normalizedObjectJson(raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw || '{}')
  } catch (error) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, '当前变量状态不是合法 JSON。', { what: '当前变量状态' })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '当前变量状态必须是 JSON object。', { what: '当前变量状态' })
  }
  return JSON.stringify(parsed, null, 2)
}

export class VariableStateRepository {
  constructor(
    private readonly store: ElecKoiSqliteStore,
    private readonly configs: VariableConfigRepository
  ) {}

  runtimeContext(
    conversationId: string,
    context: { characterId: string }
  ): AgentVariableRuntimeContext | undefined {
    if (!context.characterId) return undefined

    const config = this.configs.forConversation(conversationId, context.characterId)
    if (!config) return undefined
    const hasVariables = config.schemaCode.trim().length > 0
      || config.variables.length > 0
      || config.objects.some((item) => item.id !== VARIABLE_INITIALIZATION_OBJECT_ID)
    if (!hasVariables) return undefined

    const currentStateJson = readCurrentConversationVariableState(conversationId, this.store.db)
    return {
      initialStateJson: normalizedObjectJson(this.viewerStates(conversationId).initialStateJson),
      schemaCode: config.schemaCode,
      objects: config.objects,
      variables: config.variables,
      stateJson: normalizedObjectJson(currentStateJson || config.initialStateJson)
    }
  }

  viewerStates(conversationId: string): { initialStateJson: string; currentStateJson: string } {
    const rows = readConversationVariableStates(conversationId, this.store.db)
    const states = new Map(rows.map((row) => [row.kind, row.stateJson]))
    return {
      initialStateJson: states.get('initial') || '{}',
      currentStateJson: states.get('current') || states.get('initial') || '{}'
    }
  }

  replaceCurrent(conversationId: string, stateJson: string, db: ElecKoiDatabase = this.store.db): string {
    const normalized = normalizedObjectJson(stateJson)
    return writeCurrentConversationVariableState(conversationId, normalized, db)
  }

  replaceAuthored(conversationId: string, characterId: string, stateJson: string): string {
    return this.store.withWriteTx(db => {
      const value = JSON.parse(normalizedObjectJson(stateJson)) as Record<string, unknown>
      const code = characterId ? this.configs.forConversation(conversationId, characterId)?.schemaCode || '' : ''
      const next = code.trim() ? loadVariableSchema(code).parse(value) : value
      return this.replaceCurrent(conversationId, JSON.stringify(next), db)
    })
  }
}
