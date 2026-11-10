/** Shared setting libraries are independent of character configuration versions. */
export interface GlobalSettingLibrary {
  id: string
  name: string
  enabled: boolean
  entries: SettingLibraryEntry[]
  groups: SettingLibraryGroup[]
  promptPositions: SettingLibraryPromptPosition[]
  listAllExpanded: boolean
  expandedGroupIds: string[]
  createdAt: string
  updatedAt: string
}
export interface GlobalSettingLibraryCollection { revision: number; libraries: GlobalSettingLibrary[] }

export interface ElecKoiHostStatus {
  architecture: 'dsh-remote'
  protocolVersion: 1
}

export type EditorLibraryKind = 'scripts' | 'regex'
export interface EditorLibraryAddress { kind: EditorLibraryKind; scope: 'global' | 'character' | 'preset'; ownerId: string }
export interface EditorLibraryVersions extends EditorLibraryAddress {
  revision: number
  resourceRevision: string
  activeVersionId: string
  versions: Array<{ id: string; name: string; content: string }>
}
export interface EditorLibrarySaveRequest { kind: EditorLibraryKind; documents: string[]; versions: EditorLibraryVersions[] }
export interface EditorLibrarySaveResult { documents: string[]; versions: EditorLibraryVersions[] }



export type ScriptLibraryScope = 'global' | 'character' | 'preset'
export interface ScriptItem {
  [key: string]: AuthorScriptJson
  type: 'script'
  id: string
  name: string
  enabled: boolean
  content: string
  info: string
  data: { [key: string]: AuthorScriptJson }
  button: { [key: string]: AuthorScriptJson; enabled: boolean;
    buttons: Array<{ [key: string]: AuthorScriptJson; name: string; visible: boolean }> }
  export_with: { [key: string]: AuthorScriptJson; data: boolean; button: boolean }
}
export interface ScriptFolder {
  [key: string]: AuthorScriptJson
  type: 'folder'
  id: string
  name: string
  enabled: boolean
  icon: string
  color: string
  scripts: ScriptItem[]
}
export type ScriptTree = ScriptItem | ScriptFolder
export interface ScriptLibrary {
  scope: ScriptLibraryScope
  ownerId: string
  enabled: boolean
  revision: number
  trees: ScriptTree[]
  variables: { [key: string]: AuthorScriptJson }
}
export type AuthorScriptJson = null | boolean | number | string | AuthorScriptJson[] | { [key: string]: AuthorScriptJson }
export interface NativeAuthorScript {
  buttonsVisible: boolean
  key: string
  id: string
  name: string
  scope: ScriptLibraryScope
  ownerId: string
  source: string
  entryUrl: string
  settings: { [key: string]: AuthorScriptJson }
  librarySettings: { [key: string]: AuthorScriptJson }
}
export interface ScriptWorkspace {
  path: string
  version: string
  entries: Array<{ id: string; file: string }>
}
export interface NativeAuthorScriptCatalog {
  conversationId: string
  characterId: string
  presetId: string
  version: string
  scripts: NativeAuthorScript[]
}
export interface NativeAuthorScriptIdentity { scope: ScriptLibraryScope; ownerId: string; scriptId: string }
export interface NativeAuthorScriptSettings { revision: number; values: { [key: string]: AuthorScriptJson } }
export interface NativeAuthorScriptSettingsUpdate {
  key: string
  settings: { [key: string]: AuthorScriptJson }
  librarySettings: { [key: string]: AuthorScriptJson }
}
export type NativeAuthorRuleTask =
  | { kind: 'ready'; version: string }
  | { kind: 'process'; id: string; runId: string; conversationId: string; stage: 'before' | 'after' | 'afterSchema'; stateJson: string; beforeJson: string; scriptSettings: NativeAuthorScriptSettingsUpdate[] | null }
  | { kind: 'cancel'; runId: string }
export type NativeAuthorRuleReply =
  | { id: string; ok: true; stateJson: string }
  | { id: string; ok: false; message: string }
export interface ModelDiscoveryInput {
  builtinProvider?: string
  configId: string
  baseURL: string
  api: string
  apiKey?: string
  headers?: Record<string, string>
}

export interface ModelDiscoveryResult {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  inputModalities?: readonly ('text' | 'image')[]
  reasoningEfforts?: Record<string, string | null>
  reasoningEffort?: string
}

export interface ConversationModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

export interface ConversationRecord {
  id: string
  title: string
  preview: string
  createdAt: string
  updatedAt: string
}

export interface ConversationMetadata {
  characterId: string
  characterName: string
  characterAvatar: string
  characterPersona: CharacterPersona
}

export interface ConversationCreateInput {
  title?: string
  metadata?: Partial<ConversationMetadata>
}

export interface ConversationSummary extends ConversationRecord {
  metadata: ConversationMetadata
  /** Official DSH Session identity used by the Client object layer. */
  runtimeSessionId: string
}

/** 本次运行期间实际发起的请求目录，不包含请求正文。 */
export interface ConversationRequestPreviewSummary {
  id: string
  round: number | null
  request: number
  turn: number
  step: number
  provider: string
  model: string
}

/** 仅存在于运行期间内存的实际请求输入。 */
export interface ConversationRequestPreview {
  id: string
  items: Array<{
    order: number
    messageId: string
    role: 'system' | 'user' | 'assistant'
    kind: 'system' | 'prompt' | 'history' | 'user' | 'assistant' | 'tool' | 'context'
    title: string
    source: string
    anchor: string
    content: string
  }>
}

/**
 * Live changes to the product-owned conversation catalog.
 *
 * The stream is deliberately a notification feed rather than a second
 * message store.  The Client refreshes the authoritative DSH Session or
 * product projection after receiving a frame.
 */
export type ConversationChange =
  | { kind: 'snapshot' }
  | { kind: 'generation'; conversationId: string; error: string }
  | { kind: 'catalog'; conversationId: string; reason: 'created' | 'deleted' | 'updated' }
  | {
      kind: 'messages'
      conversationId: string
      reason: 'edited' | 'deleted' | 'regenerated'
      messageIds: string[]
      sessionRewritten?: boolean
    }

export type CharacterConfigurationChange =
  | { kind: 'snapshot' }
  | {
      kind: 'configuration'
      domain: 'openings' | 'settingLibraries' | 'globalSettingLibraries' | 'variables' | 'regexRules' | 'agentPresets' | 'scripts'
      characterId?: string
    }

export type ProductRecordChange =
  | { kind: 'snapshot' }
  | {
      kind: 'records'
      domain: 'characters' | 'persona' | 'creatorProjects'
      ids?: string[]
    }

export type ConversationCatalogRecord = ConversationSummary

export interface ConversationOpeningOption {
  id: string
  title: string
  content: string
  variableVersionId?: string
  displayContent?: string
  initialVariableStateJson: string
}

/** Product-owned annotations joined onto official DSH Session messages in the Client. */
export interface ConversationMessageMetadata {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  variableStateJson: string
  status: 'complete' | 'streaming' | 'error' | 'cancelled'
  createdAt: string
  /** Product-owned opening content; ordinary message bodies come from DSH Session events. */
  content?: string
  displayContent?: string
  turnId?: string
  speakerId?: string
  speakerName?: string
  speakerAvatar?: string
  sequence?: number
  messageIndex?: number
  responseIndex?: number
  runtimeSessionId?: string
  dshMessageId?: string
  /** Durable DSH Session event sequence for message mutations. */
  sessionEventSeq?: number
  /** DSH Agent turn that produced or consumed this message. */
  dshTurn?: number
  openingOptions?: ConversationOpeningOption[]
  selectedOpeningId?: string
  /** Client permission derived from the complete DSH input and control projections. */
  canChangeOpening?: boolean
}

export interface ConversationRuntimeStateSnapshot {
  variableStateJson: string
  settingLibraryStateJson: string
  variableIdentityJson?: string
}

export interface ConversationDetailsMetadata {
  conversation: ConversationRecord
  metadata: ConversationMetadata
  runtimeSessionId: string
  messages: ConversationMessageMetadata[]
  hasMore: boolean
  beforeSequence: number | null
  /** Committed post-turn variable snapshots keyed by the authoritative DSH turn. */
  runtimeVariableStateByTurn?: Record<string, string>
}

/** DSH-owned message text submitted to the product display projection. */
export interface ConversationMessageDisplayInput {
  id: string
  role: 'user' | 'assistant'
  content: string
  variableStateJson: string
  status: 'complete' | 'streaming' | 'error' | 'cancelled'
  createdAt: string
  /** Completed reasoning blocks only; tool arguments and results are excluded. */
  reasoning?: ConversationReasoningDisplayInput[]
}

export interface ConversationReasoningDisplayInput { id: string; text: string }
export interface ConversationReasoningDisplayResult { id: string; sourceText: string; displayText: string }

/** Display-only result. The source text is echoed so the Client can reject stale projections. */
export interface ConversationMessageDisplayResult {
  id: string
  sourceContent: string
  displayContent: string
  variableStateJson: string
  reasoning?: ConversationReasoningDisplayResult[]
}

export interface ConversationVariableTimelineMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  variableStateJson: string
  status: 'complete' | 'streaming' | 'error' | 'cancelled'
  createdAt: string
}

export type VariableJsonValue = null | boolean | number | string
  | VariableJsonValue[] | { [key: string]: VariableJsonValue }

export interface VariableStateDocument {
  rawJson: string
  root: { [key: string]: VariableJsonValue } | null
  errorMessage: string
  topLevelCount: number
  valueCount: number
}

export interface VariableFloorSnapshot {
  id: string
  label: string
  messagePreview: string
  createdAt: string
  state: VariableStateDocument
  changedValueCount: number
  changedPaths: string[]
}

export interface ConversationVariableConfiguration { versionId: string; versions: Array<{ id: string; name: string }> }

export interface VariableViewerTimeline {
  initial: VariableStateDocument
  current: VariableStateDocument
  floors: VariableFloorSnapshot[]
}

export interface AuthorConversationState {
  variableIdentityJson: string
  initialVariableStateJson: string
  currentVariableStateJson: string
  variableConfig: VariableConfig | null
  settingLibrarySummary: {
    characterId: string
    name: string
    activeVersionId: string
    entryCount: number
    groupCount: number
  } | null
  settingLibrary: ConversationRuntimeSettingLibrary | null
}

export type WebSearchMode = 'provider_native' | 'tavily' | 'deepseek_search_api'
export type WebFetchMode = 'http' | 'deepseek_fetch_api'

export interface TavilyConnection {
  ok: true
  plan: string
  used: number
  limit: number
}

export interface PersonaProfile {
  assistant_name: string
  assistant_avatar: string
  assistant_square: string
  assistant_cover: string
  opening: string
  show_opening: boolean
  user_name: string
  user_avatar: string
  user_square: string
  user_portrait: string
}

export interface CharacterPersona {
  assistant_name: string
  assistant_avatar: string
  assistant_square: string
  assistant_cover: string
  image_prompt?: string
  opening?: string
  show_opening?: boolean
  user_name?: string
  user_avatar?: string
  user_square?: string
  user_portrait?: string
}

export interface CharacterRecord {
  id: string
  name?: string
  avatar?: string
  group?: string
  groupName?: string
  groupViewOrder?: number
  folder?: string
  frontendBeautyEnabled?: boolean | number
  profileAge?: string
  profileSex?: string
  profileHeight?: string
  profileBirthday?: string
  profileLike?: string
  showOpening?: boolean | number
  chatBackground?: string
  chatBackgroundOpacity?: number
  chatBackgroundBlur?: number
  chatBackgroundScrim?: number
  chatBackgroundCustom?: { image: string; opacity: number; blur: number; scrim: number }
  primaryOpening?: string
  persona?: CharacterPersona
}

export interface CharacterCollection {
  active_character_id: string
  groups: string[]
  items: CharacterRecord[]
}

export interface CharacterGroupAssignment {
  characterId: string
  group: string
}

export type CharacterImportSource = 'eleckoi' | 'sillytavern'
export type CharacterExportFormat = 'png' | 'json'

export interface CharacterImportFile {
  displayName: string
  mimeType: string
  base64: string
}

export interface CharacterImportPreviewItem {
  id: string
  name: string
  summary: string
  warnings: string[]
  imageAvailable: boolean
  errorMessage: string
  importable: boolean
}

export interface CharacterImportPreview {
  token: string
  items: CharacterImportPreviewItem[]
}

export interface CharacterImportResult {
  collection: CharacterCollection
  importedCharacterIds: string[]
  failedMessages: string[]
}

export interface CharacterExportResult {
  fileName: string
  mimeType: 'image/png' | 'application/json'
  base64: string
}

export type CreatorProjectMode = 'blank' | 'existing'

export interface CreatorProject {
  id: string
  name: string
  mode: CreatorProjectMode
  rootPath: string
  sourceCharacterId: string
  coverImage: string
  createdAt: string
  updatedAt: string
}

export interface CreatorProjectCollection {
  items: CreatorProject[]
}

export interface CreateCreatorProjectInput {
  name: string
  mode: CreatorProjectMode
  parentDirectory: string
  sourceCharacterId?: string
}

export type SettingLibraryPosition =
  | 'instructions'
  | 'insert_point_1'
  | 'insert_point_2'
  | 'insert_point_3'
  | 'insert_point_4'
  | 'insert_point_5'

export interface CharacterOpeningMessage {
  id: string
  title: string
  content: string
  variableVersionId?: string | undefined
}
export interface CharacterOpenings {
  characterId: string
  enabled: boolean
  openingMessages: CharacterOpeningMessage[]
  defaultOpeningMessageId: string
}

export interface SettingLibraryOpeningMessage {
  id: string
  title: string
  content: string
  variableVersionId?: string
}

export interface SettingLibraryEntry {
  id: string
  title: string
  iconId: string
  kind: 'normal' | 'opening' | 'history_compaction' | 'hidden_tool_timeline'
  groupId: string
  content: string
  openingMessages: SettingLibraryOpeningMessage[]
  defaultOpeningMessageId: string
  agentSelectionHint: string
  agentReadStrategy: 'required' | 'keyword' | 'normal'
  dynamicMode: 'standard' | 'ejs_reference'
  contentMode: 'plain_text' | 'ejs'
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
  position: SettingLibraryPosition | null
  promptPositionId: string
  insertRole: 'system' | 'user' | 'assistant'
  order: number
  viewOrder: number
  groupViewOrder: number
  treeViewOrder: number
  createdAt: string
  updatedAt: string
}

export interface SettingLibraryGroup {
  id: string
  name: string
  parentId: string
  order: number
  treeViewOrder: number
  createdAt: string
  updatedAt: string
}

export type SettingLibraryEntryChanges = Partial<Omit<SettingLibraryEntry,
  'id' | 'kind' | 'openingMessages' | 'defaultOpeningMessageId' | 'createdAt' | 'updatedAt'>>
export interface SettingLibraryEntryUpdate { id: string; changes: SettingLibraryEntryChanges }

export interface SettingLibraryPromptPosition {
  id: string
  name: string
  anchor: SettingLibraryPosition
  side: 'before_setting_position' | 'after_setting_position'
  order: number
  createdAt: string
  updatedAt: string
}

export interface SettingLibraryVersion {
  id: string
  name: string
  entries: SettingLibraryEntry[]
  groups: SettingLibraryGroup[]
  promptPositions: SettingLibraryPromptPosition[]
  listAllExpanded: boolean
  expandedGroupIds: string[]
  createdAt: string
  updatedAt: string
}

export interface SettingLibrary {
  characterId: string
  name: string
  entries: SettingLibraryEntry[]
  groups: SettingLibraryGroup[]
  promptPositions: SettingLibraryPromptPosition[]
  activeVersionId: string
  versions: SettingLibraryVersion[]
  listAllExpanded: boolean
  expandedGroupIds: string[]
}

export type SettingLibraryContent = Pick<SettingLibrary, 'characterId' | 'name' | 'entries' | 'groups' | 'promptPositions'>

export interface SettingLibraryConversation {
  sessionId: string
  title: string
  characterName: string
  characterAvatar: string
  summary: string
  updatedAt: string
  library: SettingLibrary
}

export interface VariableObjectConfig {
  id: string
  name: string
  parentId: string
  enabled: boolean
  description: string
  updateRule: string
  dynamicKey: boolean
  order: number
  treeViewOrder: number
  createdAt: string
  updatedAt: string
}

export interface VariableItemConfig {
  id: string
  title: string
  objectId: string
  enabled: boolean
  type: '' | 'number' | 'string' | 'boolean' | 'object' | 'array' | 'null'
  defaultValue: string
  description: string
  updateRule: string
  readMode: 'required' | 'on_demand'
  order: number
  treeViewOrder: number
  createdAt: string
  updatedAt: string
}

export interface VariableConfigVersion {
  id: string
  name: string
  initialStateJson: string
  schemaCode: string
  objects: VariableObjectConfig[]
  variables: VariableItemConfig[]
  expandedObjectIds: string[]
  createdAt: string
  updatedAt: string
}

export interface VariableConfig {
  characterId: string
  name: string
  initialStateJson: string
  schemaCode: string
  objects: VariableObjectConfig[]
  variables: VariableItemConfig[]
  expandedObjectIds: string[]
  activeVersionId: string
  versions: VariableConfigVersion[]
}

export type RegexRuleScope = 'Global' | 'AgentPreset' | 'Character'
export type RegexRuleTarget = 'UserInput' | 'AiOutput' | 'SettingContent' | 'Reasoning'

export interface RegexRule {
  id: string
  name: string
  pattern: string
  replacement: string
  targets: RegexRuleTarget[]
  enabled: boolean
  displayOnly: boolean
  promptOnly: boolean
  runOnEdit: boolean
  order: number
  trimStrings?: string[]
  minDepth?: number | null
  maxDepth?: number | null
  substituteRegex?: 0 | 1 | 2
}

export interface RegexRuleVersion {
  id: string
  name: string
  globalEnabledIds: string[]
  agentPresetEnabledIds: string[]
  characterEnabledIds: string[]
}

export interface RegexRuleCollection {
  characterId: string
  agentPresetId: string
  agentPresetName: string
  agentPresetRegexRevision: string
  globalEnabled?: boolean
  agentPresetEnabled?: boolean
  characterEnabled?: boolean
  globalRules: RegexRule[]
  agentPresetRules: RegexRule[]
  characterRules: RegexRule[]
  versions: RegexRuleVersion[]
  activeVersionId: string
  revision: number
}

export interface RegexRuleImportDocument {
  displayName: string
  json: string
}

export interface RegexRuleImportResult {
  collection: RegexRuleCollection
  importedFileCount: number
  importedRuleCount: number
  failedFileNames: string[]
}

export interface RegexEditorTarget {
  scope: 'character' | 'preset'
  ownerId: string
}

export interface RegexRuleEditorCollection {
  target: RegexEditorTarget
  ownerRevision: string
  globalEnabled?: boolean
  agentPresetEnabled?: boolean
  characterEnabled?: boolean
  globalRules: RegexRule[]
  agentPresetRules: RegexRule[]
  characterRules: RegexRule[]
  versions: RegexRuleVersion[]
  activeVersionId: string
  revision: number
}

export interface RegexRuleEditorImportResult {
  collection: RegexRuleEditorCollection
  importedFileCount: number
  importedRuleCount: number
  failedFileNames: string[]
}

export interface RegexRuleTestResult {
  output: string
  validationMessage: string | null
}

export type AgentPresetPurpose = 'roleplay' | 'creator'
export type AgentPresetModelFamily = 'general' | 'claude' | 'openai' | 'gemini' | 'deepseek' | 'other'
export type AgentPresetImportSource = 'eleckoi' | 'sillytavern'
export type AgentPresetExportFormat = 'json' | 'png'

export interface AgentPresetModelTag {
  id: string
  label: string
  providerId: string
}

export interface AgentPresetTimelineItem {
  id: string
  title: string
  dateLabel: string
  note: string
}

export interface AgentPresetProfile {
  authorName: string
  authorAvatarPath: string
  usageInstructions: string
  timeline: AgentPresetTimelineItem[]
}

export interface AgentPresetLibraryGroup {
  id: string
  purpose: AgentPresetPurpose
  name: string
  sortIndex: number
}

export interface AgentPresetSummary {
  id: string
  purpose: AgentPresetPurpose
  name: string
  modelFamily: AgentPresetModelFamily
  modelTags: AgentPresetModelTag[]
  libraryGroupId: string
  activeVersionId: string
  activeVersionNumber: number
  entryCount: number
  profile: AgentPresetProfile
}

export interface AgentPresetCatalog {
  activePresetIds: { roleplay: string; creator: string }
  groups: AgentPresetLibraryGroup[]
  presets: AgentPresetSummary[]
}

export interface AgentToolMember {
  name: string
  description: string
}

export interface AgentToolGroup {
  id: string
  name: string
  description: string
  source: 'built_in' | 'mcp' | 'extension'
  members: AgentToolMember[]
  enabled: boolean
  included: boolean
  available?: boolean
  plugin?: { id: string; name: string }
}

export interface AgentPreset {
  id: string
  purpose: AgentPresetPurpose
  name: string
  modelFamily: AgentPresetModelFamily
  modelTags: AgentPresetModelTag[]
  libraryGroupId: string
  activeVersionId: string
  activeVersionNumber: number
  profile: AgentPresetProfile
  entries: SettingLibraryEntry[]
  groups: SettingLibraryGroup[]
  promptPositions: SettingLibraryPromptPosition[]
  toolGroups: AgentToolGroup[]
  /** Runtime-only tools provided by the player's plugins, outside the preset. */
  extraToolGroups?: AgentToolGroup[]
  subagentModelSelection?: { configId: string; model: string }
  toolModelConfigIds?: Record<string, string>
  autoIllustration?: { enabled: boolean; modelConfigId: string }
  roleplayPlan: { steps: string[] }
  regexRules: RegexRule[]
  expandedGroupIds: string[]
}

export interface AgentPresetImportDocument {
  displayName: string
  mimeType: string
  base64: string
}

export interface AgentPresetImportResult {
  preset: AgentPreset
  source: AgentPresetImportSource
  skippedUnsupportedEntries: number
  skippedDepthRegexCount: number
}

export interface AgentPresetExportResult {
  fileName: string
  mimeType: string
  base64: string
}

export interface ConversationRuntimeSettingLibrary {
  characterId: string
  name: string
  entries: SettingLibraryEntry[]
  groups: SettingLibraryGroup[]
  promptPositions: SettingLibraryPromptPosition[]
}

export interface ConversationRuntimePreparation {
  conversationId: string
  runtimeSessionId: string
  promptTextContext: {
    macros?: { userName: string; characterName: string }
    rules?: RegexRuleCollection
  }
  variableContext?: {
    versionId: string
    identityJson: string
    defaultStateJson: string
    schemaCode: string
    objects: VariableObjectConfig[]
    variables: VariableItemConfig[]
    stateJson: string
  }
  conversationContext: {
    characterId: string
    characterName: string
    persona: Record<string, unknown>
    history: Array<{ role: 'user' | 'assistant'; content: string; speakerName?: string }>
    historyMode: 'prefix'
    currentPromptText: string
    settingLibrary?: ConversationRuntimeSettingLibrary
  }
  disabledToolGroupIds: string[]
  agentPreset: {
    id: string
    versionId: string
    name: string
    roleplayPlan: { steps: string[] }
    subagentModelSelection?: { configId: string; model: string }
    toolModelConfigIds?: Record<string, string>
    autoIllustration?: { enabled: boolean; modelConfigId: string }
    historyCompactionInstructions?: string
  }
  settingLibraryBaseline?: {
    source: ConversationRuntimeSettingLibrary
    projected: ConversationRuntimeSettingLibrary
  }
}

export interface ElecKoiProductDataStore {
  saveImportedTranscript(conversationId: string, messages: Array<{
    role: 'user' | 'assistant'; content: string; variableStateJson?: string; id: string; sessionEventSeq: number; turn: number | null
  }>, opening?: { content: string; variableStateJson?: string }, currentVariableStateJson?: string): void
  readScriptWorkspace(scope: ScriptLibraryScope, ownerId: string): ScriptWorkspace
  readScriptAsset(scope: ScriptLibraryScope, ownerId: string, version: string, file: string): Uint8Array
  watchScriptSources(changed: () => void): () => void
  frontendProjects(): import('@eleckoi/dsh-product-data/frontends').FrontendProjectRepository
  normalizeChatDisplaySettings(value: unknown): unknown
  setDisplayPreferences(value: unknown): void
  prepareDisplayUi(value: Record<string, unknown>): {
    value: Record<string, unknown>
    commit(): void
    rollback(): void
  }
  runtimeSessionId(conversationId: string): string
  exportConversationArchive(conversationId: string): ConversationArchiveSnapshot
  parseConversationArchive(value: unknown): ConversationArchiveSnapshot
  conversationArchiveRuntimeSessionIds(snapshot: ConversationArchiveSnapshot): string[]
  requiredConversationArchiveRuntimeSessionIds(snapshot: ConversationArchiveSnapshot): string[]
  importConversationArchive(
    snapshot: ConversationArchiveSnapshot,
    characterId: string,
    runtimeIds: ReadonlyMap<string, string>,
    conversationId: string,
    options?: { preserveIds?: boolean }
  ): string
  readConversationCatalog(): ConversationCatalogRecord[]
  readConversationDetails(conversationId: string, beforeSequence?: number, limit?: number): ConversationDetailsMetadata
  projectConversationMessages(
    conversationId: string,
    messages: ConversationMessageDisplayInput[]
  ): ConversationMessageDisplayResult[]
  readVariableTimeline(conversationId: string, sessionMessages?: ConversationVariableTimelineMessage[]): VariableViewerTimeline
  readConversationVariableConfiguration(conversationId: string): ConversationVariableConfiguration
  selectConversationVariableVersion(conversationId: string, versionId: string, expectedVersionId: string): ConversationVariableConfiguration
  readAuthorConversationState(conversationId: string): AuthorConversationState
  readConversationVariableContext(conversationId: string): ConversationRuntimePreparation['variableContext']
  replaceConversationVariableState(conversationId: string, stateJson: string, identityJson?: string): string
  updateConversationVariables(conversationId: string, stateJson: string): string
  createConversation(input: ConversationCreateInput): ConversationDetailsMetadata
  renameConversation(conversationId: string, title: string): ConversationDetailsMetadata
  deleteConversation(conversationId: string): Promise<void>
  listInputImageReferences(): Array<{ conversationId: string; attachmentId: string }>
  selectConversationOpening(conversationId: string, openingId: string): ConversationDetailsMetadata
  updateConversationOpening(conversationId: string, content: string): ConversationDetailsMetadata
  prepareConversationRuntime(conversationId: string, text: string, options?: { preset?: AgentPreset; persona?: Record<string, unknown>; characterId?: string }): ConversationRuntimePreparation
  projectConversationPromptHistory<T extends { role: string; content: string }>(history: readonly T[], preparation: Pick<ConversationRuntimePreparation, 'promptTextContext'>): T[]
  commitConversationRuntime(
    conversationId: string,
    variableStateJson: string | undefined,
    settingLibraryStateJson: string | undefined,
    settingLibraryBaseline: ConversationRuntimePreparation['settingLibraryBaseline'],
    expectedVariableStateJson?: string,
    variableIdentityJson?: string,
    expectedVariableIdentityJson?: string
  ): void
  snapshotConversationRuntime(conversationId: string): ConversationRuntimeStateSnapshot
  readRuntimeVariableHistory(conversationId: string, runtimeSessionId: string): Array<{
    messageId: string; turn: number; variableStateJson: string
  }>
  validateConversationRuntimeSnapshot(snapshot: ConversationRuntimeStateSnapshot): void
  restoreConversationRuntime(conversationId: string, snapshot: ConversationRuntimeStateSnapshot): void
  readCharacters(): CharacterCollection
  createCharacter(character: CharacterRecord): CharacterCollection
  duplicateCharacter(characterId: string): { characterId: string; collection: CharacterCollection }
  updateCharacter(character: CharacterRecord): CharacterCollection
  selectCharacter(characterId: string): CharacterCollection
  saveCharacterGroups(groups: string[], assignments: CharacterGroupAssignment[]): CharacterCollection
  deleteCharacters(characterIds: string[]): CharacterCollection
  exportCharacter(characterId: string, format: CharacterExportFormat): CharacterExportResult
  prepareCharacterImports(files: CharacterImportFile[], source: CharacterImportSource): CharacterImportPreview
  commitCharacterImports(token: string): CharacterImportResult
  discardCharacterImports(token: string): void
  readPersona(): PersonaProfile
  savePersona(profile: PersonaProfile): PersonaProfile
  readCharacterOpenings(characterId: string): CharacterOpenings
  saveCharacterOpenings(characterId: string, value: CharacterOpenings): CharacterOpenings
  readSettingLibrary(characterId: string): SettingLibrary
  readGlobalSettingLibraries(): GlobalSettingLibraryCollection
  saveGlobalSettingLibraries(value: GlobalSettingLibraryCollection): GlobalSettingLibraryCollection
  replaceSettingLibraryContent(characterId: string, library: SettingLibraryContent): SettingLibrary
  updateSettingLibraryEntries(characterId: string, updates: SettingLibraryEntryUpdate[]): SettingLibraryEntry[]
  importSettingLibrary(characterId: string, library: SettingLibrary, openingImports: CharacterOpeningMessage[]): SettingLibrary
  saveSettingLibrary(characterId: string, library: SettingLibrary): SettingLibrary
  saveSettingLibraryViewState(characterId: string, expandedGroupIds: string[]): string[]
  readConversationSettingLibraries(characterId: string): SettingLibraryConversation[]
  saveConversationSettingLibrary(characterId: string, conversationId: string, library: SettingLibrary): SettingLibrary
  resetConversationSettingLibrary(characterId: string, conversationId: string): void
  saveConversationSettingLibraryVersion(characterId: string, conversationId: string, name: string): SettingLibrary
  readVariableConfig(characterId: string): VariableConfig
  saveVariableConfig(characterId: string, config: VariableConfig): VariableConfig
  saveVariableConfigViewState(characterId: string, expandedObjectIds: string[]): string[]
  readRegexRules(characterId: string): RegexRuleCollection
  readRegexEditor(target: RegexEditorTarget): RegexRuleEditorCollection
  saveRegexEditor(collection: RegexRuleEditorCollection): RegexRuleEditorCollection
  importRegexEditor(collection: RegexRuleEditorCollection, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[]): RegexRuleEditorImportResult
  exportRegexEditor(target: RegexEditorTarget, ruleIds: string[]): { fileName: string; json: string }
  readScriptLibrary(scope: ScriptLibraryScope, ownerId: string): ScriptLibrary
  readEditorLibraryVersions(address: EditorLibraryAddress): EditorLibraryVersions
  saveEditorLibraries(request: EditorLibrarySaveRequest): EditorLibrarySaveResult
  saveScriptLibrary(library: ScriptLibrary): ScriptLibrary
  updateScriptSettings(scope: ScriptLibraryScope, ownerId: string, scriptId: string, target: 'script' | 'library', values: Record<string, unknown>, expectedRevision: number): ScriptLibrary
  saveScriptLibraries(libraries: ScriptLibrary[]): ScriptLibrary[]
  saveRegexRules(characterId: string, collection: RegexRuleCollection, expectedRevision: number): RegexRuleCollection
  importRegexRules(
    characterId: string,
    fallbackScope: RegexRuleScope,
    documents: RegexRuleImportDocument[],
    expectedRevision: number
  ): RegexRuleImportResult
  exportRegexRules(characterId: string, ruleIds: string[]): { fileName: string; json: string }
  testRegexRule(text: string, rule: RegexRule, target: RegexRuleTarget, options?: { surface?: 'Display' | 'Prompt' | 'Stored'; variablesJson?: string; depth?: number; isEdit?: boolean }, signal?: AbortSignal): Promise<RegexRuleTestResult>
  readAgentPresetCatalog(): AgentPresetCatalog
  readAgentPreset(presetId: string): AgentPreset
  updateAgentPresetEntries(presetId: string, updates: SettingLibraryEntryUpdate[]): SettingLibraryEntry[]
  saveAgentPreset(preset: AgentPreset, expectedRegexRules: RegexRule[], scriptLibrary?: ScriptLibrary): AgentPreset
  createAgentPreset(name: string, libraryGroupId: string, purpose: AgentPresetPurpose): AgentPreset
  importAgentPreset(source: AgentPresetImportSource, document: AgentPresetImportDocument, purpose: AgentPresetPurpose): AgentPresetImportResult
  exportAgentPreset(presetId: string, format: AgentPresetExportFormat): AgentPresetExportResult
  setActiveAgentPreset(presetId: string): AgentPresetCatalog
  createAgentPresetGroup(name: string, purpose: AgentPresetPurpose): AgentPresetCatalog
  renameAgentPresetGroup(groupId: string, name: string): AgentPresetCatalog
  assignAgentPresetGroup(presetId: string, groupId: string): AgentPresetCatalog
  deleteAgentPresetGroup(groupId: string): AgentPresetCatalog
  deleteAgentPreset(presetId: string): AgentPresetCatalog
  readCreatorProjects(): CreatorProjectCollection
  createCreatorProject(input: CreateCreatorProjectInput): CreatorProjectCollection
  deleteCreatorProject(projectId: string): CreatorProjectCollection
}

export interface ConversationArchiveSnapshot {
  readonly format: 'eleckoi.desktop-conversation'
  readonly version: 3
  readonly settingLibraryStateJson: string | null
  readonly characterId: string
  readonly conversationId: string
  readonly tables: Record<string, Array<Record<string, string | number | null>>>
}

export type DisplayPreferenceValue = null | boolean | number | string
  | DisplayPreferenceValue[] | { [key: string]: DisplayPreferenceValue }

export interface DisplayPreferencesSnapshot {
  ui: Record<string, DisplayPreferenceValue>
  chatDisplay: Record<string, DisplayPreferenceValue>
  writable: boolean
  revision: number
}
export interface CreatorStudioSession { sessionId: string; presetId: string; characterId: string }
export interface CreatorStudioMessage { eventSeq: number; role: 'user' | 'assistant'; text: string; turn: number }
export interface CreatorStudioSessionSummary extends CreatorStudioSession { title: string; updatedAt: number; pinned: boolean; pinIndex: number }
export interface CreatorStudioRuntime {
  list(): Promise<CreatorStudioSessionSummary[]>
  create(characterId: string, workspaceId?: string): Promise<CreatorStudioSession>
  open(sessionId: string): Promise<CreatorStudioSession>
  selectCharacter(sessionId: string, characterId: string): Promise<CreatorStudioSession>
  rename(sessionId: string, title: string): Promise<void>
  pin(sessionId: string, pinned: boolean): Promise<void>
  delete(sessionId: string): Promise<void>
  messages(sessionId: string): Promise<CreatorStudioMessage[]>
  deleteMessagesFrom(sessionId: string, eventSeq: number, role: 'user' | 'assistant'): Promise<void>
  regenerate(sessionId: string): Promise<void>
}
