export interface DshModelSettings {
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  apiFormat: 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-generative-ai'
  customHeaders: Record<string, string>
  contextWindow: number
  autoCompactTokenLimit?: number | undefined
  maxTokens?: number | undefined
  temperature?: number | undefined
  topP?: number | undefined
  reasoningEffort?: string | undefined
  supportsImageInput: boolean
  proxyUrl?: string | undefined
}

export type DshImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export interface DshEncodedImageAttachment {
  mediaType: DshImageMediaType
  data: string
  name?: string | undefined
}

export interface DshImageAttachmentRef {
  attachmentId: string
  mediaType: DshImageMediaType
  bytes: number
  width: number
  height: number
  name?: string | undefined
  originalDimensions?: { width: number; height: number } | undefined
}

import type { DshGenerationStats } from './generationStats'

export interface DshStreamCallbacks {
  onDelta(delta: string): void
  onFinal(content: string): void
  onGenerationStats?(stats: DshGenerationStats): void
  onVariableState?(stateJson: string): void
  onSettingLibraryState?(stateJson: string): void
  onProcessItem?(item: DshProcessItem): void
}

export type {
  DshContextBreakdownStats,
  DshContextPressureStats,
  DshGenerationStats,
  DshTokenUsageStats
} from './generationStats'

export interface DshConversationHistoryItem {
  role: 'user' | 'assistant'
  content: string
  speakerName?: string
}

export interface DshSettingLibraryRuntimeContext {
  characterId: string
  name: string
  entries: Array<Record<string, unknown>>
  groups: Array<Record<string, unknown>>
  promptPositions: Array<Record<string, unknown>>
}

export interface DshConversationContext {
  characterId: string
  characterName: string
  persona: Record<string, unknown>
  history: DshConversationHistoryItem[]
  settingLibrary?: DshSettingLibraryRuntimeContext
}

export interface DshProcessItem {
  id: string
  kind: 'tool' | 'command' | 'file_change' | 'compaction' | 'subagent' | 'action' | 'narrative' | 'reasoning'
  status: 'running' | 'complete' | 'error' | 'cancelled'
  toolName: string
  arguments: string
  summary: string
  detail: string
  startedAtMillis: number
  completedAtMillis?: number
  parentId?: string
  delegatedModel?: string
}

export interface DshVariableObjectConfig {
  id: string
  name: string
  parentId: string
  enabled: boolean
  description: string
  updateRule: string
  dynamicKey: boolean
}

export interface DshVariableItemConfig {
  id: string
  title: string
  objectId: string
  enabled: boolean
  type: '' | 'number' | 'string' | 'boolean' | 'array'
  defaultValue: string
  description: string
  updateRule: string
  readMode: 'required' | 'on_demand'
}

export interface DshVariableRuntimeContext {
  initialStateJson: string
  schemaCode: string
  objects: DshVariableObjectConfig[]
  variables: DshVariableItemConfig[]
  stateJson: string
}

export interface DshToolPolicy {
  disabledGroupIds: string[]
}

export interface DshWebSearchSettings {
  mode: 'provider_native' | 'tavily'
  maxResults: 3 | 5 | 8
  tavilyApiKey: string
}

export interface DshAgentPreset {
  id: string
  versionId: string
  name: string
  roleplayPlan: { steps: string[] }
  historyCompactionInstructions?: string | undefined
}

export interface DshRuntimeOptions {
  configPath: string
  workspaceRoot: string
  runtimeDataRoot: string
  executablePath: string
  presetTemplatePath: string
}
