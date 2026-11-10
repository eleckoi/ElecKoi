import type { AgentVariableRuntimeContext } from '@shared/contracts/agent/runtime'
import { VARIABLE_INITIALIZATION_OBJECT_ID } from '@shared/contracts/variables/schemas'
import {
  readConversationVariableStates,
  readCurrentConversationVariableState,
  readCurrentConversationVariableIdentity,
  readConversationVariableBinding,
  selectConversationVariableVersion,
  writeCurrentConversationVariableState
} from '@product-data/domain/conversations'
import type { ElecKoiDatabase, ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import type { VariableConfigRepository } from './VariableConfigRepository'
import { loadVariableSchema } from './variableSchema'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { createVariableIdentities, parseVariableIdentities, reconcileVariableState, replaceVariableIdentities, validateVariableIdentityState, type VariableIdentityConfig } from '@shared/foundation/variables/identity'

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

  configuration(conversationId: string) {
    const binding = readConversationVariableBinding(conversationId, this.store.db)
    const versions = binding.characterId ? this.configs.get(binding.characterId).versions.map(({ id, name }) => ({ id, name })) : []
    return { versionId: binding.versionId, versions }
  }

  selectVersion(conversationId: string, versionId: string, expectedVersionId: string) {
    return this.store.withWriteTx(db => {
      const configuration = this.configuration(conversationId)
      if (versionId && !configuration.versions.some(item => item.id === versionId)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '要使用的变量配置版本不存在。', { what: '变量配置版本' })
      }
      selectConversationVariableVersion(conversationId, versionId, expectedVersionId, db)
      return this.configuration(conversationId)
    })
  }

  runtimeContext(
    conversationId: string,
    context: { characterId: string }
  ): AgentVariableRuntimeContext | undefined {
    if (!context.characterId) return undefined

    const config = this.configs.forConversation(conversationId, context.characterId)
    const currentStateJson = readCurrentConversationVariableState(conversationId, this.store.db)
    const hasVariables = config && (config.schemaCode.trim().length > 0
      || config.variables.length > 0
      || config.objects.some((item) => item.id !== VARIABLE_INITIALIZATION_OBJECT_ID))
    if (!hasVariables && !Object.keys(JSON.parse(normalizedObjectJson(currentStateJson))).length) return undefined

    return {
      versionId: config?.activeVersionId || '',
      identityJson: this.identities(conversationId),
      defaultStateJson: normalizedObjectJson(config?.initialStateJson || '{}'),
      schemaCode: config?.schemaCode || '',
      objects: config?.objects || [],
      variables: config?.variables || [],
      stateJson: normalizedObjectJson(currentStateJson)
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

  identities(conversationId: string): string {
    return readCurrentConversationVariableIdentity(conversationId, this.store.db)
  }

  private identityConfig(conversationId: string): VariableIdentityConfig {
    const binding = readConversationVariableBinding(conversationId, this.store.db)
    const config = binding?.characterId ? this.configs.forConversation(conversationId, binding.characterId) : null
    return { versionId: config?.activeVersionId || '', objects: config?.objects || [], variables: config?.variables || [] }
  }

  importedIdentities(conversationId: string, stateJson: string): string {
    return JSON.stringify(createVariableIdentities(JSON.parse(normalizedObjectJson(stateJson)), this.identityConfig(conversationId), 'runtime'))
  }

  replaceCurrent(conversationId: string, stateJson: string, db: ElecKoiDatabase = this.store.db, identityJson?: string): string {
    const normalized = normalizedObjectJson(stateJson)
    // Raw replacements are explicit state writes (imports/manual tools), not config saves.
    const identities = identityJson !== undefined ? parseVariableIdentities(identityJson)
      : replaceVariableIdentities(parseVariableIdentities(this.identities(conversationId)), this.identityConfig(conversationId), JSON.parse(normalized))
    validateVariableIdentityState(JSON.parse(normalized), identities)
    return writeCurrentConversationVariableState(conversationId, normalized, db, JSON.stringify(identities))
  }

  replaceAuthored(conversationId: string, characterId: string, stateJson: string): string {
    return this.store.withWriteTx(db => {
      const value = JSON.parse(normalizedObjectJson(stateJson)) as Record<string, unknown>
      const code = characterId ? this.configs.forConversation(conversationId, characterId)?.schemaCode || '' : ''
      const next = code.trim() ? loadVariableSchema(code).parse(value) : value
      const accepted = reconcileVariableState(JSON.parse(this.viewerStates(conversationId).currentStateJson),
        parseVariableIdentities(this.identities(conversationId)), this.identityConfig(conversationId), next)
      return this.replaceCurrent(conversationId, JSON.stringify(accepted.state), db, JSON.stringify(accepted.identities))
    })
  }
}
