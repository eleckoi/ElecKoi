import type { AuthorVariablePatch } from './variables'
import type { AuthorVariableRule } from './scripts'
import type { AuthorAgentTrajectory } from './trajectory'
export * from './trajectory'

export type AuthorSurface = 'message-renderer' | 'chat-ui' | 'application-frontend' | 'character-frontend'

export interface AuthorAppInfo {
  name: 'ElecKoi'
  apiVersion: string
  stage: 'preview'
}

export interface AuthorContext {
  surface: AuthorSurface
  scope: 'current-character' | 'application'
  conversationId: string
  conversationTitle: string
  messageId: string
  characterId: string
  projectId?: string
  entryFile?: string
  view?: string
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

/** Media metadata; URL is null when browser delivery is not available. */
export interface AuthorMediaResource {
  id: string
  type: AuthorMediaType
  url: string | null
  mimeType: string | null
  name: string
  size: number | null
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
  openingMessages: Array<{ id: string; title: string; content: string; variableVersionId?: string; initialVariableStateJson: string }>
  defaultOpeningMessageId: string
  agentSelectionHint: string
  agentReadStrategy: 'required' | 'keyword' | 'normal'
  dynamicMode: 'standard' | 'ejs_reference'
  contentMode: 'plain_text' | 'ejs'
  keywords: string[]
  keywordScanDepth: number
  conditionKeywords: string[]
  keywordCondition: 'none' | 'any' | 'all' | 'not_any' | 'not_all'
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

export type AuthorSettingEntryChanges = Partial<Omit<AuthorSettingLibraryEntry,
  'id' | 'kind' | 'openingMessages' | 'defaultOpeningMessageId' | 'createdAt' | 'updatedAt'>>
export interface AuthorSettingEntryUpdate { id: string; changes: AuthorSettingEntryChanges }

export const AUTHOR_SETTING_ENTRY_MUTABLE_FIELDS = [
  'title', 'iconId', 'groupId', 'content', 'agentSelectionHint', 'agentReadStrategy',
  'dynamicMode', 'contentMode', 'keywords', 'keywordScanDepth', 'conditionKeywords',
  'keywordCondition', 'keywordUseRegex', 'keywordIgnoreCase', 'keywordWholeWord',
  'keywordRecursionDepth', 'triggerMode', 'enabled', 'position', 'promptPositionId',
  'insertRole', 'order', 'viewOrder', 'groupViewOrder', 'treeViewOrder'
] as const satisfies readonly (keyof AuthorSettingEntryChanges)[]

export interface AuthorPreset {
  id: string
  name: string
  activeVersionId: string
  entries: AuthorSettingLibraryEntry[]
  groups: AuthorSettingLibrary['groups']
  promptPositions: AuthorSettingLibrary['promptPositions']
}

export interface AuthorPresetCatalog {
  activePresetId: string
  items: Array<{ id: string; name: string; activeVersionId: string; entryCount: number }>
}

export interface AuthorMessage {
  id: string
  conversationId: string
  role: AuthorMessageRole
  content: string
  displayContent: string
  /** Exact native history, or null when no historical snapshot is available. */
  variableState: Record<string, unknown> | null
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

export interface AuthorMessagePage {
  items: AuthorMessage[]
  hasMore: boolean
  beforeSequence: number | null
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
  current: { configId: string; model: string; reasoningEffort?: string }
  items: Array<{
    configId: string
    name: string
    provider: string
    defaultModel: string
    enabled?: boolean
    models: Array<{
      id: string
      name: string
      contextWindowTokens?: number | null
      autoCompactTokenLimit?: number | null
      maxOutputTokens?: number | null
      temperature?: number | null
      topP?: number | null
      reasoningEffort?: string | null
      reasoningEfforts?: false | Record<string, string | null>
      inputModalities?: ('text' | 'image')[]
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
  turns?: number
  steps?: number
  llmMs?: number
  toolMs?: number
  ttftMs?: number
  ttftSteps?: number
  decodeMs?: number
  decodeTokens?: number
  tokenUsage?: AuthorTokenUsage
  contextPressure?: { pressureTokens?: number; projectedTokens?: number; contextWindow?: number }
  contextBreakdown?: { systemTokens: number; toolsTokens: number; messageTokens: number }
}

export type AuthorGenerationState = {
  active: false
  conversationId: string
  stats: AuthorGenerationStats | null
} | {
  active: true
  conversationId: string
  runId: string
  /** Client observation identity; null before a formal turn is observable. */
  generationId: string | null
  turn: number | null
  messageId: string
  accumulated: string
  sequence: number
  stats: AuthorGenerationStats | null
}

export interface AuthorGenerationIdentity {
  conversationId: string
  /** The owning native runtime Session. */
  runId: string
  /** Unique for this live observation, including regeneration in the same Session. */
  generationId: string
  turn: number
}

export interface AuthorEventMap {
  'messages.changed': { conversationId: string; reason: AuthorMessagesChangedReason; messageIds: string[] }
  'agent.output.delta': AuthorGenerationIdentity & { messageId: string; sequence: number; operation: 'append' | 'replace'; delta: string; accumulated: string }
  'agent.run.finished': AuthorGenerationIdentity & { reason: 'completed' | 'output-limit' | 'blocked'; message: AuthorMessage | null }
  'agent.run.cancelled': AuthorGenerationIdentity & { messageId: string; reason: 'cancelled' | 'interrupted' }
  'agent.run.failed': AuthorGenerationIdentity & { messageId: string; code: string; message: string }
  'agent.state.changed': AuthorGenerationIdentity & { state: AuthorAgentState; detail?: string }
  'agent.process.updated': AuthorGenerationIdentity & { messageId: string; item: AuthorAgentProcessItem }
  'agent.generation.stats': AuthorGenerationIdentity & { stats: AuthorGenerationStats }
  'audio.state.changed': { conversationId: string; state: AuthorAudioState }
  'audio.time.updated': { conversationId: string; state: AuthorAudioState }
}

export type AuthorEventName = keyof AuthorEventMap

export const AUTHOR_CONVERSATION_EVENT_NAMES: readonly AuthorEventName[] = [
  'messages.changed',
  'agent.output.delta',
  'agent.run.finished',
  'agent.run.cancelled',
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

export interface AuthorScriptSettings { revision: number; values: Record<string, unknown> }

export interface AuthorScriptButton {
  id: string
  label: string
  /** Use this invocation's API for user actions; it never joins a rule's pending candidate. */
  onClick(context: { api: ElecKoiAuthorApi; signal: AbortSignal }): void | Promise<void>
}

export interface AuthorScriptPanel { id: string; title: string; html: string }

export interface ElecKoiAuthorApi {
  readonly api: { readonly stage: 'preview'; readonly version: string }
  call<TResult = unknown>(method: string, params?: Record<string, unknown>): Promise<TResult>
  readonly app: {
    getInfo(): Promise<AuthorAppInfo>
    getCapabilities(): Promise<AuthorCapability[]>
  }
  readonly context: { current(): Promise<AuthorContext> }
  readonly script: {
    /** Only installed for an explicitly owned running script. */
    getSettings(): Promise<AuthorScriptSettings>
    setSettings(values: Record<string, unknown>, expectedRevision: number): Promise<AuthorScriptSettings>
    getLibrarySettings(): Promise<AuthorScriptSettings>
    setLibrarySettings(values: Record<string, unknown>, expectedRevision: number): Promise<AuthorScriptSettings>
  }
  readonly ui: {
    /** Running script only. IDs are unique within that script, not across scopes. */
    registerButton(button: AuthorScriptButton): () => void
    /** Accepts a native document; relative resources resolve against the owning script file. */
    openPanel(panel: AuthorScriptPanel): Promise<{ id: string }>
    closePanel(id: string): Promise<{ closed: boolean }>
  }
  readonly variables: {
    getState(options?: { messageId?: string }): Promise<Record<string, unknown>>
    getConfig(): Promise<unknown>
    setState(state: Record<string, unknown>): Promise<Record<string, unknown>>
    merge(state: Record<string, unknown>): Promise<Record<string, unknown>>
    applyPatch(patch: AuthorVariablePatch[]): Promise<Record<string, unknown>>
    reset(): Promise<Record<string, unknown>>
    registerRule(rule: AuthorVariableRule): () => void
  }
  readonly openings: {
    list(): Promise<{ items: AuthorOpening[] }>
    current(): Promise<AuthorOpening | null>
    select(id: string): Promise<{ selectedId: string }>
  }
  readonly messages: {
    /** Messages currently loaded by the native conversation view. */
    list(): Promise<AuthorMessage[]>
    getPage(): Promise<AuthorMessagePage>
    pageOlder(beforeSequence: number): Promise<AuthorMessagePage>
    get(id: string): Promise<AuthorMessage>
    current(): Promise<AuthorMessage>
    setContent(id: string, text: string): Promise<AuthorMessage>
    deleteFrom(id: string): Promise<{ ok: true; deletedMessageCount: number; remainingMessageCount: number }>
    regenerate(id: string): Promise<AuthorRunAccepted>
    editAndRegenerate(id: string, text: string): Promise<AuthorRunAccepted>
  }
  readonly chat: {
    current(): Promise<AuthorChatSummary>
    list(): Promise<{ items: AuthorChatSummary[] }>
    getGenerationState(): Promise<AuthorGenerationState>
    /** Reads current loaded history, or loads the exact preceding history cursor first. */
    getAgentTrajectory(options?: { beforeSequence?: number }): Promise<AuthorAgentTrajectory>
    getModels(): Promise<AuthorChatModelCatalog>
    send(text: string, options?: { attachments?: AuthorSendAttachment[] }): Promise<AuthorRunAccepted>
    stopGeneration(): Promise<{ cancelled: boolean }>
    create(options?: { title?: string }): Promise<{ chat: AuthorChatSummary }>
    /** Opens an explicitly identified chat belonging to the same role. */
    open(conversationId: string): Promise<{ chat: AuthorChatSummary }>
    /** Does not select or create a replacement chat after deleting the current one. */
    delete(conversationId: string): Promise<{ deletedId: string; chat: AuthorChatSummary | null }>
    selectModel(options: { configId: string; model: string; reasoningEffort?: string }): Promise<{ configId: string; model: string; reasoningEffort?: string }>
  }
  readonly character: { current(): Promise<Record<string, unknown> | null> }
  readonly settingLibrary: {
    /** The bound character's original unexpanded library, without story overrides or preset entries. */
    current(): Promise<AuthorSettingLibrary | null>
    getSummary(): Promise<{
      characterId: string
      name: string
      activeVersionId: string
      entryCount: number
      groupCount: number
    } | null>
    /** Replaces the bound character's current library content, preserving other versions and management settings. */
    replace(library: AuthorSettingLibrary): Promise<AuthorSettingLibrary>
    getEntry(id: string): Promise<AuthorSettingLibraryEntry>
    updateEntry(id: string, changes: AuthorSettingEntryChanges): Promise<AuthorSettingLibraryEntry>
    /** Atomically edits the character's ordinary entries and active version, leaving story overrides unchanged. */
    updateEntries(updates: AuthorSettingEntryUpdate[]): Promise<AuthorSettingLibraryEntry[]>
  }
  readonly presets: {
    list(): Promise<AuthorPresetCatalog>
    current(): Promise<AuthorPreset | null>
    get(presetId: string): Promise<AuthorPreset>
    getEntry(presetId: string, id: string): Promise<AuthorSettingLibraryEntry>
    /** Edits the stored preset and active version, affecting all chats using that preset. */
    updateEntry(presetId: string, id: string, changes: AuthorSettingEntryChanges): Promise<AuthorSettingLibraryEntry>
    updateEntries(presetId: string, updates: AuthorSettingEntryUpdate[]): Promise<AuthorSettingLibraryEntry[]>
    /** Selects the global preset for subsequent requests, not just the current chat. */
    select(presetId: string): Promise<AuthorPresetCatalog>
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
    /** Requests submission of the official composer; submitted is not a generation receipt. */
    send(): Promise<{ submitted: boolean }>
  }
  readonly events: ElecKoiAuthorEvents
}

declare global {
  interface Window {
    ElecKoi: ElecKoiAuthorApi
    readonly ElecKoiReady: Promise<ElecKoiAuthorApi>
  }
}
