/** Native Client model documents are returned unchanged; no separate SDK storage. */
export type ApplicationDocument = Record<string, any>;
export type ApplicationResult = any;
export type ApplicationDomain = 'characters' | 'conversations' | 'conversationDetails' | 'timeline' | 'stream' | 'modelSelection' | 'stats'
  | 'presets' | 'presetDetail' | 'models' | 'settingLibraries' | 'conversationSettingLibraries' | 'variables' | 'regexRules'
  | 'persona' | 'appearance' | 'webSearch' | 'creator' | 'creatorDirectory' | 'creatorAssistant' | 'plugins' | 'pluginUi' | 'slots';
export interface FrontendTarget { target: 'root' | 'page' | 'slot'; view?: string; pageId?: string; slot?: string; entryKey?: string; kind?: string; [key: string]: unknown }
export interface ApplicationCapabilities {
  readonly version: '1.0.0'; readonly domains: readonly ApplicationDomain[];
  readonly actions: Readonly<Record<string, readonly string[]>>; readonly slots: readonly FrontendTarget[];
  readonly pluginUiKinds: readonly ('panel' | 'script-button')[];
}
export interface GenerationInput {
  conversationId?: string; requestId?: string; text?: string; signal?: AbortSignal; mode?: 'queue' | 'steer';
  images?: { data: string; mediaType: string; name?: string }[]; files?: string[];
  /** Formal Agent regeneration rewind target. */ eventSeq?: number; role?: string; [key: string]: unknown;
}
export interface ApplicationActions {
  characters: {
    refresh(): Promise<ApplicationResult>; create(character: ApplicationDocument): Promise<ApplicationResult>;
    update(character: ApplicationDocument): Promise<ApplicationResult>; select(characterId: string): Promise<ApplicationResult>;
    delete(characterIds: string[]): Promise<ApplicationResult>; saveGroups(groups: ApplicationDocument[], assignments?: ApplicationDocument[]): Promise<ApplicationResult>;
    prepareImport(source: string, files: ApplicationDocument[]): Promise<ApplicationResult>; commitImport(token: string): Promise<ApplicationResult>;
    discardImport(token: string): Promise<void>; exportCharacters(characterIds: string[], format: string): Promise<ApplicationResult>;
  };
  conversations: {
    refresh(): Promise<ApplicationResult>; create(input: { title?: string; metadata?: { characterId?: string; characterName?: string; characterAvatar?: string; characterPersona?: ApplicationDocument } }): Promise<ApplicationResult>;
    delete(conversationId: string): Promise<void>; activate(conversationId: string): void; open(conversationId: string): Promise<ApplicationResult>;
    openTimeline(conversationId: string): Promise<ApplicationResult>; closeTimeline(conversationId?: string): void;
    refreshDetails(): Promise<ApplicationResult>; refreshTimeline(): Promise<ApplicationResult>; pageOlder(expectedId: string, expectedBeforeSequence: number): Promise<ApplicationResult>;
    send(input: GenerationInput): Promise<ApplicationResult>; regenerate(input: GenerationInput): Promise<ApplicationResult>;
    cancel(conversationId?: string, requestId?: string): Promise<ApplicationResult>; cancelRequest(conversationId: string, requestId: string): Promise<ApplicationResult>;
    selectOpening(conversationId: string, openingId: string): Promise<ApplicationResult>; updateOpening(conversationId: string, content: string): Promise<ApplicationResult>;
    editMessage(conversationId: string, eventSeq: number, role: string, content: string): Promise<ApplicationResult>;
    deleteMessagesFrom(conversationId: string, eventSeq: number, role: string): Promise<ApplicationResult>;
    readModelSelection(conversationId: string): Promise<ApplicationResult>; selectModel(conversationId: string, selection: ApplicationDocument): Promise<ApplicationResult>;
    readAuthorState(conversationId: string): Promise<ApplicationResult>; replaceAuthorVariableState(conversationId: string, state: ApplicationDocument): Promise<ApplicationResult>;
    readTrajectory(conversationId: string): Promise<ApplicationResult>; exportArchive(conversationId: string): Promise<ApplicationResult>;
    importArchive(characterId: string, json: string): Promise<ApplicationResult>; uploadFile(conversationId: string, file: File, options?: ApplicationDocument): Promise<ApplicationResult>;
    readImage(conversationId: string, attachment: ApplicationDocument): Promise<ApplicationResult>; revealFile(conversationId: string, attachmentId: string, name: string): Promise<void>;
  };
  presets: {
    refresh(): Promise<ApplicationResult>; read(presetId: string): Promise<ApplicationResult>; save(preset: ApplicationDocument, expectedRegexRules: ApplicationDocument[]): Promise<ApplicationResult>;
    create(name: string, libraryGroupId?: string): Promise<ApplicationResult>; import(source: string, document: ApplicationDocument): Promise<ApplicationResult>;
    export(presetId: string, format: string): Promise<ApplicationResult>; setActive(presetId: string): Promise<ApplicationResult>;
    createGroup(name: string): Promise<ApplicationResult>; renameGroup(groupId: string, name: string): Promise<ApplicationResult>;
    assignGroup(presetId: string, groupId: string): Promise<ApplicationResult>; deleteGroup(groupId: string): Promise<ApplicationResult>; delete(presetId: string): Promise<ApplicationResult>;
  };
  models: {
    refresh(): Promise<ApplicationResult>; save(config: ApplicationDocument): Promise<ApplicationResult>; deleteConfig(configId: string): Promise<ApplicationResult>;
    deleteProvider(provider: string, preferredId?: string): Promise<ApplicationResult>; discover(config: ApplicationDocument): Promise<ApplicationResult>;
    testConnection(config: ApplicationDocument): Promise<ApplicationResult>; revealApiKey(configId: string): Promise<string>;
  };
  settingLibraries: CharacterConfigurationActions & {
    listCharacters(): Promise<ApplicationResult>; readConversations(characterId: string): Promise<ApplicationResult>;
    saveConversation(characterId: string, sessionId: string, library: ApplicationDocument): Promise<ApplicationResult>;
    resetConversation(characterId: string, sessionId: string): Promise<ApplicationResult>; saveConversationVersion(characterId: string, sessionId: string, name: string): Promise<ApplicationResult>;
  };
  variables: CharacterConfigurationActions;
  regexRules: Omit<CharacterConfigurationActions, 'saveViewState'> & {
    import(characterId: string, collection: ApplicationDocument, fallbackScope: string, documents: ApplicationDocument[]): Promise<ApplicationResult>;
    export(characterId: string, ruleIds: string[]): Promise<ApplicationResult>; test(text: string, rule: ApplicationDocument, target: string): Promise<ApplicationResult>;
  };
  persona: { refresh(): Promise<ApplicationResult>; save(profile: ApplicationDocument): Promise<ApplicationResult> };
  appearance: { refresh(): Promise<ApplicationResult>; updateUi(patch: ApplicationDocument | ((current: ApplicationDocument) => ApplicationDocument)): Promise<ApplicationResult>; setChatDisplay(value: ApplicationDocument): Promise<ApplicationResult> };
  webSearch: { refresh(): Promise<ApplicationResult>; update(patch: ApplicationDocument): Promise<ApplicationResult>; saveAndTest(apiKey: string): Promise<ApplicationResult>; test(apiKey?: string): Promise<ApplicationResult>; removeKey(): Promise<ApplicationResult> };
  creator: {
    refresh(): Promise<ApplicationResult>; create(input: ApplicationDocument): Promise<ApplicationResult>; delete(projectId: string): Promise<ApplicationResult>;
    selectDirectory(signal: AbortSignal): Promise<ApplicationResult>; finishDirectory(value: string | null, error?: Error): void;
    enterProject(projectId: string): Promise<ApplicationResult>; createAssistantConversation(projectId: string): Promise<ApplicationResult>;
    openAssistantConversation(projectId: string, sessionId: string): Promise<ApplicationResult>; sendAssistant(projectId: string, text: string, files?: File[]): Promise<ApplicationResult>;
    cancelAssistant(projectId: string): Promise<ApplicationResult>;
  };
  /** Original manager face operations. Observe manager state for progress, failure, and confirmation. */
  plugins: {
    ensure(): void; refresh(): void; setEnabled(packageName: string, enabled: boolean): void; setRowEnabled(entryId: string, enabled: boolean): void;
    openInstall(): void; closeInstall(): void; editInstallSpec(text: string): void; runInstall(): void; cancelInstall(): void;
    uninstall(packageName: string): void; confirm(): void; cancelConfirm(): void; chooseRegistry(choice: ApplicationDocument): void;
    configForm(id: string): unknown;
  };
  pluginUi: { refresh(): Promise<void>; open(pluginId: string, id: string): Promise<void> };
}
export interface CharacterConfigurationActions {
  read(characterId: string): Promise<ApplicationResult>; readUntracked(characterId: string): Promise<ApplicationResult>;
  save(characterId: string, value: ApplicationDocument): Promise<ApplicationResult>; saveViewState(characterId: string, expandedIds: string[]): Promise<ApplicationResult>;
}
export interface ApplicationApi {
  readonly version: '1.0.0'; readonly capabilities: ApplicationCapabilities; readonly actions: ApplicationActions;
  /** Original generated Remote instance. Native Result envelopes and streams are retained. */
  readonly remote: Record<string, any>;
  /** Returns the original model snapshot by reference. Owner is required for character configuration and preset details. */
  getSnapshot<T = ApplicationDocument>(domain: ApplicationDomain, owner?: string): T;
  subscribe(domain: ApplicationDomain, listener: () => void): () => void;
  subscribe(domain: ApplicationDomain, owner: string | undefined, listener: () => void): () => void;
  read<T = ApplicationResult>(domain: ApplicationDomain, owner?: string): T | Promise<T>;
}
export interface NavigationTarget { pageId?: string; conversationId?: string; characterId?: string; view?: string }
export interface NavigationSnapshot { pageId: string; conversationId: string | null; characterId: string | null; view: string }
export interface NavigationApi {
  getSnapshot(): NavigationSnapshot; subscribe(listener: () => void): () => void;
  open(target: string | NavigationTarget): Promise<NavigationSnapshot>;
  registerBackHandler(handler: (event: Event | KeyboardEvent) => boolean | void, priority?: number): () => void;
  back(): unknown;
}
export interface ApplicationEnvironment {
  view: string; platform: 'android' | 'desktop' | 'browser'; theme: string | null;
  viewport: { width: number; height: number }; container: { width: number; height: number } | null;
  safeArea: { top: number; right: number; bottom: number; left: number } | null;
}
export interface PlatformApi {
  /** The same native platform bridge that the default frontend uses. */
  readonly native: Record<string, any> | null; readonly desktop: Record<string, any> | null;
  readonly environment: { getSnapshot(): ApplicationEnvironment; subscribe(listener: () => void): () => void };
}
export interface ChatControllerHandlers {
  'input.get'?: (params: ApplicationDocument) => unknown;
  'input.set'?: (params: ApplicationDocument & { text: string }) => unknown;
  'input.append'?: (params: ApplicationDocument & { text: string }) => unknown;
  'input.clear'?: (params: ApplicationDocument) => unknown;
  'input.send'?: (params: ApplicationDocument) => unknown | Promise<unknown>;
  'presentation.current'?: (params: ApplicationDocument) => unknown | Promise<unknown>;
  'ui.openBackground'?: (params: ApplicationDocument) => unknown | Promise<unknown>;
  'ui.openSettings'?: (params: ApplicationDocument) => unknown | Promise<unknown>;
  'ui.openModels'?: (params: ApplicationDocument) => unknown | Promise<unknown>;
  'ui.openHistory'?: (params: ApplicationDocument) => unknown | Promise<unknown>;
  'ui.editMessage'?: (params: ApplicationDocument & { id: string }) => unknown | Promise<unknown>;
  'ui.showProcess'?: (params: ApplicationDocument & { id: string }) => unknown | Promise<unknown>;
  'chats.openHistory'?: (params: ApplicationDocument) => unknown | Promise<unknown>;
}
