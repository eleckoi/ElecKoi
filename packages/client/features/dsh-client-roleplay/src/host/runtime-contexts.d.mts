import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ConversationRuntimePreparation } from '@eleckoi/dsh-product-api'

type Preparation = ConversationRuntimePreparation
type VariableContext = NonNullable<Preparation['variableContext']>

export interface RuntimeContext {
  rootSessionId: string
  conversationId: string
  conversationContext: Partial<Preparation['conversationContext']> & { currentUserInput?: string }
  settingLibraryBaseline?: Preparation['settingLibraryBaseline']
  generationVariableStateJson?: string
  generationVariableIdentityJson?: string
  settings: {
    enabled: boolean
    library: Preparation['conversationContext']['settingLibrary'] | null
    frozenLibrary?: Preparation['conversationContext']['settingLibrary'] | null
    history: Preparation['conversationContext']['history']
    variableState?: Record<string, unknown>
    runtimeResolution?: object
  }
  variables: {
    enabled: boolean
    config: {
      versionId: string
      defaultState: Record<string, unknown>
      schemaCode: string
      objects: VariableContext['objects']
      variables: VariableContext['variables']
    } | null
    state: Record<string, any>
    identities: Record<string, { id: string; parentId: string; origin: 'definition' | 'runtime' | 'unresolved'; kind: 'object' | 'variable' | 'entry' | 'value'; definitionId: string; versionId: string }>
  }
}

/** Current-turn state owned and released by the roleplay Host plugin. */
export class RuntimeContexts {
  constructor(readVariableConfiguration?: (conversationId: string) => Preparation['variableContext'])
  get(sessionId: string): RuntimeContext
  readVariables(sessionId: string): RuntimeContext['variables']
  has(sessionId: string): boolean
  set(sessionId: string, state: RuntimeContext): void
  prepare(sessionId: string, runtime: Preparation, history: Preparation['conversationContext']['history'],
    currentUserInput: string, generationVariableStateJson?: string, appendCurrentInput?: boolean): RuntimeContext
  inherit(parentId: string, childId: string): void
  forget(sessionId: string): void
  forgetConversation(conversationId: string): void
  close(): void
}

export function restoreRuntimeContext(ctx: Context, session: Session, snapshot: { conversationId: string }): void
