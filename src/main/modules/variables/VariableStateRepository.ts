import type { AgentVariableRuntimeContext } from '@shared/contracts/agent/runtime'
import { VARIABLE_INITIALIZATION_OBJECT_ID } from '@shared/contracts/variables/schemas'
import {
  readConversationVariableStates,
  readCurrentConversationVariableState,
  writeCurrentConversationVariableState
} from '@main/modules/conversations'
import { type ElecKoiDatabase, SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import type { VariableConfigRepository } from './VariableConfigRepository'

function normalizedObjectJson(raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw || '{}')
  } catch (error) {
    throw new Error('当前变量状态不是合法 JSON。', { cause: error })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('当前变量状态必须是 JSON object。')
  }
  return JSON.stringify(parsed, null, 2)
}

export class VariableStateRepository {
  constructor(
    private readonly store: SqliteDatabase,
    private readonly configs: VariableConfigRepository
  ) {}

  runtimeContext(
    conversationId: string,
    context: { characterId: string; characterMode: string }
  ): AgentVariableRuntimeContext | undefined {
    if (context.characterMode !== 'story' || !context.characterId) return undefined

    const config = this.configs.get(context.characterId)
    const hasVariables = config.schemaCode.trim().length > 0
      || config.variables.length > 0
      || config.objects.some((item) => item.id !== VARIABLE_INITIALIZATION_OBJECT_ID)
    if (!hasVariables) return undefined

    const currentStateJson = readCurrentConversationVariableState(conversationId, this.store.db)
    return {
      initialStateJson: normalizedObjectJson(config.initialStateJson),
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
}
