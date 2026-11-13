<!-- 由 pnpm generate:plugin-docs 使用锁定的 DSH 官方生成器生成，请勿手工修改。 -->

# Host 接口引用的数据类型

以下声明由官方 TypeGraphRenderer 从公开方法引用的类型生成。类型应从对应公开包入口导入，完整设定字段保留在原有结构中。

## AgentPreset

```ts
export interface AgentPreset {
    id: string;
    purpose: AgentPresetPurpose;
    name: string;
    modelFamily: AgentPresetModelFamily;
    modelTags: AgentPresetModelTag[];
    libraryGroupId: string;
    activeVersionId: string;
    activeVersionNumber: number;
    profile: AgentPresetProfile;
    entries: SettingLibraryEntry[];
    groups: SettingLibraryGroup[];
    promptPositions: SettingLibraryPromptPosition[];
    toolGroups: AgentToolGroup[];
    extraToolGroups?: AgentToolGroup[];
    subagentModelSelection?: { configId: string; model: string; };
    toolModelConfigIds?: Record<string, string>;
    autoIllustration?: { enabled: boolean; modelConfigId: string; };
    roleplayPlan: { steps: string[]; };
    regexRules: RegexRule[];
    expandedGroupIds: string[];
}
```

源码：[packages/host/product-api/src/types.ts:829](../../packages/host/product-api/src/types.ts#L829)

## AgentPresetCatalog

```ts
export interface AgentPresetCatalog {
    activePresetIds: { roleplay: string; creator: string; };
    groups: AgentPresetLibraryGroup[];
    presets: AgentPresetSummary[];
}
```

源码：[packages/host/product-api/src/types.ts:806](../../packages/host/product-api/src/types.ts#L806)

## AgentPresetExportFormat

```ts
export type AgentPresetExportFormat = 'json' | 'png';
```

源码：[packages/host/product-api/src/types.ts:764](../../packages/host/product-api/src/types.ts#L764)

## AgentPresetExportResult

```ts
export interface AgentPresetExportResult {
    fileName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:866](../../packages/host/product-api/src/types.ts#L866)

## AgentPresetImportDocument

```ts
export interface AgentPresetImportDocument {
    displayName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:853](../../packages/host/product-api/src/types.ts#L853)

## AgentPresetImportResult

```ts
export interface AgentPresetImportResult {
    preset: AgentPreset;
    source: AgentPresetImportSource;
    skippedUnsupportedEntries: number;
    skippedDepthRegexCount: number;
}
```

源码：[packages/host/product-api/src/types.ts:859](../../packages/host/product-api/src/types.ts#L859)

## AgentPresetImportSource

```ts
export type AgentPresetImportSource = 'eleckoi' | 'sillytavern';
```

源码：[packages/host/product-api/src/types.ts:763](../../packages/host/product-api/src/types.ts#L763)

## AgentPresetLibraryGroup

```ts
export interface AgentPresetLibraryGroup {
    id: string;
    purpose: AgentPresetPurpose;
    name: string;
    sortIndex: number;
}
```

源码：[packages/host/product-api/src/types.ts:786](../../packages/host/product-api/src/types.ts#L786)

## AgentPresetModelFamily

```ts
export type AgentPresetModelFamily = 'general' | 'claude' | 'openai' | 'gemini' | 'deepseek' | 'other';
```

源码：[packages/host/product-api/src/types.ts:762](../../packages/host/product-api/src/types.ts#L762)

## AgentPresetModelTag

```ts
export interface AgentPresetModelTag {
    id: string;
    label: string;
    providerId: string;
}
```

源码：[packages/host/product-api/src/types.ts:766](../../packages/host/product-api/src/types.ts#L766)

## AgentPresetProfile

```ts
export interface AgentPresetProfile {
    authorName: string;
    authorAvatarPath: string;
    usageInstructions: string;
    timeline: AgentPresetTimelineItem[];
}
```

源码：[packages/host/product-api/src/types.ts:779](../../packages/host/product-api/src/types.ts#L779)

## AgentPresetPurpose

```ts
export type AgentPresetPurpose = 'roleplay' | 'creator';
```

源码：[packages/host/product-api/src/types.ts:761](../../packages/host/product-api/src/types.ts#L761)

## AgentPresetSummary

```ts
export interface AgentPresetSummary {
    id: string;
    purpose: AgentPresetPurpose;
    name: string;
    modelFamily: AgentPresetModelFamily;
    modelTags: AgentPresetModelTag[];
    libraryGroupId: string;
    activeVersionId: string;
    activeVersionNumber: number;
    entryCount: number;
    profile: AgentPresetProfile;
}
```

源码：[packages/host/product-api/src/types.ts:793](../../packages/host/product-api/src/types.ts#L793)

## AgentPresetTimelineItem

```ts
export interface AgentPresetTimelineItem {
    id: string;
    title: string;
    dateLabel: string;
    note: string;
}
```

源码：[packages/host/product-api/src/types.ts:772](../../packages/host/product-api/src/types.ts#L772)

## AgentToolGroup

```ts
export interface AgentToolGroup {
    id: string;
    name: string;
    description: string;
    source: 'built_in' | 'mcp' | 'extension';
    members: AgentToolMember[];
    enabled: boolean;
    included: boolean;
    available?: boolean;
    plugin?: { id: string; name: string; };
}
```

源码：[packages/host/product-api/src/types.ts:817](../../packages/host/product-api/src/types.ts#L817)

## AgentToolMember

```ts
export interface AgentToolMember {
    name: string;
    description: string;
}
```

源码：[packages/host/product-api/src/types.ts:812](../../packages/host/product-api/src/types.ts#L812)

## AuthorConversationState

```ts
export interface AuthorConversationState {
    variableIdentityJson: string;
    initialVariableStateJson: string;
    currentVariableStateJson: string;
    variableConfig: VariableConfig | null;
    settingLibrarySummary: { characterId: string; name: string; activeVersionId: string; entryCount: number; groupCount: number; } | null;
    settingLibrary: ConversationRuntimeSettingLibrary | null;
}
```

源码：[packages/host/product-api/src/types.ts:351](../../packages/host/product-api/src/types.ts#L351)

## AuthorScriptJson

```ts
export type AuthorScriptJson = null | boolean | number | string | AuthorScriptJson[] | { [key: string]: AuthorScriptJson; };
```

源码：[packages/host/product-api/src/types.ts:79](../../packages/host/product-api/src/types.ts#L79)

## CharacterAsset

```ts
export type CharacterAsset = Pick<AssetDomain.CharacterAsset, keyof AssetDomain.CharacterAsset>;
```

源码：[packages/host/product-api/src/types.ts:2](../../packages/host/product-api/src/types.ts#L2)

## CharacterAssetCatalog

```ts
export type CharacterAssetCatalog = Omit<AssetDomain.CharacterAssetCatalog, 'items' | 'folders'> & { items: CharacterAsset[]; folders: CharacterAssetFolder[]; };
```

源码：[packages/host/product-api/src/types.ts:4](../../packages/host/product-api/src/types.ts#L4)

## CharacterAssetFolder

```ts
export type CharacterAssetFolder = Pick<AssetDomain.CharacterAssetFolder, keyof AssetDomain.CharacterAssetFolder>;
```

源码：[packages/host/product-api/src/types.ts:3](../../packages/host/product-api/src/types.ts#L3)

## CharacterAssetUpload

```ts
export type CharacterAssetUpload = Pick<AssetDomain.CharacterAssetUpload, keyof AssetDomain.CharacterAssetUpload>;
```

源码：[packages/host/product-api/src/types.ts:5](../../packages/host/product-api/src/types.ts#L5)

## CharacterAssetUploadTicket

```ts
export type CharacterAssetUploadTicket = Pick<AssetDomain.CharacterAssetUploadTicket, keyof AssetDomain.CharacterAssetUploadTicket>;
```

源码：[packages/host/product-api/src/types.ts:6](../../packages/host/product-api/src/types.ts#L6)

## CharacterCollection

```ts
export interface CharacterCollection {
    active_character_id: string;
    groups: string[];
    items: CharacterRecord[];
}
```

源码：[packages/host/product-api/src/types.ts:427](../../packages/host/product-api/src/types.ts#L427)

## CharacterConfigurationChange

```ts
export type CharacterConfigurationChange = { kind: 'snapshot'; } | { kind: 'configuration'; domain: 'openings' | 'settingLibraries' | 'globalSettingLibraries' | 'variables' | 'regexRules' | 'agentPresets' | 'scripts'; characterId?: string; };
```

源码：[packages/host/product-api/src/types.ts:214](../../packages/host/product-api/src/types.ts#L214)

## CharacterExportFormat

```ts
export type CharacterExportFormat = 'png' | 'json' | 'zip';
```

源码：[packages/host/product-api/src/types.ts:439](../../packages/host/product-api/src/types.ts#L439)

## CharacterExportResult

```ts
export interface CharacterExportResult {
    fileName: string;
    mimeType: 'image/png' | 'application/json' | 'application/zip';
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:468](../../packages/host/product-api/src/types.ts#L468)

## CharacterGroupAssignment

```ts
export interface CharacterGroupAssignment {
    characterId: string;
    group: string;
}
```

源码：[packages/host/product-api/src/types.ts:433](../../packages/host/product-api/src/types.ts#L433)

## CharacterImportFile

```ts
export interface CharacterImportFile {
    displayName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:441](../../packages/host/product-api/src/types.ts#L441)

## CharacterImportPreview

```ts
export interface CharacterImportPreview {
    token: string;
    items: CharacterImportPreviewItem[];
}
```

源码：[packages/host/product-api/src/types.ts:457](../../packages/host/product-api/src/types.ts#L457)

## CharacterImportPreviewItem

```ts
export interface CharacterImportPreviewItem {
    id: string;
    name: string;
    summary: string;
    warnings: string[];
    imageAvailable: boolean;
    errorMessage: string;
    importable: boolean;
}
```

源码：[packages/host/product-api/src/types.ts:447](../../packages/host/product-api/src/types.ts#L447)

## CharacterImportResult

```ts
export interface CharacterImportResult {
    collection: CharacterCollection;
    importedCharacterIds: string[];
    failedMessages: string[];
}
```

源码：[packages/host/product-api/src/types.ts:462](../../packages/host/product-api/src/types.ts#L462)

## CharacterImportSource

```ts
export type CharacterImportSource = 'eleckoi' | 'sillytavern';
```

源码：[packages/host/product-api/src/types.ts:438](../../packages/host/product-api/src/types.ts#L438)

## CharacterOpeningMessage

```ts
export interface CharacterOpeningMessage {
    id: string;
    title: string;
    content: string;
    variableVersionId?: string | undefined;
}
```

源码：[packages/host/product-api/src/types.ts:506](../../packages/host/product-api/src/types.ts#L506)

## CharacterOpenings

```ts
export interface CharacterOpenings {
    characterId: string;
    enabled: boolean;
    openingMessages: CharacterOpeningMessage[];
    defaultOpeningMessageId: string;
}
```

源码：[packages/host/product-api/src/types.ts:512](../../packages/host/product-api/src/types.ts#L512)

## CharacterPersona

```ts
export interface CharacterPersona {
    assistant_name: string;
    assistant_avatar: string;
    assistant_square: string;
    assistant_cover: string;
    image_prompt?: string;
    opening?: string;
    show_opening?: boolean;
    user_name?: string;
    user_avatar?: string;
    user_square?: string;
    user_portrait?: string;
}
```

源码：[packages/host/product-api/src/types.ts:389](../../packages/host/product-api/src/types.ts#L389)

## CharacterRecord

```ts
export interface CharacterRecord {
    id: string;
    name?: string;
    avatar?: string;
    group?: string;
    groupName?: string;
    groupViewOrder?: number;
    folder?: string;
    frontendBeautyEnabled?: boolean | number;
    profileAge?: string;
    profileSex?: string;
    profileHeight?: string;
    profileBirthday?: string;
    profileLike?: string;
    showOpening?: boolean | number;
    chatBackground?: string;
    chatBackgroundOpacity?: number;
    chatBackgroundBlur?: number;
    chatBackgroundScrim?: number;
    chatBackgroundCustom?: { image: string; opacity: number; blur: number; scrim: number; };
    primaryOpening?: string;
    persona?: CharacterPersona;
}
```

源码：[packages/host/product-api/src/types.ts:403](../../packages/host/product-api/src/types.ts#L403)

## ConversationChange

```ts
export type ConversationChange = { kind: 'snapshot'; } | { kind: 'generation'; conversationId: string; error: string; } | { kind: 'catalog'; conversationId: string; reason: 'created' | 'deleted' | 'updated'; } | { kind: 'messages'; conversationId: string; reason: 'edited' | 'deleted' | 'regenerated'; messageIds: string[]; sessionRewritten?: boolean; };
```

源码：[packages/host/product-api/src/types.ts:202](../../packages/host/product-api/src/types.ts#L202)

## ConversationCreateInput

```ts
export interface ConversationCreateInput {
    title?: string;
    metadata?: Partial<ConversationMetadata>;
}
```

源码：[packages/host/product-api/src/types.ts:158](../../packages/host/product-api/src/types.ts#L158)

## ConversationDetailsMetadata

```ts
export interface ConversationDetailsMetadata {
    conversation: ConversationRecord;
    metadata: ConversationMetadata;
    runtimeSessionId: string;
    messages: ConversationMessageMetadata[];
    hasMore: boolean;
    beforeSequence: number | null;
    runtimeVariableStateByTurn?: Record<string, string>;
}
```

源码：[packages/host/product-api/src/types.ts:277](../../packages/host/product-api/src/types.ts#L277)

## ConversationMessageDisplayInput

```ts
export interface ConversationMessageDisplayInput {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    variableStateJson: string;
    status: 'complete' | 'streaming' | 'error' | 'cancelled';
    createdAt: string;
    reasoning?: ConversationReasoningDisplayInput[];
}
```

源码：[packages/host/product-api/src/types.ts:289](../../packages/host/product-api/src/types.ts#L289)

## ConversationMessageDisplayResult

```ts
export interface ConversationMessageDisplayResult {
    id: string;
    sourceContent: string;
    displayContent: string;
    variableStateJson: string;
    reasoning?: ConversationReasoningDisplayResult[];
}
```

源码：[packages/host/product-api/src/types.ts:304](../../packages/host/product-api/src/types.ts#L304)

## ConversationMessageMetadata

```ts
export interface ConversationMessageMetadata {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant';
    variableStateJson: string;
    status: 'complete' | 'streaming' | 'error' | 'cancelled';
    createdAt: string;
    content?: string;
    displayContent?: string;
    turnId?: string;
    speakerId?: string;
    speakerName?: string;
    speakerAvatar?: string;
    sequence?: number;
    messageIndex?: number;
    responseIndex?: number;
    runtimeSessionId?: string;
    dshMessageId?: string;
    sessionEventSeq?: number;
    dshTurn?: number;
    openingOptions?: ConversationOpeningOption[];
    selectedOpeningId?: string;
    canChangeOpening?: boolean;
}
```

源码：[packages/host/product-api/src/types.ts:242](../../packages/host/product-api/src/types.ts#L242)

## ConversationMetadata

```ts
export interface ConversationMetadata {
    characterId: string;
    characterName: string;
    characterAvatar: string;
    characterPersona: CharacterPersona;
}
```

源码：[packages/host/product-api/src/types.ts:151](../../packages/host/product-api/src/types.ts#L151)

## ConversationModelSelection

```ts
export interface ConversationModelSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
```

源码：[packages/host/product-api/src/types.ts:137](../../packages/host/product-api/src/types.ts#L137)

## ConversationOpeningOption

```ts
export interface ConversationOpeningOption {
    id: string;
    title: string;
    content: string;
    variableVersionId?: string;
    displayContent?: string;
    initialVariableStateJson: string;
}
```

源码：[packages/host/product-api/src/types.ts:232](../../packages/host/product-api/src/types.ts#L232)

## ConversationReasoningDisplayInput

```ts
export interface ConversationReasoningDisplayInput {
    id: string;
    text: string;
}
```

源码：[packages/host/product-api/src/types.ts:300](../../packages/host/product-api/src/types.ts#L300)

## ConversationReasoningDisplayResult

```ts
export interface ConversationReasoningDisplayResult {
    id: string;
    sourceText: string;
    displayText: string;
}
```

源码：[packages/host/product-api/src/types.ts:301](../../packages/host/product-api/src/types.ts#L301)

## ConversationRecord

```ts
export interface ConversationRecord {
    id: string;
    title: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
}
```

源码：[packages/host/product-api/src/types.ts:143](../../packages/host/product-api/src/types.ts#L143)

## ConversationRequestPreview

```ts
export interface ConversationRequestPreview {
    id: string;
    items: Array<{ order: number; messageId: string; role: 'system' | 'user' | 'assistant'; kind: 'system' | 'prompt' | 'history' | 'user' | 'assistant' | 'tool' | 'context'; title: string; source: string; anchor: string; content: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:181](../../packages/host/product-api/src/types.ts#L181)

## ConversationRequestPreviewSummary

```ts
export interface ConversationRequestPreviewSummary {
    id: string;
    round: number | null;
    request: number;
    turn: number;
    step: number;
    provider: string;
    model: string;
}
```

源码：[packages/host/product-api/src/types.ts:170](../../packages/host/product-api/src/types.ts#L170)

## ConversationRuntimeSettingLibrary

```ts
export interface ConversationRuntimeSettingLibrary {
    characterId: string;
    name: string;
    entries: SettingLibraryEntry[];
    groups: SettingLibraryGroup[];
    promptPositions: SettingLibraryPromptPosition[];
}
```

源码：[packages/host/product-api/src/types.ts:872](../../packages/host/product-api/src/types.ts#L872)

## ConversationSummary

```ts
export interface ConversationSummary extends ConversationRecord {
    metadata: ConversationMetadata;
    runtimeSessionId: string;
}
```

源码：[packages/host/product-api/src/types.ts:163](../../packages/host/product-api/src/types.ts#L163)

## ConversationVariableConfiguration

```ts
export interface ConversationVariableConfiguration {
    versionId: string;
    versions: Array<{ id: string; name: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:343](../../packages/host/product-api/src/types.ts#L343)

## CreateCreatorProjectInput

```ts
export interface CreateCreatorProjectInput {
    name: string;
    mode: CreatorProjectMode;
    parentDirectory: string;
    sourceCharacterId?: string;
}
```

源码：[packages/host/product-api/src/types.ts:491](../../packages/host/product-api/src/types.ts#L491)

## CreatorProject

```ts
export interface CreatorProject {
    id: string;
    name: string;
    mode: CreatorProjectMode;
    rootPath: string;
    sourceCharacterId: string;
    coverImage: string;
    createdAt: string;
    updatedAt: string;
}
```

源码：[packages/host/product-api/src/types.ts:476](../../packages/host/product-api/src/types.ts#L476)

## CreatorProjectCollection

```ts
export interface CreatorProjectCollection {
    items: CreatorProject[];
}
```

源码：[packages/host/product-api/src/types.ts:487](../../packages/host/product-api/src/types.ts#L487)

## CreatorProjectMode

```ts
export type CreatorProjectMode = 'blank' | 'existing';
```

源码：[packages/host/product-api/src/types.ts:474](../../packages/host/product-api/src/types.ts#L474)

## CreatorStudioMessage

```ts
export interface CreatorStudioMessage {
    eventSeq: number;
    role: 'user' | 'assistant';
    text: string;
    turn: number;
}
```

源码：[packages/host/product-api/src/types.ts:1076](../../packages/host/product-api/src/types.ts#L1076)

## CreatorStudioSession

```ts
export interface CreatorStudioSession {
    sessionId: string;
    presetId: string;
    characterId: string;
}
```

源码：[packages/host/product-api/src/types.ts:1075](../../packages/host/product-api/src/types.ts#L1075)

## CreatorStudioSessionSummary

```ts
export interface CreatorStudioSessionSummary extends CreatorStudioSession {
    title: string;
    updatedAt: number;
    pinned: boolean;
    pinIndex: number;
}
```

源码：[packages/host/product-api/src/types.ts:1077](../../packages/host/product-api/src/types.ts#L1077)

## DisplayPreferencesSnapshot

```ts
export interface DisplayPreferencesSnapshot {
    ui: Record<string, DisplayPreferenceValue>;
    chatDisplay: Record<string, DisplayPreferenceValue>;
    writable: boolean;
    revision: number;
}
```

源码：[packages/host/product-api/src/types.ts:1069](../../packages/host/product-api/src/types.ts#L1069)

## DisplayPreferenceValue

```ts
export type DisplayPreferenceValue = null | boolean | number | string | DisplayPreferenceValue[] | { [key: string]: DisplayPreferenceValue; };
```

源码：[packages/host/product-api/src/types.ts:1066](../../packages/host/product-api/src/types.ts#L1066)

## EditorLibraryAddress

```ts
export interface EditorLibraryAddress {
    kind: EditorLibraryKind;
    scope: 'global' | 'character' | 'preset';
    ownerId: string;
}
```

源码：[packages/host/product-api/src/types.ts:34](../../packages/host/product-api/src/types.ts#L34)

## EditorLibraryKind

```ts
export type EditorLibraryKind = 'scripts' | 'regex';
```

源码：[packages/host/product-api/src/types.ts:33](../../packages/host/product-api/src/types.ts#L33)

## EditorLibrarySaveRequest

```ts
export interface EditorLibrarySaveRequest {
    kind: EditorLibraryKind;
    documents: string[];
    versions: EditorLibraryVersions[];
}
```

源码：[packages/host/product-api/src/types.ts:41](../../packages/host/product-api/src/types.ts#L41)

## EditorLibrarySaveResult

```ts
export interface EditorLibrarySaveResult {
    documents: string[];
    versions: EditorLibraryVersions[];
}
```

源码：[packages/host/product-api/src/types.ts:42](../../packages/host/product-api/src/types.ts#L42)

## EditorLibraryVersions

```ts
export interface EditorLibraryVersions extends EditorLibraryAddress {
    revision: number;
    resourceRevision: string;
    activeVersionId: string;
    versions: Array<{ id: string; name: string; content: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:35](../../packages/host/product-api/src/types.ts#L35)

## ElecKoiHostStatus

```ts
export interface ElecKoiHostStatus {
    architecture: 'dsh-remote';
    protocolVersion: 1;
}
```

源码：[packages/host/product-api/src/types.ts:28](../../packages/host/product-api/src/types.ts#L28)

## FrontendExport

```ts
export type FrontendExport = Omit<Native.FrontendExport, 'project'> & { project: FrontendProject; };
```

源码：[packages/host/product-api/src/frontend-project-types.ts:18](../../packages/host/product-api/src/frontend-project-types.ts#L18)

## FrontendFile

```ts
export type FrontendFile = Native.FrontendFile;
```

源码：[packages/host/product-api/src/frontend-project-types.ts:17](../../packages/host/product-api/src/frontend-project-types.ts#L17)

## FrontendFileInput

```ts
export type FrontendFileInput = Native.FrontendFileInput;
```

源码：[packages/host/product-api/src/frontend-project-types.ts:15](../../packages/host/product-api/src/frontend-project-types.ts#L15)

## FrontendFileQuery

```ts
export type FrontendFileQuery = Native.FrontendFileQuery;
```

源码：[packages/host/product-api/src/frontend-project-types.ts:16](../../packages/host/product-api/src/frontend-project-types.ts#L16)

## FrontendImport

```ts
export type FrontendImport = Omit<Native.FrontendImport, 'manifest' | 'project'> & { manifest?: FrontendJson; project?: FrontendJson; };
```

源码：[packages/host/product-api/src/frontend-project-types.ts:13](../../packages/host/product-api/src/frontend-project-types.ts#L13)

## FrontendJson

```ts
export type FrontendJson = Record<string, FrontendValue>;
```

源码：[packages/host/product-api/src/frontend-project-types.ts:6](../../packages/host/product-api/src/frontend-project-types.ts#L6)

## FrontendManifest

```ts
export type FrontendManifest = Omit<Native.FrontendManifest, 'config' | 'project'> & { config?: FrontendJson; project?: FrontendJson; };
```

源码：[packages/host/product-api/src/frontend-project-types.ts:10](../../packages/host/product-api/src/frontend-project-types.ts#L10)

## FrontendOwner

```ts
export type FrontendOwner = Native.FrontendOwner;
```

源码：[packages/host/product-api/src/frontend-project-types.ts:8](../../packages/host/product-api/src/frontend-project-types.ts#L8)

## FrontendProject

```ts
export type FrontendProject = Omit<Native.FrontendProject, 'manifest'> & { manifest?: FrontendManifest; };
```

源码：[packages/host/product-api/src/frontend-project-types.ts:11](../../packages/host/product-api/src/frontend-project-types.ts#L11)

## FrontendReplaceFiles

```ts
export type FrontendReplaceFiles = Omit<Native.FrontendReplaceFiles, 'manifest'> & { manifest?: FrontendJson; };
```

源码：[packages/host/product-api/src/frontend-project-types.ts:14](../../packages/host/product-api/src/frontend-project-types.ts#L14)

## FrontendValue

```ts
export type FrontendValue = null | boolean | number | string | FrontendValue[] | { [key: string]: FrontendValue; };
```

源码：[packages/host/product-api/src/frontend-project-types.ts:5](../../packages/host/product-api/src/frontend-project-types.ts#L5)

## FrontendWorkspace

```ts
export type FrontendWorkspace = Omit<Native.FrontendWorkspace, 'projects'> & { projects: FrontendProject[]; };
```

源码：[packages/host/product-api/src/frontend-project-types.ts:12](../../packages/host/product-api/src/frontend-project-types.ts#L12)

## GlobalSettingLibrary

```ts
export interface GlobalSettingLibrary {
    id: string;
    name: string;
    enabled: boolean;
    entries: SettingLibraryEntry[];
    groups: SettingLibraryGroup[];
    promptPositions: SettingLibraryPromptPosition[];
    listAllExpanded: boolean;
    expandedGroupIds: string[];
    createdAt: string;
    updatedAt: string;
}
```

源码：[packages/host/product-api/src/types.ts:14](../../packages/host/product-api/src/types.ts#L14)

## GlobalSettingLibraryCollection

```ts
export interface GlobalSettingLibraryCollection {
    revision: number;
    libraries: GlobalSettingLibrary[];
}
```

源码：[packages/host/product-api/src/types.ts:26](../../packages/host/product-api/src/types.ts#L26)

## IllustrationSessionConfiguration

```ts
export interface IllustrationSessionConfiguration {
    autoIllustration?: { enabled: boolean; modelConfigId: string; };
    inheritedFromSessionId?: string;
}
```

源码：[packages/client/features/dsh-auto-illustration/src/index.d.ts:3](../../packages/client/features/dsh-auto-illustration/src/index.d.ts#L3)

## ModelDiscoveryInput

```ts
export interface ModelDiscoveryInput {
    builtinProvider?: string;
    configId: string;
    baseURL: string;
    api: string;
    apiKey?: string;
    headers?: Record<string, string>;
}
```

源码：[packages/host/product-api/src/types.ts:118](../../packages/host/product-api/src/types.ts#L118)

## ModelDiscoveryResult

```ts
export interface ModelDiscoveryResult {
    id: string;
    name?: string;
    contextWindow?: number;
    maxTokens?: number;
    inputModalities?: readonly ('text' | 'image')[];
    reasoningEfforts?: Record<string, string | null>;
    reasoningEffort?: string;
}
```

源码：[packages/host/product-api/src/types.ts:127](../../packages/host/product-api/src/types.ts#L127)

## NativeAuthorRuleReply

```ts
export type NativeAuthorRuleReply = { id: string; ok: true; stateJson: string; } | { id: string; ok: false; message: string; };
```

源码：[packages/host/product-api/src/types.ts:115](../../packages/host/product-api/src/types.ts#L115)

## NativeAuthorRuleTask

```ts
export type NativeAuthorRuleTask = { kind: 'ready'; version: string; } | { kind: 'process'; id: string; runId: string; conversationId: string; stage: 'before' | 'after' | 'afterSchema'; stateJson: string; beforeJson: string; scriptSettings: NativeAuthorScriptSettingsUpdate[] | null; } | { kind: 'cancel'; runId: string; };
```

源码：[packages/host/product-api/src/types.ts:111](../../packages/host/product-api/src/types.ts#L111)

## NativeAuthorScript

```ts
export interface NativeAuthorScript {
    buttonsVisible: boolean;
    key: string;
    id: string;
    name: string;
    scope: ScriptLibraryScope;
    ownerId: string;
    source: string;
    entryUrl: string;
    settings: { [key: string]: AuthorScriptJson; };
    librarySettings: { [key: string]: AuthorScriptJson; };
}
```

源码：[packages/host/product-api/src/types.ts:80](../../packages/host/product-api/src/types.ts#L80)

## NativeAuthorScriptCatalog

```ts
export interface NativeAuthorScriptCatalog {
    conversationId: string;
    characterId: string;
    presetId: string;
    version: string;
    scripts: NativeAuthorScript[];
}
```

源码：[packages/host/product-api/src/types.ts:97](../../packages/host/product-api/src/types.ts#L97)

## NativeAuthorScriptIdentity

```ts
export interface NativeAuthorScriptIdentity {
    scope: ScriptLibraryScope;
    ownerId: string;
    scriptId: string;
}
```

源码：[packages/host/product-api/src/types.ts:104](../../packages/host/product-api/src/types.ts#L104)

## NativeAuthorScriptSettings

```ts
export interface NativeAuthorScriptSettings {
    revision: number;
    values: { [key: string]: AuthorScriptJson; };
}
```

源码：[packages/host/product-api/src/types.ts:105](../../packages/host/product-api/src/types.ts#L105)

## NativeAuthorScriptSettingsUpdate

```ts
export interface NativeAuthorScriptSettingsUpdate {
    key: string;
    settings: { [key: string]: AuthorScriptJson; };
    librarySettings: { [key: string]: AuthorScriptJson; };
}
```

源码：[packages/host/product-api/src/types.ts:106](../../packages/host/product-api/src/types.ts#L106)

## NativeFrontendChange

```ts
export type NativeFrontendChange = { kind: 'snapshot' | 'changed'; revision: number; };
```

源码：[packages/host/product-api/src/frontend-project-types.ts:20](../../packages/host/product-api/src/frontend-project-types.ts#L20)

## PersonaProfile

```ts
export interface PersonaProfile {
    assistant_name: string;
    assistant_avatar: string;
    assistant_square: string;
    assistant_cover: string;
    opening: string;
    show_opening: boolean;
    user_name: string;
    user_avatar: string;
    user_square: string;
    user_portrait: string;
}
```

源码：[packages/host/product-api/src/types.ts:376](../../packages/host/product-api/src/types.ts#L376)

## ProductRecordChange

```ts
export type ProductRecordChange = { kind: 'snapshot'; } | { kind: 'records'; domain: 'characters' | 'persona' | 'creatorProjects'; ids?: string[]; };
```

源码：[packages/host/product-api/src/types.ts:222](../../packages/host/product-api/src/types.ts#L222)

## RegexEditorTarget

```ts
export interface RegexEditorTarget {
    scope: 'character' | 'preset';
    ownerId: string;
}
```

源码：[packages/host/product-api/src/types.ts:730](../../packages/host/product-api/src/types.ts#L730)

## RegexRule

```ts
export interface RegexRule {
    id: string;
    name: string;
    pattern: string;
    replacement: string;
    targets: RegexRuleTarget[];
    enabled: boolean;
    displayOnly: boolean;
    promptOnly: boolean;
    runOnEdit: boolean;
    order: number;
    trimStrings?: string[];
    minDepth?: number | null;
    maxDepth?: number | null;
    substituteRegex?: 0 | 1 | 2;
}
```

源码：[packages/host/product-api/src/types.ts:677](../../packages/host/product-api/src/types.ts#L677)

## RegexRuleCollection

```ts
export interface RegexRuleCollection {
    characterId: string;
    agentPresetId: string;
    agentPresetName: string;
    agentPresetRegexRevision: string;
    globalEnabled?: boolean;
    agentPresetEnabled?: boolean;
    characterEnabled?: boolean;
    globalRules: RegexRule[];
    agentPresetRules: RegexRule[];
    characterRules: RegexRule[];
    versions: RegexRuleVersion[];
    activeVersionId: string;
    revision: number;
}
```

源码：[packages/host/product-api/src/types.ts:702](../../packages/host/product-api/src/types.ts#L702)

## RegexRuleEditorCollection

```ts
export interface RegexRuleEditorCollection {
    target: RegexEditorTarget;
    ownerRevision: string;
    globalEnabled?: boolean;
    agentPresetEnabled?: boolean;
    characterEnabled?: boolean;
    globalRules: RegexRule[];
    agentPresetRules: RegexRule[];
    characterRules: RegexRule[];
    versions: RegexRuleVersion[];
    activeVersionId: string;
    revision: number;
}
```

源码：[packages/host/product-api/src/types.ts:735](../../packages/host/product-api/src/types.ts#L735)

## RegexRuleEditorImportResult

```ts
export interface RegexRuleEditorImportResult {
    collection: RegexRuleEditorCollection;
    importedFileCount: number;
    importedRuleCount: number;
    failedFileNames: string[];
}
```

源码：[packages/host/product-api/src/types.ts:749](../../packages/host/product-api/src/types.ts#L749)

## RegexRuleImportDocument

```ts
export interface RegexRuleImportDocument {
    displayName: string;
    json: string;
}
```

源码：[packages/host/product-api/src/types.ts:718](../../packages/host/product-api/src/types.ts#L718)

## RegexRuleImportResult

```ts
export interface RegexRuleImportResult {
    collection: RegexRuleCollection;
    importedFileCount: number;
    importedRuleCount: number;
    failedFileNames: string[];
}
```

源码：[packages/host/product-api/src/types.ts:723](../../packages/host/product-api/src/types.ts#L723)

## RegexRuleScope

```ts
export type RegexRuleScope = 'Global' | 'AgentPreset' | 'Character';
```

源码：[packages/host/product-api/src/types.ts:674](../../packages/host/product-api/src/types.ts#L674)

## RegexRuleTarget

```ts
export type RegexRuleTarget = 'UserInput' | 'AiOutput' | 'SettingContent' | 'Reasoning';
```

源码：[packages/host/product-api/src/types.ts:675](../../packages/host/product-api/src/types.ts#L675)

## RegexRuleTestResult

```ts
export interface RegexRuleTestResult {
    output: string;
    validationMessage: string | null;
}
```

源码：[packages/host/product-api/src/types.ts:756](../../packages/host/product-api/src/types.ts#L756)

## RegexRuleVersion

```ts
export interface RegexRuleVersion {
    id: string;
    name: string;
    globalEnabledIds: string[];
    agentPresetEnabledIds: string[];
    characterEnabledIds: string[];
}
```

源码：[packages/host/product-api/src/types.ts:694](../../packages/host/product-api/src/types.ts#L694)

## RequestPreviewSummary

```ts
export interface RequestPreviewSummary {
    id: string;
    round: number | null;
    request: number;
    turn: number;
    step: number;
    provider: string;
    model: string;
}
```

源码：[packages/client/features/dsh-client-roleplay/src/host/request-preview.d.mts:4](../../packages/client/features/dsh-client-roleplay/src/host/request-preview.d.mts#L4)

## RoleplayRequestContextItem

```ts
export interface RoleplayRequestContextItem {
    order: number;
    messageId: string;
    role: 'system' | 'user' | 'assistant';
    kind: 'system' | 'prompt' | 'history' | 'user' | 'assistant' | 'tool' | 'context';
    title: string;
    source: string;
    anchor: string;
    content: string;
}
```

源码：[packages/client/features/dsh-client-roleplay/src/projections.d.ts:4](../../packages/client/features/dsh-client-roleplay/src/projections.d.ts#L4)

## ScriptFolder

```ts
export interface ScriptFolder {
    [key: string]: AuthorScriptJson;
    type: 'folder';
    id: string;
    name: string;
    enabled: boolean;
    icon: string;
    color: string;
    scripts: ScriptItem[];
}
```

源码：[packages/host/product-api/src/types.ts:60](../../packages/host/product-api/src/types.ts#L60)

## ScriptItem

```ts
export interface ScriptItem {
    [key: string]: AuthorScriptJson;
    type: 'script';
    id: string;
    name: string;
    enabled: boolean;
    content: string;
    info: string;
    data: { [key: string]: AuthorScriptJson; };
    button: { [key: string]: AuthorScriptJson; enabled: boolean; buttons: Array<{ [key: string]: AuthorScriptJson; name: string; visible: boolean; }>; };
    export_with: { [key: string]: AuthorScriptJson; data: boolean; button: boolean; };
}
```

源码：[packages/host/product-api/src/types.ts:47](../../packages/host/product-api/src/types.ts#L47)

## ScriptLibrary

```ts
export interface ScriptLibrary {
    scope: ScriptLibraryScope;
    ownerId: string;
    enabled: boolean;
    revision: number;
    trees: ScriptTree[];
    variables: { [key: string]: AuthorScriptJson; };
}
```

源码：[packages/host/product-api/src/types.ts:71](../../packages/host/product-api/src/types.ts#L71)

## ScriptLibraryScope

```ts
export type ScriptLibraryScope = 'global' | 'character' | 'preset';
```

源码：[packages/host/product-api/src/types.ts:46](../../packages/host/product-api/src/types.ts#L46)

## ScriptTree

```ts
export type ScriptTree = ScriptItem | ScriptFolder;
```

源码：[packages/host/product-api/src/types.ts:70](../../packages/host/product-api/src/types.ts#L70)

## ScriptWorkspace

```ts
export interface ScriptWorkspace {
    path: string;
    version: string;
    entries: Array<{ id: string; file: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:92](../../packages/host/product-api/src/types.ts#L92)

## SessionModelParameterPatch

```ts
export interface SessionModelParameterPatch {
    contextWindowTokens?: number | null | undefined;
    maxOutputTokens?: number | null | undefined;
    autoCompactTokenLimit?: number | null | undefined;
    temperature?: number | null | undefined;
    topP?: number | null | undefined;
}
```

源码：[packages/host/product-api/src/types.ts:8](../../packages/host/product-api/src/types.ts#L8)

## SessionModelParameterState

```ts
export interface SessionModelParameterState {
    revision: number;
    entries: Record<string, SessionModelParameterPatch>;
}
```

源码：[packages/host/product-api/src/types.ts:12](../../packages/host/product-api/src/types.ts#L12)

## SettingLibrary

```ts
export interface SettingLibrary {
    characterId: string;
    name: string;
    entries: SettingLibraryEntry[];
    groups: SettingLibraryGroup[];
    promptPositions: SettingLibraryPromptPosition[];
    activeVersionId: string;
    versions: SettingLibraryVersion[];
    listAllExpanded: boolean;
    expandedGroupIds: string[];
}
```

源码：[packages/host/product-api/src/types.ts:596](../../packages/host/product-api/src/types.ts#L596)

## SettingLibraryContent

```ts
export type SettingLibraryContent = Pick<SettingLibrary, 'characterId' | 'name' | 'entries' | 'groups' | 'promptPositions'>;
```

源码：[packages/host/product-api/src/types.ts:608](../../packages/host/product-api/src/types.ts#L608)

## SettingLibraryConversation

```ts
export interface SettingLibraryConversation {
    sessionId: string;
    title: string;
    characterName: string;
    characterAvatar: string;
    summary: string;
    updatedAt: string;
    library: SettingLibrary;
}
```

源码：[packages/host/product-api/src/types.ts:610](../../packages/host/product-api/src/types.ts#L610)

## SettingLibraryEntry

```ts
export interface SettingLibraryEntry {
    id: string;
    title: string;
    iconId: string;
    kind: 'normal' | 'opening' | 'history_compaction' | 'hidden_tool_timeline';
    groupId: string;
    content: string;
    openingMessages: SettingLibraryOpeningMessage[];
    defaultOpeningMessageId: string;
    agentSelectionHint: string;
    agentReadStrategy: 'required' | 'keyword' | 'normal';
    dynamicMode: 'standard' | 'ejs_reference';
    contentMode: 'plain_text' | 'ejs';
    keywords: string[];
    keywordScanDepth: number;
    conditionKeywords: string[];
    keywordCondition: 'none' | 'any' | 'all' | 'not_any';
    keywordUseRegex: boolean;
    keywordIgnoreCase: boolean;
    keywordWholeWord: boolean;
    keywordRecursionDepth: number;
    triggerMode: 'always' | 'agent_tool' | null;
    enabled: boolean;
    position: SettingLibraryPosition | null;
    promptPositionId: string;
    insertRole: 'system' | 'user' | 'assistant';
    order: number;
    viewOrder: number;
    groupViewOrder: number;
    treeViewOrder: number;
    createdAt: string;
    updatedAt: string;
}
```

源码：[packages/host/product-api/src/types.ts:526](../../packages/host/product-api/src/types.ts#L526)

## SettingLibraryEntryChanges

```ts
export type SettingLibraryEntryChanges = Partial<Omit<SettingLibraryEntry, 'id' | 'kind' | 'openingMessages' | 'defaultOpeningMessageId' | 'createdAt' | 'updatedAt'>>;
```

源码：[packages/host/product-api/src/types.ts:570](../../packages/host/product-api/src/types.ts#L570)

## SettingLibraryEntryUpdate

```ts
export interface SettingLibraryEntryUpdate {
    id: string;
    changes: SettingLibraryEntryChanges;
}
```

源码：[packages/host/product-api/src/types.ts:572](../../packages/host/product-api/src/types.ts#L572)

## SettingLibraryGroup

```ts
export interface SettingLibraryGroup {
    id: string;
    name: string;
    parentId: string;
    order: number;
    treeViewOrder: number;
    createdAt: string;
    updatedAt: string;
}
```

源码：[packages/host/product-api/src/types.ts:560](../../packages/host/product-api/src/types.ts#L560)

## SettingLibraryOpeningMessage

```ts
export interface SettingLibraryOpeningMessage {
    id: string;
    title: string;
    content: string;
    variableVersionId?: string;
}
```

源码：[packages/host/product-api/src/types.ts:519](../../packages/host/product-api/src/types.ts#L519)

## SettingLibraryPosition

```ts
export type SettingLibraryPosition = 'instructions' | 'insert_point_1' | 'insert_point_2' | 'insert_point_3' | 'insert_point_4' | 'insert_point_5';
```

源码：[packages/host/product-api/src/types.ts:498](../../packages/host/product-api/src/types.ts#L498)

## SettingLibraryPromptPosition

```ts
export interface SettingLibraryPromptPosition {
    id: string;
    name: string;
    anchor: SettingLibraryPosition;
    side: 'before_setting_position' | 'after_setting_position';
    order: number;
    createdAt: string;
    updatedAt: string;
}
```

源码：[packages/host/product-api/src/types.ts:574](../../packages/host/product-api/src/types.ts#L574)

## SettingLibraryVersion

```ts
export interface SettingLibraryVersion {
    id: string;
    name: string;
    entries: SettingLibraryEntry[];
    groups: SettingLibraryGroup[];
    promptPositions: SettingLibraryPromptPosition[];
    listAllExpanded: boolean;
    expandedGroupIds: string[];
    createdAt: string;
    updatedAt: string;
}
```

源码：[packages/host/product-api/src/types.ts:584](../../packages/host/product-api/src/types.ts#L584)

## TavilyConnection

```ts
export interface TavilyConnection {
    ok: true;
    plan: string;
    used: number;
    limit: number;
}
```

源码：[packages/host/product-api/src/types.ts:369](../../packages/host/product-api/src/types.ts#L369)

## VariableConfig

```ts
export interface VariableConfig {
    characterId: string;
    name: string;
    initialStateJson: string;
    schemaCode: string;
    objects: VariableObjectConfig[];
    variables: VariableItemConfig[];
    expandedObjectIds: string[];
    activeVersionId: string;
    versions: VariableConfigVersion[];
}
```

源码：[packages/host/product-api/src/types.ts:662](../../packages/host/product-api/src/types.ts#L662)

## VariableConfigVersion

```ts
export interface VariableConfigVersion {
    id: string;
    name: string;
    initialStateJson: string;
    schemaCode: string;
    objects: VariableObjectConfig[];
    variables: VariableItemConfig[];
    expandedObjectIds: string[];
    createdAt: string;
    updatedAt: string;
}
```

源码：[packages/host/product-api/src/types.ts:650](../../packages/host/product-api/src/types.ts#L650)

## VariableFloorSnapshot

```ts
export interface VariableFloorSnapshot {
    id: string;
    label: string;
    messagePreview: string;
    createdAt: string;
    state: VariableStateDocument;
    changedValueCount: number;
    changedPaths: string[];
}
```

源码：[packages/host/product-api/src/types.ts:333](../../packages/host/product-api/src/types.ts#L333)

## VariableItemConfig

```ts
export interface VariableItemConfig {
    id: string;
    title: string;
    objectId: string;
    enabled: boolean;
    type: '' | 'number' | 'string' | 'boolean' | 'object' | 'array' | 'null';
    defaultValue: string;
    description: string;
    updateRule: string;
    readMode: 'required' | 'on_demand';
    order: number;
    treeViewOrder: number;
    createdAt: string;
    updatedAt: string;
}
```

源码：[packages/host/product-api/src/types.ts:634](../../packages/host/product-api/src/types.ts#L634)

## VariableJsonValue

```ts
export type VariableJsonValue = null | boolean | number | string | VariableJsonValue[] | { [key: string]: VariableJsonValue; };
```

源码：[packages/host/product-api/src/types.ts:322](../../packages/host/product-api/src/types.ts#L322)

## VariableObjectConfig

```ts
export interface VariableObjectConfig {
    id: string;
    name: string;
    parentId: string;
    enabled: boolean;
    description: string;
    updateRule: string;
    dynamicKey: boolean;
    order: number;
    treeViewOrder: number;
    createdAt: string;
    updatedAt: string;
}
```

源码：[packages/host/product-api/src/types.ts:620](../../packages/host/product-api/src/types.ts#L620)

## VariableStateDocument

```ts
export interface VariableStateDocument {
    rawJson: string;
    root: { [key: string]: VariableJsonValue; } | null;
    errorMessage: string;
    topLevelCount: number;
    valueCount: number;
}
```

源码：[packages/host/product-api/src/types.ts:325](../../packages/host/product-api/src/types.ts#L325)

## VariableViewerTimeline

```ts
export interface VariableViewerTimeline {
    initial: VariableStateDocument;
    current: VariableStateDocument;
    floors: VariableFloorSnapshot[];
}
```

源码：[packages/host/product-api/src/types.ts:345](../../packages/host/product-api/src/types.ts#L345)

## WebFetchMode

```ts
export type WebFetchMode = 'http' | 'deepseek_fetch_api';
```

源码：[packages/host/product-api/src/types.ts:367](../../packages/host/product-api/src/types.ts#L367)

## WebSearchMode

```ts
export type WebSearchMode = 'provider_native' | 'tavily' | 'deepseek_search_api';
```

源码：[packages/host/product-api/src/types.ts:366](../../packages/host/product-api/src/types.ts#L366)

## 官方和平台类型

官方类型从其对应的 DSH 公开包入口导入；平台类型使用 TypeScript 标准库。

[锁定版本的官方接口目录](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/docs/subsystems/README.zh.md)

`GenerateOptions`、`RemoteStream`、`Session`
