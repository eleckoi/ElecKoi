<!-- 由 pnpm generate:plugin-docs 使用锁定的 DSH 官方生成器生成，请勿手工修改。 -->

# Client 接口引用的数据类型

以下声明由官方 TypeGraphRenderer 从公开方法引用的类型生成。类型应从对应公开包入口导入，完整设定字段保留在原有结构中。

## CharacterCatalogSnapshot

```ts
export interface CharacterCatalogSnapshot {
    status: 'loading' | 'ready' | 'error';
    collection: CharacterCollection;
    error: string;
}
```

源码：[packages/client/features/dsh-client-characters/src/client/types.ts:4](../../packages/client/features/dsh-client-characters/src/client/types.ts#L4)

## CharacterDownloadResult

```ts
export interface CharacterDownloadResult {
    canceled: boolean;
    directory: string;
    written: { characterId: string; fileName: string; }[];
    failures: { characterId: string; message: string; }[];
}
```

源码：[packages/client/features/dsh-client-characters/src/client/types.ts:5](../../packages/client/features/dsh-client-characters/src/client/types.ts#L5)

## ClientDisplayPreferencesSnapshot

```ts
export interface ClientDisplayPreferencesSnapshot {
    status: 'loading' | 'ready' | 'error';
    ui: Readonly<Record<string, DisplayPreferenceValue>>;
    chatDisplay: Readonly<Record<string, DisplayPreferenceValue>>;
    writable: boolean;
    revision?: number;
    error: string;
}
```

源码：[packages/client/features/dsh-client-display-preferences/src/client/types.ts:4](../../packages/client/features/dsh-client-display-preferences/src/client/types.ts#L4)

## ClientModelConfig

```ts
export interface ClientModelConfig {
    id: string;
    name?: string;
    provider?: string;
    model?: string;
    model_options?: ClientModelOption[];
    enabled?: boolean;
    base_url?: string;
    api_format?: string;
    api_key?: string;
    custom_headers?: Record<string, string>;
    proxy_url?: string;
    credentialRef?: string;
    credentialConfigured?: boolean;
    clearCredential?: boolean;
    settingsNs?: string;
    settingsPath?: string[];
    builtin?: boolean;
    useBuiltinModels?: boolean;
    draftKey?: string;
    clearConfiguration?: boolean;
    image_settings?: Record<string, import('@eleckoi/dsh-product-api/types').VariableJsonValue>;
}
```

源码：[packages/client/features/dsh-client-models/src/client/types.ts:10](../../packages/client/features/dsh-client-models/src/client/types.ts#L10)

## ClientModelOption

```ts
export interface ClientModelOption {
    id: string;
    name: string;
    description?: string;
    inputModalities?: readonly ('text' | 'image')[];
    contextWindowTokens?: number;
    maxOutputTokens?: number;
    supportsImageInput?: boolean;
    overrideFields?: string[];
    capabilitiesOverride?: boolean;
    catalogDefaults?: ClientModelOption;
    reasoningEfforts?: false | Record<string, string | null>;
    reasoningEffort?: string;
    temperature?: number;
    topP?: number;
    autoCompactTokenLimit?: number;
    isUserAdded?: boolean;
}
```

源码：[packages/client/features/dsh-client-models/src/client/types.ts:3](../../packages/client/features/dsh-client-models/src/client/types.ts#L3)

## ClientModelProvider

```ts
export interface ClientModelProvider {
    provider: string;
    displayName?: string;
    settingsNs: string;
    settingsPath: string[];
    declared?: boolean;
}
```

源码：[packages/client/features/dsh-client-models/src/client/types.ts:18](../../packages/client/features/dsh-client-models/src/client/types.ts#L18)

## ConfigurationSnapshot

```ts
export interface ConfigurationSnapshot<T> {
    status: 'idle' | 'loading' | 'ready' | 'error';
    value: T | null;
    error: string;
}
```

源码：[packages/client/features/dsh-client-character-configuration/src/client/types.ts:6](../../packages/client/features/dsh-client-character-configuration/src/client/types.ts#L6)

## ConversationCatalogSnapshot

```ts
export interface ConversationCatalogSnapshot {
    status: 'loading' | 'ready' | 'error';
    items: ConversationSummary[];
    error: string;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:53](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L53)

## ConversationChatSnapshot

```ts
export interface ConversationChatSnapshot {
    details: ConversationDetailsSnapshot;
    stream: ConversationStreamSnapshot;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:68](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L68)

## ConversationClientDetails

```ts
export interface ConversationClientDetails extends Omit<ConversationDetailsMetadata, 'messages'> {
    messages: ConversationClientMessage[];
    replace?: boolean;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:52](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L52)

## ConversationClientMessage

```ts
export interface ConversationClientMessage extends Omit<ConversationMessageMetadata, 'dshTurn'> {
    content?: string;
    displayContent?: string;
    status: 'complete' | 'streaming' | 'error' | 'cancelled';
    sequence?: number;
    productSequence?: number;
    sessionEventSeq?: number;
    dshTurn?: number | null;
    requestId?: string;
    nativeVariableStateJson?: string;
    variableSnapshotAvailable?: boolean;
    inputEventSeq?: number;
    process?: ConversationProcessItem[];
    processTiming?: { startedAtMillis?: number; completedAtMillis?: number; };
    dshMessageId?: string;
    runtimeSessionId?: string;
    renderKey?: string;
    dshNodeKey?: string;
    turnUsage?: TurnTailChatData['tokenUsage'];
    inputImageAttachments?: (ImageAttachmentRef | ConversationPendingImage)[];
    generatedImageAttachments?: ConversationGeneratedImage[];
    inputFileAttachments?: (FileAttachmentRef | ConversationPendingFile)[];
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:24](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L24)

## ConversationDetailsSnapshot

```ts
export interface ConversationDetailsSnapshot {
    id: string;
    status: 'idle' | 'loading' | 'ready' | 'error';
    details: ConversationClientDetails | null;
    runtimeSessionId?: string;
    error: string;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:54](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L54)

## ConversationGeneratedImage

```ts
export interface ConversationGeneratedImage extends Partial<ImageAttachmentRef> {
    id: string;
    batchId: string;
    frameId: number;
    status: 'generating' | 'ready' | 'failed';
    error?: string;
    name?: string;
    width: number;
    height: number;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:20](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L20)

## ConversationGenerationChange

```ts
export interface ConversationGenerationChange {
    conversationId: string;
    runtimeSessionId: string;
    kind: 'live' | 'baseline' | 'released';
    running: boolean;
    events: readonly ConversationGenerationEvent[];
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:58](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L58)

## ConversationGenerationEvent

```ts
export type ConversationGenerationEvent = Extract<SessionEventLike, { type: 'turn/start' | 'turn/end' | 'assistant/message'; }>;
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:56](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L56)

## ConversationGenerationReply

```ts
export type ConversationGenerationReply = { status: 'pending'; } | { status: 'ready'; message: ConversationClientMessage | null; } | { status: 'unavailable'; reason: string; };
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:65](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L65)

## ConversationPendingFile

```ts
export interface ConversationPendingFile {
    attachmentId: string;
    name: string;
    bytes: number;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:22](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L22)

## ConversationPendingImage

```ts
export interface ConversationPendingImage {
    attachmentId: string;
    name: string;
    dataUrl: string;
    width?: number;
    height?: number;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:18](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L18)

## ConversationProcessItem

```ts
export interface ConversationProcessItem {
    id: string;
    kind: 'tool' | 'command' | 'file_change' | 'compaction' | 'subagent' | 'action' | 'narrative' | 'reasoning';
    status: 'running' | 'complete' | 'error' | 'cancelled';
    toolName: string;
    arguments: string;
    summary: string;
    detail: string;
    displayDetail?: string;
    startedAtMillis: number;
    completedAtMillis?: number;
    parentId?: string;
    delegatedModel?: string;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:16](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L16)

## ConversationRegenerateInput

```ts
export interface ConversationRegenerateInput {
    conversationId: string;
    requestId: string;
    eventSeq: number;
    replacementMessage?: string;
    signal?: AbortSignal;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:83](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L83)

## ConversationRunResult

```ts
export interface ConversationRunResult {
    details: ConversationClientDetails | null;
    cancelled: boolean;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:84](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L84)

## ConversationSelection

```ts
export interface ConversationSelection {
    active_conversation_id: string;
    preferred_sessions: Record<string, string>;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:80](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L80)

## ConversationSendInput

```ts
export interface ConversationSendInput {
    conversationId: string;
    requestId: string;
    text?: string;
    mode?: 'steer' | 'queue';
    signal?: AbortSignal;
    images?: { mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string; name?: string; }[];
    files?: string[];
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:82](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L82)

## ConversationStatsSnapshot

```ts
export interface ConversationStatsSnapshot {
    id: string;
    stats: { sessionStats?: SessionStatsProjection; tokenUsage?: TokenUsageProjection; contextPressure?: ContextPressureProjection; contextBreakdown?: ContextBreakdownProjection; } | null;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:70](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L70)

## ConversationStreamSnapshot

```ts
export interface ConversationStreamSnapshot {
    id: string;
    status: 'idle' | 'running' | 'complete' | 'error';
    runId: string;
    requestId: string;
    messageId: string;
    nodeKey: string;
    dshTurn?: number;
    renderKey?: string;
    sequence: number;
    content: string;
    process: ConversationProcessItem[];
    error: string;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:55](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L55)

## ConversationTimelineSnapshot

```ts
export interface ConversationTimelineSnapshot {
    id: string;
    status: 'idle' | 'loading' | 'ready' | 'error';
    timeline: VariableViewerTimeline | null;
    error: string;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:79](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L79)

## ConversationUploadedFile

```ts
export interface ConversationUploadedFile {
    id: string;
    receiptId: string;
    attachmentId: string;
    name: string;
    bytes: number;
}
```

源码：[packages/client/features/dsh-client-conversations/src/client/types.ts:81](../../packages/client/features/dsh-client-conversations/src/client/types.ts#L81)

## CreatorStudioConversationSnapshot

```ts
export interface CreatorStudioConversationSnapshot {
    status: 'idle' | 'loading' | 'ready' | 'error';
    active: CreatorStudioSession | null;
    reference: SessionReference | null;
    items: CreatorStudioSessionSummary[];
    error: string;
    editingSessionId: string;
}
```

源码：[packages/client/features/dsh-client-creator-studio/src/client/types.ts:12](../../packages/client/features/dsh-client-creator-studio/src/client/types.ts#L12)

## CreatorStudioSessions

```ts
export interface CreatorStudioSessions {
    getSnapshot(): CreatorStudioConversationSnapshot;
    subscribe(listener: () => void): () => void;
    refresh(): Promise<CreatorStudioSessionSummary[]>;
    create(characterId?: string): Promise<CreatorStudioSession | undefined>;
    open(sessionId: string): Promise<CreatorStudioSession | undefined>;
    restoreRecent(): Promise<CreatorStudioSession | undefined>;
    rename(sessionId: string, title: string): Promise<void>;
    pin(sessionId: string, pinned: boolean): Promise<void>;
    delete(sessionId: string): Promise<void>;
    search(query: string, signal: AbortSignal): Promise<{ items: import('@deepseek-ai/dsh-api-session-controller/client').SessionSearchResultItem[]; hasMore: boolean; }>;
    readDefaultModel(): Promise<ConversationModelSelection>;
    selectModel(selection: ConversationModelSelection): Promise<ConversationModelSelection>;
    messages(): Promise<CreatorStudioMessage[]>;
    regenerate(): Promise<void>;
    deleteMessagesFrom(eventSeq: number, role: 'user' | 'assistant'): Promise<void>;
    selectCharacter(characterId: string): Promise<CreatorStudioSession>;
    release(): void;
}
```

源码：[packages/client/features/dsh-client-creator-studio/src/client/types.ts:20](../../packages/client/features/dsh-client-creator-studio/src/client/types.ts#L20)

## CreatorStudioSnapshot

```ts
export interface CreatorStudioSnapshot {
    status: 'loading' | 'ready' | 'error';
    collection: CreatorProjectCollection;
    error: string;
}
```

源码：[packages/client/features/dsh-client-creator-studio/src/client/types.ts:46](../../packages/client/features/dsh-client-creator-studio/src/client/types.ts#L46)

## EditorLibraryVersionModel

```ts
export interface EditorLibraryVersionModel<T> {
    subscribe(listener: () => void): () => void;
    read(scope: 'global' | 'character' | 'preset', ownerId: string): Promise<EditorLibraryVersions>;
    save(documents: T[], versions: EditorLibraryVersions[]): Promise<{ documents: T[]; versions: EditorLibraryVersions[]; }>;
}
```

源码：[packages/client/features/dsh-client-character-configuration/src/client/types.ts:34](../../packages/client/features/dsh-client-character-configuration/src/client/types.ts#L34)

## ElecKoiRegexEditor

```ts
export interface ElecKoiRegexEditor {
    versions: EditorLibraryVersionModel<RegexRuleEditorCollection>;
    getSnapshot(): ConfigurationSnapshot<RegexRuleEditorCollection>;
    read(): Promise<RegexRuleEditorCollection>;
    subscribe(listener: (snapshot: ConfigurationSnapshot<RegexRuleEditorCollection>) => void): () => void;
    save(collection: RegexRuleEditorCollection): Promise<RegexRuleEditorCollection>;
    import(collection: RegexRuleEditorCollection, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[]): Promise<RegexRuleEditorImportResult>;
    export(ruleIds: string[]): Promise<{ fileName: string; json: string; }>;
}
```

源码：[packages/client/features/dsh-client-character-configuration/src/client/types.ts:274](../../packages/client/features/dsh-client-character-configuration/src/client/types.ts#L274)

## ModelCatalogSnapshot

```ts
export interface ModelCatalogSnapshot {
    status: 'loading' | 'ready' | 'error';
    configs: ClientModelConfig[];
    providers: ClientModelProvider[];
    error: string;
}
```

源码：[packages/client/features/dsh-client-models/src/client/types.ts:19](../../packages/client/features/dsh-client-models/src/client/types.ts#L19)

## NativeAuthorChatHandlers

```ts
export type NativeAuthorChatHandlers = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>;
```

源码：[packages/client/features/dsh-client-author/src/client/types.ts:20](../../packages/client/features/dsh-client-author/src/client/types.ts#L20)

## NativeAuthorPanel

```ts
export interface NativeAuthorPanel extends AuthorScriptPanel {
    key: string;
    conversationId: string;
    scriptKey: string;
    baseUrl: string;
}
```

源码：[packages/client/features/dsh-client-author/src/client/types.ts:11](../../packages/client/features/dsh-client-author/src/client/types.ts#L11)

## NativeAuthorProjectContext

```ts
export type NativeAuthorProjectContext = { projectId: string; entryFile: string; view: string; } & ({ scope: 'application'; } | { scope: 'character'; characterId: string; conversationId?: string; });
```

源码：[packages/client/features/dsh-client-author/src/client/types.ts:21](../../packages/client/features/dsh-client-author/src/client/types.ts#L21)

## NativeAuthorRuntimeSnapshot

```ts
export interface NativeAuthorRuntimeSnapshot {
    status: 'idle' | 'starting' | 'ready' | 'error' | 'closed';
    conversationId: string;
    error: string;
    scriptStatuses: Record<string, AuthorScriptStatus & { scope: string; ownerId: string; source: string; }>;
}
```

源码：[packages/client/features/dsh-client-author/src/client/types.ts:4](../../packages/client/features/dsh-client-author/src/client/types.ts#L4)

## NativeAuthorUiSnapshot

```ts
export interface NativeAuthorUiSnapshot {
    buttons: Array<{ key: string; id: string; label: string; scriptKey: string; scriptName: string; scope: string; conversationId: string; busy: boolean; error: string; }>;
    panel: NativeAuthorPanel | null;
}
```

源码：[packages/client/features/dsh-client-author/src/client/types.ts:14](../../packages/client/features/dsh-client-author/src/client/types.ts#L14)

## PersonaSnapshot

```ts
export interface PersonaSnapshot {
    status: 'loading' | 'ready' | 'error';
    profile: PersonaProfile | null;
    error: string;
}
```

源码：[packages/client/features/dsh-client-persona/src/client/types.ts:4](../../packages/client/features/dsh-client-persona/src/client/types.ts#L4)

## PresetCatalogSnapshot

```ts
export interface PresetCatalogSnapshot {
    status: 'loading' | 'ready' | 'error';
    catalog: AgentPresetCatalog | null;
    error: string;
}
```

源码：[packages/client/features/dsh-client-presets/src/client/types.ts:4](../../packages/client/features/dsh-client-presets/src/client/types.ts#L4)

## PresetDetailSnapshot

```ts
export interface PresetDetailSnapshot {
    status: 'idle' | 'ready' | 'error';
    preset: AgentPreset | null;
    error: string;
}
```

源码：[packages/client/features/dsh-client-presets/src/client/types.ts:5](../../packages/client/features/dsh-client-presets/src/client/types.ts#L5)

## WebSearchSettingsPatch

```ts
export interface WebSearchSettingsPatch {
    mode?: WebSearchMode;
    fetchMode?: WebFetchMode;
    maxResults?: number;
}
```

源码：[packages/client/features/dsh-client-web-search/src/client/types.ts:5](../../packages/client/features/dsh-client-web-search/src/client/types.ts#L5)

## WebSearchSnapshot

```ts
export interface WebSearchSnapshot {
    status: 'loading' | 'ready' | 'error';
    mode: WebSearchMode;
    fetchMode: WebFetchMode;
    officialDeepSeekAvailable: boolean;
    maxResults: number;
    apiKeyConfigured: boolean;
    apiKeyRef: string;
    apiKeyWritable: boolean;
    writable: boolean;
    tavilyAvailable: boolean;
    revision?: number;
    error: string;
}
```

源码：[packages/client/features/dsh-client-web-search/src/client/types.ts:4](../../packages/client/features/dsh-client-web-search/src/client/types.ts#L4)

## 官方和平台类型

官方类型从其对应的 DSH 公开包入口导入；平台类型使用 TypeScript 标准库。

[锁定版本的官方接口目录](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/docs/subsystems/README.zh.md)

`GenerateOptions`、`RemoteStream`、`Session`
