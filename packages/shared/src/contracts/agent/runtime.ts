import type { RuntimeModelSettings } from '../entities/model'
import type { AgentProcessItem, ChatImageMediaType, ChatUserFileAttachment, ChatUserImageAttachment, EncodedChatImageAttachment } from '../entities/chat'
import type { VariableItemConfig, VariableObjectConfig } from '../variables/schemas'
import type { SettingLibraryEntry, SettingLibraryGroup, SettingLibraryPromptPosition } from '../settingLibrary/schemas'
import type { AgentGenerationStats } from './generationStats'
import type { AgentTrajectorySnapshot } from './trajectory'

export interface AgentVariableRuntimeContext {
  versionId: string
  identityJson: string
  defaultStateJson: string
  schemaCode: string
  objects: VariableObjectConfig[]
  variables: VariableItemConfig[]
  stateJson: string
}

/** The product transcript/context that is projected into one DSH step. */
export interface AgentConversationHistoryItem {
  role: 'user' | 'assistant'
  content: string
  speakerName?: string
}

/** Effective per-conversation setting library exposed to the DSH setting tools. */
export interface AgentSettingLibraryRuntimeContext {
  characterId: string
  name: string
  entries: SettingLibraryEntry[]
  groups: SettingLibraryGroup[]
  promptPositions: SettingLibraryPromptPosition[]
}

export interface AgentConversationContext {
  characterId: string
  characterName: string
  persona: Record<string, unknown>
  history: AgentConversationHistoryItem[]
  currentPromptText?: string
  settingLibrary?: AgentSettingLibraryRuntimeContext
}

export interface AgentRunInput {
  conversationId: string
  runId: string
  text: string
  inputImages?: ChatUserImageAttachment[] | undefined
  inputFiles?: AgentInputFile[] | undefined
  settings: RuntimeModelSettings
  subagentSettings?: RuntimeModelSettings | undefined
  variableContext?: AgentVariableRuntimeContext | undefined
  conversationContext?: AgentConversationContext | undefined
  runtimeThreadId?: string | undefined
  discardRuntimeThreadIds?: string[] | undefined
  generationStatsSeed?: {
    previous?: AgentGenerationStats | undefined
    previousRuntimeThreadId?: string | undefined
    retainedTurns: number
  } | undefined
  toolPolicy?: { disabledGroupIds: string[] } | undefined
  agentPreset?: {
    id: string
    versionId: string
    name: string
    roleplayPlan: { steps: string[] }
    historyCompactionInstructions?: string | undefined
  } | undefined
}

export interface AgentInputFile {
  id: string
  path: string
  name: string
  bytes: number
  reference?: ChatUserFileAttachment | undefined
}

export interface AgentRunCallbacks {
  onDelta(delta: string): void
  onFinal(content: string): void
  onFileUploaded?(draftId: string, file: ChatUserFileAttachment): void
  onTurnStarted?(turn: number): void
  onGenerationStats?(stats: AgentGenerationStats): void
  onVariableState?(stateJson: string): void
  onSettingLibraryState?(stateJson: string): void
  onProcessItem?(item: AgentProcessItem): void
}

export type AgentRunResult = 'complete' | 'cancelled'

export interface AgentResolvedModelInfo {
  provider: string
  id: string
  name: string
  description?: string
  inputModalities?: string[]
  contextWindow?: number
  defaultMaxTokens?: number
  reasoning?: {
    efforts: Array<{ id: string; name: string; description?: string }>
    defaultEffort?: string
  }
}

export interface AgentModelCatalog {
  default: { provider: string; model: string; reasoningEffort?: string }
  routableProviders: string[]
  groups: Array<{ id: string; name: string; models: AgentResolvedModelInfo[] }>
  failures: Array<{ id: string; name: string; message: string }>
}

export interface AgentRuntimePort {
  createSession?(input: Omit<AgentRunInput, 'runId' | 'text'>): Promise<void>
  prepareImages?(images: EncodedChatImageAttachment[]): Promise<ChatUserImageAttachment[]>
  readImage?(image: ChatUserImageAttachment): Promise<{ mediaType: ChatImageMediaType; data: string }>
  run(input: AgentRunInput, callbacks: AgentRunCallbacks): Promise<AgentRunResult>
  generationStats?(conversationId: string, runtimeThreadId: string): AgentGenerationStats | undefined
  trajectory?(
    conversationId: string,
    runtimeThreadId: string,
    options?: { beforeIndex?: number | undefined; limit?: number | undefined }
  ): AgentTrajectorySnapshot
  modelCatalog?(): Promise<AgentModelCatalog>
  describeModel?(provider: string, model: string): Promise<AgentResolvedModelInfo>
  resolveModelSelection?(runtimeThreadId: string): Promise<{
    provider: string
    model: string
    reasoningEffort?: string | undefined
  }>
  selectModel?(runtimeThreadId: string, selection: {
    provider: string
    model: string
    reasoningEffort?: string | undefined
  }): Promise<{ provider: string; model: string; reasoningEffort?: string | undefined }>
  cancel(conversationId: string): Promise<boolean>
  rewindConversation?(conversationId: string, runtimeThreadId: string, fromTurn: number): Promise<'rewound' | 'unavailable'>
  editMessage?(conversationId: string, runtimeThreadId: string, messageId: string, role: 'user' | 'assistant', content: string): Promise<void>
  confirmRewind?(conversationId: string): void
  rollbackRewind?(conversationId: string, runtimeThreadId: string): Promise<void>
  disposeConversation(
    conversationId: string,
    runtimeThreadIds?: readonly string[],
    retainedRuntimeThreadIds?: readonly string[]
  ): Promise<void>
  close(): Promise<void>
}
