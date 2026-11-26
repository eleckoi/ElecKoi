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

源码：[packages/host/product-api/src/types.ts:871](../../packages/host/product-api/src/types.ts#L871)

## AgentPresetCatalog

```ts
export interface AgentPresetCatalog {
    activePresetIds: { roleplay: string; creator: string; };
    groups: AgentPresetLibraryGroup[];
    presets: AgentPresetSummary[];
}
```

源码：[packages/host/product-api/src/types.ts:848](../../packages/host/product-api/src/types.ts#L848)

## AgentPresetExportFormat

```ts
export type AgentPresetExportFormat = 'json' | 'png';
```

源码：[packages/host/product-api/src/types.ts:806](../../packages/host/product-api/src/types.ts#L806)

## AgentPresetExportResult

```ts
export interface AgentPresetExportResult {
    fileName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:908](../../packages/host/product-api/src/types.ts#L908)

## AgentPresetImportDocument

```ts
export interface AgentPresetImportDocument {
    displayName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:895](../../packages/host/product-api/src/types.ts#L895)

## AgentPresetImportResult

```ts
export interface AgentPresetImportResult {
    preset: AgentPreset;
    source: AgentPresetImportSource;
    skippedUnsupportedEntries: number;
    skippedDepthRegexCount: number;
}
```

源码：[packages/host/product-api/src/types.ts:901](../../packages/host/product-api/src/types.ts#L901)

## AgentPresetImportSource

```ts
export type AgentPresetImportSource = 'eleckoi' | 'sillytavern';
```

源码：[packages/host/product-api/src/types.ts:805](../../packages/host/product-api/src/types.ts#L805)

## AgentPresetLibraryGroup

```ts
export interface AgentPresetLibraryGroup {
    id: string;
    purpose: AgentPresetPurpose;
    name: string;
    sortIndex: number;
}
```

源码：[packages/host/product-api/src/types.ts:828](../../packages/host/product-api/src/types.ts#L828)

## AgentPresetModelFamily

```ts
export type AgentPresetModelFamily = 'general' | 'claude' | 'openai' | 'gemini' | 'deepseek' | 'other';
```

源码：[packages/host/product-api/src/types.ts:804](../../packages/host/product-api/src/types.ts#L804)

## AgentPresetModelTag

```ts
export interface AgentPresetModelTag {
    id: string;
    label: string;
    providerId: string;
}
```

源码：[packages/host/product-api/src/types.ts:808](../../packages/host/product-api/src/types.ts#L808)

## AgentPresetProfile

```ts
export interface AgentPresetProfile {
    authorName: string;
    authorAvatarPath: string;
    usageInstructions: string;
    timeline: AgentPresetTimelineItem[];
}
```

源码：[packages/host/product-api/src/types.ts:821](../../packages/host/product-api/src/types.ts#L821)

## AgentPresetPurpose

```ts
export type AgentPresetPurpose = 'roleplay' | 'creator';
```

源码：[packages/host/product-api/src/types.ts:803](../../packages/host/product-api/src/types.ts#L803)

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

源码：[packages/host/product-api/src/types.ts:835](../../packages/host/product-api/src/types.ts#L835)

## AgentPresetTimelineItem

```ts
export interface AgentPresetTimelineItem {
    id: string;
    title: string;
    dateLabel: string;
    note: string;
}
```

源码：[packages/host/product-api/src/types.ts:814](../../packages/host/product-api/src/types.ts#L814)

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

源码：[packages/host/product-api/src/types.ts:859](../../packages/host/product-api/src/types.ts#L859)

## AgentToolMember

```ts
export interface AgentToolMember {
    name: string;
    description: string;
}
```

源码：[packages/host/product-api/src/types.ts:854](../../packages/host/product-api/src/types.ts#L854)

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

源码：[packages/host/product-api/src/types.ts:376](../../packages/host/product-api/src/types.ts#L376)

## AuthorScriptJson

```ts
export type AuthorScriptJson = null | boolean | number | string | AuthorScriptJson[] | { [key: string]: AuthorScriptJson; };
```

源码：[packages/host/product-api/src/types.ts:82](../../packages/host/product-api/src/types.ts#L82)

## CharacterAsset

```ts
export type CharacterAsset = Pick<AssetDomain.CharacterAsset, keyof AssetDomain.CharacterAsset>;
```

源码：[packages/host/product-api/src/types.ts:5](../../packages/host/product-api/src/types.ts#L5)

## CharacterAssetCatalog

```ts
export type CharacterAssetCatalog = Omit<AssetDomain.CharacterAssetCatalog, 'items' | 'folders'> & { items: CharacterAsset[]; folders: CharacterAssetFolder[]; };
```

源码：[packages/host/product-api/src/types.ts:7](../../packages/host/product-api/src/types.ts#L7)

## CharacterAssetFolder

```ts
export type CharacterAssetFolder = Pick<AssetDomain.CharacterAssetFolder, keyof AssetDomain.CharacterAssetFolder>;
```

源码：[packages/host/product-api/src/types.ts:6](../../packages/host/product-api/src/types.ts#L6)

## CharacterAssetUpload

```ts
export type CharacterAssetUpload = Pick<AssetDomain.CharacterAssetUpload, keyof AssetDomain.CharacterAssetUpload>;
```

源码：[packages/host/product-api/src/types.ts:8](../../packages/host/product-api/src/types.ts#L8)

## CharacterAssetUploadTicket

```ts
export type CharacterAssetUploadTicket = Pick<AssetDomain.CharacterAssetUploadTicket, keyof AssetDomain.CharacterAssetUploadTicket>;
```

源码：[packages/host/product-api/src/types.ts:9](../../packages/host/product-api/src/types.ts#L9)

## CharacterCastMember

```ts
export interface CharacterCastMember {
    id: string;
    name: string;
    portraitAssetId: string | null;
    circleAssetId: string | null;
    squareAssetId: string | null;
    crop: { zoom: number; offset: { x: number; y: number; }; rotation: number; } | null;
}
```

源码：[packages/host/product-api/src/types.ts:428](../../packages/host/product-api/src/types.ts#L428)

## CharacterCollection

```ts
export interface CharacterCollection {
    active_character_id: string;
    groups: string[];
    items: CharacterRecord[];
}
```

源码：[packages/host/product-api/src/types.ts:467](../../packages/host/product-api/src/types.ts#L467)

## CharacterConfigurationChange

```ts
export type CharacterConfigurationChange = { kind: 'snapshot'; } | { kind: 'configuration'; domain: 'openings' | 'settingLibraries' | 'globalSettingLibraries' | 'variables' | 'regexRules' | 'agentPresets' | 'scripts'; characterId?: string; };
```

源码：[packages/host/product-api/src/types.ts:217](../../packages/host/product-api/src/types.ts#L217)

## CharacterExportFormat

```ts
export type CharacterExportFormat = 'png' | 'zip';
```

源码：[packages/host/product-api/src/types.ts:479](../../packages/host/product-api/src/types.ts#L479)

## CharacterExportResult

```ts
export interface CharacterExportResult {
    fileName: string;
    mimeType: 'image/png' | 'application/zip';
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:508](../../packages/host/product-api/src/types.ts#L508)

## CharacterGroupAssignment

```ts
export interface CharacterGroupAssignment {
    characterId: string;
    group: string;
}
```

源码：[packages/host/product-api/src/types.ts:473](../../packages/host/product-api/src/types.ts#L473)

## CharacterImportFile

```ts
export interface CharacterImportFile {
    displayName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/host/product-api/src/types.ts:481](../../packages/host/product-api/src/types.ts#L481)

## CharacterImportPreview

```ts
export interface CharacterImportPreview {
    token: string;
    items: CharacterImportPreviewItem[];
}
```

源码：[packages/host/product-api/src/types.ts:497](../../packages/host/product-api/src/types.ts#L497)

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

源码：[packages/host/product-api/src/types.ts:487](../../packages/host/product-api/src/types.ts#L487)

## CharacterImportResult

```ts
export interface CharacterImportResult {
    collection: CharacterCollection;
    importedCharacterIds: string[];
    failedMessages: string[];
}
```

源码：[packages/host/product-api/src/types.ts:502](../../packages/host/product-api/src/types.ts#L502)

## CharacterImportSource

```ts
export type CharacterImportSource = 'eleckoi' | 'sillytavern';
```

源码：[packages/host/product-api/src/types.ts:478](../../packages/host/product-api/src/types.ts#L478)

## CharacterOpeningMessage

```ts
export interface CharacterOpeningMessage {
    id: string;
    title: string;
    content: string;
    variableVersionId?: string | undefined;
    segments?: Array<{ id: string; text: string; } & ({ kind: 'cover'; } | { kind: 'speech'; speakerId: string; })> | undefined;
}
```

源码：[packages/host/product-api/src/types.ts:546](../../packages/host/product-api/src/types.ts#L546)

## CharacterOpenings

```ts
export interface CharacterOpenings {
    characterId: string;
    enabled: boolean;
    openingMessages: CharacterOpeningMessage[];
    defaultOpeningMessageId: string;
}
```

源码：[packages/host/product-api/src/types.ts:555](../../packages/host/product-api/src/types.ts#L555)

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

源码：[packages/host/product-api/src/types.ts:414](../../packages/host/product-api/src/types.ts#L414)

## CharacterRecord

```ts
export interface CharacterRecord {
    id: string;
    cast?: CharacterCastMember[] | undefined;
    addedAtEpochMs?: number;
    editedAtEpochMs?: number;
    authorName?: string;
    authorAvatar?: string;
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

源码：[packages/host/product-api/src/types.ts:437](../../packages/host/product-api/src/types.ts#L437)

## ConversationChange

```ts
export type ConversationChange = { kind: 'snapshot'; } | { kind: 'generation'; conversationId: string; error: string; } | { kind: 'catalog'; conversationId: string; reason: 'created' | 'deleted' | 'updated'; } | { kind: 'messages'; conversationId: string; reason: 'edited' | 'deleted' | 'regenerated'; messageIds: string[]; sessionRewritten?: boolean; };
```

源码：[packages/host/product-api/src/types.ts:205](../../packages/host/product-api/src/types.ts#L205)

## ConversationCreateInput

```ts
export interface ConversationCreateInput {
    title?: string;
    metadata?: Partial<ConversationMetadata>;
}
```

源码：[packages/host/product-api/src/types.ts:161](../../packages/host/product-api/src/types.ts#L161)

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

源码：[packages/host/product-api/src/types.ts:290](../../packages/host/product-api/src/types.ts#L290)

## ConversationMessageDisplayInput

```ts
export interface ConversationMessageDisplayInput {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    roleplayReply?: true;
    variableStateJson: string;
    status: 'complete' | 'streaming' | 'error' | 'cancelled';
    createdAt: string;
    reasoning?: ConversationReasoningDisplayInput[];
    openingSegments?: ConversationOpeningSegmentDisplayInput[];
    roleplayBlocks?: ConversationRoleplayBlockDisplayInput[];
}
```

源码：[packages/host/product-api/src/types.ts:302](../../packages/host/product-api/src/types.ts#L302)

## ConversationMessageDisplayResult

```ts
export interface ConversationMessageDisplayResult {
    id: string;
    sourceContent: string;
    displayContent: string;
    variableStateJson: string;
    reasoning?: ConversationReasoningDisplayResult[];
    openingSegments?: ConversationOpeningSegmentDisplayResult[];
    roleplayGroups?: ConversationOpeningSegmentDisplayResult[];
}
```

源码：[packages/host/product-api/src/types.ts:327](../../packages/host/product-api/src/types.ts#L327)

## ConversationMessageEdit

```ts
export type ConversationMessageEdit = string | Array<{ id: string; text: string; }>;
```

源码：[packages/host/product-api/src/types.ts:3](../../packages/host/product-api/src/types.ts#L3)

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

源码：[packages/host/product-api/src/types.ts:255](../../packages/host/product-api/src/types.ts#L255)

## ConversationMetadata

```ts
export interface ConversationMetadata {
    characterId: string;
    characterName: string;
    characterAvatar: string;
    characterPersona: CharacterPersona;
}
```

源码：[packages/host/product-api/src/types.ts:154](../../packages/host/product-api/src/types.ts#L154)

## ConversationModelSelection

```ts
export interface ConversationModelSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
```

源码：[packages/host/product-api/src/types.ts:140](../../packages/host/product-api/src/types.ts#L140)

## ConversationOpeningOption

```ts
export interface ConversationOpeningOption {
    id: string;
    title: string;
    content: string;
    variableVersionId?: string;
    displayContent?: string;
    segments?: Array<{ id: string; kind: 'cover' | 'speech'; text: string; speakerId?: string | undefined; speakerName?: string | undefined; speakerAvatar?: string | undefined; speakerCrop?: CharacterCastMember['crop'] | undefined; displayContent?: string | undefined; }>;
    initialVariableStateJson: string;
}
```

源码：[packages/host/product-api/src/types.ts:235](../../packages/host/product-api/src/types.ts#L235)

## ConversationOpeningSegmentDisplayInput

```ts
export interface ConversationOpeningSegmentDisplayInput {
    id: string;
    text: string;
}
```

源码：[packages/host/product-api/src/types.ts:318](../../packages/host/product-api/src/types.ts#L318)

## ConversationOpeningSegmentDisplayResult

```ts
export interface ConversationOpeningSegmentDisplayResult {
    id: string;
    sourceText: string;
    displayText: string;
}
```

源码：[packages/host/product-api/src/types.ts:319](../../packages/host/product-api/src/types.ts#L319)

## ConversationReasoningDisplayInput

```ts
export interface ConversationReasoningDisplayInput {
    id: string;
    text: string;
}
```

源码：[packages/host/product-api/src/types.ts:316](../../packages/host/product-api/src/types.ts#L316)

## ConversationReasoningDisplayResult

```ts
export interface ConversationReasoningDisplayResult {
    id: string;
    sourceText: string;
    displayText: string;
}
```

源码：[packages/host/product-api/src/types.ts:317](../../packages/host/product-api/src/types.ts#L317)

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

源码：[packages/host/product-api/src/types.ts:146](../../packages/host/product-api/src/types.ts#L146)

## ConversationRequestPreview

```ts
export interface ConversationRequestPreview {
    id: string;
    items: Array<{ order: number; messageId: string; role: 'system' | 'user' | 'assistant'; kind: 'system' | 'prompt' | 'history' | 'user' | 'assistant' | 'tool' | 'context'; title: string; source: string; anchor: string; content: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:184](../../packages/host/product-api/src/types.ts#L184)

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

源码：[packages/host/product-api/src/types.ts:173](../../packages/host/product-api/src/types.ts#L173)

## ConversationRoleplayBlockDisplayInput

```ts
export interface ConversationRoleplayBlockDisplayInput extends ConversationOpeningSegmentDisplayInput {
    kind: 'speech' | 'cover';
    speakerId?: string;
    speakerName?: string;
}
```

源码：[packages/host/product-api/src/types.ts:320](../../packages/host/product-api/src/types.ts#L320)

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

源码：[packages/host/product-api/src/types.ts:914](../../packages/host/product-api/src/types.ts#L914)

## ConversationSummary

```ts
export interface ConversationSummary extends ConversationRecord {
    metadata: ConversationMetadata;
    runtimeSessionId: string;
}
```

源码：[packages/host/product-api/src/types.ts:166](../../packages/host/product-api/src/types.ts#L166)

## ConversationVariableConfiguration

```ts
export interface ConversationVariableConfiguration {
    versionId: string;
    versions: Array<{ id: string; name: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:368](../../packages/host/product-api/src/types.ts#L368)

## CreateCreatorProjectInput

```ts
export interface CreateCreatorProjectInput {
    name: string;
    mode: CreatorProjectMode;
    parentDirectory: string;
    sourceCharacterId?: string;
}
```

源码：[packages/host/product-api/src/types.ts:531](../../packages/host/product-api/src/types.ts#L531)

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

源码：[packages/host/product-api/src/types.ts:516](../../packages/host/product-api/src/types.ts#L516)

## CreatorProjectCollection

```ts
export interface CreatorProjectCollection {
    items: CreatorProject[];
}
```

源码：[packages/host/product-api/src/types.ts:527](../../packages/host/product-api/src/types.ts#L527)

## CreatorProjectMode

```ts
export type CreatorProjectMode = 'blank' | 'existing';
```

源码：[packages/host/product-api/src/types.ts:514](../../packages/host/product-api/src/types.ts#L514)

## CreatorStudioMessage

```ts
export interface CreatorStudioMessage {
    eventSeq: number;
    role: 'user' | 'assistant';
    text: string;
    turn: number;
}
```

源码：[packages/host/product-api/src/types.ts:1123](../../packages/host/product-api/src/types.ts#L1123)

## CreatorStudioSession

```ts
export interface CreatorStudioSession {
    sessionId: string;
    presetId: string;
    characterId: string;
}
```

源码：[packages/host/product-api/src/types.ts:1122](../../packages/host/product-api/src/types.ts#L1122)

## CreatorStudioSessionSummary

```ts
export interface CreatorStudioSessionSummary extends CreatorStudioSession {
    title: string;
    updatedAt: number;
    pinned: boolean;
    pinIndex: number;
}
```

源码：[packages/host/product-api/src/types.ts:1124](../../packages/host/product-api/src/types.ts#L1124)

## DisplayPreferencesSnapshot

```ts
export interface DisplayPreferencesSnapshot {
    ui: Record<string, DisplayPreferenceValue>;
    chatDisplay: Record<string, DisplayPreferenceValue>;
    writable: boolean;
    revision: number;
}
```

源码：[packages/host/product-api/src/types.ts:1116](../../packages/host/product-api/src/types.ts#L1116)

## DisplayPreferenceValue

```ts
export type DisplayPreferenceValue = null | boolean | number | string | DisplayPreferenceValue[] | { [key: string]: DisplayPreferenceValue; };
```

源码：[packages/host/product-api/src/types.ts:1113](../../packages/host/product-api/src/types.ts#L1113)

## EditorLibraryAddress

```ts
export interface EditorLibraryAddress {
    kind: EditorLibraryKind;
    scope: 'global' | 'character' | 'preset';
    ownerId: string;
}
```

源码：[packages/host/product-api/src/types.ts:37](../../packages/host/product-api/src/types.ts#L37)

## EditorLibraryKind

```ts
export type EditorLibraryKind = 'scripts' | 'regex';
```

源码：[packages/host/product-api/src/types.ts:36](../../packages/host/product-api/src/types.ts#L36)

## EditorLibrarySaveRequest

```ts
export interface EditorLibrarySaveRequest {
    kind: EditorLibraryKind;
    documents: string[];
    versions: EditorLibraryVersions[];
}
```

源码：[packages/host/product-api/src/types.ts:44](../../packages/host/product-api/src/types.ts#L44)

## EditorLibrarySaveResult

```ts
export interface EditorLibrarySaveResult {
    documents: string[];
    versions: EditorLibraryVersions[];
}
```

源码：[packages/host/product-api/src/types.ts:45](../../packages/host/product-api/src/types.ts#L45)

## EditorLibraryVersions

```ts
export interface EditorLibraryVersions extends EditorLibraryAddress {
    revision: number;
    resourceRevision: string;
    activeVersionId: string;
    versions: Array<{ id: string; name: string; content: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:38](../../packages/host/product-api/src/types.ts#L38)

## ElecKoiHostStatus

```ts
export interface ElecKoiHostStatus {
    architecture: 'dsh-remote';
    protocolVersion: 1;
}
```

源码：[packages/host/product-api/src/types.ts:31](../../packages/host/product-api/src/types.ts#L31)

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

源码：[packages/host/product-api/src/types.ts:17](../../packages/host/product-api/src/types.ts#L17)

## GlobalSettingLibraryCollection

```ts
export interface GlobalSettingLibraryCollection {
    revision: number;
    libraries: GlobalSettingLibrary[];
}
```

源码：[packages/host/product-api/src/types.ts:29](../../packages/host/product-api/src/types.ts#L29)

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

源码：[packages/host/product-api/src/types.ts:121](../../packages/host/product-api/src/types.ts#L121)

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

源码：[packages/host/product-api/src/types.ts:130](../../packages/host/product-api/src/types.ts#L130)

## NativeAuthorRuleReply

```ts
export type NativeAuthorRuleReply = { id: string; ok: true; stateJson: string; } | { id: string; ok: false; message: string; };
```

源码：[packages/host/product-api/src/types.ts:118](../../packages/host/product-api/src/types.ts#L118)

## NativeAuthorRuleTask

```ts
export type NativeAuthorRuleTask = { kind: 'ready'; version: string; } | { kind: 'process'; id: string; runId: string; conversationId: string; stage: 'before' | 'after' | 'afterSchema'; stateJson: string; beforeJson: string; scriptSettings: NativeAuthorScriptSettingsUpdate[] | null; } | { kind: 'cancel'; runId: string; };
```

源码：[packages/host/product-api/src/types.ts:114](../../packages/host/product-api/src/types.ts#L114)

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

源码：[packages/host/product-api/src/types.ts:83](../../packages/host/product-api/src/types.ts#L83)

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

源码：[packages/host/product-api/src/types.ts:100](../../packages/host/product-api/src/types.ts#L100)

## NativeAuthorScriptIdentity

```ts
export interface NativeAuthorScriptIdentity {
    scope: ScriptLibraryScope;
    ownerId: string;
    scriptId: string;
}
```

源码：[packages/host/product-api/src/types.ts:107](../../packages/host/product-api/src/types.ts#L107)

## NativeAuthorScriptSettings

```ts
export interface NativeAuthorScriptSettings {
    revision: number;
    values: { [key: string]: AuthorScriptJson; };
}
```

源码：[packages/host/product-api/src/types.ts:108](../../packages/host/product-api/src/types.ts#L108)

## NativeAuthorScriptSettingsUpdate

```ts
export interface NativeAuthorScriptSettingsUpdate {
    key: string;
    settings: { [key: string]: AuthorScriptJson; };
    librarySettings: { [key: string]: AuthorScriptJson; };
}
```

源码：[packages/host/product-api/src/types.ts:109](../../packages/host/product-api/src/types.ts#L109)

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

源码：[packages/host/product-api/src/types.ts:401](../../packages/host/product-api/src/types.ts#L401)

## ProductRecordChange

```ts
export type ProductRecordChange = { kind: 'snapshot'; } | { kind: 'records'; domain: 'characters' | 'persona' | 'creatorProjects'; ids?: string[]; };
```

源码：[packages/host/product-api/src/types.ts:225](../../packages/host/product-api/src/types.ts#L225)

## RegexEditorTarget

```ts
export interface RegexEditorTarget {
    scope: 'character' | 'preset';
    ownerId: string;
}
```

源码：[packages/host/product-api/src/types.ts:772](../../packages/host/product-api/src/types.ts#L772)

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

源码：[packages/host/product-api/src/types.ts:719](../../packages/host/product-api/src/types.ts#L719)

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

源码：[packages/host/product-api/src/types.ts:744](../../packages/host/product-api/src/types.ts#L744)

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

源码：[packages/host/product-api/src/types.ts:777](../../packages/host/product-api/src/types.ts#L777)

## RegexRuleEditorImportResult

```ts
export interface RegexRuleEditorImportResult {
    collection: RegexRuleEditorCollection;
    importedFileCount: number;
    importedRuleCount: number;
    failedFileNames: string[];
}
```

源码：[packages/host/product-api/src/types.ts:791](../../packages/host/product-api/src/types.ts#L791)

## RegexRuleImportDocument

```ts
export interface RegexRuleImportDocument {
    displayName: string;
    json: string;
}
```

源码：[packages/host/product-api/src/types.ts:760](../../packages/host/product-api/src/types.ts#L760)

## RegexRuleImportResult

```ts
export interface RegexRuleImportResult {
    collection: RegexRuleCollection;
    importedFileCount: number;
    importedRuleCount: number;
    failedFileNames: string[];
}
```

源码：[packages/host/product-api/src/types.ts:765](../../packages/host/product-api/src/types.ts#L765)

## RegexRuleScope

```ts
export type RegexRuleScope = 'Global' | 'AgentPreset' | 'Character';
```

源码：[packages/host/product-api/src/types.ts:716](../../packages/host/product-api/src/types.ts#L716)

## RegexRuleTarget

```ts
export type RegexRuleTarget = 'UserInput' | 'AiOutput' | 'SettingContent' | 'Reasoning';
```

源码：[packages/host/product-api/src/types.ts:717](../../packages/host/product-api/src/types.ts#L717)

## RegexRuleTestResult

```ts
export interface RegexRuleTestResult {
    output: string;
    validationMessage: string | null;
}
```

源码：[packages/host/product-api/src/types.ts:798](../../packages/host/product-api/src/types.ts#L798)

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

源码：[packages/host/product-api/src/types.ts:736](../../packages/host/product-api/src/types.ts#L736)

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

源码：[packages/host/product-api/src/types.ts:63](../../packages/host/product-api/src/types.ts#L63)

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

源码：[packages/host/product-api/src/types.ts:50](../../packages/host/product-api/src/types.ts#L50)

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

源码：[packages/host/product-api/src/types.ts:74](../../packages/host/product-api/src/types.ts#L74)

## ScriptLibraryScope

```ts
export type ScriptLibraryScope = 'global' | 'character' | 'preset';
```

源码：[packages/host/product-api/src/types.ts:49](../../packages/host/product-api/src/types.ts#L49)

## ScriptTree

```ts
export type ScriptTree = ScriptItem | ScriptFolder;
```

源码：[packages/host/product-api/src/types.ts:73](../../packages/host/product-api/src/types.ts#L73)

## ScriptWorkspace

```ts
export interface ScriptWorkspace {
    path: string;
    version: string;
    entries: Array<{ id: string; file: string; }>;
}
```

源码：[packages/host/product-api/src/types.ts:95](../../packages/host/product-api/src/types.ts#L95)

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

源码：[packages/host/product-api/src/types.ts:11](../../packages/host/product-api/src/types.ts#L11)

## SessionModelParameterState

```ts
export interface SessionModelParameterState {
    revision: number;
    entries: Record<string, SessionModelParameterPatch>;
}
```

源码：[packages/host/product-api/src/types.ts:15](../../packages/host/product-api/src/types.ts#L15)

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

源码：[packages/host/product-api/src/types.ts:638](../../packages/host/product-api/src/types.ts#L638)

## SettingLibraryContent

```ts
export type SettingLibraryContent = Pick<SettingLibrary, 'characterId' | 'name' | 'entries' | 'groups' | 'promptPositions'>;
```

源码：[packages/host/product-api/src/types.ts:650](../../packages/host/product-api/src/types.ts#L650)

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

源码：[packages/host/product-api/src/types.ts:652](../../packages/host/product-api/src/types.ts#L652)

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

源码：[packages/host/product-api/src/types.ts:569](../../packages/host/product-api/src/types.ts#L569)

## SettingLibraryEntryChanges

```ts
export type SettingLibraryEntryChanges = Partial<Omit<SettingLibraryEntry, 'id' | 'kind' | 'openingMessages' | 'defaultOpeningMessageId' | 'createdAt' | 'updatedAt'>>;
```

源码：[packages/host/product-api/src/types.ts:612](../../packages/host/product-api/src/types.ts#L612)

## SettingLibraryEntryUpdate

```ts
export interface SettingLibraryEntryUpdate {
    id: string;
    changes: SettingLibraryEntryChanges;
}
```

源码：[packages/host/product-api/src/types.ts:614](../../packages/host/product-api/src/types.ts#L614)

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

源码：[packages/host/product-api/src/types.ts:602](../../packages/host/product-api/src/types.ts#L602)

## SettingLibraryOpeningMessage

```ts
export interface SettingLibraryOpeningMessage {
    id: string;
    title: string;
    content: string;
    variableVersionId?: string;
}
```

源码：[packages/host/product-api/src/types.ts:562](../../packages/host/product-api/src/types.ts#L562)

## SettingLibraryPosition

```ts
export type SettingLibraryPosition = 'instructions' | 'insert_point_1' | 'insert_point_2' | 'insert_point_3' | 'insert_point_4' | 'insert_point_5';
```

源码：[packages/host/product-api/src/types.ts:538](../../packages/host/product-api/src/types.ts#L538)

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

源码：[packages/host/product-api/src/types.ts:616](../../packages/host/product-api/src/types.ts#L616)

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

源码：[packages/host/product-api/src/types.ts:626](../../packages/host/product-api/src/types.ts#L626)

## TavilyConnection

```ts
export interface TavilyConnection {
    ok: true;
    plan: string;
    used: number;
    limit: number;
}
```

源码：[packages/host/product-api/src/types.ts:394](../../packages/host/product-api/src/types.ts#L394)

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

源码：[packages/host/product-api/src/types.ts:704](../../packages/host/product-api/src/types.ts#L704)

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

源码：[packages/host/product-api/src/types.ts:692](../../packages/host/product-api/src/types.ts#L692)

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

源码：[packages/host/product-api/src/types.ts:358](../../packages/host/product-api/src/types.ts#L358)

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

源码：[packages/host/product-api/src/types.ts:676](../../packages/host/product-api/src/types.ts#L676)

## VariableJsonValue

```ts
export type VariableJsonValue = null | boolean | number | string | VariableJsonValue[] | { [key: string]: VariableJsonValue; };
```

源码：[packages/host/product-api/src/types.ts:347](../../packages/host/product-api/src/types.ts#L347)

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

源码：[packages/host/product-api/src/types.ts:662](../../packages/host/product-api/src/types.ts#L662)

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

源码：[packages/host/product-api/src/types.ts:350](../../packages/host/product-api/src/types.ts#L350)

## VariableViewerTimeline

```ts
export interface VariableViewerTimeline {
    initial: VariableStateDocument;
    current: VariableStateDocument;
    floors: VariableFloorSnapshot[];
}
```

源码：[packages/host/product-api/src/types.ts:370](../../packages/host/product-api/src/types.ts#L370)

## WebFetchMode

```ts
export type WebFetchMode = 'http' | 'deepseek_fetch_api';
```

源码：[packages/host/product-api/src/types.ts:392](../../packages/host/product-api/src/types.ts#L392)

## WebSearchMode

```ts
export type WebSearchMode = 'automatic' | 'provider_native' | 'tavily' | 'deepseek_search_api';
```

源码：[packages/host/product-api/src/types.ts:391](../../packages/host/product-api/src/types.ts#L391)

## WorkspaceFileEdit

```ts
export type WorkspaceFileEdit = { kind: 'mkdir'; name: string; } | { kind: 'rename'; entry: WorkspaceFileSelection; name: string; } | { kind: 'delete'; entries: WorkspaceFileSelection[]; } | { kind: 'copy' | 'move'; entries: WorkspaceFileSelection[]; destination: string[]; };
```

源码：[packages/host/product-api/src/types.ts:1134](../../packages/host/product-api/src/types.ts#L1134)

## WorkspaceFileEntry

```ts
export interface WorkspaceFileEntry {
    name: string;
    address?: string;
    kind: 'file' | 'directory' | 'other';
    bytes: number;
    modifiedAt: number;
    version: string;
}
```

源码：[packages/host/product-api/src/types.ts:1125](../../packages/host/product-api/src/types.ts#L1125)

## WorkspaceFileExport

```ts
export type WorkspaceFileExport = { kind: 'file'; name: string; mime: string; } | { kind: 'chunk'; data: string; } | { kind: 'complete'; };
```

源码：[packages/host/product-api/src/types.ts:1139](../../packages/host/product-api/src/types.ts#L1139)

## WorkspaceFileImport

```ts
export type WorkspaceFileImport = { kind: 'ready'; offset: number; } | { kind: 'complete'; };
```

源码：[packages/host/product-api/src/types.ts:1140](../../packages/host/product-api/src/types.ts#L1140)

## WorkspaceFileSelection

```ts
export interface WorkspaceFileSelection {
    name: string;
    version: string;
}
```

源码：[packages/host/product-api/src/types.ts:1133](../../packages/host/product-api/src/types.ts#L1133)

## 官方和平台类型

官方类型从其对应的 DSH 公开包入口导入；平台类型使用 TypeScript 标准库。

[锁定版本的官方接口目录](https://github.com/deepseek-ai/deepseek-harness/blob/9c2670d3bce5275e0d1610272958121af87787bb/docs/subsystems/README.zh.md)

`GenerateOptions`、`RemoteStream`、`Session`、`SessionId`
