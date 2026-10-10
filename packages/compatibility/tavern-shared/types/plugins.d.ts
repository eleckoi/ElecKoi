export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Scope = 'message' | 'chat' | 'character' | 'preset' | 'global' | 'script' | 'extension' | 'plugin';
export interface PluginManifest { id: string; name: string; version: string; entry?: string; source: string; enabled?: boolean }
export interface Message { id: string; role: 'system' | 'user' | 'assistant'; content: string; reasoning: string; metadata: Record<string, Json>; swipes: string[]; swipe_id: number; images?: {id:string;url:string}[] }
export interface MessageContentOptions {
  content: string; messageId?: string; conversationId?: string; role?: string; streaming?: boolean;
  images?: { id?: string; frameIndex?: number; afterParagraph?: number; attachmentId?: string; url?: string; previewUrl?: string; dataUrl?: string; status?: string; generationStatus?: string; renderKey?: string; errorMessage?: string; [key: string]: unknown }[];
}
export interface SqlStatement { sql: string; params?: Json[] }
export interface SqlResult { rows: Record<string, Json>[]; changes: number; lastInsertId: number }
export interface PluginDatabase {
  execute(sql: string, params?: Json[]): Promise<SqlResult>;
  query(sql: string, params?: Json[]): Promise<Record<string, Json>[]>;
  transaction(statements: SqlStatement[]): Promise<SqlResult[]>;
}
export interface GenerationOptions {
  id?: string; conversationId?: string; configId?: string; model?: string; purpose?: string;
  raw?: boolean; stream?: boolean; prompt?: string; responseFormat?: 'json';
  messages?: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | GenerationContentPart[]; name?: string; tool_call_id?: string; tool_calls?: GenerationToolCall[] }[];
  parameters?: Record<string, Json>;
  custom_api?: {apiurl?:string;key?:string;model?:string;source?:string;configId?:string;custom_include_headers?:Record<string,string>};
  /** Per-request controls; omission follows captured shared settings. Empty stop disables them. */
  generationControls?: { stop?: string[]; expandStopMacros?: boolean; replyPrefix?: string; promptPostProcessing?: '' | 'merge' | 'merge_tools' | 'semi' | 'semi_tools' | 'strict' | 'strict_tools' | 'single'; names?: { user_name?: string; char_name?: string; group_names?: string[] } };
}
export type GenerationContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };
export interface GenerationToolCall { id: string; type: 'function'; function: { name: string; arguments: string }; signature?: string }
export interface GenerationResult { id: string; content: string; reasoning: string; model: string; tool_calls?: GenerationToolCall[]; signatures?: string[]; reasoning_signature?: string }
export interface GenerationPreview { dryRun: true; messages: NonNullable<GenerationOptions['messages']>; request: Record<string, Json>; format: string }
export interface PromptInjection {
  id: string; content: string; role?: 'system' | 'user' | 'assistant'; order?: number; depth?: number;
  anchor?: 'instructions' | 'beforeToolContext' | 'toolContext' | 'afterToolContext' | 'beforeHistory' | 'afterHistory' | 'beforeLatestUserInput' | 'afterLatestUserInput' | 'beforeToolFlow' | 'afterToolFlow';
  position?: 'in_chat' | 'none'; filter?: () => boolean | Promise<boolean>;
  should_scan?: boolean;
}
export interface UiDescriptor { id: string; label: string; kind: 'panel' | 'settings' | 'message-button' | 'script-button' | 'character-menu'; html?: string; onClick?: (event: Json) => void | Promise<void> }
export interface QuickReply {
  id: number; label: string; message: string; icon: string; title: string; automationId: string;
  showLabel: boolean; isHidden: boolean; preventAutoExecute: boolean; executeOnStartup: boolean; executeOnUser: boolean; executeOnAi: boolean;
  executeOnChatChange: boolean; executeOnGroupMemberDraft: boolean; executeOnNewChat: boolean; executeBeforeGeneration: boolean;
  contextList: { set: string; isChained: boolean }[]; [key: string]: unknown;
}
export interface QuickReplySet { version: 2; name: string; qrList: QuickReply[]; idIndex: number; disableSend: boolean; placeBeforeInput: boolean; injectInput: boolean; [key: string]: unknown }
export interface QuickReplyApi {
  getSetByName(name: string): QuickReplySet | undefined; getQrByLabel(name: string, label: string | number): QuickReply | undefined; getSetByQr(reply: QuickReply): QuickReplySet | undefined;
  listSets(): string[]; listGlobalSets(): string[]; listChatSets(): string[]; listQuickReplies(name: string): string[];
  createSet(name: string, options?: Partial<QuickReplySet>): Promise<QuickReplySet>; updateSet(name: string, options?: Partial<QuickReplySet>): Promise<QuickReplySet>; deleteSet(name: string): Promise<void>;
  createQuickReply(name: string, label: string, options?: Partial<QuickReply>): QuickReply; updateQuickReply(name: string, label: string | number, options: Partial<QuickReply> & {newLabel?: string}): QuickReply; deleteQuickReply(name: string, label: string | number): void;
  createContextItem(name: string, label: string | number, contextName: string, isChained?: boolean): void; deleteContextItem(name: string, label: string | number, contextName: string): void; clearContextMenu(name: string, label: string | number): void;
  toggleGlobalSet(name: string, visible?: boolean): void; addGlobalSet(name: string, visible?: boolean): void; removeGlobalSet(name: string): void; toggleChatSet(name: string, visible?: boolean): void; addChatSet(name: string, visible?: boolean): void; removeChatSet(name: string): void;
  executeQuickReply(name: string, label: string | number, args?: Record<string, unknown>, options?: Record<string, unknown>): Promise<string>; executeQuickReplyByIndex(index: number): Promise<string>; executeByName(name: string, args?: Record<string, unknown>, options?: Record<string, unknown>): Promise<string>;
  importClosures(from: string, names: string[], options: {scope: unknown; abortController?: unknown; debugController?: unknown}): string;
  exportSet(name: string): QuickReplySet; importSet(value: QuickReplySet): Promise<void>; renderInto(root: HTMLElement): HTMLElement; open(): Promise<unknown>; openManager(name?: string): Promise<boolean>;
}
/** Opt-in adapter for an authored theme's actual message content elements. */
export interface MessageSurface {
  /** The real chat owning a native surface; hydration cannot rebind it to another chat. */
  conversationId?: string;
  root: HTMLElement;
  retrieve(nativeMessageId: string): HTMLElement | HTMLElement[];
  format(text: string): string;
  refresh(nativeMessageId: string, html: string, target?: HTMLElement): void | Promise<void>;
  syncMetadata?(messages: { native_id: string; message_id: number; is_hidden: boolean; is_system: boolean }[]): void;
  /** Return the tool result element actually mounted inside the displayed message. */
  renderTools?(messageElement: HTMLElement, invocations: ToolInvocation[], message: Json): HTMLElement | Promise<HTMLElement>;
  clear?(): void;
  print?(): void;
}
export interface DataBankScope extends ContextOptions { source?: 'all' | 'global' | 'character' | 'chat' }
export interface DataBankDocument { id: string; url: string; scope: string; name: string; text: string; size: number; enabled: boolean; revision: number; updatedAt: number; metadata: Record<string, Json>; indexedRevision?: number; indexedChunks?: number }
export interface EmbeddingConnection { url: string; model: string; apiKey?: string; headers?: Record<string, string> }
export interface DataBankSettings { enabled: boolean; chunkSize: number; overlap: number; count: number; threshold: number; query: number; tokenBudget?: number; embedding?: EmbeddingConnection }
export interface DataBankMatch { documentId: string; url: string; name: string; index: number; start: number; end: number; text: string; score: number }
export interface ContextOptions { conversationId?: string; characterId?: string; presetId?: string }
export interface ModelConnection { id: string; name: string; provider: string; baseUrl: string; proxyUrl: string; model: string; apiFormat: string; hasKey: boolean; customHeaders: Record<string,string>; models: {id:string;name:string}[] }
export interface ConnectionProfile { id: string; name: string; mode: string; exclude: string[]; api: string; model: string; preset?: string; proxy?: string; 'api-url'?: string; 'secret-id'?: string; eleckoi_config_id?: string; [key: string]: unknown }
export interface ProxyPreset { name: string; url?: string; apiurl?: string; password?: string; key?: string; [key: string]: unknown }
export interface GenerationTask { id: string; status: 'running' | 'completed' | 'failed' | 'cancelled'; result?: GenerationResult; error?: string }
export interface MainGenerationOptions {
  conversationId?: string; force_chid?: string | number | null; await?: boolean;
  signal?: AbortSignal; abortController?: AbortController | {signal:{aborted:boolean;reason?:unknown};addEventListener(type:string,listener:()=>void):void;removeEventListener(type:string,listener:()=>void):void};
  quiet_prompt?: string; quietToLoud?: boolean; skipWIAN?: boolean; force_name2?: boolean;
  quietImage?: string | File | Blob | (string | File | Blob)[] | null; quietName?: string | null;
  responseLength?: number | null; jsonSchema?: {name?:string;value?:Record<string,Json>;schema?:Record<string,Json>;strict?:boolean;returnInvalid?:boolean} | null;
}
export interface NativeCommandResult { accepted: boolean; message: string; runId?: string }
export interface ChatBranch { id: string; name: string; parentId: string; messageCount: number }
export type FileSaveResult = { saved: true; name: string; uri: string; bytes: number } | { saved: false; cancelled: true };
export interface ItemizedPrompt { mesId: number; rawPrompt: string; main_api: string; format: string; request: Record<string, Json>; requests?: Json[] }
export interface PluginApi {
  application: import('./application.js').ApplicationApi;
  navigation: import('./application.js').NavigationApi;
  platform: import('./application.js').PlatformApi;
  assets: { resolve(reference: string): string };
  presentation: { current(): Promise<unknown> };
  quickReplies: QuickReplyApi;
  chat: {
    close():Promise<{accepted:boolean}>; temporary():Promise<string>;
    openHistory():Promise<{accepted:boolean}>;
    current(): Promise<Record<string, Json>>; list(): Promise<Record<string, Json>>; getGenerationState(): Promise<Record<string, Json>>;
    getAgentTrajectory(options?: {messageId?:string}): Promise<Record<string, Json>>; getModels(): Promise<Record<string, Json>>;
    send(text: string, options?: {attachments?: (File | Blob | Record<string, Json>)[]}): Promise<NativeCommandResult>; stopGeneration(): Promise<NativeCommandResult>;
    create(options?: {characterId?:string}): Promise<NativeCommandResult>; open(sessionId: string): Promise<NativeCommandResult>; delete(sessionId: string): Promise<NativeCommandResult>;
    selectModel(options:{configId:string;model?:string}): Promise<NativeCommandResult>;
    createStored(options?:{characterId?:string;title?:string}): Promise<string>; branch(index:number,options?:{checkpoint?:boolean;name?:string}): Promise<ChatBranch>;
    generateFromHistory(type?: 'normal' | 'continue' | 'regenerate' | 'swipe', options?: MainGenerationOptions): Promise<string | NativeCommandResult>;
    import(filename:string,content:string): Promise<boolean>; export(options?:{conversationId?:string}): Promise<string>; rename(name:string,options?:{conversationId?:string}): Promise<boolean>;
  };
  models: {list(): Promise<ModelConnection[]>; put(config: Partial<ModelConnection> & {apiKey?: string; credentialConfigId?: string}): Promise<ModelConnection>; delete(id: string): Promise<boolean>; refresh(id: string): Promise<ModelConnection>; select(id: string, model?: string): Promise<ModelConnection>};
  secrets: {read(id: string): Promise<string>; write(options: {baseId:string;label:string;value:string;allowEmpty?:boolean}): Promise<string>;
    rename(id:string,label:string): Promise<string>; delete(id:string): Promise<string>};
  connections: {current(): {configId?: string; model?: string; baseUrl?: string; source?: string;apiFormat?:string;provider?:string}; list(): ConnectionProfile[]; get(reference?: string): ConnectionProfile | null;
    create(name: string): Promise<ConnectionProfile>; update(reference?: string, patch?: Partial<ConnectionProfile>): Promise<ConnectionProfile>; delete(reference: string): Promise<boolean>; select(reference: string | null): Promise<ConnectionProfile | null>;
    configure(patch: Partial<ConnectionProfile>): Promise<unknown>; endpoint(api?:string,url?:string,options?:{connect?:boolean}):Promise<string>; secret(key?:string,reference?:string):Promise<string>;
    readSecret(key?:string,reference?:string):Promise<string>; writeSecret(key:string|undefined,label:string,value:string,allowEmpty?:boolean):Promise<string>;
    renameSecret(key:string|undefined,reference:string|undefined,label:string):Promise<string>; deleteSecret(key?:string,reference?:string):Promise<string>;
    requestOptions(reference?:string):Promise<{configId?:string;model?:string;preset_name?:string;custom_api:Record<string,Json>}>;
    proxies(): ProxyPreset[]; putProxy(value: ProxyPreset): Promise<ProxyPreset>; deleteProxy(name: string): Promise<boolean>};
  notes: { get(): { content: string; depth: number; frequency: number; position: number; role: number };
    set(patch: Partial<{ content: string; depth: number; frequency: number; position: number; role: number }>): Promise<void> };
  tts: { settings(): Promise<TtsSettings>; configure(settings: Partial<TtsSettings>): Promise<TtsSettings>;
    voices(options?: Partial<TtsSettings>): Promise<TtsVoice[]>; synthesize(text: string, options?: Partial<TtsSettings> & { id?: string; messageId?: number | null; characterName?: string }): Promise<TtsAudio>;
    speak(text: string, options?: Partial<TtsSettings> & { id?: string; title?: string; messageId?: number | null; characterName?: string }): Promise<TtsAudio>; stop(id?: string): Promise<boolean>;
    state(id?: string): Promise<Record<string, Json> | Record<string, Json>[]>;
    providers(): { id: string; name: string }[]; registerProvider(provider: TtsProvider): () => void };
  groups: { list(): Promise<GroupDocument[]>; get(id: string): Promise<GroupDocument>; put(group: Partial<GroupDocument> & { members: string[] }): Promise<GroupDocument>;
    delete(id: string): Promise<boolean>; createChat(id: string, title?: string): Promise<string>; bind(id: string): Promise<void> };
  databank: {
    registerParser(parser: { id: string; name?: string; accepts(file: File): boolean | Promise<boolean>; parse(file: File, options?: DataBankScope): string | Promise<string> }): () => void;
    parsers(): { id: string; name: string }[];
    settings(): Promise<DataBankSettings>; configure(value: Partial<DataBankSettings>): Promise<DataBankSettings>;
    list(options?: DataBankScope): Promise<DataBankDocument[]>; get(id: string, options?: DataBankScope): Promise<DataBankDocument>;
    put(document: DataBankScope & { id?: string; url?: string; name?: string; text: string; enabled?: boolean; metadata?: Record<string, Json> }): Promise<DataBankDocument>;
    delete(id: string, options?: DataBankScope): Promise<boolean>; setEnabled(id: string, enabled: boolean, options?: DataBankScope): Promise<DataBankDocument>;
    ingest(options?: DataBankScope & { id?: string; url?: string; name?: string }): Promise<{ id: string; chunks: number; reused?: boolean }[]>;
    purge(options?: DataBankScope & { id?: string; url?: string; name?: string }): Promise<number>;
    search(query: string, options?: DataBankScope & { threshold?: number; count?: number }): Promise<DataBankMatch[]>;
    embed(input: string | string[]): Promise<number[][]>;
    importFile(file: File | Blob, options?: DataBankScope & { name?: string; password?: string }): Promise<DataBankDocument>;
    scrapers(): { id: string; name: string; description?: string; iconClass?: string; iconAvailable?: boolean }[];
    runScraper(id: string, options?: DataBankScope): Promise<DataBankDocument[]>;
  };
  scripts: { getTrees(options: { type: 'global' | 'preset' | 'character' }): any[]; replaceTrees(trees: any[], options: { type: 'global' | 'preset' | 'character' }): void;
    updateTrees(updater: (trees: any[]) => any[], options: { type: 'global' | 'preset' | 'character' }): any[];
    buttons(): { name: string; visible: boolean }[]; replaceButtons(buttons: { name: string; visible?: boolean }[]): void;
    updateButtons(updater: (buttons: any[]) => any[]): any[] };
  slash: { execute(text: string, options?: { pipe?: string; scope?: unknown; abortController?: unknown; parserFlags?: Record<number, boolean>; onProgress?: (done: number, total: number) => void }): Promise<{ pipe: string; isAborted: boolean; isQuietlyAborted: boolean; abortReason?: string; isBreak: boolean; isError: boolean; errorMessage?: string }>;
    register(descriptor: { name: string; aliases?: string[]; callback: (namedArguments: Record<string, any>, unnamedArguments: any) => string | Promise<string>; helpString?: string; [key: string]: any }): () => void;
    list(): { name: string; aliases: string[]; helpString: string }[] };
  tokens: { count(text: string, options?: { encoding?: string }): number; encode(text: string, options?: { encoding?: string }): number[];
    decode(ids: number[], options?: { encoding?: string }): string; info(): { encoding: string; model: string; implementation: string };
    select(type: 'GPT2' | 'OPENAI' | 'BEST_MATCH' | 'r50k_base' | 'p50k_base' | 'p50k_edit' | 'cl100k_base' | 'o200k_base' | number): Promise<string> };
  ready(): Promise<void>; flush(): Promise<void>;
  call(method: string, params?: Record<string, Json>): Promise<Json>;
  plugins: { list(): Promise<Record<string, PluginManifest>>; install(id: string, manifest: PluginManifest): Promise<boolean>; openManager(): Promise<void>; setEnabled(id: string, enabled: boolean): Promise<boolean>; remove(id: string): Promise<boolean> };
  storage: { kv: { get(key: string): Promise<Json>; set(key: string, value: Json): Promise<void>; delete(key: string): Promise<number>; list(): Promise<Record<string, Json>> }; sqlite: { open(name: string): Promise<PluginDatabase> } };
  settings: { get(): Promise<Record<string, Json>>; set(value: Record<string, Json>): Promise<Record<string, Json>> };
  files: { saveText(options: { name: string; text: string; mimeType?: string }): Promise<FileSaveResult> };
  generation: { preview(options: GenerationOptions): Promise<GenerationPreview>; request(data: Record<string, Json>, options?: { extractData?: boolean; signal?: AbortSignal }): Promise<Json | CompletionStream>; invoke(options: GenerationOptions): Promise<GenerationResult>; invokeRaw(options: GenerationOptions): Promise<GenerationResult>; start(options: GenerationOptions): Promise<GenerationTask>; get(id: string): Promise<GenerationTask>; cancel(id: string): Promise<boolean> };
  prompt: { inject(entries: PromptInjection[], options?: { once?: boolean }): { uninject(): void }; remove(ids: string[]): void; preview(): PromptInjection[]; history(options?:ContextOptions):Promise<ItemizedPrompt[]>; clearHistory(options?:ContextOptions & {all?:boolean}):Promise<void>; beforeProviderRequest(callback: (event:{conversationId:string;format:string;request:Record<string,Json>}) => void | Promise<void>): {stop():void}; beforeGeneration(callback: (event: { conversationId: string; purpose: string }) => void | Promise<void>): { stop(): void } };
  ui: { registerMessageSurface(surface: MessageSurface): () => void; notifyMessageRendered(messageIds: string | string[], type?: string): Promise<void>; register(descriptor: UiDescriptor): Promise<void>; unregister(id: string): Promise<void>; open(id: string): Promise<void>; close(): Promise<void>; list(): Promise<UiDescriptor[]>; emit(event: string, payload: Json): Promise<void>;
    /** Incrementally renders Markdown, inline generated images, and isolated interactive HTML with the shared Host SDK. */
    renderMessageContent(container: HTMLElement, options: MessageContentOptions): { update(options: MessageContentOptions): void; dispose(): void };
    registerChatController(conversationId: string, handlers: import('./application.js').ChatControllerHandlers): () => void;
    openSettings(): Promise<unknown>; openModels(): Promise<unknown>; openBackground(): Promise<unknown>; openHistory(): Promise<unknown>;
    createChat(options?: { characterId?: string; title?: string }): Promise<unknown>; editMessage(id: string): Promise<unknown>; showProcess(id: string): Promise<unknown>;
    getChatDocument(): Document;
    chatPanels(action: 'toggle' | 'reset'): Promise<{accepted: boolean}>; setCssVariable(target: 'chat' | 'background' | 'gallery' | 'zoomedAvatar', name: string, value: string): void; reloadChat(): void };
  appearance: { backgrounds(options?: ContextOptions): Promise<{current: string; items: {name: string; path: string}[]}>;
    selectBackground(name: string, options?: ContextOptions): Promise<{current: string; items: {name: string; path: string}[]}>;
    lockBackground(locked: boolean, options?: ContextOptions): Promise<{current:string;items:{name:string;path:string}[]}>;
    theme(name?: string): Promise<string>; palette(options?: ContextOptions & {name?: string; background?: string; force?: boolean}): Promise<string>;
    messageStyle(style: 'single' | 'bubble' | 'flat'): Promise<string> };
  media: { imageSettings(value?: Record<string, Json>): Promise<Record<string, Json>>;
    generate(options: ContextOptions & {prompt:string;negative?:string;gallery?:boolean;configId?:string;source?:string;width?:number;height?:number;steps?:number;cfg?:number;seed?:number;model?:string;sampler?:string;workflow?:string|Record<string,Json>;skip?:number;scheduler?:string;vae?:string;upscaler?:string;hires?:boolean;scale?:number;denoise?:number;'2ndpass'?:number;faces?:boolean}): Promise<{id:string;url:string;path:string;width:number;height:number;source:string}>;
    gallery(options?: ContextOptions): Promise<{id:string;url:string;prompt:string;createdAt:number}[]>; read(url:string):Promise<string>;
    expressions(options?: ContextOptions & {folder?:string}):Promise<{name:string;label:string;url:string}[]>;
    uploadExpression(options:ContextOptions & {url:string;label:string;folder?:string;spriteName?:string}):Promise<{name:string;label:string;url:string}> };
  variables: { edit(options?: { type?: Scope; message_id?: number | 'latest'; script_id?: string; extension_id?: string }): Promise<boolean>;
    readScope(options: ContextOptions & { scope: Scope; messageId?: string }): Promise<Record<string, Json>>; writeScope(value: Record<string, Json>, options: ContextOptions & { scope: Scope; messageId?: string }): Promise<Record<string, Json>> };
  worldbooks: { list(): Promise<string[]>; get(name: string): Promise<Record<string, Json>>; put(name: string, book: Record<string, Json>): Promise<Record<string, Json>>; delete(name: string): Promise<boolean>;
    scan(options: ContextOptions & {messages:string[];maxContext?:number;dryRun?:boolean;globalScanData?:Record<string,Json>}):Promise<{entries:Json[];outlets:Record<string,string>;trace:Json[];dryRun:boolean}>;
    settings(): Promise<Record<string, Json>>; setSettings(value: Record<string, Json>): Promise<Record<string, Json>>;
    lastScan(options?: ContextOptions): Promise<{ entries: Json[]; outlets: Record<string, string>; trace: Json[]; dryRun: boolean } | null>;
    timedEffect(name: string, uid: number, effect: 'sticky' | 'cooldown' | 'delay', state?: 'on' | 'off' | 'toggle'): Promise<{active: boolean; remaining: number; metadata: Json}>;
    bind(scope: 'global' | 'character' | 'chat', names: string[], options?: ContextOptions): Promise<string[]>; bindings(scope: 'global' | 'character' | 'chat', options?: ContextOptions): Promise<string[]> };
  characters: { list(): Promise<Record<string, Json>[]>; read(options?: ContextOptions): Promise<Record<string, Json>>; write(character: Record<string, Json>, options?: ContextOptions): Promise<Record<string, Json>>;
    rename(id:string,name:string,options?:ContextOptions & {chats?:boolean}):Promise<boolean>; openLibrary(options?:{forceDefault?:boolean}):Promise<boolean> };
  personas: { get(id?: string): Promise<Record<string, Json>>; set(persona: Record<string, Json>): Promise<Record<string, Json>>;
    list(): Promise<Record<string, Json>[]>; select(id: string, options?: { scope?: 'global' | 'character' | 'chat'; conversationId?: string; characterId?: string }): Promise<void>;
    binding(scope?: 'chat' | 'character' | 'default', id?: string | null): Promise<string | null>;
    put(id: string, name: string, persona: Record<string, Json>): Promise<Record<string, Json>>; delete(id: string): Promise<boolean> };
  presets: { list(): Promise<Record<string, Json>[]>; get(id?: string): Promise<Record<string, Json>>; select(id: string): Promise<Record<string, Json>>; update(id: string, preset: Record<string, Json>): Promise<Record<string, Json>> };
  regex: { get(options?: ContextOptions): Promise<Record<string, Json>>; set(rules: Record<string, Json>, options?: ContextOptions): Promise<Record<string, Json>> };
  macros: { register(name: string, value: string | (() => string)): () => void; unregister(name: string): void; substitute(text: string, options?: { readOnly?: boolean; dynamicMacros?: Record<string, any> }): string;
    registry: { registerMacro(name: string, options: { handler: (context: any) => any; [key: string]: any }): unknown; registerMacroAlias(target: string, alias: string, options?: { visible?: boolean }): boolean; unregisterMacro(name: string): boolean; hasMacro(name: string): boolean; getMacro(name: string): unknown; getAllMacros(options?: { excludeAliases?: boolean; excludeHiddenAliases?: boolean }): any[] };
    engine: { addPreProcessor(handler: (text: string, environment: any) => string, options?: { priority?: number; source?: string }): void; removePreProcessor(handler: Function): boolean; addPostProcessor(handler: (text: string, environment: any) => string, options?: { priority?: number; source?: string }): void; removePostProcessor(handler: Function): boolean } };
  messages: { read(options?: { conversationId?: string }): Promise<Message[]>; update(messages: { id: string; content?: string; expectedContent?: string; metadata?: Record<string, Json> }[], options?: { conversationId?: string }): Promise<Message[]>; insert(messages: Partial<Message>[], options?: { conversationId?: string; index?: number }): Promise<Message[]>; delete(ids: string[], options?: { conversationId?: string }): Promise<Message[]>; metadata(id?: string, value?: Record<string, Json>, options?: { conversationId?: string }): Promise<Record<string, Json>> };
  extras: { readonly modules: string[]; readonly connected: boolean; connect(url?:string,key?:string):Promise<string[]>; disconnect():void;
    fetch(url:string,options?:{method?:string;headers?:Record<string,string>;body?:string;signal?:AbortSignal}):ReturnType<PluginApi['net']['fetch']> };
  net: { fetch(url: string, options?: { id?: string; signal?: AbortSignal; method?: string; headers?: Record<string, string>; body?: string; contentType?: string; responseType?: "text" | "base64" }): Promise<{ status: number; ok: boolean; headers: Record<string, string>; text(): Promise<string>; json(): Promise<Json> }>; cancel(id: string): Promise<boolean> };
  events: { on(name: string, listener: (...args: any[]) => void | Promise<void>): () => void; once(name: string, listener: (...args: any[]) => void | Promise<void>): () => void; off(name: string, listener: (...args: any[]) => void | Promise<void>): void; emit(name: string, ...args: any[]): Promise<void> };
}

export interface CompletionStreamState { reasoning: string; images: string[]; signature: string; toolSignatures: Record<string, string> }
export interface GroupDocument {
  id: string; name: string; members: string[]; disabled_members: string[];
  activation_strategy: 0 | 1 | 2 | 3; generation_mode: 0 | 1 | 2;
  chats: string[]; chat_id?: string | null; allow_self_responses?: boolean;
  [key: string]: unknown;
}
export interface ToolInvocation { id: string; name: string; displayName?: string; parameters: string; result: string; error?: boolean; rawResult?: Json }
export interface TtsSettings { provider: string; url?: string; apiKey?: string; model?: string; voice?: string; speed?: number; pitch?: number; instructions?: string; headers?: Record<string, string> }
export interface TtsVoice { id: string; name: string; locale?: string; networkRequired?: boolean }
export interface TtsAudio { id: string; url: string; mimeType?: string; bytes?: number; status: 'completed'; messageId?: number | null; characterName?: string; text?: string; audio?: string }
export interface TtsProvider { id: string; name?: string; voices(options?: Partial<TtsSettings>): Promise<TtsVoice[]> | TtsVoice[];
  synthesize(text: string, options: Partial<TtsSettings> & { id: string; signal: AbortSignal }): Promise<{ url: string; mimeType?: string; bytes?: number }> }
export type CompletionStream = () => AsyncGenerator<{ text: string; swipes: string[]; state: CompletionStreamState }>;
export interface CompletionExtractedData { content: Json; reasoning: string }
export interface ChatCompletionRequest { stream?: boolean; messages: { role: string; content: Json; [key: string]: Json | undefined }[]; model?: string; chat_completion_source?: string; custom_url?: string; max_tokens?: number; temperature?: number; [key: string]: unknown }
export type PresetApiId = 'openai' | 'kobold' | 'koboldhorde' | 'novel' | 'textgenerationwebui' | 'context' | 'instruct' | 'sysprompt' | 'reasoning';
export interface PresetManagerApi {
  readonly apiId: PresetApiId;
  readonly select: HTMLSelectElement;
  getAllPresets(): string[];
  findPreset(name: string): string | undefined;
  getSelectedPreset(): string | undefined;
  getSelectedPresetName(): string;
  selectPreset(value: string): Promise<void>;
  updatePreset(options?: { skipUpdate?: boolean }): Promise<void>;
  savePresetAs(): Promise<void>;
  savePreset(name: string, settings?: Record<string, Json> | null, options?: { skipUpdate?: boolean }): Promise<void>;
  renamePreset(newName: string): Promise<void>;
  getPresetList(api?: PresetApiId): { presets: Record<string, Json>[]; preset_names: string[] | Record<string, number>; settings: Record<string, Json> };
  isKeyedApi(): boolean;
  isAdvancedFormatting(): boolean;
  updateList(name: string, preset: Record<string, Json>): void;
  getPresetSettings(name?: string): Record<string, Json>;
  getCompletionPresetByName(name: string): Record<string, Json> | undefined;
  deletePreset(name?: string): Promise<boolean | undefined>;
  getDefaultPreset(name: string): Promise<{ isDefault: boolean; preset: Record<string, Json> }>;
  readPresetExtensionField(options: { name?: string; path?: string }): Json;
  writePresetExtensionField(options: { name?: string; path?: string; value: Json }): Promise<void>;
}
export interface ChatCompletionServiceApi {
  readonly TYPE: 'openai';
  createRequestData(data: ChatCompletionRequest): ChatCompletionRequest;
  sendRequest(data: ChatCompletionRequest, extractData?: boolean, signal?: AbortSignal): Promise<CompletionExtractedData | Json | CompletionStream>;
  processRequest(data: ChatCompletionRequest, options: { presetName?: string }, extractData?: boolean, signal?: AbortSignal): Promise<CompletionExtractedData | Json | CompletionStream>;
  presetToGeneratePayload(preset: Record<string, Json>, overridePreset?: Record<string, Json>, overridePayload?: Partial<ChatCompletionRequest>): Promise<ChatCompletionRequest>;
}
