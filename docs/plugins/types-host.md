<!-- 由 pnpm generate:plugin-docs 使用锁定的 DSH 官方生成器生成，请勿手工修改。 -->

# Host 接口引用的数据类型

以下声明由官方 TypeGraphRenderer 从公开方法引用的类型生成。类型应从对应公开包入口导入，完整设定字段保留在原有结构中。

## AgentPreset

```ts
export interface AgentPreset {
    id: string;
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
    subagentModelSelection?: { configId: string; model: string; };
    toolModelConfigIds?: Record<string, string>;
    roleplayPlan: { steps: string[]; };
    regexRules: RegexRule[];
    expandedGroupIds: string[];
}
```

源码：[packages/dsh-product-api/src/types.ts:678](../../packages/dsh-product-api/src/types.ts#L678)

## AgentPresetCatalog

```ts
export interface AgentPresetCatalog {
    activePresetId: string;
    groups: AgentPresetLibraryGroup[];
    presets: AgentPresetSummary[];
}
```

源码：[packages/dsh-product-api/src/types.ts:657](../../packages/dsh-product-api/src/types.ts#L657)

## AgentPresetExportFormat

```ts
export type AgentPresetExportFormat = 'json' | 'png';
```

源码：[packages/dsh-product-api/src/types.ts:617](../../packages/dsh-product-api/src/types.ts#L617)

## AgentPresetExportResult

```ts
export interface AgentPresetExportResult {
    fileName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:711](../../packages/dsh-product-api/src/types.ts#L711)

## AgentPresetImportDocument

```ts
export interface AgentPresetImportDocument {
    displayName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:698](../../packages/dsh-product-api/src/types.ts#L698)

## AgentPresetImportResult

```ts
export interface AgentPresetImportResult {
    preset: AgentPreset;
    source: AgentPresetImportSource;
    skippedUnsupportedEntries: number;
    skippedDepthRegexCount: number;
}
```

源码：[packages/dsh-product-api/src/types.ts:704](../../packages/dsh-product-api/src/types.ts#L704)

## AgentPresetImportSource

```ts
export type AgentPresetImportSource = 'eleckoi' | 'sillytavern';
```

源码：[packages/dsh-product-api/src/types.ts:616](../../packages/dsh-product-api/src/types.ts#L616)

## AgentPresetLibraryGroup

```ts
export interface AgentPresetLibraryGroup {
    id: string;
    name: string;
    sortIndex: number;
}
```

源码：[packages/dsh-product-api/src/types.ts:639](../../packages/dsh-product-api/src/types.ts#L639)

## AgentPresetModelFamily

```ts
export type AgentPresetModelFamily = 'general' | 'claude' | 'openai' | 'gemini' | 'deepseek' | 'other';
```

源码：[packages/dsh-product-api/src/types.ts:615](../../packages/dsh-product-api/src/types.ts#L615)

## AgentPresetModelTag

```ts
export interface AgentPresetModelTag {
    id: string;
    label: string;
    providerId: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:619](../../packages/dsh-product-api/src/types.ts#L619)

## AgentPresetProfile

```ts
export interface AgentPresetProfile {
    authorName: string;
    authorAvatarPath: string;
    usageInstructions: string;
    timeline: AgentPresetTimelineItem[];
}
```

源码：[packages/dsh-product-api/src/types.ts:632](../../packages/dsh-product-api/src/types.ts#L632)

## AgentPresetSummary

```ts
export interface AgentPresetSummary {
    id: string;
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

源码：[packages/dsh-product-api/src/types.ts:645](../../packages/dsh-product-api/src/types.ts#L645)

## AgentPresetTimelineItem

```ts
export interface AgentPresetTimelineItem {
    id: string;
    title: string;
    dateLabel: string;
    note: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:625](../../packages/dsh-product-api/src/types.ts#L625)

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
}
```

源码：[packages/dsh-product-api/src/types.ts:668](../../packages/dsh-product-api/src/types.ts#L668)

## AgentToolMember

```ts
export interface AgentToolMember {
    name: string;
    description: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:663](../../packages/dsh-product-api/src/types.ts#L663)

## AuthorCapabilities

```ts
export interface AuthorCapabilities {
    methods: string[];
    version: number;
    assetsBaseUrl: string;
}
```

源码：[packages/dsh-compatibility-host/src/types.ts:4](../../packages/dsh-compatibility-host/src/types.ts#L4)

## AuthorChange

```ts
export interface AuthorChange {
    event: string;
    payload: AuthorValue;
}
```

源码：[packages/dsh-compatibility-host/src/types.ts:3](../../packages/dsh-compatibility-host/src/types.ts#L3)

## AuthorCommand

```ts
export interface AuthorCommand {
    method: string;
    params: { [key: string]: AuthorValue; };
}
```

源码：[packages/dsh-compatibility-host/src/types.ts:2](../../packages/dsh-compatibility-host/src/types.ts#L2)

## AuthorConversationState

```ts
export interface AuthorConversationState {
    initialVariableStateJson: string;
    currentVariableStateJson: string;
    variableConfig: VariableConfig | null;
    settingLibrarySummary: { characterId: string; name: string; activeVersionId: string; entryCount: number; groupCount: number; } | null;
    settingLibrary: ConversationRuntimeSettingLibrary | null;
}
```

源码：[packages/dsh-product-api/src/types.ts:256](../../packages/dsh-product-api/src/types.ts#L256)

## AuthorValue

```ts
export type AuthorValue = null | boolean | number | string | AuthorValue[] | { [key: string]: AuthorValue; };
```

源码：[packages/dsh-compatibility-host/src/types.ts:1](../../packages/dsh-compatibility-host/src/types.ts#L1)

## CharacterCollection

```ts
export interface CharacterCollection {
    active_character_id: string;
    groups: string[];
    items: CharacterRecord[];
}
```

源码：[packages/dsh-product-api/src/types.ts:329](../../packages/dsh-product-api/src/types.ts#L329)

## CharacterConfigurationChange

```ts
export type CharacterConfigurationChange = { kind: 'snapshot'; } | { kind: 'configuration'; domain: 'settingLibraries' | 'variables' | 'regexRules' | 'agentPresets'; characterId?: string; };
```

源码：[packages/dsh-product-api/src/types.ts:126](../../packages/dsh-product-api/src/types.ts#L126)

## CharacterExportFormat

```ts
export type CharacterExportFormat = 'png' | 'json';
```

源码：[packages/dsh-product-api/src/types.ts:341](../../packages/dsh-product-api/src/types.ts#L341)

## CharacterExportResult

```ts
export interface CharacterExportResult {
    fileName: string;
    mimeType: 'image/png' | 'application/json';
    base64: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:369](../../packages/dsh-product-api/src/types.ts#L369)

## CharacterGroupAssignment

```ts
export interface CharacterGroupAssignment {
    characterId: string;
    group: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:335](../../packages/dsh-product-api/src/types.ts#L335)

## CharacterImportFile

```ts
export interface CharacterImportFile {
    displayName: string;
    mimeType: string;
    base64: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:343](../../packages/dsh-product-api/src/types.ts#L343)

## CharacterImportPreview

```ts
export interface CharacterImportPreview {
    token: string;
    items: CharacterImportPreviewItem[];
}
```

源码：[packages/dsh-product-api/src/types.ts:358](../../packages/dsh-product-api/src/types.ts#L358)

## CharacterImportPreviewItem

```ts
export interface CharacterImportPreviewItem {
    id: string;
    name: string;
    summary: string;
    imageAvailable: boolean;
    errorMessage: string;
    importable: boolean;
}
```

源码：[packages/dsh-product-api/src/types.ts:349](../../packages/dsh-product-api/src/types.ts#L349)

## CharacterImportResult

```ts
export interface CharacterImportResult {
    collection: CharacterCollection;
    importedCharacterIds: string[];
    failedMessages: string[];
}
```

源码：[packages/dsh-product-api/src/types.ts:363](../../packages/dsh-product-api/src/types.ts#L363)

## CharacterImportSource

```ts
export type CharacterImportSource = 'eleckoi' | 'sillytavern';
```

源码：[packages/dsh-product-api/src/types.ts:340](../../packages/dsh-product-api/src/types.ts#L340)

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

源码：[packages/dsh-product-api/src/types.ts:292](../../packages/dsh-product-api/src/types.ts#L292)

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
    primaryOpening?: string;
    persona?: CharacterPersona;
}
```

源码：[packages/dsh-product-api/src/types.ts:306](../../packages/dsh-product-api/src/types.ts#L306)

## CompatibilityChange

```ts
export interface CompatibilityChange {
    event: string;
    payload: CompatibilityValue;
}
```

源码：[packages/dsh-product-api/src/types.ts:8](../../packages/dsh-product-api/src/types.ts#L8)

## CompatibilityCommand

```ts
export interface CompatibilityCommand {
    method: string;
    params: { [key: string]: CompatibilityValue; };
}
```

源码：[packages/dsh-product-api/src/types.ts:7](../../packages/dsh-product-api/src/types.ts#L7)

## CompatibilityTimelineInput

```ts
export interface CompatibilityTimelineInput {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    sessionEventSeq?: number;
    reasoning?: string;
}
```

源码：[packages/dsh-product-api/src/compatibility-messages.ts:12](../../packages/dsh-product-api/src/compatibility-messages.ts#L12)

## CompatibilityValue

```ts
export type CompatibilityValue = null | boolean | number | string | CompatibilityValue[] | { [key: string]: CompatibilityValue; };
```

源码：[packages/dsh-product-api/src/types.ts:6](../../packages/dsh-product-api/src/types.ts#L6)

## ConversationChange

```ts
export type ConversationChange = { kind: 'snapshot'; } | { kind: 'generation'; conversationId: string; error: string; } | { kind: 'catalog'; conversationId: string; reason: 'created' | 'deleted' | 'updated'; } | { kind: 'messages'; conversationId: string; reason: 'edited' | 'deleted' | 'regenerated'; messageIds: string[]; sessionRewritten?: boolean; };
```

源码：[packages/dsh-product-api/src/types.ts:114](../../packages/dsh-product-api/src/types.ts#L114)

## ConversationCreateInput

```ts
export interface ConversationCreateInput {
    title?: string;
    metadata?: Partial<ConversationMetadata>;
}
```

源码：[packages/dsh-product-api/src/types.ts:70](../../packages/dsh-product-api/src/types.ts#L70)

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
    compatibilityPresentation?: { groupId?: CompatibilityValue; metadata: { [id: string]: CompatibilityValue; }; extensions: { [id: string]: CompatibilityValue; }; bindings: { [id: string]: CompatibilityValue; }; swipes?: { [id: string]: CompatibilityValue; }; variables?: { [id: string]: CompatibilityValue; }; timeline: CompatibilityValue; };
}
```

源码：[packages/dsh-product-api/src/types.ts:188](../../packages/dsh-product-api/src/types.ts#L188)

## ConversationLifecycleParticipant

```ts
export interface ConversationLifecycleParticipant {
    readonly id: string;
    prepare?(input: ConversationPreparation, signal: AbortSignal): void | Promise<void>;
    afterSave?(input: ConversationSave, signal: AbortSignal): void | Promise<void>;
    prepareRestore?(input: ConversationRestore, signal: AbortSignal): ConversationRestorePlan | Promise<ConversationRestorePlan>;
}
```

源码：[packages/dsh-product-api/src/conversationLifecycle.ts:41](../../packages/dsh-product-api/src/conversationLifecycle.ts#L41)

## ConversationMessageDisplayInput

```ts
export interface ConversationMessageDisplayInput {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    variableStateJson: string;
    status: 'complete' | 'streaming' | 'error' | 'cancelled';
    createdAt: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:203](../../packages/dsh-product-api/src/types.ts#L203)

## ConversationMessageDisplayResult

```ts
export interface ConversationMessageDisplayResult {
    id: string;
    sourceContent: string;
    displayContent: string;
    variableStateJson: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:213](../../packages/dsh-product-api/src/types.ts#L213)

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

源码：[packages/dsh-product-api/src/types.ts:154](../../packages/dsh-product-api/src/types.ts#L154)

## ConversationMetadata

```ts
export interface ConversationMetadata {
    characterId: string;
    characterName: string;
    characterAvatar: string;
    characterPersona: CharacterPersona;
}
```

源码：[packages/dsh-product-api/src/types.ts:63](../../packages/dsh-product-api/src/types.ts#L63)

## ConversationModelSelection

```ts
export interface ConversationModelSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:49](../../packages/dsh-product-api/src/types.ts#L49)

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

源码：[packages/dsh-product-api/src/types.ts:144](../../packages/dsh-product-api/src/types.ts#L144)

## ConversationPreparation

```ts
export interface ConversationPreparation {
    readonly operationId: string;
    readonly conversationId: string;
    readonly runtimeSessionId: string;
    readonly turn: number;
    readonly text: string;
    readonly model: { readonly provider: string; readonly model: string; readonly reasoningEffort?: string; };
    readonly runtime: Readonly<ConversationRuntimePreparation>;
}
```

源码：[packages/dsh-product-api/src/conversationLifecycle.ts:13](../../packages/dsh-product-api/src/conversationLifecycle.ts#L13)

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

源码：[packages/dsh-product-api/src/types.ts:55](../../packages/dsh-product-api/src/types.ts#L55)

## ConversationRequestPreview

```ts
export interface ConversationRequestPreview {
    id: string;
    items: Array<{ order: number; messageId: string; role: 'system' | 'user' | 'assistant'; kind: 'system' | 'prompt' | 'history' | 'user' | 'assistant' | 'tool' | 'context'; title: string; source: string; anchor: string; content: string; }>;
}
```

源码：[packages/dsh-product-api/src/types.ts:93](../../packages/dsh-product-api/src/types.ts#L93)

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

源码：[packages/dsh-product-api/src/types.ts:82](../../packages/dsh-product-api/src/types.ts#L82)

## ConversationRestore

```ts
export interface ConversationRestore {
    readonly operationId: string;
    readonly conversationId: string;
    readonly runtimeSessionId: string;
    readonly reason: 'delete-messages' | 'regenerate';
    readonly fromTurn: number;
    readonly fromEventSeq: number;
    readonly state: Readonly<ConversationRuntimeStateSnapshot>;
}
```

源码：[packages/dsh-product-api/src/conversationLifecycle.ts:24](../../packages/dsh-product-api/src/conversationLifecycle.ts#L24)

## ConversationRestorePlan

```ts
export interface ConversationRestorePlan {
    apply(): void | Promise<void>;
    rollback(): void | Promise<void>;
}
```

源码：[packages/dsh-product-api/src/conversationLifecycle.ts:35](../../packages/dsh-product-api/src/conversationLifecycle.ts#L35)

## ConversationRuntimePreparation

```ts
export interface ConversationRuntimePreparation {
    conversationId: string;
    runtimeSessionId: string;
    promptTextContext: { macros?: { userName: string; characterName: string; }; rules?: RegexRuleCollection; };
    variableContext?: { initialStateJson: string; schemaCode: string; objects: VariableObjectConfig[]; variables: VariableItemConfig[]; stateJson: string; };
    conversationContext: { characterId: string; characterName: string; persona: Record<string, unknown>; history: Array<{ role: 'user' | 'assistant'; content: string; speakerName?: string; }>; historyMode: 'prefix'; currentPromptText: string; settingLibrary?: ConversationRuntimeSettingLibrary; };
    disabledToolGroupIds: string[];
    agentPreset: { id: string; versionId: string; name: string; roleplayPlan: { steps: string[]; }; subagentModelSelection?: { configId: string; model: string; }; toolModelConfigIds?: Record<string, string>; historyCompactionInstructions?: string; };
    settingLibraryBaseline?: { source: ConversationRuntimeSettingLibrary; projected: ConversationRuntimeSettingLibrary; };
}
```

源码：[packages/dsh-product-api/src/types.ts:725](../../packages/dsh-product-api/src/types.ts#L725)

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

源码：[packages/dsh-product-api/src/types.ts:717](../../packages/dsh-product-api/src/types.ts#L717)

## ConversationRuntimeStateSnapshot

```ts
export interface ConversationRuntimeStateSnapshot {
    variableStateJson: string;
    settingLibraryStateJson: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:183](../../packages/dsh-product-api/src/types.ts#L183)

## ConversationSave

```ts
export interface ConversationSave {
    readonly operationId: string;
    readonly conversationId: string;
    readonly runtimeSessionId: string;
    readonly turn: number;
}
```

源码：[packages/dsh-product-api/src/conversationLifecycle.ts:5](../../packages/dsh-product-api/src/conversationLifecycle.ts#L5)

## ConversationSummary

```ts
export interface ConversationSummary extends ConversationRecord {
    metadata: ConversationMetadata;
    runtimeSessionId: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:75](../../packages/dsh-product-api/src/types.ts#L75)

## CreateCreatorProjectInput

```ts
export interface CreateCreatorProjectInput {
    name: string;
    mode: CreatorProjectMode;
    parentDirectory: string;
    sourceCharacterId?: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:392](../../packages/dsh-product-api/src/types.ts#L392)

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

源码：[packages/dsh-product-api/src/types.ts:377](../../packages/dsh-product-api/src/types.ts#L377)

## CreatorProjectCollection

```ts
export interface CreatorProjectCollection {
    items: CreatorProject[];
}
```

源码：[packages/dsh-product-api/src/types.ts:388](../../packages/dsh-product-api/src/types.ts#L388)

## CreatorProjectMode

```ts
export type CreatorProjectMode = 'blank' | 'existing';
```

源码：[packages/dsh-product-api/src/types.ts:375](../../packages/dsh-product-api/src/types.ts#L375)

## DisplayPreferencesSnapshot

```ts
export interface DisplayPreferencesSnapshot {
    ui: Record<string, DisplayPreferenceValue>;
    chatDisplay: Record<string, DisplayPreferenceValue>;
    writable: boolean;
    revision: number;
}
```

源码：[packages/dsh-product-api/src/types.ts:871](../../packages/dsh-product-api/src/types.ts#L871)

## DisplayPreferenceValue

```ts
export type DisplayPreferenceValue = null | boolean | number | string | DisplayPreferenceValue[] | { [key: string]: DisplayPreferenceValue; };
```

源码：[packages/dsh-product-api/src/types.ts:868](../../packages/dsh-product-api/src/types.ts#L868)

## ElecKoiHostStatus

```ts
export interface ElecKoiHostStatus {
    architecture: 'dsh-remote';
    protocolVersion: 1;
}
```

源码：[packages/dsh-product-api/src/types.ts:1](../../packages/dsh-product-api/src/types.ts#L1)

## ModelConnectionInput

```ts
export interface ModelConnectionInput {
    configId: string;
    model: string;
    baseURL: string;
    api: string;
    apiKey?: string;
    headers?: Record<string, string>;
}
```

源码：[packages/dsh-product-api/src/types.ts:22](../../packages/dsh-product-api/src/types.ts#L22)

## ModelDiscoveryInput

```ts
export interface ModelDiscoveryInput {
    configId: string;
    baseURL: string;
    api: string;
    apiKey?: string;
    headers?: Record<string, string>;
}
```

源码：[packages/dsh-product-api/src/types.ts:31](../../packages/dsh-product-api/src/types.ts#L31)

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

源码：[packages/dsh-product-api/src/types.ts:39](../../packages/dsh-product-api/src/types.ts#L39)

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

源码：[packages/dsh-product-api/src/types.ts:279](../../packages/dsh-product-api/src/types.ts#L279)

## ProductRecordChange

```ts
export type ProductRecordChange = { kind: 'snapshot'; } | { kind: 'records'; domain: 'characters' | 'persona' | 'creatorProjects'; ids?: string[]; };
```

源码：[packages/dsh-product-api/src/types.ts:134](../../packages/dsh-product-api/src/types.ts#L134)

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

源码：[packages/dsh-product-api/src/types.ts:560](../../packages/dsh-product-api/src/types.ts#L560)

## RegexRuleCollection

```ts
export interface RegexRuleCollection {
    characterId: string;
    agentPresetId: string;
    agentPresetName: string;
    agentPresetRegexRevision: string;
    globalRules: RegexRule[];
    agentPresetRules: RegexRule[];
    characterRules: RegexRule[];
    versions: RegexRuleVersion[];
    activeVersionId: string;
    revision: number;
}
```

源码：[packages/dsh-product-api/src/types.ts:585](../../packages/dsh-product-api/src/types.ts#L585)

## RegexRuleImportDocument

```ts
export interface RegexRuleImportDocument {
    displayName: string;
    json: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:598](../../packages/dsh-product-api/src/types.ts#L598)

## RegexRuleImportResult

```ts
export interface RegexRuleImportResult {
    collection: RegexRuleCollection;
    importedFileCount: number;
    importedRuleCount: number;
    failedFileNames: string[];
}
```

源码：[packages/dsh-product-api/src/types.ts:603](../../packages/dsh-product-api/src/types.ts#L603)

## RegexRuleScope

```ts
export type RegexRuleScope = 'Global' | 'AgentPreset' | 'Character';
```

源码：[packages/dsh-product-api/src/types.ts:557](../../packages/dsh-product-api/src/types.ts#L557)

## RegexRuleTarget

```ts
export type RegexRuleTarget = 'UserInput' | 'AiOutput' | 'SlashCommand' | 'SettingContent' | 'Reasoning';
```

源码：[packages/dsh-product-api/src/types.ts:558](../../packages/dsh-product-api/src/types.ts#L558)

## RegexRuleTestResult

```ts
export interface RegexRuleTestResult {
    output: string;
    validationMessage: string | null;
}
```

源码：[packages/dsh-product-api/src/types.ts:610](../../packages/dsh-product-api/src/types.ts#L610)

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

源码：[packages/dsh-product-api/src/types.ts:577](../../packages/dsh-product-api/src/types.ts#L577)

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

源码：[packages/dsh-client-roleplay/src/host/request-preview.d.mts:4](../../packages/dsh-client-roleplay/src/host/request-preview.d.mts#L4)

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

源码：[packages/dsh-client-roleplay/src/projections.d.ts:4](../../packages/dsh-client-roleplay/src/projections.d.ts#L4)

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

源码：[packages/dsh-product-api/src/types.ts:481](../../packages/dsh-product-api/src/types.ts#L481)

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

源码：[packages/dsh-product-api/src/types.ts:493](../../packages/dsh-product-api/src/types.ts#L493)

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

源码：[packages/dsh-product-api/src/types.ts:415](../../packages/dsh-product-api/src/types.ts#L415)

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

源码：[packages/dsh-product-api/src/types.ts:449](../../packages/dsh-product-api/src/types.ts#L449)

## SettingLibraryOpeningMessage

```ts
export interface SettingLibraryOpeningMessage {
    id: string;
    title: string;
    content: string;
    variableVersionId?: string;
    initialVariableStateJson: string;
}
```

源码：[packages/dsh-product-api/src/types.ts:407](../../packages/dsh-product-api/src/types.ts#L407)

## SettingLibraryPosition

```ts
export type SettingLibraryPosition = 'instructions' | 'insert_point_1' | 'insert_point_2' | 'insert_point_3' | 'insert_point_4' | 'insert_point_5';
```

源码：[packages/dsh-product-api/src/types.ts:399](../../packages/dsh-product-api/src/types.ts#L399)

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

源码：[packages/dsh-product-api/src/types.ts:459](../../packages/dsh-product-api/src/types.ts#L459)

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

源码：[packages/dsh-product-api/src/types.ts:469](../../packages/dsh-product-api/src/types.ts#L469)

## TavilyConnection

```ts
export interface TavilyConnection {
    ok: true;
    plan: string;
    used: number;
    limit: number;
}
```

源码：[packages/dsh-product-api/src/types.ts:272](../../packages/dsh-product-api/src/types.ts#L272)

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

源码：[packages/dsh-product-api/src/types.ts:545](../../packages/dsh-product-api/src/types.ts#L545)

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

源码：[packages/dsh-product-api/src/types.ts:533](../../packages/dsh-product-api/src/types.ts#L533)

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

源码：[packages/dsh-product-api/src/types.ts:241](../../packages/dsh-product-api/src/types.ts#L241)

## VariableItemConfig

```ts
export interface VariableItemConfig {
    id: string;
    title: string;
    objectId: string;
    enabled: boolean;
    type: '' | 'number' | 'string' | 'boolean' | 'array';
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

源码：[packages/dsh-product-api/src/types.ts:517](../../packages/dsh-product-api/src/types.ts#L517)

## VariableJsonValue

```ts
export type VariableJsonValue = null | boolean | number | string | VariableJsonValue[] | { [key: string]: VariableJsonValue; };
```

源码：[packages/dsh-product-api/src/types.ts:230](../../packages/dsh-product-api/src/types.ts#L230)

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

源码：[packages/dsh-product-api/src/types.ts:503](../../packages/dsh-product-api/src/types.ts#L503)

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

源码：[packages/dsh-product-api/src/types.ts:233](../../packages/dsh-product-api/src/types.ts#L233)

## VariableViewerTimeline

```ts
export interface VariableViewerTimeline {
    current: VariableStateDocument;
    floors: VariableFloorSnapshot[];
}
```

源码：[packages/dsh-product-api/src/types.ts:251](../../packages/dsh-product-api/src/types.ts#L251)

## WebSearchMode

```ts
export type WebSearchMode = 'provider_native' | 'tavily';
```

源码：[packages/dsh-product-api/src/types.ts:270](../../packages/dsh-product-api/src/types.ts#L270)

## 官方和平台类型

官方类型从其对应的 DSH 公开包入口导入；平台类型使用 TypeScript 标准库。

[锁定版本的官方接口目录](https://github.com/deepseek-ai/deepseek-harness/blob/c1b47e41fcd54d20a0f061df28683bfc29ee24e5/docs/subsystems/README.zh.md)

`GenerateOptions`、`Session`
