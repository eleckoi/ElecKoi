import type { RuntimeModelSettings } from '../entities/model'
import type { AgentProcessItem, ChatImageMediaType, ChatUserImageAttachment, EncodedChatImageAttachment } from '../entities/chat'
import type { VariableItemConfig, VariableObjectConfig } from '../variables/schemas'
import type { SettingLibraryEntry, SettingLibraryGroup, SettingLibraryPromptPosition } from '../settingLibrary/schemas'
import type { AgentGenerationStats } from './generationStats'
import type { WebSearchMode } from './webSearch'
import type { AgentTrajectorySnapshot } from './trajectory'

export interface AgentVariableRuntimeContext {
  initialStateJson: string
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
  settingLibrary?: AgentSettingLibraryRuntimeContext
}

export interface AgentRunInput {
  conversationId: string
  runId: string
  text: string
  inputImages?: ChatUserImageAttachment[] | undefined
  settings: RuntimeModelSettings
  subagentSettings?: RuntimeModelSettings | undefined
  variableContext?: AgentVariableRuntimeContext | undefined
  conversationContext?: AgentConversationContext | undefined
  runtimeThreadId?: string | undefined
  discardRuntimeThreadIds?: string[] | undefined
  toolPolicy?: { disabledGroupIds: string[] } | undefined
  webSearch?: {
    mode: WebSearchMode
    maxResults: 3 | 5 | 8
    tavilyApiKey: string
  } | undefined
  agentPreset?: {
    id: string
    versionId: string
    name: string
    roleplayPlan: { steps: string[] }
    historyCompactionInstructions?: string | undefined
  } | undefined
}

export interface AgentRunCallbacks {
  onDelta(delta: string): void
  onFinal(content: string): void
  onGenerationStats?(stats: AgentGenerationStats): void
  onVariableState?(stateJson: string): void
  onSettingLibraryState?(stateJson: string): void
  onProcessItem?(item: AgentProcessItem): void
}

export type AgentRunResult = 'complete' | 'cancelled'

export interface AgentRuntimePort {
  prepareImages?(images: EncodedChatImageAttachment[]): Promise<ChatUserImageAttachment[]>
  readImage?(image: ChatUserImageAttachment): Promise<{ mediaType: ChatImageMediaType; data: string }>
  run(input: AgentRunInput, callbacks: AgentRunCallbacks): Promise<AgentRunResult>
  generationStats?(conversationId: string, runtimeThreadId: string): AgentGenerationStats | undefined
  trajectory?(
    conversationId: string,
    runtimeThreadId: string,
    options?: { beforeIndex?: number | undefined; limit?: number | undefined }
  ): AgentTrajectorySnapshot
  cancel(conversationId: string): Promise<boolean>
  disposeConversation(conversationId: string): Promise<void>
  close(): Promise<void>
}
