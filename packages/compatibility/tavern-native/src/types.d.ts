/** Public contracts derived from ElecKoi's independent implementation. */
export type TavernRecord = Record<string, unknown>;
export type TavernId = string | number;
export type TavernRole = 'system' | 'user' | 'assistant' | 'tool';
export type ChatRole = Exclude<TavernRole, 'tool'>;
export type CatalogIdentity = string | { id?: string; name?: string; [key: string]: unknown };
export type TavernUpdater<T> = (value: T) => T | void | Promise<T | void>;
export type SyncTavernUpdater<T> = (value: T) => T | void;
export type AsyncTavernUpdater<T> = (value: T) => Promise<T | void>;
export interface TavernOptions extends TavernRecord { }

export interface ChatMessage extends TavernRecord {
  message_id: number; name: string; role: ChatRole; message: string;
  data: TavernRecord; is_hidden: boolean; swipe_id: number; extra: TavernRecord;
  swipes?: string[]; swipes_data?: TavernRecord[]; swipes_info?: TavernRecord[];
}
export interface ChatMessageUpdate extends TavernRecord {
  message_id: TavernId; name?: string; role?: ChatRole; message?: string;
  data?: TavernRecord; is_hidden?: boolean; swipe_id?: number; extra?: TavernRecord;
  swipes?: string[]; swipes_data?: TavernRecord[]; swipes_info?: TavernRecord[];
}
export interface ChatMessageCreate extends TavernRecord {
  name?: string; role?: ChatRole; message?: string; data?: TavernRecord;
  is_hidden?: boolean; swipe_id?: number; extra?: TavernRecord;
  swipes?: string[]; swipes_data?: TavernRecord[]; swipes_info?: TavernRecord[];
}
export interface ChatMessageFilter extends TavernRecord {
  role?: ChatRole | 'all'; hide_state?: 'all' | 'hidden' | 'unhidden'; include_swipes?: boolean;
}
export interface MessageMutationOptions extends TavernRecord {
  refresh?: 'none' | 'affected' | 'all'; insert_before?: TavernId | 'end'; insert_at?: TavernId | 'end';
}
export interface MessageFormatOptions extends TavernRecord { message_id?: TavernId; }
/** A structural view of the real JQuery collection returned by the renderer. */
export interface TavernJQuery<T extends Element = HTMLElement> {
  readonly length: number; readonly jquery: string; [index: number]: T;
  get(): T[]; get(index: number): T | undefined; toArray(): T[];
  find(selector: string): TavernJQuery; first(): TavernJQuery<T>; last(): TavernJQuery<T>;
  eq(index: number): TavernJQuery<T>; closest(selector: string): TavernJQuery;
  parent(selector?: string): TavernJQuery; children(selector?: string): TavernJQuery;
  html(): string | undefined; html(value: string): this;
  text(): string; text(value: string): this;
  attr(name: string): string | undefined; attr(name: string, value: string | number | null): this;
  prop(name: string): unknown; prop(name: string, value: unknown): this;
  data(key: string): unknown; data(key: string, value: unknown): this;
  css(name: string): string | undefined; css(name: string, value: string | number): this; css(values: Record<string, string | number>): this;
  addClass(value: string): this; removeClass(value?: string): this; toggleClass(value: string, state?: boolean): this;
  on(events: string, listener: (event: Event) => unknown): this;
  on(events: string, selector: string, listener: (event: Event) => unknown): this;
  off(events?: string, listener?: (event: Event) => unknown): this;
  append(content: string | Element | TavernJQuery): this; remove(): this; empty(): this;
  each(callback: (index: number, element: T) => unknown): this;
  [key: string]: unknown;
}
export interface TavernMessageFunctions {
  getChatMessages(range?: TavernId, filter?: ChatMessageFilter): ChatMessage[];
  setChatMessages(updates: ChatMessageUpdate[], options?: MessageMutationOptions): Promise<void>;
  createChatMessages(messages: ChatMessageCreate[], options?: MessageMutationOptions): Promise<void>;
  deleteChatMessages(messageIds: TavernId[], options?: MessageMutationOptions): Promise<void>;
  rotateChatMessages(begin: TavernId, middle: TavernId, end: TavernId, options?: MessageMutationOptions): Promise<void>;
  retrieveDisplayedMessage(messageId: TavernId): TavernJQuery;
  formatAsDisplayedMessage(text: string, options?: MessageFormatOptions): string;
  refreshOneMessage(messageId: TavernId, options?: MessageFormatOptions): Promise<void>;
}
export interface VariableOptions extends TavernRecord {
  type?: 'chat' | 'global' | 'preset' | 'character' | 'script' | 'message';
  script_id?: string; message_id?: TavernId;
}
export interface TavernVariableFunctions {
  getVariables(options?: VariableOptions): TavernRecord;
  replaceVariables(variables: TavernRecord, options?: VariableOptions): void;
  updateVariablesWith(updater: SyncTavernUpdater<TavernRecord>, options?: VariableOptions): TavernRecord;
  updateVariablesWith(updater: AsyncTavernUpdater<TavernRecord>, options?: VariableOptions): Promise<TavernRecord>;
  updateVariablesWith(updater: TavernUpdater<TavernRecord>, options?: VariableOptions): TavernRecord | Promise<TavernRecord>;
  insertOrAssignVariables(variables: TavernRecord, options?: VariableOptions): TavernRecord;
  insertVariables(variables: TavernRecord, options?: VariableOptions): TavernRecord;
  deleteVariable(path: string | (string | number)[], options?: VariableOptions): { variables: TavernRecord; delete_occurred: boolean };
  registerVariableSchema(schema: object, options?: VariableOptions): () => void;
  getAllVariables(options?: VariableOptions): TavernRecord;
}
export interface CharacterData extends TavernRecord {
  name?: string; description?: string; personality?: string; scenario?: string;
  first_mes?: string; mes_example?: string; system_prompt?: string; post_history_instructions?: string;
  creator_notes?: string; character_version?: string; alternate_greetings?: string[];
  tags?: string[]; extensions?: TavernRecord; character_book?: TavernRecord | null;
}
export interface Character extends CharacterData {
  id?: string; avatar?: string; avatar_id?: string; avatar_path?: string;
  spec?: string; spec_version?: string; data?: CharacterData;
}
export interface CharacterInput extends CharacterData {
  id?: string; avatar?: string | Blob; avatar_id?: string; avatar_path?: string;
  spec?: string; spec_version?: string; data?: CharacterData;
}
export interface Persona extends TavernRecord {
  id?: string; name: string; description?: string; avatar?: string; avatar_id?: string; avatar_path?: string;
}
export interface PersonaInput extends TavernRecord { id?: string; name?: string; description?: string; avatar?: string | Blob; avatar_id?: string; avatar_path?: string; }
export interface ChatHistoryBrief extends TavernRecord {
  file_name?: string; chat_id?: string; chat_items?: number; mes?: string; last_mes?: string;
}
export type ChatTranscript = Array<TavernRecord>;
export interface RawRegexScript extends TavernRecord {
  id?: string; scriptName: string; findRegex: string; replaceString: string;
  placement?: number[]; disabled?: boolean; markdownOnly?: boolean; promptOnly?: boolean;
  runOnEdit?: boolean; substituteRegex?: number; minDepth?: number | null; maxDepth?: number | null;
}
export interface RawCharacter {
  readonly data: CharacterData;
  getCardData(): Character; getAvatarId(): string; getRegexScripts(): RawRegexScript[];
  getCharacterBook(): TavernRecord | null; getWorldName(): string;
  getAvatarPath(): string; getData(): CharacterData; save(): Promise<void>;
}
export interface RawCharacterConstructor {
  new(data: Character): RawCharacter;
  get(name?: CatalogIdentity): Promise<RawCharacter>;
  find(options?: { name?: CatalogIdentity }): Character | null;
  findIndex(name?: CatalogIdentity): number;
  getChatsFromFiles(data: unknown, isGroupChat?: boolean): Promise<Record<string, ChatTranscript>>;
}
export interface TavernCharacterFunctions {
  getCharacterNames(): string[]; getCharacterIds(): string[];
  getCurrentCharacterName(): string | null; getCurrentCharacterId(): string | null;
  createCharacter(name: CatalogIdentity, data: CharacterInput, options?: TavernOptions): Promise<boolean>;
  createOrReplaceCharacter(name: CatalogIdentity, data: CharacterInput, options?: TavernOptions): Promise<boolean>;
  deleteCharacter(name: CatalogIdentity, options?: TavernOptions): Promise<boolean>;
  getCharacter(name?: CatalogIdentity): Promise<Character>;
  replaceCharacter(name: CatalogIdentity, data: CharacterInput, options?: TavernOptions): Promise<void>;
  updateCharacterWith(name: CatalogIdentity, updater: TavernUpdater<Character>, options?: TavernOptions): Promise<Character>;
  RawCharacter: RawCharacterConstructor;
  getCharData(name?: CatalogIdentity): Character | null;
  getCharAvatarPath(name?: CatalogIdentity): string | null;
  getChatHistoryBrief(name?: CatalogIdentity, allowAvatar?: boolean): Promise<ChatHistoryBrief[] | null>;
  getChatHistoryDetail(data: unknown, isGroupChat?: boolean): Promise<Record<string, ChatTranscript>>;
}
export interface TavernPersonaFunctions {
  getPersonaNames(): string[]; getPersonaIds(): string[];
  getCurrentPersonaName(): string | null; getCurrentPersonaId(): string | null;
  getPersonaAvatarPath(name?: CatalogIdentity): string | null; getPersona(name?: CatalogIdentity): Persona;
  createPersona(name: CatalogIdentity, data: PersonaInput, options?: TavernOptions): Promise<boolean>;
  createOrReplacePersona(name: CatalogIdentity, data: PersonaInput, options?: TavernOptions): Promise<boolean>;
  deletePersona(name: CatalogIdentity, options?: TavernOptions): Promise<boolean>;
  replacePersona(name: CatalogIdentity, data: PersonaInput, options?: TavernOptions): Promise<void>;
  updatePersonaWith(name: CatalogIdentity, updater: TavernUpdater<Persona>, options?: TavernOptions): Promise<Persona>;
}
export interface PromptPosition extends TavernRecord { type?: string; role?: TavernRole; depth?: number; order?: number; }
export interface PresetPrompt extends TavernRecord {
  id?: string; identifier?: string; name?: string; content?: string; role?: TavernRole;
  enabled?: boolean; system_prompt?: boolean; marker?: boolean; position?: PromptPosition;
}
export interface PresetSettings extends TavernRecord {
  temperature?: number; top_p?: number; top_k?: number; min_p?: number;
  max_context?: number; max_completion_tokens?: number; frequency_penalty?: number; presence_penalty?: number;
}
export interface Preset extends TavernRecord {
  id?: string; name?: string; settings: PresetSettings; prompts: PresetPrompt[]; prompts_unused: PresetPrompt[];
}
export interface TavernPresetFunctions {
  isPresetNormalPrompt(prompt: PresetPrompt): boolean; isPresetSystemPrompt(prompt: PresetPrompt): boolean;
  isPresetPlaceholderPrompt(prompt: PresetPrompt): boolean;
  getPresetNames(): string[]; getLoadedPresetName(): string; loadPreset(name: string): boolean;
  getPreset(name?: CatalogIdentity): Preset; default_preset: Preset;
  createPreset(name: CatalogIdentity, data?: Preset, options?: TavernOptions): Promise<boolean>;
  createOrReplacePreset(name: CatalogIdentity, data?: Preset, options?: TavernOptions): Promise<boolean>;
  deletePreset(name: CatalogIdentity, options?: TavernOptions): Promise<boolean>;
  renamePreset(name: CatalogIdentity, newName: string): Promise<boolean>;
  replacePreset(name: CatalogIdentity, data: Preset, options?: TavernOptions): Promise<void>;
  updatePresetWith(name: CatalogIdentity, updater: TavernUpdater<Preset>, options?: TavernOptions): Promise<Preset>;
  setPreset(name: string, data: Partial<Preset>, options?: TavernOptions): Promise<Preset>;
  setPreset(data: Partial<Preset>, options?: TavernOptions): Promise<Preset>;
}
export interface WorldbookEntry extends TavernRecord {
  uid: TavernId; name?: string; content?: string; enabled?: boolean;
  strategy?: { type?: string; keys?: (string | RegExp)[]; keys_secondary?: { logic?: string; keys?: (string | RegExp)[]; [key: string]: unknown }; scan_depth?: number | 'same_as_global'; [key: string]: unknown };
  position?: PromptPosition; probability?: number; case_sensitive?: boolean | 'same_as_global'; match_whole_words?: boolean | 'same_as_global';
  use_group_scoring?: boolean | 'same_as_global';
  recursion?: { prevent_incoming?: boolean; prevent_outgoing?: boolean; delay_until?: number | null; [key: string]: unknown };
  effect?: { sticky?: number | null; cooldown?: number | null; delay?: number | null; [key: string]: unknown };
  group?: string; group_prioritized?: boolean; group_weight?: number;
}
export type WorldbookEntryInput = Partial<WorldbookEntry>;
export interface CharacterWorldbooks { primary: string | null; additional: string[]; }
export interface LorebookEntry extends TavernRecord {
  uid: TavernId; comment?: string; content?: string; enabled?: boolean; type?: string;
  position?: string; depth?: number; order?: number; keys?: (string | RegExp)[]; filters?: (string | RegExp)[];
  logic?: string; scan_depth?: number | 'same_as_global'; probability?: number;
  sticky?: number | null; cooldown?: number | null; delay?: number | null;
}
export interface TavernWorldbookFunctions {
  getWorldbookNames(): string[]; getGlobalWorldbookNames(): string[];
  rebindGlobalWorldbooks(names: string[]): Promise<void>;
  getCharWorldbookNames(name?: CatalogIdentity): CharacterWorldbooks;
  rebindCharWorldbooks(name: CatalogIdentity, worldbooks: CharacterWorldbooks): Promise<void>;
  getChatWorldbookName(chat?: CatalogIdentity): string | null;
  rebindChatWorldbook(chat: CatalogIdentity, worldbook: string | null): Promise<void>;
  getOrCreateChatWorldbook(chat?: CatalogIdentity, name?: string): Promise<string>;
  getWorldbook(name: CatalogIdentity): Promise<WorldbookEntry[]>;
  createWorldbook(name: CatalogIdentity, entries?: WorldbookEntryInput[], options?: TavernOptions): Promise<boolean>;
  createOrReplaceWorldbook(name: CatalogIdentity, entries?: WorldbookEntryInput[], options?: TavernOptions): Promise<boolean>;
  deleteWorldbook(name: CatalogIdentity, options?: TavernOptions): Promise<boolean>;
  replaceWorldbook(name: CatalogIdentity, entries: WorldbookEntryInput[], options?: TavernOptions): Promise<void>;
  updateWorldbookWith(name: CatalogIdentity, updater: TavernUpdater<WorldbookEntry[]>, options?: TavernOptions): Promise<WorldbookEntry[]>;
  createWorldbookEntries(name: CatalogIdentity, entries: WorldbookEntryInput[], options?: TavernOptions): Promise<{ worldbook: WorldbookEntry[]; new_entries: WorldbookEntry[] }>;
  deleteWorldbookEntries(name: CatalogIdentity, selector: TavernId[] | ((entry: WorldbookEntry) => boolean), options?: TavernOptions): Promise<{ worldbook: WorldbookEntry[]; deleted_entries: WorldbookEntry[] }>;
  getLorebookSettings(): TavernRecord; setLorebookSettings(settings: TavernRecord): void;
  getLorebooks(): string[];
  getCharLorebooks(options?: string | { name?: CatalogIdentity; type?: 'primary' | 'additional' | 'all'; [key: string]: unknown }): CharacterWorldbooks;
  getCurrentCharPrimaryLorebook(): string | null; setCurrentCharLorebooks(worldbooks: Partial<CharacterWorldbooks>): Promise<void>;
  getChatLorebook(chat?: CatalogIdentity): string | null; setChatLorebook(name: string | null, chat?: CatalogIdentity): Promise<void>;
  getLorebookEntries(name: CatalogIdentity): Promise<LorebookEntry[]>;
  replaceLorebookEntries(name: CatalogIdentity, entries: Partial<LorebookEntry>[], options?: TavernOptions): Promise<void>;
  updateLorebookEntriesWith(name: CatalogIdentity, updater: TavernUpdater<LorebookEntry[]>, options?: TavernOptions): Promise<LorebookEntry[]>;
  setLorebookEntries(name: CatalogIdentity, entries: Partial<LorebookEntry>[], options?: TavernOptions): Promise<LorebookEntry[]>;
  createLorebook(name: CatalogIdentity, entries?: WorldbookEntryInput[], options?: TavernOptions): Promise<boolean>;
  deleteLorebook(name: CatalogIdentity, options?: TavernOptions): Promise<boolean>;
  getOrCreateChatLorebook(name?: string): Promise<string>;
  createLorebookEntries(name: CatalogIdentity, entries: Partial<LorebookEntry>[], options?: TavernOptions): Promise<{ entries: LorebookEntry[]; new_uids: TavernId[] }>;
  deleteLorebookEntries(name: CatalogIdentity, uids: TavernId[], options?: TavernOptions): Promise<{ entries: LorebookEntry[]; delete_occurred: boolean }>;
}
export interface TavernRegex extends TavernRecord {
  id?: string; name?: string; enabled?: boolean; scope?: string; find_regex?: string; replace_string?: string;
  source?: string; destination?: string; min_depth?: number | null; max_depth?: number | null;
}
export interface RegexOptions extends TavernRecord { scope?: 'all' | 'global' | 'preset' | 'character'; enable_state?: 'all' | 'enabled' | 'disabled'; }
export interface TavernRegexFunctions {
  isCharacterTavernRegexesEnabled(): boolean; getTavernRegexes(options?: RegexOptions): TavernRegex[];
  replaceTavernRegexes(regexes: TavernRegex[], options?: RegexOptions): Promise<void>;
  updateTavernRegexesWith(updater: TavernUpdater<TavernRegex[]>, options?: RegexOptions): Promise<TavernRegex[]>;
  formatAsTavernRegexedString(text: string, source: string, destination: string, options?: { depth?: number; [key: string]: unknown }): string;
}
export type RawImportData = string | Blob | TavernRecord | TavernRecord[];
export interface RawImporter<T> {
  (data: RawImportData, options?: TavernOptions): Promise<T>;
  (filename: string, content: string | Blob): Promise<T>;
}
export interface TavernImportFunctions {
  importRawCharacter: RawImporter<Response>; importRawChat: RawImporter<Response>;
  importRawWorldbook: RawImporter<Response>; importRawPreset: RawImporter<boolean>;
  importRawTavernRegex(content: string): boolean; importRawTavernRegex(filename: string, content: string): boolean;
}
export type TavernEventListener<A extends unknown[] = unknown[]> = (...args: A) => unknown;
export interface EventRegistration { stop(): void; }
export interface EventWaitOptions<A extends unknown[] = unknown[]> { timeout?: number; signal?: AbortSignal; predicate?: (...args: A) => boolean; }
export interface STWorldInfoEntry extends TavernRecord {
  world: string; uid: TavernId; eleckoiRuntimeId?: string; hash?: number; content?: string;
  key: (string | RegExp)[]; keysecondary: (string | RegExp)[]; comment: string;
  disable: boolean; constant: boolean; vectorized: boolean; selective: boolean; selectiveLogic: number;
  position: number; depth: number; role: number; order: number; scanDepth: number | null;
  excludeRecursion: boolean; preventRecursion: boolean; delayUntilRecursion: boolean | number;
  sticky: number | null; cooldown: number | null; delay: number | null;
  caseSensitive: boolean | null; matchWholeWords: boolean | null; useGroupScoring: boolean | null;
  groupOverride: boolean; groupWeight: number; useProbability: boolean; automationId: string;
}
export type WorldInfoTimedEffect = 'sticky' | 'cooldown' | 'delay';
export interface WorldInfoTimedEffects {
  checkTimedEffects(): void;
  getEffectMetadata(type: string, entry: STWorldInfoEntry): { hash?: number; start: number; end: number; protected: boolean } | null | undefined;
  setTimedEffect(type: string, entry: STWorldInfoEntry, value: boolean): void;
  setTimedEffects(activated: Iterable<STWorldInfoEntry>): void;
  isValidEffectType(type: unknown): boolean; isEffectActive(type: string, entry: STWorldInfoEntry): boolean; cleanUp(): void;
}
export interface WorldInfoEntriesLoaded {
  globalLore: STWorldInfoEntry[]; characterLore: STWorldInfoEntry[]; chatLore: STWorldInfoEntry[]; personaLore: STWorldInfoEntry[];
}
/** Mutable values are consumed by this same native scan after ordered listeners finish. */
export interface WorldInfoScanDone {
  state: { current: 0 | 1 | 2 | 3; next: 0 | 1 | 2 | 3; loopCount: number };
  new: { all: STWorldInfoEntry[]; successful: STWorldInfoEntry[] };
  activated: { entries: Map<string, STWorldInfoEntry>; text: string };
  sortedEntries: STWorldInfoEntry[]; recursionDelay: { availableLevels: number[]; currentLevel: number };
  budget: { current: number | null; overflowed: boolean }; timedEffects: WorldInfoTimedEffects;
}
export interface TavernEventMap {
  worldinfo_entries_loaded: [payload: WorldInfoEntriesLoaded]; worldinfo_scan_done: [payload: WorldInfoScanDone];
  world_info_activated: [entries: STWorldInfoEntry[]]; worldinfo_force_activate: [entries: (TavernRecord & { world: string; uid: TavernId })[]];
  js_generation_requested: [configuration: GenerationConfig, generationId: string];
  js_generation_started: [generationId: string]; js_generation_ended: [text: string, generationId: string];
  js_stream_token_received_fully: [text: string, generationId: string]; js_stream_token_received_incrementally: [delta: string, generationId: string];
  js_reasoning_token_received_fully: [reasoning: string, generationId: string]; js_reasoning_token_received_incrementally: [delta: string, generationId: string];
}
export interface TavernEventFunctions {
  eventOn<K extends keyof TavernEventMap>(event: K, listener: TavernEventListener<TavernEventMap[K]>): EventRegistration;
  eventOn<A extends unknown[]>(event: string, listener: TavernEventListener<A>): EventRegistration;
  eventOnce<K extends keyof TavernEventMap>(event: K, listener: TavernEventListener<TavernEventMap[K]>): EventRegistration;
  eventOnce<A extends unknown[]>(event: string, listener: TavernEventListener<A>): EventRegistration;
  eventMakeFirst<K extends keyof TavernEventMap>(event: K, listener: TavernEventListener<TavernEventMap[K]>): EventRegistration;
  eventMakeFirst<A extends unknown[]>(event: string, listener: TavernEventListener<A>): EventRegistration;
  eventMakeLast<K extends keyof TavernEventMap>(event: K, listener: TavernEventListener<TavernEventMap[K]>): EventRegistration;
  eventMakeLast<A extends unknown[]>(event: string, listener: TavernEventListener<A>): EventRegistration;
  eventOnButton<A extends unknown[]>(event: string, listener: TavernEventListener<A>): void;
  eventEmit(event: string, ...args: unknown[]): Promise<void>; eventEmitAndWait(event: string, ...args: unknown[]): void;
  eventRemoveListener<A extends unknown[]>(event: string, listener: TavernEventListener<A>): void;
  eventClearEvent(event: string): void; eventClearListener<A extends unknown[]>(listener: TavernEventListener<A>): void; eventClearAll(): void;
  eventWaitOnce<K extends keyof TavernEventMap>(event: K, options?: EventWaitOptions<TavernEventMap[K]> | number): Promise<TavernEventMap[K]>;
  eventWaitOnce<A extends unknown[] = unknown[]>(event: string, options?: EventWaitOptions<A> | number): Promise<A>;
}
export interface TavernIframeEvents {
  readonly MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started'; readonly MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended';
  readonly GENERATION_REQUESTED: 'js_generation_requested'; readonly GENERATION_STARTED: 'js_generation_started'; readonly GENERATION_ENDED: 'js_generation_ended';
  readonly STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully'; readonly STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally';
  readonly REASONING_TOKEN_RECEIVED_FULLY: 'js_reasoning_token_received_fully'; readonly REASONING_TOKEN_RECEIVED_INCREMENTALLY: 'js_reasoning_token_received_incrementally';
}
export interface ScriptButton extends TavernRecord { id?: string; name: string; visible?: boolean; }
export interface ScriptEntry extends TavernRecord {
  type: 'script'; id: string; name: string; enabled?: boolean; content?: string; info?: string; data?: TavernRecord;
  button?: { enabled?: boolean; buttons?: ScriptButton[]; [key: string]: unknown };
  export_with?: { data?: boolean; button?: boolean; [key: string]: unknown };
}
export interface ScriptFolder extends TavernRecord { type: 'folder'; id: string; name: string; enabled?: boolean; icon?: string; color?: string; scripts: ScriptTree[]; }
export type ScriptTree = ScriptEntry | ScriptFolder;
export type ScriptTreeOptions = 'global' | 'character' | 'preset' | { scope?: 'global' | 'character' | 'preset'; type?: 'global' | 'character' | 'preset'; ownerId?: string; character_id?: string; preset_id?: string; [key: string]: unknown };
export interface TavernRuntimeFunctions {
  initializeGlobal<T>(name: string, value: T): void; waitGlobalInitialized<T = unknown>(name: string, options?: { signal?: AbortSignal }): Promise<T>;
  getScriptId(): string; getScriptName(): string; getScriptTrees(options?: ScriptTreeOptions): ScriptTree[];
  replaceScriptTrees(trees: ScriptTree[], options?: ScriptTreeOptions): void;
  updateScriptTreesWith(updater: SyncTavernUpdater<ScriptTree[]>, options?: ScriptTreeOptions): ScriptTree[];
  updateScriptTreesWith(updater: AsyncTavernUpdater<ScriptTree[]>, options?: ScriptTreeOptions): Promise<ScriptTree[]>;
  updateScriptTreesWith(updater: TavernUpdater<ScriptTree[]>, options?: ScriptTreeOptions): ScriptTree[] | Promise<ScriptTree[]>;
  getScriptInfo(id?: string): string; replaceScriptInfo(value: string, id?: string): void;
  updateScriptInfoWith(updater: SyncTavernUpdater<string>, id?: string): string;
  updateScriptInfoWith(updater: AsyncTavernUpdater<string>, id?: string): Promise<string>;
  updateScriptInfoWith(updater: TavernUpdater<string>, id?: string): string | Promise<string>;
  getScriptButtons(id?: string): ScriptButton[]; replaceScriptButtons(buttons: ScriptButton[], id?: string): void;
  updateScriptButtonsWith(updater: SyncTavernUpdater<ScriptButton[]>, id?: string): ScriptButton[];
  updateScriptButtonsWith(updater: AsyncTavernUpdater<ScriptButton[]>, id?: string): Promise<ScriptButton[]>;
  updateScriptButtonsWith(updater: TavernUpdater<ScriptButton[]>, id?: string): ScriptButton[] | Promise<ScriptButton[]>;
  appendInexistentScriptButtons(buttons: ScriptButton[], id?: string): void;
  getScriptButtonEvent(name: string): string; getButtonEvent(name: string): string;
  getAllEnabledScriptButtons(): Record<string, { button_id: string; button_name: string }[]>;
  getScriptData(id?: string): TavernRecord; replaceScriptData(data: TavernRecord, id?: string): void;
  getExtensionNames(): string[]; isExtensionInstalled(name: string): boolean; isExtensionEnabled(name: string): boolean;
  enableExtension(name: string): Promise<unknown>; disableExtension(name: string): Promise<unknown>;
  getTavernVersion(): string; getSillyTavernVersion(): string; getTavernHelperVersion(): string; getTavernHelperExtensionId(): string;
}
export interface ExtensionInstallation extends TavernRecord { name: string; version: string | null; remote_url: string | null; commit_hash: string | null; branch: string | null; }
export interface TavernExtensionFunctions {
  isAdmin(): boolean; isInstalledExtension(id: string): boolean; getExtensionType(id: string): string | null;
  getExtensionInstallationInfo(id: string): Promise<ExtensionInstallation | null>;
  installExtension(url: string, type?: string): Promise<Response>; uninstallExtension(name: string): Promise<Response>;
  reinstallExtension(name: string): Promise<Response>; updateExtension(name: string): Promise<Response>;
  getProxyPresetNames(): string[]; getModelList(customApi?: CustomGenerationApi): Promise<string[]>;
}
export type AudioChannel = 'bgm' | 'amb' | 'ambient' | 'voice' | 'sfx';
export type AudioMode = 'repeat_one' | 'repeat_all' | 'shuffle' | 'play_one_and_stop';
export interface AudioTrack extends TavernRecord { url: string; title?: string; id?: string; name?: string; mimeType?: string; }
export interface AudioSettings { enabled: boolean; mode: AudioMode; muted: boolean; volume: number; }
export interface NativeAudioState extends TavernRecord {
  channel: Exclude<AudioChannel, 'amb'>; enabled: boolean; mode: AudioMode; muted: boolean; volume: number;
  playlist: AudioTrack[]; currentIndex: number; currentTrack: AudioTrack | null;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'; currentTime: number; duration: number; error?: string;
}
export interface TavernAudioFunctions {
  getAudioList(type?: AudioChannel): AudioTrack[]; getAudioSettings(type?: AudioChannel): AudioSettings;
  setAudioSettings(type: AudioChannel, settings: Partial<AudioSettings>): void;
  replaceAudioList(type: AudioChannel, tracks: AudioTrack[]): void; appendAudioList(type: AudioChannel, tracks: AudioTrack[]): void;
  playAudio(type: AudioChannel, audio: AudioTrack): void; pauseAudio(type?: AudioChannel): void;
  getCurrentAudio(type?: AudioChannel): { src: string; title: string; playing: boolean; progress: number };
  resumeAudio(type?: AudioChannel): Promise<NativeAudioState>; stopAudio(type?: AudioChannel): Promise<NativeAudioState>;
  seekAudio(type: AudioChannel, seconds: number): Promise<NativeAudioState>; getAudioState(type?: AudioChannel): Promise<NativeAudioState>;
}
export interface GenerationPrompt extends TavernRecord {
  id?: string; role?: TavernRole; content?: string | TavernRecord[]; message?: string; image?: Blob | string | (Blob | string)[];
}
export interface PromptInjection extends GenerationPrompt {
  position?: string; depth?: number; order?: number; should_scan?: boolean;
  filter?: () => unknown | Promise<unknown>;
}
export interface CustomGenerationApi extends TavernRecord { apiurl?: string; key?: string; model?: string; proxy_preset?: string; source?: string; }
export interface GenerationConfig extends PresetSettings {
  generation_id?: string; should_stream?: boolean; should_silence?: boolean; should_return_reasoning?: boolean;
  preset_name?: string; user_input?: string; prompt?: string; messages?: GenerationPrompt[];
  ordered_prompts?: (GenerationPrompt | string)[]; prompts?: GenerationPrompt[];
  image?: Blob | string | (Blob | string)[]; max_chat_history?: number; maxChatHistory?: number;
  overrides?: TavernRecord & { chat_history?: GenerationPrompt[] | { prompts?: GenerationPrompt[]; with_depth_entries?: boolean; author_note?: string; [key: string]: unknown } };
  injects?: PromptInjection[]; custom_api?: CustomGenerationApi; tools?: FunctionToolSchema[]; json_schema?: TavernRecord;
}
export interface FunctionToolSchema extends TavernRecord { type: 'function'; function: { name: string; description?: string; parameters?: TavernRecord; [key: string]: unknown }; }
export interface GenerationToolCall extends TavernRecord { id: string; type: 'function'; function: { name: string; arguments: string }; thought_signature?: string; }
export interface GenerationResult { content: string; reasoning?: string; reasoning_signature?: string; tool_calls?: GenerationToolCall[]; }
export interface GenerationDetails extends TavernRecord {
  generationId: string; generation_id?: string; provider?: string; model?: string; status: string; startedAt: number;
  finishedAt?: number; text?: string; reasoning?: string;
  toolCalls?: { id: string; name: string; arguments: string; thoughtSignature?: string }[];
}
export interface TavernGenerationFunctions {
  generate(config: GenerationConfig & { should_return_reasoning: true }): Promise<GenerationResult>;
  generate(config?: GenerationConfig): Promise<string | GenerationResult>;
  generateRaw(config: GenerationConfig & { should_return_reasoning: true }): Promise<GenerationResult>;
  generateRaw(config?: GenerationConfig): Promise<string | GenerationResult>;
  stopGeneration(id?: string): Promise<boolean>; stopGenerationById(id: string): boolean; stopAllGeneration(): boolean;
  injectPrompts(prompts: PromptInjection[], options?: { once?: boolean | string }): { uninject(): void };
  uninjectPrompts(ids: string | string[]): void; getGenerationDetails(id: string): Promise<GenerationDetails>;
}
export interface MacroOverrides extends TavernRecord { name1Override?: string; name2Override?: string; }
export interface MacroOptions extends TavernRecord { aliases?: string[]; description?: string; }
export interface SlashResult extends TavernRecord { pipe: string; isAborted?: boolean; isError?: boolean; errorMessage?: string; }
export interface SlashOptions extends TavernRecord { signal?: AbortSignal; abortController?: object; scope?: object; }
export interface TavernIframeFunctions {
  reloadIframe(): void; getMessageId(iframeName: string): number;
  errorCatched<F extends (...args: never[]) => unknown>(callback: F): F;
  registerMacroLike<A extends unknown[]>(regex: RegExp, replacement: (context: TavernRecord, ...args: A) => string): { unregister(): void };
  unregisterMacroLike(regex: RegExp): void;
  getLastMessageId(): number; getCurrentMessageId(): number; getIframeName(): string;
  getIframeWindow(): Window; getScriptWindow(): Window; getTavernHelper(): TavernHelper;
  setInput(text: string): Promise<unknown>; getInput(): Promise<{ text: string; [key: string]: unknown }>; setInputText(text: string): Promise<unknown>;
  substitudeMacros(text: string, overrides?: MacroOverrides): string; substituteMacros(text: string, overrides?: MacroOverrides): string;
  triggerSlash(text: string): Promise<string>; triggerSlashWithOptions(text: string, options?: SlashOptions): Promise<SlashResult>;
  registerMacro<A extends unknown[]>(name: string, callback: (...args: A) => unknown, options?: MacroOptions): unknown;
  unregisterMacro(name: string): unknown;
}
export interface TavernHelper extends TavernMessageFunctions, TavernVariableFunctions, TavernCharacterFunctions,
  TavernPersonaFunctions, TavernPresetFunctions, TavernWorldbookFunctions, TavernRegexFunctions, TavernImportFunctions,
  TavernEventFunctions, TavernRuntimeFunctions, TavernExtensionFunctions, TavernAudioFunctions, TavernGenerationFunctions, TavernIframeFunctions { }

export interface NativeNetwork {
  fetch(input: RequestInfo | URL, init?: RequestInit & { timeout?: number }): Promise<Response>;
}
export interface TtsSettings extends TavernRecord {
  provider?: string; configId?: string; model?: string; voice?: string; speed?: number;
  responseFormat?: string; instructions?: string; rate?: number; pitch?: number; volume?: number; lang?: string;
}
export interface SpeechVoice extends TavernRecord { name: string; voiceURI: string; lang: string; default: boolean; localService: boolean; provider?: string; }
export interface NativeSpeechProvider {
  speak(text: string, settings: TavernRecord, signal: AbortSignal): unknown | Promise<unknown>;
  voices?(): unknown | Promise<unknown>; stop?(): unknown | Promise<unknown>;
}
export interface NativeTts {
  speak(text: string, settings?: TtsSettings): Promise<boolean>; stop(): Promise<boolean>;
  /** Built-in providers return SpeechVoice[]; custom providers preserve their voices result. */
  voices<T = SpeechVoice[]>(settings?: TtsSettings): Promise<T>;
  settings(): Promise<TtsSettings>; configure(settings: TtsSettings): Promise<TtsSettings>;
  synthesize(text: string, settings?: TtsSettings): Promise<{ requestId: string; provider: 'openai'; model: string; voice: string; mediaType: string; url: string }>;
  providers(): string[]; registerProvider(name: string, provider: NativeSpeechProvider): () => boolean;
}
export type MediaKind = 'image' | 'video';
export interface MediaInput extends TavernRecord {
  signal?: AbortSignal; generationId?: string; requestId?: string; source?: string; provider?: string;
  conversationId?: string; characterId?: string; prompt?: string; negative?: string; width?: number; height?: number;
  steps?: number; cfg?: number; seed?: number; configId?: string; model?: string;
  workflow?: string | Record<string, { class_type: string; inputs: TavernRecord; [key: string]: unknown }>;
}
export interface NativeMediaSettings extends TavernRecord {
  source?: string; configId?: string; model?: string; width?: number; height?: number; steps?: number; cfg?: number;
}
export interface MediaImage extends TavernRecord {
  id: string; url: string; reference?: string; source?: string; generationId?: string;
  conversationId?: string; characterId?: string; width?: number; height?: number; prompt?: string; createdAt?: number;
}
export interface MediaVideo extends TavernRecord { url: string; reference?: string; mediaType?: string; kind: 'video'; source: string; generationId: string; conversationId?: string; characterId?: string; createdAt?: number; }
export interface MediaProvider {
  kinds: MediaKind[];
  generate(input: MediaInput & { kind: MediaKind; generationId: string }, context: { signal: AbortSignal; network: NativeNetwork; conversationId: string }): string | (TavernRecord & { url?: string; data?: string; bytes?: Uint8Array | ArrayBuffer; base64?: string; mediaType?: string; mimeType?: string }) | Promise<string | (TavernRecord & { url?: string; data?: string; bytes?: Uint8Array | ArrayBuffer; base64?: string; mediaType?: string; mimeType?: string })>;
  cancel?(generationId: string): unknown | Promise<unknown>;
}
export interface CharacterExpression extends TavernRecord { name?: string; url: string; reference?: string; characterId?: string; }
export interface NativeMedia {
  providers(): { name: string; kinds: MediaKind[]; builtin: boolean }[];
  registerProvider(name: string, provider: MediaProvider): () => boolean;
  imageSettings(input?: MediaInput): Promise<NativeMediaSettings>;
  providerSettings(input?: { name?: string; settings?: TavernRecord }): Promise<{ name: string; settings: TavernRecord; [key: string]: unknown }>;
  generate(input?: MediaInput): Promise<MediaImage>; video(input?: MediaInput): Promise<MediaVideo>;
  cancel(input?: { generationId?: string; requestId?: string; id?: string; conversationId?: string }): Promise<{ cancelled: number; generationId?: string }>;
  gallery(scope?: TavernRecord): Promise<Array<MediaImage | MediaVideo>>; read(reference: string): Promise<string>;
  expressions(params?: TavernRecord): Promise<CharacterExpression[]>; uploadExpression(params: TavernRecord): Promise<CharacterExpression>;
}
export interface YouTubeCaptionTrack { languageCode: string; name: string; automatic: boolean; translatable: boolean; url: string; }
export interface YouTubeMetadata {
  id: string; url: string; title: string; author: string; channelId: string; description: string;
  duration: number; viewCount: number; isLive: boolean; thumbnails: { url: string; width?: number; height?: number }[];
  publishedAt: string; captionTracks: YouTubeCaptionTrack[];
}
export interface YouTubeOptions extends TavernRecord { language?: string; lang?: string; signal?: AbortSignal; }
export interface NativeYouTube {
  videoId(value: string): string; metadata(value: string, settings?: YouTubeOptions): Promise<YouTubeMetadata>;
  captionTracks(value: string, settings?: YouTubeOptions): Promise<YouTubeCaptionTrack[]>;
  transcript(value: string, settings?: YouTubeOptions): Promise<{ videoId: string; languageCode: string; automatic: boolean; segments: { start: number; duration: number; text: string }[]; text: string }>;
}
export interface SillyTavernMessage extends TavernRecord {
  native_id?: string; mes: string; name: string; is_user: boolean; is_system?: boolean; role?: TavernRole;
  swipes?: string[]; swipe_id?: number; swipe_info?: TavernRecord[]; extra?: TavernRecord; reasoning?: string;
}
export interface SillyTavernCharacter extends Character { native_id: string; avatar: string; name: string; data: CharacterData; }
export interface SillyTavernGroup extends TavernRecord { id: string; name: string; members: string[]; disabled_members?: string[]; }
export interface TavernEventSource {
  on<K extends keyof TavernEventMap>(event: K, listener: TavernEventListener<TavernEventMap[K]>): () => void;
  on<A extends unknown[]>(event: string, listener: TavernEventListener<A>): () => void;
  once<K extends keyof TavernEventMap>(event: K, listener: TavernEventListener<TavernEventMap[K]>): () => void;
  once<A extends unknown[]>(event: string, listener: TavernEventListener<A>): () => void;
  removeListener<A extends unknown[]>(event: string, listener: TavernEventListener<A>): void;
  emit(event: string, ...args: unknown[]): unknown[];
  emitAndWait(event: string, ...args: unknown[]): Promise<unknown[]>;
  makeFirst<A extends unknown[]>(event: string, listener: TavernEventListener<A>): void;
  makeLast<A extends unknown[]>(event: string, listener: TavernEventListener<A>): void;
  [key: string]: unknown;
}
export interface NativeTokenizerService {
  info(): { encoding?: string; available: readonly string[]; [key: string]: unknown };
  select(encoding: string): Promise<unknown>;
  registerVocabulary(name: string, file: Blob | ArrayBuffer | Uint8Array, options?: { kind?: 'sentencepiece' | 'json'; source?: string; license?: string }): Promise<string>;
  unregisterVocabulary(name: string): Promise<boolean>;
}
export interface TavernContext extends TavernRecord {
  chat: SillyTavernMessage[]; characters: SillyTavernCharacter[]; groups: SillyTavernGroup[];
  name1: string; name2: string; user_avatar: string; characterId: number; groupId: string | null; readonly chatId: string;
  chatMetadata: TavernRecord; extensionSettings: TavernRecord; powerUserSettings: TavernRecord;
  chatCompletionSettings: TavernRecord; textCompletionSettings: TavernRecord; extensionPrompts: TavernRecord;
  mainApi: string; onlineStatus: string; maxContext: number; duringGenerating: boolean;
  eventSource: TavernEventSource; eventTypes: Record<string, string>; event_types: Record<string, string>;
  net: NativeNetwork; media: NativeMedia; youtube: NativeYouTube; tts: NativeTts;
  tokenizerRegistry: NativeTokenizerService;
  flush(): Promise<void>; getCurrentChatId(): string; getChatTitle(): string; getRequestHeaders(): Record<string, string>;
  getCharacters(): Promise<SillyTavernCharacter[]>; getOneCharacter(avatar: string): Promise<SillyTavernCharacter | undefined>;
  unshallowCharacter(avatar: string): Promise<SillyTavernCharacter | undefined>; selectCharacterById(id: TavernId): Promise<unknown>;
  openCharacterChat(id: TavernId): Promise<unknown>; openGroupChat(id: string): Promise<unknown>; renameChat(oldName: string, newName?: string): Promise<unknown>;
  saveChat(): Promise<void>; saveMetadata(): Promise<void>; saveMetadataDebounced(): Promise<unknown>; saveSettingsDebounced(): Promise<unknown>;
  updateChatMetadata(value: TavernRecord, reset?: boolean): void;
  addOneMessage(message: SillyTavernMessage, options?: { insertAfter?: TavernId; [key: string]: unknown }): Promise<void>;
  writeCharacterExtension(avatar: string, key: string, value: unknown): Promise<void>; writeExtensionField(id: TavernId, key: string, value: unknown): Promise<void>;
  getCharacterCardFields(options?: { chid?: number }): { system: string; jailbreak: string; description: string; personality: string; scenario: string; persona: string; mesExamples: string; version: string; charDepthPrompt: string; creatorNotes: string; firstMessage: string; alternateGreetings: string[] };
  messageFormatting(text: string, name?: string, isSystem?: boolean, isUser?: boolean, messageId?: TavernId): string;
  reloadCurrentChat(): Promise<void>; stopGeneration(): Promise<boolean>;
  generate(type?: string, options?: TavernRecord & { signal?: AbortSignal; abortController?: object }, dryRun?: boolean): Promise<unknown>;
  generateQuietPrompt(prompt: string, quietToLoud?: boolean, skipWIAN?: boolean, quietImage?: unknown, quietName?: string): Promise<string | GenerationResult>;
  generateRaw(prompt: string, api?: string, instruct?: boolean, quietToLoud?: boolean, systemPrompt?: string): Promise<string | GenerationResult>;
  getChatCompletionModel(): string; getTokenCount(text: string, padding?: number): number; getTokenCountAsync(text: string, padding?: number): Promise<number>;
  getTextTokens(type: unknown, text: string): number[]; decodeTextTokens(type: unknown, tokens: number[]): { text: string; chunks: string[] };
  getThumbnailUrl(type: string, file: string): string; deactivateSendButtons(): void; activateSendButtons(): void;
  substituteParams(text: string, overrides?: MacroOverrides): string;
  executeSlashCommandsWithOptions(text: string, options?: SlashOptions): Promise<SlashResult>; executeSlashCommands(text: string, options?: SlashOptions): Promise<SlashResult>;
  deleteMessage(id: TavernId): Promise<void>; deleteLastMessage(): Promise<void>; clearChat(): Promise<void>;
  updateMessageBlock(id: TavernId, message?: Partial<SillyTavernMessage>): Promise<void>; scrollChatToBottom(): void;
  renderExtensionTemplate(extension: string, name: string, data?: TavernRecord): string;
  renderExtensionTemplateAsync(extension: string, name: string, data?: TavernRecord): Promise<string>;
  isMobile(): boolean; shouldSendOnEnter(): boolean; translate(text: string): string; addLocaleData(locale: string, data: Record<string, string>): void;
}
export interface SillyTavernApi { getContext(): TavernContext; libs: TavernRecord; version: string; }
/** Application-owned state; callbacks and provider references stay in the shared JS realm. */
export interface SharedEventListener { listener: TavernEventListener; once: boolean; }
export interface TavernSharedEventHub {
  events: Map<string, SharedEventListener[]>;
  on<A extends unknown[]>(event: string, listener: TavernEventListener<A>, once?: boolean, first?: boolean): () => void;
  remove<A extends unknown[]>(event: string, listener: TavernEventListener<A>): void;
  move<A extends unknown[]>(event: string, listener: TavernEventListener<A>, first: boolean): void;
  listeners(event: string): SharedEventListener[];
  emit(event: string, ...args: unknown[]): unknown[];
  emitAndWait(event: string, ...args: unknown[]): Promise<unknown[]>;
  clearEvent(event: string): void; clearListener<A extends unknown[]>(listener: TavernEventListener<A>): void; clearAll(): void;
}
export interface NativeTavernCatalog<T> { items: T[]; activeId?: string; inUse?: T; [key: string]: unknown; }
export interface NativeTavernCatalogs extends TavernRecord {
  characters?: NativeTavernCatalog<Character & { id: string }>;
  personas?: NativeTavernCatalog<Persona & { id: string }>;
  presets?: NativeTavernCatalog<Preset & { id: string }>;
  groups?: NativeTavernCatalog<SillyTavernGroup>;
  worldbooks?: NativeTavernCatalog<TavernRecord & { id: string; name: string }>;
  conversations?: Array<TavernRecord & { id: string }>;
}
export interface NativeTavernMessage extends TavernRecord {
  id: string; role: ChatRole; content: string; speakerName?: string; sessionEventSeq?: number;
  variableState?: TavernRecord; isHidden?: boolean; reasoning?: string; extra?: TavernRecord;
  swipeId?: number; swipes?: string[]; swipesData?: TavernRecord[]; swipesInfo?: TavernRecord[];
}
export interface NativeTavernSnapshot extends NativeTavernCatalogs {
  messages: NativeTavernMessage[];
  context?: TavernRecord & { conversationId?: string; characterId?: string; personaId?: string; presetId?: string; scriptId?: string; messageId?: string };
  variables?: TavernRecord; variableScopes?: Record<string, Record<string, TavernRecord>>;
  audio?: Partial<Record<Exclude<AudioChannel, 'amb'>, NativeAudioState>>;
}
export interface TavernConversationRecord {
  snapshot?: NativeTavernSnapshot;
  members: Set<(snapshot: NativeTavernSnapshot) => void>;
  refreshing: Promise<NativeTavernSnapshot> | null;
}
export interface TavernSharedStage { patch(snapshot: NativeTavernSnapshot): void; conversationId: string; global: boolean; }
export interface TavernGlobalWaiter { resolve(value: unknown): void; reject(reason: unknown): void; }
export interface TavernSharedState {
  conversations: Map<string, TavernConversationRecord>; eventHub: TavernSharedEventHub; globals: Map<string, unknown>;
  globalInitializations: Map<string, unknown>; globalWaiters: Map<string, Set<TavernGlobalWaiter>>;
  ttsProviders: Map<string, NativeSpeechProvider>; stages: TavernSharedStage[]; writeTail: Promise<void>;
  acceptedCatalog?: NativeTavernCatalogs; helperGenerations?: Map<string, AbortController>;
  helperGenerationOwners?: Map<string, string>; audio?: Partial<Record<Exclude<AudioChannel, 'amb'>, NativeAudioState>>;
  [key: string]: unknown;
}
