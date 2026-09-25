export type AuthorSurface = 'message-renderer' | 'chat-ui'

export interface AuthorAppInfo {
  name: 'ElecKoi'
  apiVersion: string
  stage: 'preview'
}

export interface AuthorContext {
  surface: AuthorSurface
  scope: 'current-character'
  conversationId: string
  conversationTitle: string
  messageId: string
  characterId: string
}

export type AuthorMessageRole = 'user' | 'assistant'
export type AuthorMessageStatus = 'complete' | 'streaming' | 'error' | 'cancelled'
export type AuthorAgentState = 'idle' | 'starting' | 'streaming' | 'stopping' | 'error'
export type AuthorMessagesChangedReason = 'sent' | 'edited' | 'deleted' | 'regenerated'
export type AuthorAgentProcessKind = 'tool' | 'command' | 'file_change' | 'compaction' | 'subagent' | 'action' | 'narrative' | 'reasoning'
export type AuthorAgentProcessStatus = 'running' | 'complete' | 'error' | 'cancelled'

export interface AuthorAgentProcessItem {
  id: string
  kind: AuthorAgentProcessKind
  status: AuthorAgentProcessStatus
  toolName: string
  arguments: string
  summary: string
  detail: string
  startedAtMillis: number
  completedAtMillis?: number
  parentId?: string
  delegatedModel?: string
}

export type AuthorMediaType = 'image' | 'audio' | 'video' | 'file'

/** A browser-loadable media object. The URL may be remote, a data URL, or an ElecKoi local-media URL. */
export interface AuthorMediaResource {
  id: string
  type: AuthorMediaType
  url: string
  mimeType: string
  name: string
  size: number
  width: number | null
  height: number | null
  duration: number | null
  metadata: Record<string, unknown>
}

/** An image passed to the Agent with a user message. Use either base64 data or a readable URL. */
export interface AuthorSendAttachment {
  type: 'image'
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  name?: string
  data?: string
  url?: string
}

export type AuthorAudioChannel = 'bgm' | 'ambient' | 'voice' | 'sfx'
export type AuthorAudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export interface AuthorAudioTrack {
  id: string
  url: string
  name: string
  mimeType: string
  metadata: Record<string, unknown>
}

export type AuthorAudioTrackInput = string | (Partial<AuthorAudioTrack> & { url: string })

export interface AuthorAudioState {
  conversationId: string
  channel: AuthorAudioChannel
  status: AuthorAudioStatus
  playlist: AuthorAudioTrack[]
  currentIndex: number
  currentTrack: AuthorAudioTrack | null
  currentTime: number
  duration: number | null
  loop: boolean
  shuffle: boolean
  volume: number
  muted: boolean
  error: string
}

export interface AuthorAudioSettings {
  masterVolume: number
  muted: boolean
  channels: Record<AuthorAudioChannel, { volume: number; muted: boolean }>
}

export interface AuthorAudioSettingsUpdate {
  masterVolume?: number
  muted?: boolean
  channels?: Partial<Record<AuthorAudioChannel, { volume?: number; muted?: boolean }>>
}

export interface AuthorOpening {
  id: string
  title: string
  content: string
  displayContent?: string
  initialVariableState: Record<string, unknown>
}

export interface AuthorSettingLibraryEntry {
  id: string
  title: string
  iconId: string
  kind: 'normal' | 'opening' | 'history_compaction' | 'hidden_tool_timeline'
  groupId: string
  content: string
  openingMessages: Array<{ id: string; title: string; content: string; initialVariableStateJson: string }>
  defaultOpeningMessageId: string
  agentSelectionHint: string
  agentReadStrategy: 'required' | 'keyword' | 'normal' | 'variable_condition'
  dynamicMode: 'standard' | 'ejs_controller' | 'ejs_reference'
  keywords: string[]
  keywordScanDepth: number
  conditionKeywords: string[]
  keywordCondition: 'none' | 'any' | 'all' | 'not_any'
  keywordUseRegex: boolean
  keywordIgnoreCase: boolean
  keywordWholeWord: boolean
  keywordRecursionDepth: number
  triggerMode: 'always' | 'agent_tool' | null
  enabled: boolean
  position: 'instructions' | 'insert_point_1' | 'insert_point_2' | 'insert_point_3' | 'insert_point_4' | 'insert_point_5' | null
  promptPositionId: string
  insertRole: 'system' | 'user' | 'assistant'
  order: number
  viewOrder: number
  groupViewOrder: number
  treeViewOrder: number
  createdAt: string
  updatedAt: string
}

export interface AuthorSettingLibrary {
  characterId: string
  name: string
  entries: AuthorSettingLibraryEntry[]
  groups: Array<{ id: string; name: string; parentId: string; order: number; treeViewOrder: number; createdAt: string; updatedAt: string }>
  promptPositions: Array<{
    id: string
    name: string
    anchor: NonNullable<AuthorSettingLibraryEntry['position']>
    side: 'before_setting_position' | 'after_setting_position'
    order: number
    createdAt: string
    updatedAt: string
  }>
}

export interface AuthorMessage {
  id: string
  conversationId: string
  role: AuthorMessageRole
  content: string
  displayContent: string
  variableState: Record<string, unknown>
  status: AuthorMessageStatus
  createdAt: string
  turnId: string
  speakerId: string
  speakerName: string
  speakerAvatar: string
  sequence: number | null
  responseIndex: number | null
  process: AuthorAgentProcessItem[]
  attachments: AuthorMediaResource[]
  openingOptions: AuthorOpening[]
  selectedOpeningId: string
}

export interface AuthorChatSummary {
  id: string
  title: string
  preview: string
  createdAt: string
  updatedAt: string
  characterId: string
  characterName: string
  characterAvatar: string
}

export interface AuthorRunAccepted {
  accepted: true
  conversationId: string
  runId: string
  messageId: string
}

export interface AuthorChatModelCatalog {
  current: { configId: string; model: string }
  items: Array<{
    configId: string
    name: string
    provider: string
    defaultModel: string
    models: Array<{
      id: string
      name: string
      contextWindowTokens?: number | null
      autoCompactTokenLimit?: number | null
      maxOutputTokens?: number | null
      temperature?: number | null
      topP?: number | null
      reasoningEffort?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
      supportsImageInput?: boolean
    }>
  }>
}

export interface AuthorCapability {
  method: string
  namespace: string
  description: string
  permission: string
  stage: 'preview'
  since: string
}

export interface AuthorTokenUsage {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface AuthorGenerationStats {
  turns: number
  steps: number
  llmMs: number
  toolMs: number
  ttftMs: number
  ttftSteps: number
  decodeMs: number
  decodeTokens: number
  tokenUsage: AuthorTokenUsage
  contextPressure: { pressureTokens?: number; projectedTokens?: number; contextWindow?: number }
  contextBreakdown: { systemTokens: number; toolsTokens: number; messageTokens: number }
}

export type AuthorGenerationState = {
  active: false
  conversationId: string
  stats: AuthorGenerationStats | null
} | {
  active: true
  conversationId: string
  runId: string
  messageId: string
  accumulated: string
  sequence: number
  stats: AuthorGenerationStats | null
}

export type AuthorTrajectoryStatus = 'running' | 'complete' | 'error' | 'cancelled'

export interface AuthorAgentTrajectoryRequest {
  number: number
  seq: number
  turn: number | null
  step: number | null
  status: AuthorTrajectoryStatus
  reason: string
  provider: string
  model: string
  detail: string
  rawJson: string
  timeMillis: number | null
  durationMillis: number | null
}

export interface AuthorAgentTrajectoryRecord {
  id: string
  index: number
  seq: number
  type: string
  kind: 'system' | 'user' | 'context' | 'assistant' | 'tool' | 'compaction'
  title: string
  preview: string
  source: string
  input: string
  output: string
  detail: string
  rawJson: string
  timeMillis: number | null
  durationMillis: number | null
  turn: number | null
  step: number | null
  status: AuthorTrajectoryStatus
  requests: AuthorAgentTrajectoryRequest[]
}

export interface AuthorAgentTrajectory {
  conversationId: string
  runtimeThreadId: string | null
  records: AuthorAgentTrajectoryRecord[]
  totalRecords: number
  hasMore: boolean
  beforeIndex: number | null
  startedAtMillis: number | null
  completedAtMillis: number | null
}

export interface AuthorEventMap {
  'messages.changed': { conversationId: string; reason: AuthorMessagesChangedReason; messageIds: string[] }
  'agent.output.delta': { conversationId: string; runId: string; messageId: string; sequence: number; delta: string }
  'agent.run.finished': { conversationId: string; runId: string; message: AuthorMessage }
  'agent.run.failed': { conversationId: string; runId: string; messageId: string; code: string; message: string }
  'agent.state.changed': { conversationId: string; state: AuthorAgentState; detail?: string }
  'agent.process.updated': { conversationId: string; runId: string; messageId: string; item: AuthorAgentProcessItem }
  'agent.generation.stats': { conversationId: string; runId: string; stats: AuthorGenerationStats }
  'audio.state.changed': { conversationId: string; state: AuthorAudioState }
  'audio.time.updated': { conversationId: string; state: AuthorAudioState }
}

export type AuthorEventName = keyof AuthorEventMap

export const AUTHOR_CONVERSATION_EVENT_NAMES: readonly AuthorEventName[] = [
  'messages.changed',
  'agent.output.delta',
  'agent.run.finished',
  'agent.run.failed',
  'agent.state.changed',
  'agent.process.updated',
  'agent.generation.stats'
]

export const AUTHOR_AUDIO_EVENT_NAMES: readonly AuthorEventName[] = [
  'audio.state.changed',
  'audio.time.updated'
]

export const AUTHOR_EVENT_NAMES: readonly AuthorEventName[] = [
  ...AUTHOR_CONVERSATION_EVENT_NAMES,
  ...AUTHOR_AUDIO_EVENT_NAMES
]

export interface ElecKoiAuthorEvents {
  list(): Promise<{ items: readonly AuthorEventName[] }>
  on<TName extends AuthorEventName>(name: TName, listener: (payload: AuthorEventMap[TName]) => void): () => void
  off<TName extends AuthorEventName>(name: TName, listener: (payload: AuthorEventMap[TName]) => void): boolean | undefined
}

export interface ElecKoiAuthorApi {
  readonly api: { readonly stage: 'preview'; readonly version: string }
  call<TResult = unknown>(method: string, params?: Record<string, unknown>): Promise<TResult>
  readonly app: {
    getInfo(): Promise<AuthorAppInfo>
    getCapabilities(): Promise<AuthorCapability[]>
  }
  readonly context: { current(): Promise<AuthorContext> }
  readonly variables: {
    getState(options?: { messageId?: string }): Promise<Record<string, unknown>>
    getConfig(): Promise<unknown>
    setState(state: Record<string, unknown>): Promise<Record<string, unknown>>
    merge(state: Record<string, unknown>): Promise<Record<string, unknown>>
    applyPatch(patch: Array<{
      op: 'add' | 'replace' | 'remove'
      path: string
      value?: unknown
    }>): Promise<Record<string, unknown>>
    reset(): Promise<Record<string, unknown>>
  }
  readonly openings: {
    list(): Promise<{ items: AuthorOpening[] }>
    current(): Promise<AuthorOpening | null>
    select(id: string): Promise<{ selectedId: string }>
  }
  readonly messages: {
    list(): Promise<AuthorMessage[]>
    get(id: string): Promise<AuthorMessage>
    current(): Promise<AuthorMessage>
    deleteFrom(id: string): Promise<{ ok: true; deletedMessageCount: number; remainingMessageCount: number }>
    regenerate(id: string): Promise<AuthorRunAccepted>
    editAndRegenerate(id: string, text: string): Promise<AuthorRunAccepted>
  }
  readonly chat: {
    current(): Promise<AuthorChatSummary>
    list(): Promise<{ items: AuthorChatSummary[] }>
    getGenerationState(): Promise<AuthorGenerationState>
    getAgentTrajectory(options?: { beforeIndex?: number; limit?: number }): Promise<AuthorAgentTrajectory>
    getModels(): Promise<AuthorChatModelCatalog>
    send(text: string, options?: { attachments?: AuthorSendAttachment[] }): Promise<AuthorRunAccepted>
    stopGeneration(): Promise<{ cancelled: boolean }>
    create(options?: { title?: string }): Promise<{ chat: AuthorChatSummary }>
    open(sessionId: string): Promise<{ chat: AuthorChatSummary }>
    delete(sessionId: string): Promise<{ deletedId: string; chat: AuthorChatSummary }>
    selectModel(options: { configId: string; model: string }): Promise<{ configId: string; model: string }>
  }
  readonly character: { current(): Promise<Record<string, unknown> | null> }
  readonly settingLibrary: {
    current(): Promise<AuthorSettingLibrary | null>
    getSummary(): Promise<{
      characterId: string
      name: string
      activeVersionId: string
      entryCount: number
      groupCount: number
    } | null>
  }
  readonly media: {
    getMessageAttachments(messageId?: string): Promise<{ items: AuthorMediaResource[] }>
    getMessageAttachment(messageId: string, attachmentId: string): Promise<AuthorMediaResource>
  }
  readonly audio: {
    play(options: { channel?: AuthorAudioChannel; track: AuthorAudioTrackInput; loop?: boolean; volume?: number; startAt?: number }): Promise<AuthorAudioState>
    pause(channel?: AuthorAudioChannel): Promise<AuthorAudioState>
    resume(channel?: AuthorAudioChannel): Promise<AuthorAudioState>
    stop(channel?: AuthorAudioChannel): Promise<AuthorAudioState>
    seek(seconds: number, channel?: AuthorAudioChannel): Promise<AuthorAudioState>
    getState(channel?: AuthorAudioChannel): Promise<AuthorAudioState>
    getPlaylist(channel?: AuthorAudioChannel): Promise<{ channel: AuthorAudioChannel; items: AuthorAudioTrack[]; currentIndex: number }>
    setPlaylist(channel: AuthorAudioChannel, items: AuthorAudioTrackInput[], options?: { currentIndex?: number; autoplay?: boolean; loop?: boolean; shuffle?: boolean }): Promise<AuthorAudioState>
    appendPlaylist(channel: AuthorAudioChannel, items: AuthorAudioTrackInput[]): Promise<AuthorAudioState>
    getSettings(): Promise<AuthorAudioSettings>
    setSettings(settings: AuthorAudioSettingsUpdate): Promise<AuthorAudioSettings>
  }
  readonly input: {
    get(): Promise<{ text: string }>
    set(text: string): Promise<{ text: string }>
    append(text: string): Promise<{ text: string }>
    clear(): Promise<{ text: '' }>
    send(): Promise<{ submitted: boolean }>
  }
  readonly events: ElecKoiAuthorEvents
}

declare global {
  interface Window {
    ElecKoi: ElecKoiAuthorApi
  }
}
