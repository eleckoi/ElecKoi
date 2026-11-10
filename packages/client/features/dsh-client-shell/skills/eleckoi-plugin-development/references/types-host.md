<!-- Generated from docs/plugins/types-host.md; run pnpm generate:plugin-docs. -->

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

源码：[packages/host/product-api/src/types.ts:817](../../packages/host/product-api/src/types.ts#L817)

## AgentPresetCatalog

```ts
export interface AgentPresetCatalog {
    activePresetIds: { roleplay: string; creator: string; };
    groups: AgentPresetLibraryGroup[];
    presets: AgentPresetSummary[];
}
```

源码：[packages/host/product-api/src/types.ts:794](../../packages/host/product-api/src/types.ts#L794)

## AgentPresetExportFormat

```ts
export type AgentPresetExportFormat = 'json' | 'png';
```

源码：[packages/host/product-api/src/types.ts:752](../../packages/host/product-api/src/types.ts#L752)

## AgentPresetExportResult

```ts
export interface AgentPresetExportResult {
    fileName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:854](../../packages/host/product-api/src/types.ts#L854)

## AgentPresetImportDocument

```ts
export interface AgentPresetImportDocument {
    displayName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:841](../../packages/host/product-api/src/types.ts#L841)

## AgentPresetImportResult

```ts
export interface AgentPresetImportResult {
    preset: AgentPreset;
    source: AgentPresetImportSource;
    skippedUnsupportedEntries: number;
    skippedDepthRegexCount: number;
}
```

源码：[packages/host/product-api/src/types.ts:847](../../packages/host/product-api/src/types.ts#L847)

## AgentPresetImportSource

```ts
export type AgentPresetImportSource = 'eleckoi' | 'sillytavern';
```

源码：[packages/host/product-api/src/types.ts:751](../../packages/host/product-api/src/types.ts#L751)

## AgentPresetLibraryGroup

```ts
export interface AgentPresetLibraryGroup {
    id: string;
    purpose: AgentPresetPurpose;
    name: string;
    sortIndex: number;
}
```

源码：[packages/host/product-api/src/types.ts:774](../../packages/host/product-api/src/types.ts#L774)

## AgentPresetModelFamily

```ts
export type AgentPresetModelFamily = 'general' | 'claude' | 'openai' | 'gemini' | 'deepseek' | 'other';
```

源码：[packages/host/product-api/src/types.ts:750](../../packages/host/product-api/src/types.ts#L750)

## AgentPresetModelTag

```ts
export interface AgentPresetModelTag {
    id: string;
    label: string;
    providerId: string;
}
```

源码：[packages/host/product-api/src/types.ts:754](../../packages/host/product-api/src/types.ts#L754)

## AgentPresetProfile

```ts
export interface AgentPresetProfile {
    authorName: string;
    authorAvatarPath: string;
    usageInstructions: string;
    timeline: AgentPresetTimelineItem[];
}
```

源码：[packages/host/product-api/src/types.ts:767](../../packages/host/product-api/src/types.ts#L767)

## AgentPresetPurpose

```ts
export type AgentPresetPurpose = 'roleplay' | 'creator';
```

源码：[packages/host/product-api/src/types.ts:749](../../packages/host/product-api/src/types.ts#L749)

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

源码：[packages/host/product-api/src/types.ts:781](../../packages/host/product-api/src/types.ts#L781)

## AgentPresetTimelineItem

```ts
export interface AgentPresetTimelineItem {
    id: string;
    title: string;
    dateLabel: string;
    note: string;
}
```

源码：[packages/host/product-api/src/types.ts:760](../../packages/host/product-api/src/types.ts#L760)

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

源码：[packages/host/product-api/src/types.ts:805](../../packages/host/product-api/src/types.ts#L805)

## AgentToolMember

```ts
export interface AgentToolMember {
    name: string;
    description: string;
}
```

源码：[packages/host/product-api/src/types.ts:800](../../packages/host/product-api/src/types.ts#L800)

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

源码：[packages/host/product-api/src/types.ts:339](../../packages/host/product-api/src/types.ts#L339)

## AuthorScriptJson

```ts
export type AuthorScriptJson = null | boolean | number | string | AuthorScriptJson[] | { [key: string]: AuthorScriptJson; };
```

源码：[packages/host/product-api/src/types.ts:67](../../packages/host/product-api/src/types.ts#L67)

## CharacterCollection

```ts
export interface CharacterCollection {
    active_character_id: string;
    groups: string[];
    items: CharacterRecord[];
}
```

源码：[packages/host/product-api/src/types.ts:415](../../packages/host/product-api/src/types.ts#L415)

## CharacterConfigurationChange

```ts
export type CharacterConfigurationChange = { kind: 'snapshot'; } | { kind: 'configuration'; domain: 'openings' | 'settingLibraries' | 'globalSettingLibraries' | 'variables' | 'regexRules' | 'agentPresets' | 'scripts'; characterId?: string; };
```

源码：[packages/host/product-api/src/types.ts:202](../../packages/host/product-api/src/types.ts#L202)

## CharacterExportFormat

```ts
export type CharacterExportFormat = 'png' | 'json';
```

源码：[packages/host/product-api/src/types.ts:427](../../packages/host/product-api/src/types.ts#L427)

## CharacterExportResult

```ts
export interface CharacterExportResult {
    fileName: string;
    mimeType: 'image/png' | 'application/json';
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:456](../../packages/host/product-api/src/types.ts#L456)

## CharacterGroupAssignment

```ts
export interface CharacterGroupAssignment {
    characterId: string;
    group: string;
}
```

源码：[packages/host/product-api/src/types.ts:421](../../packages/host/product-api/src/types.ts#L421)

## CharacterImportFile

```ts
export interface CharacterImportFile {
    displayName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:429](../../packages/host/product-api/src/types.ts#L429)

## CharacterImportPreview

```ts
export interface CharacterImportPreview {
    token: string;
    items: CharacterImportPreviewItem[];
}
```

源码：[packages/host/product-api/src/types.ts:445](../../packages/host/product-api/src/types.ts#L445)

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

源码：[packages/host/product-api/src/types.ts:435](../../packages/host/product-api/src/types.ts#L435)

## CharacterImportResult

```ts
export interface CharacterImportResult {
    collection: CharacterCollection;
    importedCharacterIds: string[];
    failedMessages: string[];
}
```

源码：[packages/host/product-api/src/types.ts:450](../../packages/host/product-api/src/types.ts#L450)

## CharacterImportSource

```ts
export type CharacterImportSource = 'eleckoi' | 'sillytavern';
```

源码：[packages/host/product-api/src/types.ts:426](../../packages/host/product-api/src/types.ts#L426)

## CharacterOpeningMessage

```ts
export interface CharacterOpeningMessage {
    id: string;
    title: string;
    content: string;
    variableVersionId?: string | undefined;
}
```

源码：[packages/host/product-api/src/types.ts:494](../../packages/host/product-api/src/types.ts#L494)

## CharacterOpenings

```ts
export interface CharacterOpenings {
    characterId: string;
    enabled: boolean;
    openingMessages: CharacterOpeningMessage[];
    defaultOpeningMessageId: string;
}
```

源码：[packages/host/product-api/src/types.ts:500](../../packages/host/product-api/src/types.ts#L500)

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

源码：[packages/host/product-api/src/types.ts:377](../../packages/host/product-api/src/types.ts#L377)

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

源码：[packages/host/product-api/src/types.ts:391](../../packages/host/product-api/src/types.ts#L391)

## ConversationChange

```ts
export type ConversationChange = { kind: 'snapshot'; } | { kind: 'generation'; conversationId: string; error: string; } | { kind: 'catalog'; conversationId: string; reason: 'created' | 'deleted' | 'updated'; } | { kind: 'messages'; conversationId: string; reason: 'edited' | 'deleted' | 'regenerated'; messageIds: string[]; sessionRewritten?: boolean; };
```

源码：[packages/host/product-api/src/types.ts:190](../../packages/host/product-api/src/types.ts#L190)

## ConversationCreateInput

```ts
export interface ConversationCreateInput {
    title?: string;
    metadata?: Partial<ConversationMetadata>;
}
```

源码：[packages/host/product-api/src/types.ts:146](../../packages/host/product-api/src/types.ts#L146)

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

源码：[packages/host/product-api/src/types.ts:265](../../packages/host/product-api/src/types.ts#L265)

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

源码：[packages/host/product-api/src/types.ts:277](../../packages/host/product-api/src/types.ts#L277)

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

源码：[packages/host/product-api/src/types.ts:292](../../packages/host/product-api/src/types.ts#L292)

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

源码：[packages/host/product-api/src/types.ts:230](../../packages/host/product-api/src/types.ts#L230)

## ConversationMetadata

```ts
export interface ConversationMetadata {
    characterId: string;
    characterName: string;
    characterAvatar: string;
    characterPersona: CharacterPersona;
}
```

源码：[packages/host/product-api/src/types.ts:139](../../packages/host/product-api/src/types.ts#L139)

## ConversationModelSelection

```ts
export interface ConversationModelSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
```

源码：[packages/host/product-api/src/types.ts:125](../../packages/host/product-api/src/types.ts#L125)

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

源码：[packages/host/product-api/src/types.ts:220](../../packages/host/product-api/src/types.ts#L220)

## ConversationReasoningDisplayInput

```ts
export interface ConversationReasoningDisplayInput {
    id: string;
    text: string;
}
```

源码：[packages/host/product-api/src/types.ts:288](../../packages/host/product-api/src/types.ts#L288)

## ConversationReasoningDisplayResult

```ts
export interface ConversationReasoningDisplayResult {
    id: string;
    sourceText: string;
    displayText: string;
}
```

源码：[packages/host/product-api/src/types.ts:289](../../packages/host/product-api/src/types.ts#L289)

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

源码：[packages/host/product-api/src/types.ts:131](../../packages/host/product-api/src/types.ts#L131)

## ConversationRequestPreview

```ts
export interface ConversationRequestPreview {
    id: string;
    items: Array<{ order: number; messageId: string; role: 'system' | 'user' | 'assistant'; kind: 'system' | 'prompt' | 'history' | 'user' | 'assistant' | 'tool' | 'context'; title: string; source: string; anchor: string; content: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:169](../../packages/host/product-api/src/types.ts#L169)

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

源码：[packages/host/product-api/src/types.ts:158](../../packages/host/product-api/src/types.ts#L158)

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

源码：[packages/host/product-api/src/types.ts:860](../../packages/host/product-api/src/types.ts#L860)

## ConversationSummary

```ts
export interface ConversationSummary extends ConversationRecord {
    metadata: ConversationMetadata;
    runtimeSessionId: string;
}
```

源码：[packages/host/product-api/src/types.ts:151](../../packages/host/product-api/src/types.ts#L151)

## ConversationVariableConfiguration

```ts
export interface ConversationVariableConfiguration {
    versionId: string;
    versions: Array<{ id: string; name: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:331](../../packages/host/product-api/src/types.ts#L331)

## CreateCreatorProjectInput

```ts
export interface CreateCreatorProjectInput {
    name: string;
    mode: CreatorProjectMode;
    parentDirectory: string;
    sourceCharacterId?: string;
}
```

源码：[packages/host/product-api/src/types.ts:479](../../packages/host/product-api/src/types.ts#L479)

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

源码：[packages/host/product-api/src/types.ts:464](../../packages/host/product-api/src/types.ts#L464)

## CreatorProjectCollection

```ts
export interface CreatorProjectCollection {
    items: CreatorProject[];
}
```

源码：[packages/host/product-api/src/types.ts:475](../../packages/host/product-api/src/types.ts#L475)

## CreatorProjectMode

```ts
export type CreatorProjectMode = 'blank' | 'existing';
```

源码：[packages/host/product-api/src/types.ts:462](../../packages/host/product-api/src/types.ts#L462)

## CreatorStudioMessage

```ts
export interface CreatorStudioMessage {
    eventSeq: number;
    role: 'user' | 'assistant';
    text: string;
    turn: number;
}
```

源码：[packages/host/product-api/src/types.ts:1060](../../packages/host/product-api/src/types.ts#L1060)

## CreatorStudioSession

```ts
export interface CreatorStudioSession {
    sessionId: string;
    presetId: string;
    characterId: string;
}
```

源码：[packages/host/product-api/src/types.ts:1059](../../packages/host/product-api/src/types.ts#L1059)

## CreatorStudioSessionSummary

```ts
export interface CreatorStudioSessionSummary extends CreatorStudioSession {
    title: string;
    updatedAt: number;
    pinned: boolean;
    pinIndex: number;
}
```

源码：[packages/host/product-api/src/types.ts:1061](../../packages/host/product-api/src/types.ts#L1061)

## DisplayPreferencesSnapshot

```ts
export interface DisplayPreferencesSnapshot {
    ui: Record<string, DisplayPreferenceValue>;
    chatDisplay: Record<string, DisplayPreferenceValue>;
    writable: boolean;
    revision: number;
}
```

源码：[packages/host/product-api/src/types.ts:1053](../../packages/host/product-api/src/types.ts#L1053)

## DisplayPreferenceValue

```ts
export type DisplayPreferenceValue = null | boolean | number | string | DisplayPreferenceValue[] | { [key: string]: DisplayPreferenceValue; };
```

源码：[packages/host/product-api/src/types.ts:1050](../../packages/host/product-api/src/types.ts#L1050)

## EditorLibraryAddress

```ts
export interface EditorLibraryAddress {
    kind: EditorLibraryKind;
    scope: 'global' | 'character' | 'preset';
    ownerId: string;
}
```

源码：[packages/host/product-api/src/types.ts:22](../../packages/host/product-api/src/types.ts#L22)

## EditorLibraryKind

```ts
export type EditorLibraryKind = 'scripts' | 'regex';
```

源码：[packages/host/product-api/src/types.ts:21](../../packages/host/product-api/src/types.ts#L21)

## EditorLibrarySaveRequest

```ts
export interface EditorLibrarySaveRequest {
    kind: EditorLibraryKind;
    documents: string[];
    versions: EditorLibraryVersions[];
}
```

源码：[packages/host/product-api/src/types.ts:29](../../packages/host/product-api/src/types.ts#L29)

## EditorLibrarySaveResult

```ts
export interface EditorLibrarySaveResult {
    documents: string[];
    versions: EditorLibraryVersions[];
}
```

源码：[packages/host/product-api/src/types.ts:30](../../packages/host/product-api/src/types.ts#L30)

## EditorLibraryVersions

```ts
export interface EditorLibraryVersions extends EditorLibraryAddress {
    revision: number;
    resourceRevision: string;
    activeVersionId: string;
    versions: Array<{ id: string; name: string; content: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:23](../../packages/host/product-api/src/types.ts#L23)

## ElecKoiHostStatus

```ts
export interface ElecKoiHostStatus {
    architecture: 'dsh-remote';
    protocolVersion: 1;
}
```

源码：[packages/host/product-api/src/types.ts:16](../../packages/host/product-api/src/types.ts#L16)

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

源码：[packages/host/product-api/src/types.ts:2](../../packages/host/product-api/src/types.ts#L2)

## GlobalSettingLibraryCollection

```ts
export interface GlobalSettingLibraryCollection {
    revision: number;
    libraries: GlobalSettingLibrary[];
}
```

源码：[packages/host/product-api/src/types.ts:14](../../packages/host/product-api/src/types.ts#L14)

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

源码：[packages/host/product-api/src/types.ts:106](../../packages/host/product-api/src/types.ts#L106)

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

源码：[packages/host/product-api/src/types.ts:115](../../packages/host/product-api/src/types.ts#L115)

## NativeAuthorRuleReply

```ts
export type NativeAuthorRuleReply = { id: string; ok: true; stateJson: string; } | { id: string; ok: false; message: string; };
```

源码：[packages/host/product-api/src/types.ts:103](../../packages/host/product-api/src/types.ts#L103)

## NativeAuthorRuleTask

```ts
export type NativeAuthorRuleTask = { kind: 'ready'; version: string; } | { kind: 'process'; id: string; runId: string; conversationId: string; stage: 'before' | 'after' | 'afterSchema'; stateJson: string; beforeJson: string; scriptSettings: NativeAuthorScriptSettingsUpdate[] | null; } | { kind: 'cancel'; runId: string; };
```

源码：[packages/host/product-api/src/types.ts:99](../../packages/host/product-api/src/types.ts#L99)

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

源码：[packages/host/product-api/src/types.ts:68](../../packages/host/product-api/src/types.ts#L68)

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

源码：[packages/host/product-api/src/types.ts:85](../../packages/host/product-api/src/types.ts#L85)

## NativeAuthorScriptIdentity

```ts
export interface NativeAuthorScriptIdentity {
    scope: ScriptLibraryScope;
    ownerId: string;
    scriptId: string;
}
```

源码：[packages/host/product-api/src/types.ts:92](../../packages/host/product-api/src/types.ts#L92)

## NativeAuthorScriptSettings

```ts
export interface NativeAuthorScriptSettings {
    revision: number;
    values: { [key: string]: AuthorScriptJson; };
}
```

源码：[packages/host/product-api/src/types.ts:93](../../packages/host/product-api/src/types.ts#L93)

## NativeAuthorScriptSettingsUpdate

```ts
export interface NativeAuthorScriptSettingsUpdate {
    key: string;
    settings: { [key: string]: AuthorScriptJson; };
    librarySettings: { [key: string]: AuthorScriptJson; };
}
```

源码：[packages/host/product-api/src/types.ts:94](../../packages/host/product-api/src/types.ts#L94)

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

源码：[packages/host/product-api/src/types.ts:364](../../packages/host/product-api/src/types.ts#L364)

## ProductRecordChange

```ts
export type ProductRecordChange = { kind: 'snapshot'; } | { kind: 'records'; domain: 'characters' | 'persona' | 'creatorProjects'; ids?: string[]; };
```

源码：[packages/host/product-api/src/types.ts:210](../../packages/host/product-api/src/types.ts#L210)

## RegexEditorTarget

```ts
export interface RegexEditorTarget {
    scope: 'character' | 'preset';
    ownerId: string;
}
```

源码：[packages/host/product-api/src/types.ts:718](../../packages/host/product-api/src/types.ts#L718)

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

源码：[packages/host/product-api/src/types.ts:665](../../packages/host/product-api/src/types.ts#L665)

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

源码：[packages/host/product-api/src/types.ts:690](../../packages/host/product-api/src/types.ts#L690)

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

源码：[packages/host/product-api/src/types.ts:723](../../packages/host/product-api/src/types.ts#L723)

## RegexRuleEditorImportResult

```ts
export interface RegexRuleEditorImportResult {
    collection: RegexRuleEditorCollection;
    importedFileCount: number;
    importedRuleCount: number;
    failedFileNames: string[];
}
```

源码：[packages/host/product-api/src/types.ts:737](../../packages/host/product-api/src/types.ts#L737)

## RegexRuleImportDocument

```ts
export interface RegexRuleImportDocument {
    displayName: string;
    json: string;
}
```

源码：[packages/host/product-api/src/types.ts:706](../../packages/host/product-api/src/types.ts#L706)

## RegexRuleImportResult

```ts
export interface RegexRuleImportResult {
    collection: RegexRuleCollection;
    importedFileCount: number;
    importedRuleCount: number;
    failedFileNames: string[];
}
```

源码：[packages/host/product-api/src/types.ts:711](../../packages/host/product-api/src/types.ts#L711)

## RegexRuleScope

```ts
export type RegexRuleScope = 'Global' | 'AgentPreset' | 'Character';
```

源码：[packages/host/product-api/src/types.ts:662](../../packages/host/product-api/src/types.ts#L662)

## RegexRuleTarget

```ts
export type RegexRuleTarget = 'UserInput' | 'AiOutput' | 'SettingContent' | 'Reasoning';
```

源码：[packages/host/product-api/src/types.ts:663](../../packages/host/product-api/src/types.ts#L663)

## RegexRuleTestResult

```ts
export interface RegexRuleTestResult {
    output: string;
    validationMessage: string | null;
}
```

源码：[packages/host/product-api/src/types.ts:744](../../packages/host/product-api/src/types.ts#L744)

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

源码：[packages/host/product-api/src/types.ts:682](../../packages/host/product-api/src/types.ts#L682)

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

源码：[packages/host/product-api/src/types.ts:48](../../packages/host/product-api/src/types.ts#L48)

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

源码：[packages/host/product-api/src/types.ts:35](../../packages/host/product-api/src/types.ts#L35)

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

源码：[packages/host/product-api/src/types.ts:59](../../packages/host/product-api/src/types.ts#L59)

## ScriptLibraryScope

```ts
export type ScriptLibraryScope = 'global' | 'character' | 'preset';
```

源码：[packages/host/product-api/src/types.ts:34](../../packages/host/product-api/src/types.ts#L34)

## ScriptTree

```ts
export type ScriptTree = ScriptItem | ScriptFolder;
```

源码：[packages/host/product-api/src/types.ts:58](../../packages/host/product-api/src/types.ts#L58)

## ScriptWorkspace

```ts
export interface ScriptWorkspace {
    path: string;
    version: string;
    entries: Array<{ id: string; file: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:80](../../packages/host/product-api/src/types.ts#L80)

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

源码：[packages/host/product-api/src/types.ts:584](../../packages/host/product-api/src/types.ts#L584)

## SettingLibraryContent

```ts
export type SettingLibraryContent = Pick<SettingLibrary, 'characterId' | 'name' | 'entries' | 'groups' | 'promptPositions'>;
```

源码：[packages/host/product-api/src/types.ts:596](../../packages/host/product-api/src/types.ts#L596)

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

源码：[packages/host/product-api/src/types.ts:598](../../packages/host/product-api/src/types.ts#L598)

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

源码：[packages/host/product-api/src/types.ts:514](../../packages/host/product-api/src/types.ts#L514)

## SettingLibraryEntryChanges

```ts
export type SettingLibraryEntryChanges = Partial<Omit<SettingLibraryEntry, 'id' | 'kind' | 'openingMessages' | 'defaultOpeningMessageId' | 'createdAt' | 'updatedAt'>>;
```

源码：[packages/host/product-api/src/types.ts:558](../../packages/host/product-api/src/types.ts#L558)

## SettingLibraryEntryUpdate

```ts
export interface SettingLibraryEntryUpdate {
    id: string;
    changes: SettingLibraryEntryChanges;
}
```

源码：[packages/host/product-api/src/types.ts:560](../../packages/host/product-api/src/types.ts#L560)

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

源码：[packages/host/product-api/src/types.ts:548](../../packages/host/product-api/src/types.ts#L548)

## SettingLibraryOpeningMessage

```ts
export interface SettingLibraryOpeningMessage {
    id: string;
    title: string;
    content: string;
    variableVersionId?: string;
}
```

源码：[packages/host/product-api/src/types.ts:507](../../packages/host/product-api/src/types.ts#L507)

## SettingLibraryPosition

```ts
export type SettingLibraryPosition = 'instructions' | 'insert_point_1' | 'insert_point_2' | 'insert_point_3' | 'insert_point_4' | 'insert_point_5';
```

源码：[packages/host/product-api/src/types.ts:486](../../packages/host/product-api/src/types.ts#L486)

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

源码：[packages/host/product-api/src/types.ts:562](../../packages/host/product-api/src/types.ts#L562)

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

源码：[packages/host/product-api/src/types.ts:572](../../packages/host/product-api/src/types.ts#L572)

## TavilyConnection

```ts
export interface TavilyConnection {
    ok: true;
    plan: string;
    used: number;
    limit: number;
}
```

源码：[packages/host/product-api/src/types.ts:357](../../packages/host/product-api/src/types.ts#L357)

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

源码：[packages/host/product-api/src/types.ts:650](../../packages/host/product-api/src/types.ts#L650)

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

源码：[packages/host/product-api/src/types.ts:638](../../packages/host/product-api/src/types.ts#L638)

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

源码：[packages/host/product-api/src/types.ts:321](../../packages/host/product-api/src/types.ts#L321)

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

源码：[packages/host/product-api/src/types.ts:622](../../packages/host/product-api/src/types.ts#L622)

## VariableJsonValue

```ts
export type VariableJsonValue = null | boolean | number | string | VariableJsonValue[] | { [key: string]: VariableJsonValue; };
```

源码：[packages/host/product-api/src/types.ts:310](../../packages/host/product-api/src/types.ts#L310)

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

源码：[packages/host/product-api/src/types.ts:608](../../packages/host/product-api/src/types.ts#L608)

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

源码：[packages/host/product-api/src/types.ts:313](../../packages/host/product-api/src/types.ts#L313)

## VariableViewerTimeline

```ts
export interface VariableViewerTimeline {
    initial: VariableStateDocument;
    current: VariableStateDocument;
    floors: VariableFloorSnapshot[];
}
```

源码：[packages/host/product-api/src/types.ts:333](../../packages/host/product-api/src/types.ts#L333)

## WebFetchMode

```ts
export type WebFetchMode = 'http' | 'deepseek_fetch_api';
```

源码：[packages/host/product-api/src/types.ts:355](../../packages/host/product-api/src/types.ts#L355)

## WebSearchMode

```ts
export type WebSearchMode = 'provider_native' | 'tavily' | 'deepseek_search_api';
```

源码：[packages/host/product-api/src/types.ts:354](../../packages/host/product-api/src/types.ts#L354)

## 官方和平台类型

官方类型从其对应的 DSH 公开包入口导入；平台类型使用 TypeScript 标准库。

[锁定版本的官方接口目录](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/docs/subsystems/README.zh.md)

`GenerateOptions`、`RemoteStream`、`Session`
