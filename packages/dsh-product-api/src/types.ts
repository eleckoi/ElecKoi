export interface ElecKoiHostStatus {
  architecture: 'dsh-remote'
  protocolVersion: 1
}

export type CompatibilityValue = null | boolean | number | string | CompatibilityValue[] | { [key: string]: CompatibilityValue }
export interface CompatibilityCommand { method: string; params: { [key: string]: CompatibilityValue } }
export interface CompatibilityChange { event: string; payload: CompatibilityValue }
export interface CompatibilityStoreContract {
  readonly root: string
  get(scope: string, key: string): CompatibilityValue
  put(scope: string, key: string, value: CompatibilityValue): CompatibilityValue
  delete(scope: string, key: string): number
  deleteScope(scope: string): number
  list(scope: string): { [key: string]: CompatibilityValue }
  scopes(prefix: string): string[]
  atomic<T>(operation: () => T): T
  sql(pluginId: string, name: string, statements: Array<{ sql: string; params?: CompatibilityValue[] }>, transaction: boolean): CompatibilityValue[]
  deleteWorldbook(name: string): boolean
}

export interface ModelConnectionInput {
  configId: string
  model: string
  baseURL: string
  api: string
  apiKey?: string
  headers?: Record<string, string>
}

export interface ModelDiscoveryInput {
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
      domain: 'settingLibraries' | 'variables' | 'regexRules' | 'agentPresets'
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
  compatibilityPresentation?: { groupId?: CompatibilityValue; metadata: { [id: string]: CompatibilityValue }; extensions: { [id: string]: CompatibilityValue };
    bindings: { [id: string]: CompatibilityValue }; swipes?: { [id: string]: CompatibilityValue };
    variables?: { [id: string]: CompatibilityValue }; timeline: CompatibilityValue }
}

/** DSH-owned message text submitted to the product display projection. */
export interface ConversationMessageDisplayInput {
  id: string
  role: 'user' | 'assistant'
  content: string
  variableStateJson: string
  status: 'complete' | 'streaming' | 'error' | 'cancelled'
  createdAt: string
}

/** Display-only result. The source text is echoed so the Client can reject stale projections. */
export interface ConversationMessageDisplayResult {
  id: string
  sourceContent: string
  displayContent: string
  variableStateJson: string
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

export interface VariableViewerTimeline {
  current: VariableStateDocument
  floors: VariableFloorSnapshot[]
}

export interface AuthorConversationState {
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

export type WebSearchMode = 'provider_native' | 'tavily'

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

export interface SettingLibraryOpeningMessage {
  id: string
  title: string
  content: string
  variableVersionId?: string
  initialVariableStateJson: string
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
  type: '' | 'number' | 'string' | 'boolean' | 'array'
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
export type RegexRuleTarget = 'UserInput' | 'AiOutput' | 'SlashCommand' | 'SettingContent' | 'Reasoning'

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

export interface RegexRuleTestResult {
  output: string
  validationMessage: string | null
}

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
  name: string
  sortIndex: number
}

export interface AgentPresetSummary {
  id: string
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
  activePresetId: string
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
}

export interface AgentPreset {
  id: string
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
  subagentModelSelection?: { configId: string; model: string }
  toolModelConfigIds?: Record<string, string>
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
    initialStateJson: string
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
    historyCompactionInstructions?: string
  }
  settingLibraryBaseline?: {
    source: ConversationRuntimeSettingLibrary
    projected: ConversationRuntimeSettingLibrary
  }
}

export interface ElecKoiProductDataStore {
  normalizeChatDisplaySettings(value: unknown): unknown
  compatibilityStore(): CompatibilityStoreContract
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
  readAuthorConversationState(conversationId: string): AuthorConversationState
  replaceConversationVariableState(conversationId: string, stateJson: string): string
  createConversation(input: ConversationCreateInput): ConversationDetailsMetadata
  renameConversation(conversationId: string, title: string): ConversationDetailsMetadata
  deleteConversation(conversationId: string): Promise<void>
  selectConversationOpening(conversationId: string, openingId: string): ConversationDetailsMetadata
  updateConversationOpening(conversationId: string, content: string): ConversationDetailsMetadata
  prepareConversationRuntime(conversationId: string, text: string, options?: { preset?: AgentPreset; persona?: Record<string, unknown>; characterId?: string }): ConversationRuntimePreparation
  projectConversationPromptHistory<T extends { role: string; content: string }>(history: readonly T[], preparation: Pick<ConversationRuntimePreparation, 'promptTextContext'>): T[]
  commitConversationRuntime(
    conversationId: string,
    variableStateJson: string | undefined,
    settingLibraryStateJson: string | undefined,
    settingLibraryBaseline: ConversationRuntimePreparation['settingLibraryBaseline'],
    expectedVariableStateJson?: string
  ): void
  snapshotConversationRuntime(conversationId: string): ConversationRuntimeStateSnapshot
  validateConversationRuntimeSnapshot(snapshot: ConversationRuntimeStateSnapshot): void
  restoreConversationRuntime(conversationId: string, snapshot: ConversationRuntimeStateSnapshot): void
  readCharacters(): CharacterCollection
  createCharacter(character: CharacterRecord): CharacterCollection
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
  readSettingLibrary(characterId: string): SettingLibrary
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
  saveRegexRules(characterId: string, collection: RegexRuleCollection, expectedRevision: number): RegexRuleCollection
  importRegexRules(
    characterId: string,
    fallbackScope: RegexRuleScope,
    documents: RegexRuleImportDocument[],
    expectedRevision: number
  ): RegexRuleImportResult
  exportRegexRules(characterId: string, ruleIds: string[]): { fileName: string; json: string }
  testRegexRule(text: string, rule: RegexRule, target: RegexRuleTarget): RegexRuleTestResult
  readAgentPresetCatalog(): AgentPresetCatalog
  readAgentPreset(presetId: string): AgentPreset
  saveAgentPreset(preset: AgentPreset, expectedRegexRules: RegexRule[]): AgentPreset
  createAgentPreset(name: string, libraryGroupId: string): AgentPreset
  importAgentPreset(source: AgentPresetImportSource, document: AgentPresetImportDocument): AgentPresetImportResult
  exportAgentPreset(presetId: string, format: AgentPresetExportFormat): AgentPresetExportResult
  setActiveAgentPreset(presetId: string): AgentPresetCatalog
  createAgentPresetGroup(name: string): AgentPresetCatalog
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
  readonly version: 1
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
export interface CreatorAssistantConversation { sessionId: string; title: string; createdAt: string; legacyConversationId?: string }
export interface CreatorAssistantHistory { projectId: string; activeSessionId: string; items: CreatorAssistantConversation[] }
export interface CreatorAssistantPromptReceipt { accepted: true; requestId: string }
export interface CreatorAssistantCancelReceipt { accepted: true }
