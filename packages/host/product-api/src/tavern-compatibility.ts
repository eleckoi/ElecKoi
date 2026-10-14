import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService, type RemoteStream } from '@deepseek-ai/dsh-typert-protocol'
import { randomUUID, createHash } from 'node:crypto'
import { isPng, readPngText } from '@eleckoi/dsh-product-data/media'
import type {} from '@deepseek-ai/dsh-settings'
import type { AgentPreset, PersonaProfile, RegexRule, RegexRuleCollection, SettingLibraryEntry, ScriptLibrary, ScriptLibraryScope, ScriptTree,
  TavernAuxiliaryGenerationEvent, TavernCompatibilityJson, TavernCompatibilityRecord, TavernFunctionToolTask, TavernFunctionToolReply, TavernMainPromptContribution } from './types.js'
import { NativeTavernOperations } from './tavern-native-operations.js'
import { NativeTavernGroups, type NativeGroupActor } from './tavern-groups.js'
import type { DataBankPromptContribution } from './tavern-databank-operations.js'
import { ConfiguredModelStreams } from './configuredModelStreams.js'
import { NativeTavernFunctionTools } from './tavern-function-tools.js'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

type RecordValue = Record<string, unknown>
type Operation = (conversationId: string, params: RecordValue) => unknown | Promise<unknown>
export const TAVERN_COMPATIBILITY_NAMESPACE = 'eleckoi-product-api'

declare module '@deepseek-ai/cordis' {
  interface Context { eleckoiTavernCompatibilityApi: ElecKoiTavernCompatibilityApi }
}

const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const clone = <T>(value: T): T => structuredClone(value)
const present = (value: unknown): boolean => value !== undefined && value !== null
const mergeFields = (previous: RecordValue, patch: RecordValue): RecordValue => Object.fromEntries(Object.entries({ ...previous, ...patch }).map(([key, value]) =>
  [key, value && typeof value === 'object' && !Array.isArray(value) ? mergeFields(object(previous[key]), object(value)) : clone(value)]))
const remoteJson = (value: unknown): TavernCompatibilityJson => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(remoteJson)
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined).map(([key, field]) => [key, remoteJson(field)]))
  }
  throw new TypeError('原生兼容接口只能返回有限数值、文本和 JSON 对象。')
}

/** Same public calls, implemented with product repositories and official settings. */
export class ElecKoiTavernCompatibilityApi extends TypertRemoteService {
  static inject = ['typert', 'tools', 'agents', 'settings', 'llm', 'agentDefaultModel', 'eleckoiProductData', 'eleckoiProductRecordChanges', 'eleckoiCharacterConfigurationChanges', 'eleckoiConversationChanges']
  private readonly owner: Context
  private readonly nativeOperations: NativeTavernOperations
  private readonly configuredModelStreams: ConfiguredModelStreams
  private readonly functionTools: NativeTavernFunctionTools
  private readonly groups: NativeTavernGroups
  private readonly operations = new Map<string, Operation>()
  private snapshotReader?: (conversationId: string) => Promise<RecordValue> | RecordValue
  private tail: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context) {
    super(ctx, 'eleckoiTavernCompatibilityApi', { namespace: 'eleckoiTavernCompatibility' })
    this.owner = ctx
    this.nativeOperations = new NativeTavernOperations(ctx)
    this.configuredModelStreams = new ConfiguredModelStreams(ctx)
    this.functionTools = new NativeTavernFunctionTools(ctx)
    this.groups = new NativeTavernGroups(ctx, () => this.state(), value => this.saveState(value),
      () => ctx.eleckoiProductData.readCharacters().items.map(item => this.character(item.id, this.state())))
    ctx.eleckoiProductData.setTavernRuntimeSource(() => this.state())
  }

  /** Host-only request adapter; Session, Agent and tool execution remain native. */
  streamPresetModel(options: GenerateOptions, parameters: RecordValue, requestId: string = ''): AsyncIterable<StreamChunk> {
    return this.configuredModelStreams.stream(options, parameters, requestId)
  }

  countWorldbookTokens(content: string): number { return this.nativeOperations.countTokens(content) }

  createWorldbookTokenCounter(params: RecordValue, signal?: AbortSignal): Promise<{ encoding: string; count: (content: string) => number | Promise<number> }> {
    return this.nativeOperations.createWorldbookTokenCounter(params, signal)
  }

  collectDataBankPrompt(conversationId: string, history: Array<{ role: string; content: string }>, signal?: AbortSignal): Promise<DataBankPromptContribution | null> {
    return this.nativeOperations.collectDataBankPrompt(conversationId, history, signal)
  }

  /** Actual enabled/forced actors in a chat bound to a persistent native group. */
  groupActors(conversationId: string, groupId: string, memberIds?: unknown[]): NativeGroupActor[] {
    return this.groups.actors(conversationId, groupId, memberIds)
  }

  groupSnapshot(conversationId: string): { groups: RecordValue[]; groupId: string | null } { return this.groups.snapshot(conversationId) }

  groupPromptContext(conversationId: string, characterId: string,
    preparation: Parameters<Context['eleckoiProductData']['projectSettingPromptText']>[1], requestId?: string,
    signal?: AbortSignal, preview: boolean = false): Promise<unknown> {
    return this.groups.promptContext(conversationId, characterId, preparation, requestId
      ? texts => this.functionTools.resolvePromptTexts(conversationId, requestId, texts, signal ?? new AbortController().signal, preview)
      : undefined)
  }

  /** Classifies prepared native entries using the persistent native binding service. */
  worldbookEventSources(conversationId: string, context: RecordValue): Record<string, RecordValue[]> {
    const state = this.state(), worlds = this.worldbooks(state)
    const bindings = this.worldbookBindings(worlds), characterId = text(context.characterId, this.currentCharacterId(conversationId))
    const runtimeEntries = new Map(array(object(context.settingLibrary).entries).map(value => [text(object(value).id), object(value)]))
    const personas = this.personas(state), connected = personas.find(persona => array(persona.connections)
      .some(value => object(value).type === 'character' && object(value).id === characterId))
    const persona = connected ?? personas.find(value => value.id === text(state.activePersonaId, 'default'))
    const personaWorld = text(object(context.persona).lorebook, text(persona?.lorebook))
    const selectedCharacter = object(object(bindings.character)[characterId])
    const result: Record<string, RecordValue[]> = { globalLore: [], characterLore: [], chatLore: [], personaLore: [] }
    for (const book of worlds) {
      const scopes = [
        ...(array(bindings.global).includes(book.name) ? ['globalLore'] : []),
        ...(selectedCharacter.primary === book.name || array(selectedCharacter.additional).includes(book.name) ? ['characterLore'] : []),
        ...(object(bindings.chat)[conversationId] === book.name ? ['chatLore'] : []),
        ...(personaWorld === book.name ? ['personaLore'] : [])
      ]
      for (const entry of book.entries) {
        const id = book.scope === 'global' ? `global-setting:${entry.id}` : book.ownerId === characterId
          ? String(entry.id) : `bound-setting:${encodeURIComponent(book.ownerId)}:${entry.id}`
        const runtime = runtimeEntries.get(id)
        if (!runtime) continue
        const value = { ...runtime, ...entry, id, eleckoiRuntimeId: id, world: book.name, uid: entry.uid,
          content: runtime.content, enabled: runtime.enabled, disable: runtime.enabled === false,
          sillyTavern: { ...object(runtime.sillyTavern), uid: entry.uid } }
        for (const scope of scopes) result[scope]!.push(value)
      }
    }
    return result
  }

  /** Browser-owned scan callbacks participate only in prepared requests and explicit previews. */
  dispatchWorldbookEvent(conversationId: string, requestId: string, eventKey: string,
    eventName: import('./types.js').TavernWorldbookEventName, payload: unknown, signal: AbortSignal, preview: boolean = false): Promise<unknown> {
    return this.functionTools.worldbookEvent(conversationId, requestId, eventKey, eventName, payload, signal, preview)
  }

  matchWorldbookEntries(conversationId: string, entries: Array<{ id: string; content: string }>, query: string, signal?: AbortSignal): Promise<string[]> {
    const vectors = object(object(this.state().extensionSettings).vectors)
    return this.nativeOperations.matchWorldbookEntries(conversationId, entries, query,
      { count: Number(vectors.max_entries ?? 5), threshold: Number(vectors.score_threshold ?? 0.25) }, signal)
  }

  /** Freeze browser-owned filters and macros before the native Agent prepares a turn. */
  collectMainPrompts(conversationId: string, requestId: string, signal: AbortSignal, preview: boolean = false): Promise<TavernMainPromptContribution[]> {
    return this.functionTools.collectPrompts(conversationId, requestId, signal, preview)
  }

  releaseMainPrompts(conversationId: string, requestId: string): Promise<void> {
    return this.functionTools.releasePrompts(conversationId, requestId, new AbortController().signal)
  }

  /** Host wiring supplies existing Session/generation operations without duplicating their stores. */
  registerOperation(method: string, operation: Operation): void { this.operations.set(method, operation) }
  setSnapshotReader(reader: (conversationId: string) => Promise<RecordValue> | RecordValue): void { this.snapshotReader = reader }

  /** 读取原生目录与消息投影；空聊天编号用于主页和全局脚本。
   * @param conversationId - 当前聊天编号；主页传空字符串。
   * @returns 角色、用户资料、预设、设定库及作用域变量快照。
   */
  @Remote
  async snapshot(conversationId: string): Promise<TavernCompatibilityRecord> {
    const data = this.owner.eleckoiProductData
    const details = conversationId ? data.readConversationDetails(conversationId, undefined, 1) : undefined
    const state = this.state()
    const characters = data.readCharacters()
    const catalog = data.readAgentPresetCatalog()
    const characterId = details?.metadata.characterId || characters.active_character_id
    const personas = this.personas(state)
    const activePersonaId = text(state.activePersonaId, 'default')
    const nativeRegex = characterId ? data.readRegexRules(characterId) : undefined
    const extra = this.snapshotReader ? await this.snapshotReader(conversationId) : {}
    const nativeServices = await this.nativeOperations.snapshot()
    const annotations = object(object(state.messages)[conversationId])
    const nativeMessages = array(extra.messages ?? (conversationId ? this.messageMetadata(conversationId) : []))
    const authoredSystems = array(extra.systemMessages).filter(value => object(annotations[text(object(value).id)]).role === 'system')
    const messages = [...nativeMessages.filter(value => !(object(value).id === 'opening' && object(state.hiddenOpenings)[conversationId] === true)), ...authoredSystems].map<RecordValue>(value => {
      const row = object(value)
      const annotation = object(annotations[text(row.dshMessageId)] ?? annotations[text(row.id)])
      return { ...row, ...annotation, id: text(annotation.publicId, text(row.id)) }
    }).sort((a,b) => a.id === 'opening' ? -1 : b.id === 'opening' ? 1 : Number(a.sessionEventSeq) - Number(b.sessionEventSeq))
    const chatVariables = conversationId ? JSON.parse(data.readAuthorConversationState(conversationId).currentVariableStateJson) : {}
    const variableScopes = clone(object(state.variables))
    variableScopes.global = { '': {}, ...object(variableScopes.global) }
    variableScopes.character = { ...(characterId ? { [characterId]: {} } : {}), ...object(variableScopes.character) }
    variableScopes.preset = { ...(catalog.activePresetIds.roleplay ? { [catalog.activePresetIds.roleplay]: {} } : {}), ...object(variableScopes.preset) }
    variableScopes.chat = { ...object(variableScopes.chat), ...(conversationId ? { [conversationId]: chatVariables } : {}) }
    variableScopes.script = { ...Object.fromEntries(this.scriptCatalog(conversationId).map(script => [text(script.id), {}])), ...object(variableScopes.script) }
    variableScopes.message = Object.fromEntries(messages.map(row => [text(row.id), present(row.variableState) ? clone(object(row.variableState)) :
      typeof row.variableStateJson === 'string' ? JSON.parse(row.variableStateJson) : {}]))
    const worlds = this.worldbooks(state)
    const currentBindings = this.worldbookBindings(worlds)
    return remoteJson({
      ...extra,
      ...nativeServices,
      context: { ...object(extra.context), conversationId, chatId: conversationId, characterId, characterName: details?.metadata.characterName ?? text(characters.items.find(item => item.id === characterId)?.name),
        personaId: activePersonaId, presetId: catalog.activePresetIds.roleplay, runtimeSessionId: details?.runtimeSessionId ?? '' },
      characters:{items:characters.items.map(item=>this.character(item.id,state,currentBindings)),activeId:characterId},
      ...this.groups.snapshot(conversationId),
      personas: { items: personas, activeId: activePersonaId },
      presets: { items: catalog.presets.map(item=>this.preset(item.id,state)), inUse:this.preset(catalog.activePresetIds.roleplay,state,true), activeId:catalog.activePresetIds.roleplay },
      // Entry revisions keep catalog feeds small; changed bodies are loaded only for listeners.
      worldbooks: { items: worlds.map(item => ({ id: item.name, name: item.name,
        revision: createHash('sha256').update(JSON.stringify(item.entries)).digest('hex') })), bindings: currentBindings },
      conversations: data.readConversationCatalog().map(item => ({ id: item.id, title: item.title,
        characterId: item.metadata.characterId, groupId: text(object(state.groupBindings)[item.id]) || null })),
      tokenizer: clone(object(state.tokenizer)),
      lorebookSettings: clone(object(state.lorebookSettings)), messages,
      regexes: nativeRegex ? {
        global: this.publicRegexes(nativeRegex.globalRules, 'global', state),
        preset: this.publicRegexes(nativeRegex.agentPresetRules, 'preset', state),
        character: this.publicRegexes(nativeRegex.characterRules, 'character', state),
        characterEnabled: state.characterRegexEnabled !== false
      } : { global: [], preset: [], character: [], characterEnabled: true },
      variables: chatVariables, variableScopes,
      scripts: this.scriptCatalog(conversationId), scriptLibraries: this.scriptLibraries(conversationId), extensionSettings: clone(object(state.extensionSettings)),
      chatMetadata: { ...object(extra.chatMetadata), ...clone(object(object(state.chatMetadata)[conversationId])) }
    }) as TavernCompatibilityRecord
  }

  /** 调用原生服务；写入按提交顺序处理，失败向调用页面抛出。
   * @param conversationId - 当前聊天编号；全局目录操作可以传空字符串。
   * @param method - 对应原生业务的操作名。
   * @param params - 原生操作参数。
   * @returns 原生服务的实际结果。
   */
  @Remote
  invoke(conversationId: string, method: string, params: TavernCompatibilityRecord): Promise<TavernCompatibilityJson> {
    const execute = async () => {
      const operation = this.operations.get(method)
      const result = operation ? await operation(conversationId, clone(params)) : await this.dispatch(conversationId, method, clone(params))
      return remoteJson(result === undefined ? null : result)
    }
    if (this.nativeOperations.concurrent(method)) return execute()
    const pending = this.tail.then(execute)
    this.tail = pending.then(() => undefined, () => undefined)
    return pending
  }

  /** 通过原生 LLM 连接执行独立辅助生成，逐段返回真实输出。
   * @param params - 已保存连接、纯文本消息及生成参数。
   * @param signal - 取消生成或关闭流的信号。
   * @returns 模型开始、正文、推理及完成事件。
   */
  @Remote({ mode: 'stream' })
  generate(params: TavernCompatibilityRecord, signal: AbortSignal): AsyncIterable<TavernAuxiliaryGenerationEvent> {
    return this.nativeOperations.generate(clone(params), signal)
  }

  /** Connect browser callback ownership to native Agent tools for this chat.
   * @param conversationId - Existing product chat with its native Session.
   * @param signal - Closing the owner cancels pending callbacks and unregisters tools.
   * @returns Tool preparation and invocation tasks; the uplink returns real results.
   */
  @Remote({ mode: 'stream' })
  async *connectTools(conversationId: string, signal: AbortSignal): RemoteStream<TavernFunctionToolTask, TavernFunctionToolReply> {
    const invocation = this.ctx.invocation
    if (!invocation) throw new Error('Function tool callbacks require the native Remote stream.')
    signal.throwIfAborted()
    const connection = this.functionTools.open(conversationId)
    const cancel = () => connection.close(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    const consume = (async () => {
      try {
        for await (const reply of invocation.uplink<TavernFunctionToolReply>()) connection.channel.reply(reply)
        connection.close(new Error('Function tool callback page disconnected.'))
      } catch (error) { connection.close(error) }
    })()
    try { yield { kind: 'ready' }; yield* connection.channel.tasks() }
    finally {
      signal.removeEventListener('abort', cancel)
      connection.close(new Error('Function tool callback stream closed.'))
      void consume
    }
  }

  private messageMetadata(conversationId: string) {
    const messages: import('./types.js').ConversationMessageMetadata[] = []
    let cursor: number | undefined
    do {
      const page = this.owner.eleckoiProductData.readConversationDetails(conversationId, cursor, 200)
      messages.unshift(...page.messages)
      if (!page.hasMore || page.beforeSequence === null) return messages
      if (page.beforeSequence === cursor) throw new Error('原生消息分页游标没有前进。')
      cursor = page.beforeSequence
    } while (true)
  }

  private state(): RecordValue {
    const descriptor = this.owner.settings.describe().find(item => item.ns === TAVERN_COMPATIBILITY_NAMESPACE)
    if (!descriptor) throw new Error('ElecKoi 兼容目录 settings namespace 尚未注册。')
    return clone(object(object(descriptor.value).state))
  }

  private async saveState(state: RecordValue): Promise<void> {
    const descriptor = this.owner.settings.describe().find(item => item.ns === TAVERN_COMPATIBILITY_NAMESPACE)
    if (!descriptor) throw new Error('ElecKoi 兼容目录 settings namespace 尚未注册。')
    await this.owner.settings.mutate(TAVERN_COMPATIBILITY_NAMESPACE, [{ op: 'set', path: ['state'], value: state }])
  }

  private currentCharacterId(conversationId: string): string {
    return (conversationId ? this.owner.eleckoiProductData.readConversationDetails(conversationId).metadata.characterId : '') || this.owner.eleckoiProductData.readCharacters().active_character_id
  }

  private character(id:string,state=this.state(),worldbookBindings?:RecordValue):RecordValue {
    const native = this.owner.eleckoiProductData.readCharacters().items.find(item => item.id === id || item.name === id)
    if (!native) throw new Error(`角色不存在：${id}`)
    const preserved = object(object(state.characterFields)[native.id]), persona = object(native.persona)
    const library = this.owner.eleckoiProductData.readSettingLibrary(native.id)
    const opening = library.entries.find(entry => entry.kind === 'opening')
    const firstMessages = opening?.openingMessages.length ? opening.openingMessages.map(item => item.content)
      : array(preserved.first_messages).length ? array(preserved.first_messages).map(String) : text(persona.opening) ? [text(persona.opening)] : []
    const fields: RecordValue = { ...object(preserved.data), ...preserved, name: native.name, first_mes: firstMessages[0] ?? '', alternate_greetings: firstMessages.slice(1),
      description: library.entries.find(entry => entry.id === 'tavern-character-description')?.content ?? text(preserved.description),
      creator: text(preserved.creator), creator_notes: text(preserved.creator_notes), character_version: text(preserved.version, text(preserved.character_version)) }
    delete fields.data
    const bindings=object(object((worldbookBindings??this.worldbookBindings()).character)[native.id])
    const extensions = { ...object(fields.extensions), world: text(bindings.primary), regex_scripts: this.publicRegexes(this.owner.eleckoiProductData.readRegexRules(native.id).characterRules, 'character', state) }
    const avatarId = text(preserved.avatar_id, `${native.id}.png`)
    return { ...clone(preserved), ...native, ...fields, data: { ...fields, extensions }, extensions,
      persona: { ...object(preserved.persona), ...persona }, avatar: native.avatar, avatar_path: native.avatar, avatar_id: avatarId,
      version: text(preserved.version, text(fields.character_version)), first_messages: firstMessages, worldbook: bindings.primary ?? null }
  }

  private personas(state: RecordValue): RecordValue[] {
    const native = this.owner.eleckoiProductData.readPersona(), saved = object(state.personas), activeId = text(state.activePersonaId, 'default')
    const normalize = (id: string, value: RecordValue): RecordValue => ({ title: '', description: '', position: 0, depth: 2, role: 0, lorebook: '',
      connections: [], is_default: id === 'default', ...clone(value), id, avatar_id: text(value.avatar_id, `${id}.png`) })
    const result = Object.entries(saved).map(([id, value]) => normalize(id, object(value)))
    const current = normalize(activeId, { ...object(saved[activeId]), name: native.user_name, avatar: native.user_avatar, avatar_path: native.user_avatar,
      user_name: native.user_name, user_avatar: native.user_avatar, user_square: native.user_square, user_portrait: native.user_portrait })
    const index = result.findIndex(item => item.id === activeId)
    if (index < 0) result.unshift(current)
    else result[index] = current
    return result
  }

  private nativeWorldbookName(characterId: string): string {
    const library = this.owner.eleckoiProductData.readSettingLibrary(characterId)
    const character = this.owner.eleckoiProductData.readCharacters().items.find(item => item.id === characterId)
    return text(library.name, text(character?.name, characterId)) + ` [${characterId}]`
  }

  private worldbooks(state: RecordValue): Array<{ name: string; key: string; groupId?: string; entries: RecordValue[]; scope: 'global' | 'character'; ownerId: string }> {
    const global = this.owner.eleckoiProductData.readGlobalSettingLibrary()
    const folders = global.groups.filter(group => group.sillyTavern?.worldbook === true)
    const folderOf = (id: string): string | undefined => {
      const group = global.groups.find(item => item.id === id)
      if (!group) return undefined
      return group.sillyTavern?.worldbook === true ? group.id : group.parentId ? folderOf(group.parentId) : undefined
    }
    const result: ReturnType<ElecKoiTavernCompatibilityApi['worldbooks']> = [{ name: global.name, key: `native:${global.characterId}`,
      entries: global.entries.filter(entry => entry.kind === 'normal' && !folderOf(entry.groupId)).map((entry, index) => this.publicEntry(entry, index, state, global.characterId)), scope: 'global', ownerId: global.characterId }]
    for (const group of folders) result.push({ name: group.name, key: `folder:${group.id}`, groupId: group.id, scope: 'global', ownerId: global.characterId,
      entries: global.entries.filter(entry => entry.kind === 'normal' && folderOf(entry.groupId) === group.id).map((entry,index) => this.publicEntry(entry,index,state,global.characterId)) })
    for (const character of this.owner.eleckoiProductData.readCharacters().items) {
      const name = this.nativeWorldbookName(character.id)
      const library = this.owner.eleckoiProductData.readSettingLibrary(character.id)
      result.push({ name, key: `native:${character.id}`, scope: 'character', ownerId: character.id, entries: library.entries.filter(entry => entry.kind === 'normal').map((entry, index) => this.publicEntry(entry, index, state, character.id)) })
    }
    return result.filter(item => !global.worldbookBindings?.[item.key]?.deleted)
  }

  private worldbookBindings(worlds = this.worldbooks(this.state())): RecordValue {
    const global = this.owner.eleckoiProductData.readGlobalSettingLibrary()
    const bindings = global.worldbookBindings ?? {}
    const result: RecordValue = { global: [], character: {}, chat: {} }
    for (const world of worlds) {
      const binding = bindings[world.key] ?? { global: world.scope === 'global' && !world.groupId,
        characterIds: world.scope === 'character' ? [world.ownerId] : [], conversationIds: [], primaryCharacterIds: world.scope === 'character' ? [world.ownerId] : [] }
      if (binding.global) (result.global as string[]).push(world.name)
      for (const id of binding.characterIds) {
        const selected = object(result.character)[id] as { primary: string | null; additional: string[] } | undefined ?? { primary: null, additional: [] }
        if (binding.primaryCharacterIds?.includes(id)) selected.primary = world.name
        else selected.additional.push(world.name)
        object(result.character)[id] = selected
      }
      for (const id of binding.conversationIds) object(result.chat)[id] = world.name
    }
    return result
  }

  private publicEntry(entry: SettingLibraryEntry, index: number, state: RecordValue, ownerId: string): RecordValue {
    const preserved = { ...object(object(state.worldbookEntryFields)[`${ownerId}:${entry.id}`]), ...object(entry.sillyTavern) }
    const strategy = object(preserved.strategy), secondary = object(strategy.keys_secondary)
    const wireKeys = (saved: unknown, native: string[]): unknown[] => {
      const keys = array(saved)
      return keys.length === native.length && keys.every((key, i) => this.nativeKeyword(key) === native[i]) ? keys : native
    }
    return { ...preserved, ...entry, uid: preserved.uid ?? index, name: text(preserved.name, entry.title), comment: text(preserved.comment, entry.title),
      key: entry.keywords, keysecondary: entry.conditionKeywords, disable: !entry.enabled, constant: entry.triggerMode === 'always',
      strategy: { ...strategy, type: entry.triggerMode === 'always' ? 'constant' : strategy.type === 'vectorized' ? 'vectorized' : 'selective', keys: wireKeys(strategy.keys, entry.keywords),
        keys_secondary: { ...secondary, logic: ({ any: 'and_any', all: 'and_all', none: 'and_any', not_any: 'not_any', not_all: 'not_all' } as Record<string,string>)[entry.keywordCondition], keys: wireKeys(secondary.keys, entry.conditionKeywords) }, scan_depth: strategy.scan_depth === 'same_as_global' ? 'same_as_global' : entry.keywordScanDepth },
      position: { ...object(preserved.position), type: object(preserved.position).type ?? entry.position ?? 'instructions', role: entry.insertRole, order: entry.order, depth: object(preserved.position).depth ?? 0 },
      recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null, ...object(preserved.recursion) } }
  }

  private nativeKeyword(value: unknown): string {
    const regex = object(object(value).__eleckoiKeywordRegex)
    return typeof regex.source === 'string' ? `/${regex.source}/${text(regex.flags)}` : String(value)
  }

  private nativeEntry(value: RecordValue, index: number): SettingLibraryEntry {
    const strategy = object(value.strategy), position = object(value.position)
    const existing = value as Partial<SettingLibraryEntry>
    const settings = object(this.state().lorebookSettings)
    const inherited = (value: unknown, fallback: unknown) => value === 'same_as_global' || value === undefined ? fallback : value
    const scanDepth = inherited(strategy.scan_depth ?? value.keywordScanDepth, settings.scan_depth ?? settings.scanDepth ?? 2)
    const logic = text(object(strategy.keys_secondary).logic, text(value.keywordCondition, 'and_any'))
    const keywordCondition = ({ and_any: 'any', and_all: 'all', not_any: 'not_any', not_all: 'not_all', any: 'any', all: 'all', none: 'none' } as Record<string, SettingLibraryEntry['keywordCondition']>)[logic] ?? 'any'
    const now = new Date().toISOString()
    const positionType = typeof value.position === 'string' ? value.position : position.type
    const nativePosition = ['instructions', 'insert_point_1', 'insert_point_2', 'insert_point_3', 'insert_point_4', 'insert_point_5'].includes(String(positionType))
      ? positionType as SettingLibraryEntry['position'] : 'instructions'
    return {
      id: text(value.id, present(value.uid) ? String(value.uid) : randomUUID()), title: text(value.name, text(value.comment, text(value.title))),
      iconId: text(value.iconId), kind: existing.kind ?? 'normal', groupId: text(value.groupId), content: text(value.content),
      openingMessages: existing.openingMessages ?? [], defaultOpeningMessageId: text(value.defaultOpeningMessageId), agentSelectionHint: text(value.agentSelectionHint),
      agentReadStrategy: existing.agentReadStrategy ?? 'keyword', dynamicMode: existing.dynamicMode ?? 'standard', contentMode: existing.contentMode ?? 'plain_text',
      keywords: array(strategy.keys ?? value.key ?? value.keywords).map(key => this.nativeKeyword(key)), keywordScanDepth: Number(scanDepth),
      conditionKeywords: array(object(strategy.keys_secondary).keys ?? value.keysecondary ?? value.conditionKeywords).map(key => this.nativeKeyword(key)),
      keywordCondition, keywordUseRegex: Boolean(value.keywordUseRegex), keywordIgnoreCase: present(value.case_sensitive) ? !inherited(value.case_sensitive, settings.case_sensitive ?? false) : value.keywordIgnoreCase !== false,
      keywordWholeWord: Boolean(inherited(value.match_whole_words, settings.match_whole_words ?? value.keywordWholeWord)), keywordRecursionDepth: Number(value.keywordRecursionDepth ?? 0),
      triggerMode: strategy.type === 'constant' || value.constant === true ? 'always' : existing.triggerMode ?? null,
      enabled: value.disable !== true && value.enabled !== false,
      position: nativePosition,
      promptPositionId: text(value.promptPositionId), insertRole: position.role === 'user' || position.role === 'assistant' ? position.role : existing.insertRole ?? 'system',
      order: Math.max(1, Number(position.order ?? value.order ?? index + 1)), viewOrder: index, groupViewOrder: index, treeViewOrder: index,
      createdAt: text(value.createdAt, now), updatedAt: now
    }
  }

  private publicRegexes(rules: RegexRule[], scope: string, state: RecordValue): RecordValue[] {
    return rules.map(rule => ({ ...object(object(state.regexFields)[rule.id]), ...rule, scope, find_regex: rule.pattern, replace_string: rule.replacement,
      source: { user_input: rule.targets.includes('UserInput'), ai_output: rule.targets.includes('AiOutput'), slash_command: rule.targets.includes('SlashCommand'), world_info: rule.targets.includes('SettingContent'), reasoning: rule.targets.includes('Reasoning') },
      destination: { display: !rule.promptOnly, prompt: !rule.displayOnly }, min_depth: rule.minDepth ?? null, max_depth: rule.maxDepth ?? null }))
  }

  private nativeRegex(value: RecordValue, index: number): RegexRule {
    const source = object(value.source), destination = object(value.destination)
    const placements = array(value.placement)
    const targets: RegexRule['targets'] = Array.isArray(value.targets) ? value.targets as RegexRule['targets'] : []
    for (const [name, target, placement] of [['user_input', 'UserInput', 1], ['ai_output', 'AiOutput', 2], ['slash_command', 'SlashCommand', 3], ['world_info', 'SettingContent', 5], ['reasoning', 'Reasoning', 6]] as const) {
      if ((source[name] === true || placements.includes(placement)) && !targets.includes(target)) targets.push(target)
    }
    return { id: text(value.id, randomUUID()), name: text(value.name, text(value.scriptName)), pattern: text(value.pattern, text(value.find_regex, text(value.findRegex))),
      replacement: text(value.replacement, text(value.replace_string, text(value.replaceString))), targets: targets.length ? targets : ['UserInput', 'AiOutput'],
      enabled: value.enabled !== false && value.disabled !== true,
      displayOnly: Boolean(value.displayOnly ?? value.markdownOnly ?? (destination.display === true && destination.prompt === false)),
      promptOnly: Boolean(value.promptOnly ?? (destination.prompt === true && destination.display === false)), runOnEdit: value.runOnEdit !== false,
      order: index, trimStrings: array(value.trimStrings).map(String), minDepth: present(value.min_depth ?? value.minDepth) ? Number(value.min_depth ?? value.minDepth) : null,
      maxDepth: present(value.max_depth ?? value.maxDepth) ? Number(value.max_depth ?? value.maxDepth) : null,
      substituteRegex: value.substituteRegex === 1 || value.substituteRegex === 2 ? value.substituteRegex : 0 }
  }

  private preset(id:string,state:RecordValue,inUse=false):RecordValue {
    const draft=object(state.presetDraft), useDraft=inUse&&draft.loadedId===id&&Object.keys(object(draft.preset)).length>0
    const native=useDraft?object(draft.preset) as unknown as AgentPreset:this.owner.eleckoiProductData.readAgentPreset(id), extra=useDraft?object(draft.fields):object(object(state.presetFields)[id]), fields=object(extra.promptFields)
    const settings = { max_context: 8192, max_completion_tokens: 1024, reply_count: 1, should_stream: true, temperature: 1, frequency_penalty: 0,
      presence_penalty: 0, top_p: 1, repetition_penalty: 1, min_p: 0, top_k: 0, top_a: 0, seed: -1, squash_system_messages: false,
      reasoning_effort: 'auto', request_thoughts: true, request_images: false, enable_function_calling: true, enable_web_search: false,
      allow_sending_images: 'auto', allow_sending_videos: false, character_name_prefix: 'none', wrap_user_messages_in_quotes: false, ...object(extra.settings) }
    return { ...extra, ...native, settings, prompts_unused: clone(array(extra.prompts_unused)), extensions: clone(object(extra.extensions)),
      prompts: native.entries.map(entry => {
        const preserved = { ...object(fields[entry.id]), ...object(object(entry.sillyTavern).presetPrompt) }
        return { ...preserved, id: entry.id, identifier: entry.id, name: entry.title, content: entry.content, role: entry.insertRole, enabled: entry.enabled,
          position: clone(object(preserved.position).type ? object(preserved.position) : { type: 'relative' }) }
      }) }
  }

  private scriptCatalog(conversationId: string): RecordValue[] {
    const data = this.owner.eleckoiProductData
    const characterId = this.currentCharacterId(conversationId), presetId = data.readAgentPresetCatalog().activePresetIds.roleplay
    return (['global', 'preset', 'character'] as const).flatMap(scope => {
      const ownerId = scope === 'global' ? '' : scope === 'character' ? characterId : presetId
      if (scope !== 'global' && !ownerId) return []
      const library = data.readScriptLibrary(scope, ownerId)
      return library.trees.flatMap(tree => (tree.type === 'folder' ? tree.scripts.map(script => ({ ...script, enabled: tree.enabled && script.enabled })) : [tree])
        .map(script => ({ ...script, scope, ownerId, libraryEnabled: library.enabled, revision: library.revision })))
    })
  }

  private scriptLibraries(conversationId: string): ScriptLibrary[] {
    const data = this.owner.eleckoiProductData, characterId = this.currentCharacterId(conversationId), presetId = data.readAgentPresetCatalog().activePresetIds.roleplay
    return (['global', 'character', 'preset'] as const).flatMap(scope => {
      const ownerId = scope === 'global' ? '' : scope === 'character' ? characterId : presetId
      return scope !== 'global' && !ownerId ? [] : [data.readScriptLibrary(scope,ownerId)]
    })
  }

  private async scriptOperation(conversationId: string, method: string, params: RecordValue): Promise<unknown> {
    const data = this.owner.eleckoiProductData
    const scopeName = text(params.scope, text(params.type, 'global'))
    if (!['global', 'character', 'preset'].includes(scopeName)) throw new Error(`脚本库归属不正确：${scopeName}`)
    const scope = scopeName as ScriptLibraryScope
    const ownerId = text(params.ownerId, scope === 'global' ? '' : scope === 'character' ? this.currentCharacterId(conversationId) : data.readAgentPresetCatalog().activePresetIds.roleplay)
    const library = data.readScriptLibrary(scope, ownerId)
    if (method === 'scripts.getTrees') return clone(library.trees)
    if (method === 'scripts.replaceTrees') {
      const previous = library.trees.flatMap(tree=>tree.type==='folder'?tree.scripts:[tree])
      const script = (input: unknown): ScriptTree => {
        const item=object(input), id=text(item.id,randomUUID())
        if(item.type==='folder'||Array.isArray(item.scripts))return {...clone(item),type:'folder',id,name:text(item.name),enabled:item.enabled!==false,icon:text(item.icon),color:text(item.color),scripts:array(item.scripts).map(script)} as ScriptTree
        const before=previous.find(entry=>entry.id===id)
        return {...before,...clone(item),type:'script',id,name:text(item.name,text(before?.name)),enabled:item.enabled!==false,content:text(item.content,text(before?.content)),info:text(item.info,text(before?.info)),data:object(item.data??before?.data),
          button:{enabled:object(item.button).enabled!==false,buttons:array(object(item.button).buttons??before?.button.buttons)},export_with:{data:true,button:true,...object(item.export_with)}} as ScriptTree
      }
      const saved = data.saveScriptLibrary({ ...library, trees: array(params.trees).map(script) })
      this.owner.eleckoiCharacterConfigurationChanges.publish({ kind: 'configuration', domain: 'scripts' })
      return saved.trees
    }
    const id = text(params.id)
    const current = library.trees.flatMap(tree => tree.type === 'folder' ? tree.scripts : [tree]).find(script => script.id === id)
    if (!current) throw new Error(`原生脚本不存在：${id}`)
    if (method === 'scripts.getInfo') return clone(current)
    if (method === 'scripts.getButtons') return clone(current.button.buttons)
    if (method === 'scripts.getSettings') return clone(current.data)
    if (method === 'scripts.setInfo') {
      if(typeof params.info==='string')current.info=params.info
      else Object.assign(current, clone(object(params.info)), { id: current.id, type: 'script' })
    } else if (method === 'scripts.setButtons') current.button = { ...current.button, buttons: clone(array(params.buttons)) as typeof current.button.buttons }
    else if (method === 'scripts.setSettings') current.data = clone(object(params.data)) as typeof current.data
    else throw new Error(`原生脚本未提供操作：${method}`)
    const saved = data.saveScriptLibrary(library as ScriptLibrary)
    this.owner.eleckoiCharacterConfigurationChanges.publish({ kind: 'configuration', domain: 'scripts' })
    const result = saved.trees.flatMap(tree => tree.type === 'folder' ? tree.scripts : [tree]).find(script => script.id === id)
    if (!result) throw new Error('已保存脚本不在原生库中。')
    return method === 'scripts.setButtons' ? result.button.buttons : method === 'scripts.setSettings' ? result.data : result
  }

  private async dispatch(conversationId: string, method: string, params: RecordValue): Promise<unknown> {
    if (method.startsWith('group.')) return this.groups.invoke(conversationId, method, params)
    if (this.nativeOperations.has(method)) return this.nativeOperations.invoke(method, { ...params, conversationId })
    const data = this.owner.eleckoiProductData
    const state = this.state()
    if (method === 'tokens.select') {
      const encoding = text(params.encoding)
      if (!encoding.trim()) throw new TypeError('选择 tokenizer 需要实际 encoding 名称。')
      const native = await this.nativeOperations.snapshot()
      await this.nativeOperations.invoke('tokens.count', { encoding, model: text(object(native.selectedConnection).model), text: '' })
      state.tokenizer = { ...object(state.tokenizer), encoding }
      await this.saveState(state)
      return clone(state.tokenizer)
    }
    if (method === 'settings.get') {
      if (params.namespace !== undefined || params.ns !== undefined) return this.nativeOperations.invoke('configuration.get', params)
      return clone(object(state.extensionSettings))
    }
    if (method === 'settings.set') {
      if (params.namespace !== undefined || params.ns !== undefined) return this.nativeOperations.invoke('configuration.set', params)
      state.extensionSettings = clone(object(params.value ?? params.settings))
      await this.saveState(state)
      return clone(state.extensionSettings)
    }
    if (method === 'chat.metadata.get') return clone(object(object(state.chatMetadata)[conversationId]))
    if (method === 'chat.metadata.set') {
      if (!conversationId) throw new Error('保存聊天元数据需要当前聊天编号。')
      const metadata = clone(object(params.value ?? params.metadata ?? params.data))
      state.chatMetadata = { ...object(state.chatMetadata), [conversationId]: metadata }
      await this.saveState(state)
      this.owner.eleckoiConversationChanges.publish({ kind: 'messages', conversationId, reason: 'edited', messageIds: [] })
      return metadata
    }
    const id = text(params.id)
    const value = clone(object(params.data))
    const name = text(params.name)
    if (method === 'character.list') return { items: data.readCharacters().items.map(item => this.character(item.id, state)), activeId: this.currentCharacterId(conversationId) }
    if (method === 'character.get') return this.character(id || this.currentCharacterId(conversationId), state)
    if (method === 'character.create' || method === 'character.replace') {
      const isNew = method.endsWith('create')
      const previous = isNew ? {} : this.character(id, state)
      const nested = object(value.data), patch = { ...nested, ...value }
      for (const [key, field] of Object.entries(nested)) if (value[key] === undefined || JSON.stringify(value[key]) === JSON.stringify(previous[key])) patch[key] = field
      const card: RecordValue & { id: string; name: string } = { ...mergeFields(previous, patch), id: isNew ? text(value.id, randomUUID()) : text(previous.id), name: name || text(patch.name, text(previous.name)) }
      if (Array.isArray(value.first_messages) && JSON.stringify(value.first_messages) !== JSON.stringify(previous.first_messages)) { const firstMessages = value.first_messages.map(String); card.first_messages = firstMessages; card.first_mes = firstMessages[0] ?? ''; card.alternate_greetings = firstMessages.slice(1) }
      if (isNew && name.endsWith('.png')) { card.avatar_id = name; card.name = text(value.name, name.slice(0, -4)) }
      const persona = { ...object(previous.persona), ...object(card.persona), assistant_name: card.name,
        assistant_avatar: text(card.avatar, text(object(previous.persona).assistant_avatar)), assistant_square: text(object(card.persona).assistant_square, text(object(previous.persona).assistant_square)),
        assistant_cover: text(object(card.persona).assistant_cover, text(object(previous.persona).assistant_cover)), opening: text(card.first_mes, text(object(card.persona).opening)) }
      const collection = isNew ? data.createCharacter({ ...card, persona }) : data.updateCharacter({ ...card, persona })
      const native = collection.items.find(item => item.id === card.id)
      if (!native) throw new Error('已保存角色不在原生目录中。')
      const unknown = clone(card)
      for (const key of Object.keys(native)) delete unknown[key]
      delete unknown.first_mes
      const personaFields = { ...object(card.persona) }
      for (const key of Object.keys(object(native.persona))) delete personaFields[key]
      if (Object.keys(personaFields).length) unknown.persona = personaFields
      if (Object.keys(object(unknown.data)).length) {
        const fields = object(unknown.data)
        for (const key of Object.keys(native)) delete fields[key]
        delete fields.first_mes
        unknown.data = fields
      }
      state.characterFields = { ...object(state.characterFields), [card.id]: unknown }
      const library = data.readSettingLibrary(card.id), entries = [...library.entries]
      if (value.description !== undefined || object(value.data).description !== undefined) {
        const index = entries.findIndex(entry => entry.id === 'tavern-character-description'), before = entries[index]
        const entry = { ...this.nativeEntry({ ...before, id: 'tavern-character-description', name: before?.title ?? '角色描述', content: text(card.description),
          groupId: before?.groupId ?? '', position: 'instructions', triggerMode: 'always', agentReadStrategy: 'required' }, Math.max(0, index)),
          triggerMode: 'always' as const, agentReadStrategy: 'required' as const }
        if (index < 0) entries.push(entry); else entries[index] = entry
      }
      if (Array.isArray(value.first_messages) || patch.first_mes !== undefined || Array.isArray(patch.alternate_greetings)) {
        const values = Array.isArray(value.first_messages) && JSON.stringify(value.first_messages) !== JSON.stringify(previous.first_messages) ? value.first_messages.map(String) : [text(card.first_mes), ...array(card.alternate_greetings).map(String)]
        const index = entries.findIndex(entry => entry.kind === 'opening'), before = entries[index]
        const entry = { ...this.nativeEntry({ ...before, id: before?.id ?? 'fixed-opening-assistant', name: before?.title ?? 'AI角色开场白', content: values[0] ?? '' }, Math.max(0, index)),
          kind: 'opening' as const, openingMessages: values.map((content, i) => ({ ...before?.openingMessages[i], id: before?.openingMessages[i]?.id ?? `tavern-opening-${i + 1}`,
            title: before?.openingMessages[i]?.title ?? (i ? `备用开场 ${i}` : '默认开场'), content, initialVariableStateJson: before?.openingMessages[i]?.initialVariableStateJson ?? '' })),
          defaultOpeningMessageId: values.length ? before?.openingMessages[0]?.id ?? 'tavern-opening-1' : '' }
        if (index < 0) entries.push(entry); else entries[index] = entry
      }
      if (entries.some((entry, index) => entry !== library.entries[index])) data.replaceSettingLibraryContent(card.id, { ...library, entries })
      const extensions = object(card.extensions)
      if (Array.isArray(extensions.regex_scripts)) {
        const collection = data.readRegexRules(card.id)
        data.saveRegexRules(card.id, { ...collection, characterRules: extensions.regex_scripts.map((rule, index) => this.nativeRegex(object(rule), index)) }, collection.revision)
      }
      if (Array.isArray(object(extensions.tavern_helper).scripts)) {
        await this.scriptOperation(conversationId, 'scripts.replaceTrees', { scope: 'character', ownerId: card.id, trees: object(extensions.tavern_helper).scripts })
      }
      const worldbook = Object.prototype.hasOwnProperty.call(value, 'worldbook') ? value.worldbook : object(nested.extensions).world
      if (worldbook !== undefined) await this.worldbookOperation(conversationId, 'worldbook.bindings', { scope: 'character', owner: card.id,
        names: { ...object(object(this.worldbookBindings().character)[card.id]), primary: worldbook } }, state)
      await this.saveState(state)
      this.owner.eleckoiProductRecordChanges.publish({ kind: 'records', domain: 'characters', ids: [card.id] })
      return this.character(card.id, state)
    }
    if (method === 'character.delete') {
      const deleted = this.character(id, state)
      await this.owner.eleckoiCharactersApi.delete([text(deleted.id)], { deleteChats: object(params.options).delete_chats === true })
      delete object(state.characterFields)[text(deleted.id)]
      await this.saveState(state); return true
    }
    if (method === 'persona.list') return { items: this.personas(state), activeId: text(state.activePersonaId, 'default') }
    if (method === 'persona.get') {
      const persona = this.personas(state).find(item => item.id === id || item.name === id)
      if (!persona) throw new Error(`用户资料不存在：${id}`)
      return persona
    }
    if (method.startsWith('persona.')) {
      const saved = Object.fromEntries(this.personas(state).map(item => [text(item.id), item]))
      let targetId = id
      if (typeof value.lorebook === 'string' && value.lorebook && !this.worldbooks(state).some(book => book.name === value.lorebook)) throw new Error(`设定库不存在：${value.lorebook}`)
      if (method === 'persona.create') {
        targetId = text(value.id, randomUUID())
        if (saved[targetId]) throw new Error('用户资料编号已存在。')
        saved[targetId] = { title: '', description: '', position: 0, depth: 2, role: 0, lorebook: '', connections: [], is_default: false,
          ...value, id: targetId, avatar_id: text(value.avatar_id, `${targetId}.png`), name: name || text(value.name), avatar: text(value.avatar, text(value.user_avatar)) }
      } else if (method === 'persona.replace') {
        if (!saved[id]) throw new Error('用户资料不存在。')
        saved[id] = { ...mergeFields(saved[id]!, value), id, name: text(value.name, text(saved[id]!.name)) }
      } else if (method === 'persona.delete') {
        if (!saved[id]) throw new Error('用户资料不存在。')
        delete saved[id]
        if (id === text(state.activePersonaId, 'default')) {
          targetId = Object.keys(saved)[0] ?? 'default'; state.activePersonaId = targetId
          saved[targetId] ??= { id: targetId, avatar_id: `${targetId}.png`, name: '你', avatar: '', title: '', description: '', connections: [], is_default: true }
        }
      } else if (method === 'persona.select') { if (!saved[id]) throw new Error('用户资料不存在。'); state.activePersonaId = id }
      else throw new Error(`未知用户资料操作：${method}`)
      if (value.is_default === true) for (const [key, item] of Object.entries(saved)) item.is_default = key === targetId
      state.personas = saved
      if (method === 'persona.select' || targetId === text(state.activePersonaId, 'default')) {
        const item = saved[targetId]
        if (!item) throw new Error('当前用户资料不存在。')
        data.savePersona({ ...data.readPersona(), ...item, user_name: text(item.name, text(item.user_name)), user_avatar: text(item.avatar, text(item.user_avatar)) } as PersonaProfile)
        this.owner.eleckoiProductRecordChanges.publish({ kind: 'records', domain: 'persona' })
      }
      await this.saveState(state)
      return method === 'persona.delete' ? true : saved[targetId]
    }
    if (method === 'preset.list') { const catalog = data.readAgentPresetCatalog(); return { items: catalog.presets, activeId: catalog.activePresetIds.roleplay } }
    if (method === 'preset.get') {
      return this.preset(id||data.readAgentPresetCatalog().activePresetIds.roleplay,state,params.inUse===true)
    }
    if(method==='preset.select'){const selected=data.setActiveAgentPreset(id);delete state.presetDraft;await this.saveState(state);return selected;}
    if(method==='preset.delete'){const catalog=data.deleteAgentPreset(id);delete object(state.presetFields)[id];if(object(state.presetDraft).loadedId===id)delete state.presetDraft;await this.saveState(state);return catalog;}
    if (method === 'preset.create' || method === 'preset.replace' || method === 'preset.rename') {
      const draft=object(state.presetDraft), inUse=method==='preset.replace'&&params.inUse===true
      const native=method==='preset.create'?data.createAgentPreset(name||text(value.name,'Untitled'),text(value.libraryGroupId),value.purpose==='creator'?'creator':'roleplay'):inUse&&draft.loadedId===id?object(draft.preset) as unknown as AgentPreset:data.readAgentPreset(id)
      const merged = { ...native, ...value, id: native.id, name: method === 'preset.rename' ? name : text(value.name, native.name) }
      if (Array.isArray(value.prompts)) merged.entries = value.prompts.map((entry, index) => {
        const prompt = object(entry), promptId = text(prompt.id, text(prompt.identifier, randomUUID())), previous = native.entries.find(item => item.id === promptId)
        const result = this.nativeEntry({ ...previous, ...prompt, id: promptId, triggerMode: 'always', agentReadStrategy: 'required',
          position: { type: object(prompt.position).type === 'in_chat' ? 'insert_point_5' : 'instructions', role: prompt.role, order: object(prompt.position).order ?? index + 1 } }, index)
        result.triggerMode = 'always'; result.agentReadStrategy = 'required'
        result.sillyTavern = remoteJson({ ...object(previous?.sillyTavern), presetPrompt: prompt }) as TavernCompatibilityRecord
        return result
      })
      const saved=inUse?merged:data.saveAgentPreset(merged as AgentPreset,native.regexRules)
      const unknown={...object(inUse&&draft.loadedId===native.id?draft.fields:object(state.presetFields)[native.id]),...value}
      for (const key of Object.keys(saved)) delete unknown[key]
      if (Array.isArray(value.prompts)) {
        const fields = object(unknown.promptFields)
        value.prompts.forEach((entry, index) => {
          const prompt = clone(object(entry)), nativeEntry = merged.entries[index]
          if (!nativeEntry) throw new Error('预设提示词保存顺序不匹配。')
          for (const key of ['identifier', 'id', 'name', 'content', 'role', 'enabled']) delete prompt[key]
          fields[nativeEntry.id] = prompt
        })
        unknown.promptFields = fields
      }
      if (Array.isArray(value.prompts_unused)) unknown.prompts_unused = clone(value.prompts_unused)
      if (Object.prototype.hasOwnProperty.call(value, 'extensions')) unknown.extensions = clone(object(value.extensions))
      if (Object.prototype.hasOwnProperty.call(value, 'settings')) unknown.settings = clone(object(value.settings))
      delete unknown.prompts
      if(inUse)state.presetDraft={loadedId:native.id,preset:clone(merged),fields:unknown}
      else state.presetFields={...object(state.presetFields),[native.id]:unknown}
      await this.saveState(state)
      this.owner.eleckoiCharacterConfigurationChanges.publish({ kind: 'configuration', domain: 'agentPresets' })
      return this.preset(native.id,state,inUse)
    }
    if (method.startsWith('worldbook.')) return this.worldbookOperation(conversationId, method, params, state)
    if (method === 'scripts.list') return this.scriptCatalog(conversationId)
    if (method.startsWith('scripts.')) return this.scriptOperation(conversationId, method, params)
    if (method === 'regex.get') return (await this.snapshot(conversationId)).regexes
    if (method === 'regex.replace') {
      const characterId = this.currentCharacterId(conversationId)
      if (!characterId) throw new Error('保存正则规则前需要至少一个原生角色。')
      const collection = data.readRegexRules(characterId)
      const options = object(params.options), scope = text(options.scope, 'all')
      const fields = object(state.regexFields)
      const input = array(params.rules).map(object)
      const group = (groupScope: string) => input.filter(rule => scope === groupScope || text(rule.scope, 'global') === groupScope).map((rule, index) => {
        const normalized = this.nativeRegex(rule, index), unknown = clone(rule)
        for (const key of [...Object.keys(normalized), 'scope', 'source', 'destination', 'find_regex', 'findRegex', 'replace_string', 'replaceString', 'min_depth', 'max_depth', 'placement', 'scriptName', 'disabled', 'markdownOnly']) delete unknown[key]
        fields[normalized.id] = unknown; return normalized
      })
      const next: RegexRuleCollection = { ...collection,
        globalRules: scope === 'all' || scope === 'global' ? group('global') : collection.globalRules,
        agentPresetRules: scope === 'all' || scope === 'preset' ? group('preset') : collection.agentPresetRules,
        characterRules: scope === 'all' || scope === 'character' ? group('character') : collection.characterRules }
      const saved = data.saveRegexRules(characterId, next, collection.revision)
      state.regexFields = fields; await this.saveState(state)
      this.owner.eleckoiCharacterConfigurationChanges.publish({ kind: 'configuration', domain: 'regexRules', characterId })
      return saved
    }
    if (method === 'variables.getScope' || method === 'variables.setScope' || method === 'variables.get' || method === 'variables.replace' || method === 'variables.setState') {
      const scope = text(params.scope, 'chat')
      const owner = text(params.owner, scope === 'character' ? this.currentCharacterId(conversationId) : scope === 'chat' ? conversationId : '')
      if (scope === 'chat') {
        if (method === 'variables.getScope' || method === 'variables.get') return JSON.parse(data.readAuthorConversationState(owner).currentVariableStateJson)
        if (!owner) throw new Error('聊天变量需要当前聊天编号。')
        const saved = data.updateConversationVariables(owner, JSON.stringify(params.variables ?? params.data ?? params.state ?? {}))
        this.owner.eleckoiConversationChanges.publish({ kind: 'messages', conversationId: owner, reason: 'edited', messageIds: [] })
        return JSON.parse(saved)
      }
      if (!['global', 'preset', 'character', 'script', 'message'].includes(scope)) throw new Error(`未知变量归属：${scope}`)
      const variables = object(state.variables), scoped = object(variables[scope])
      if (scope === 'message') {
        if (!conversationId) throw new Error('消息变量需要当前聊天。')
        const annotations = object(state.messages), messages = object(annotations[conversationId])
        const nativeSnapshot = this.snapshotReader ? await this.snapshotReader(conversationId) : {}
        const native = [...array(nativeSnapshot.messages), ...array(nativeSnapshot.systemMessages)].map(object)
          .find(item => item.id === owner || item.dshMessageId === owner || object(messages[text(item.dshMessageId)]).publicId === owner)
        const alias = Object.keys(messages).find(id => id === owner || object(messages[id]).publicId === owner)
        const nativeId = alias ?? (native ? text(native.dshMessageId, text(native.id)) : undefined)
        if (!nativeId) throw new Error('聊天中不存在变量归属消息：' + owner)
        const metadata = object(messages[nativeId])
        if (method === 'variables.getScope' || method === 'variables.get') {
          if (present(metadata.variableState)) return clone(object(metadata.variableState))
          const nativeState = object(native).variableState
          if (!present(nativeState) && typeof object(native).variableStateJson === 'string') return JSON.parse(text(object(native).variableStateJson))
          if (present(nativeState)) return clone(object(nativeState))
          const ledger = this.messageMetadata(conversationId).find(item => item.id === owner)
          if (!ledger) throw new Error(`聊天中不存在变量归属消息：${owner}`)
          return JSON.parse(ledger.variableStateJson)
        }
        metadata.variableState = clone(object(params.variables ?? params.data)); messages[nativeId] = metadata; annotations[conversationId] = messages; state.messages = annotations
        await this.saveState(state)
        this.owner.eleckoiConversationChanges.publish({ kind: 'messages', conversationId, reason: 'edited', messageIds: [owner] })
        return clone(metadata.variableState)
      }
      if (method === 'variables.getScope' || method === 'variables.get') return clone(object(scoped[owner]))
      scoped[owner] = clone(object(params.variables ?? params.data)); variables[scope] = scoped; state.variables = variables
      await this.saveState(state); return clone(scoped[owner])
    }
    if (method === 'messages.metadata') {
      const supported = new Set(['speakerName', 'isHidden', 'variableState', 'extra'])
      for (const update of array(params.updates)) for (const key of Object.keys(object(object(update).patch))) {
        if (!supported.has(key)) throw new Error(`该消息字段没有独立原生元数据归属：${key}`)
      }
      const annotations = object(state.messages), scoped = object(annotations[conversationId])
      const nativeSnapshot = this.snapshotReader ? await this.snapshotReader(conversationId) : {}
      for (const update of array(params.updates)) {
        const item = object(update), publicId = text(item.id)
        const row = [...array(nativeSnapshot.messages), ...array(nativeSnapshot.systemMessages)].map(object)
          .find(row => row.id === publicId || row.dshMessageId === publicId || object(scoped[text(row.dshMessageId)]).publicId === publicId)
        const messageId = Object.keys(scoped).find(id => id === publicId || object(scoped[id]).publicId === publicId)
          ?? (row ? text(row.dshMessageId, text(row.id)) : undefined)
        if (!messageId) throw new Error('聊天中不存在消息：' + publicId)
        scoped[messageId] = { ...object(scoped[messageId]), ...object(item.patch) }
      }
      annotations[conversationId] = scoped; state.messages = annotations; await this.saveState(state)
      this.owner.eleckoiConversationChanges.publish({ kind: 'messages', conversationId, reason: 'edited', messageIds: array(params.updates).map(item => text(object(item).id)) })
      return clone(scoped)
    }
    if (['messages.update', 'messages.create', 'messages.delete', 'messages.rotate'].includes(method)) return this.mutateMessages(conversationId, method, params, state)
    if (method === 'chat.historyBrief') return data.readConversationCatalog().filter(item => item.metadata.characterId === text(params.characterId))
      .map(item => ({ ...item, file_name: `${item.id}.jsonl`, last_mes: item.updatedAt, create_date: item.createdAt, preview: item.preview }))
    if (method === 'chat.historyFiles') {
      const result: RecordValue = {}
      for (const value of array(params.data)) {
        const input = object(value), filename = text(input.file_name, text(input.fileName, text(input.id, text(input.chat))))
        const id = text(input.id, filename.replace(/\.jsonl$/i, ''))
        result[filename || id] = await this.historyTranscript(id)
      }
      return result
    }
    if (method === 'chat.historyDetail') {
      const chat = text(params.chat)
      const found = data.readConversationCatalog().find(item => item.id === chat && item.metadata.characterId === text(params.characterId))
      if (!found) throw new Error('找不到属于该角色的聊天。')
      return this.historyTranscript(found.id)
    }
    if (method.startsWith('import.')) return this.importRaw(conversationId, method, params)
    throw new Error(`ElecKoi 尚未注册原生操作：${method}`)
  }

  private async historyTranscript(conversationId: string): Promise<unknown[]> {
    const details = this.owner.eleckoiProductData.readConversationDetails(conversationId)
    const snapshot = await this.snapshot(conversationId)
    return [{ user_name: details.metadata.characterPersona.user_name, character_name: details.metadata.characterName,
      create_date: details.conversation.createdAt, chat_metadata: clone(object(snapshot.chatMetadata)) },
      ...array(snapshot.messages).map(value => {
        const message = object(value)
        return { name: text(message.speakerName), is_user: message.role === 'user', is_system: message.role === 'system' || message.isHidden === true,
          send_date: message.createdAt, mes: text(message.content), swipe_id: message.swipeId ?? 0,
          swipes: clone(message.swipes ?? [text(message.content)]), swipe_info: clone(message.swipesInfo ?? []),
          extra: clone(object(message.extra)), data: clone(object(message.variableState)), native_id: message.id }
      })]
  }

  private async mutateMessages(conversationId: string, method: string, params: RecordValue, state: RecordValue): Promise<unknown> {
    if (!conversationId) throw new Error('修改消息需要当前聊天。')
    return this.owner.eleckoiConversationLifecycle.exclusive(conversationId, async () => {
      await this.owner.eleckoiRoleplaySessions.prepareSessionAccess(conversationId)
      const snapshot = await this.snapshot(conversationId)
      const rows = array(snapshot.messages).map(object)
      let desired = rows.map(row => ({ ...row }))
      const find = (id: string) => {
        const row = desired.find(item => item.id === id)
        if (!row) throw new Error(`聊天中不存在消息：${id}`)
        return row
      }
      if (method === 'messages.update') {
        for (const value of array(params.updates)) {
          const update = object(value), row = find(text(update.id)), patch = clone(object(update.patch))
          Object.assign(row, patch)
          const swipes = array(row.swipes)
          if (swipes.length) {
            const selected = Number(row.swipeId ?? 0)
            if (!Number.isSafeInteger(selected) || selected < 0 || selected >= swipes.length) throw new RangeError('候选回复下标超出范围。')
            if (patch.content !== undefined) swipes[selected] = patch.content
            row.content = swipes[selected]
            row.swipes = swipes
            if (Array.isArray(row.swipesData) && row.swipesData[selected] !== undefined && patch.variableState === undefined) row.variableState = row.swipesData[selected]
          }
          row.contentEdited = patch.content !== undefined || patch.swipes !== undefined || patch.swipeId !== undefined
        }
      } else if (method === 'messages.create') {
        const at = params.beforeId == null ? desired.length : desired.indexOf(find(text(params.beforeId)))
        desired.splice(at, 0, ...array(params.messages).map(value => ({ ...clone(object(value)), contentEdited: true })))
      } else if (method === 'messages.delete') {
        const ids = new Set(array(params.ids).map(String)); ids.forEach(find)
        desired = desired.filter(row => !ids.has(text(row.id)))
      } else {
        const ids = array(params.ids).map(String)
        if (ids.length !== desired.length || new Set(ids).size !== desired.length) throw new Error('重排消息必须包含当前聊天的每条消息且不能重复。')
        desired = ids.map(find)
      }
      const opening = desired.find(item => item.id === 'opening')
      if (opening && desired[0] !== opening) {
        // Materialize a moved greeting into the Session so its new position is real.
        opening.id = undefined; opening.contentEdited = true
      }
      const previous = rows.filter(row => row.id !== 'opening').map(row => ({ id: text(row.id), eventSeq: Number(row.sessionEventSeq),
        role: text(row.role) as 'user' | 'assistant' | 'system', content: text(row.rawContent, text(row.content)) }))
      const ordered = desired.filter(row => row.id !== 'opening')
      const input = ordered.map(row => {
        let content = text(row.content)
        const raw = text(row.rawContent)
        if (row.role === 'assistant' && raw.includes('<FINAL>')) content = row.contentEdited
          ? `${raw.slice(0, raw.indexOf('<FINAL>'))}<FINAL>\n${content}\n</FINAL>` : raw
        return { ...(row.sessionEventSeq === undefined ? {} : { eventSeq: Number(row.sessionEventSeq) }),
          id: text(row.id), role: text(row.role, 'assistant') as 'user' | 'assistant' | 'system', content }
      })
      const sessionId = this.owner.eleckoiProductData.runtimeSessionId(conversationId)
      let checkpoint: { rollback(): void } | undefined
      try {
        await this.owner.eleckoiSessionEditor.transaction(sessionId, async () => {
          const result = await this.owner.eleckoiSessionEditor.batchMessages(sessionId, previous, input)
          checkpoint = this.owner.eleckoiRoleplaySessions.rewriteMessageCheckpoints(conversationId, result.turns,
            result.messages.map((message,index) => ({ turn: message.turn, variableStateJson: JSON.stringify(object(ordered[index]!.variableState)) })))
          const annotations = object(state.messages), next: RecordValue = {}
          for (const [index,message] of result.messages.entries()) {
            const row = ordered[index]!, publicId = text(row.id) || message.id
            const fields: RecordValue = { publicId, role: message.role, variableState: clone(object(row.variableState)) }
            for (const key of ['speakerName', 'isHidden', 'variableState', 'swipeId', 'swipes', 'swipesData', 'swipesInfo', 'extra']) {
              if (row[key] !== undefined) fields[key] = clone(row[key])
            }
            next[message.id] = fields
          }
          if (opening) {
            const saved = desired.find(item => item.id === 'opening')
            if (saved) {
              const fields: RecordValue = { publicId: 'opening', role: saved.role }
              for (const key of ['speakerName', 'isHidden', 'variableState', 'swipeId', 'swipes', 'swipesData', 'swipesInfo', 'extra']) {
                if (saved[key] !== undefined) fields[key] = clone(saved[key])
              }
              next.opening = fields
            }
          }
          annotations[conversationId] = next; state.messages = annotations
          if (!opening || opening.id !== 'opening') {
            const hidden = object(state.hiddenOpenings); hidden[conversationId] = true; state.hiddenOpenings = hidden
          }
          await this.saveState(state)
        })
      } catch (error) { checkpoint?.rollback(); throw error }
      if (opening?.id === 'opening' && opening.contentEdited) await this.owner.eleckoiConversationsApi.updateOpening(conversationId, text(opening.content))
      this.owner.eleckoiConversationChanges.publish({ kind: 'messages', conversationId,
        reason: method === 'messages.delete' ? 'deleted' : 'edited', sessionRewritten: true,
        messageIds: desired.map(row => text(row.id)).filter(Boolean) })
      return (await this.snapshot(conversationId)).messages
    })
  }

  private async worldbookOperation(conversationId: string, method: string, params: RecordValue, state: RecordValue): Promise<unknown> {
    if (method === 'worldbook.timedEffect') {
      if (!conversationId) throw new Error('计时效果需要当前聊天。')
      const book = this.worldbooks(state).find(book => book.name === params.name || book.key === params.name)
      const entry = book?.entries.find(entry => String(entry.uid) === String(params.entry))
      if (!book || !entry) throw new Error('世界书计时条目不存在。')
      const runtime = this.owner.eleckoiProductData.prepareConversationRuntime(conversationId, '')
      const currentCharacterId = this.currentCharacterId(conversationId)
      const runtimeId = book.scope === 'global' ? `global-setting:${entry.id}` : book.ownerId === currentCharacterId
        ? String(entry.id) : `bound-setting:${encodeURIComponent(book.ownerId)}:${entry.id}`
      if (!runtime.conversationContext.settingLibrary?.entries.some(item => item.id === runtimeId))
        throw new Error('该世界书未绑定当前聊天。')
      const kind = text(params.kind)
      const duration = Number(object(entry.effect)[kind] ?? entry[kind] ?? 0)
      return this.owner.eleckoiRoleplaySessions.worldbookTimedEffect(conversationId, runtimeId, kind, duration, params.value)
    }
    const data = this.owner.eleckoiProductData
    const name = text(params.name)
    const all = this.worldbooks(state)
    const found = all.find(item => item.name === name)
    if (method === 'worldbook.list') return all.map(item => item.name)
    if (method === 'worldbook.get') { if (!found) throw new Error(`世界书不存在：${name}`); return clone(found.entries) }
    if (method === 'worldbook.settings') { state.lorebookSettings = { ...object(state.lorebookSettings), ...clone(object(params.data)) }; await this.saveState(state); return state.lorebookSettings }
    if (method === 'worldbook.bindings') {
      const library = data.readGlobalSettingLibrary(), stored = library.worldbookBindings ?? {}
      for (const book of all) stored[book.key] ??= { global: book.scope === 'global' && !book.groupId,
        characterIds: book.scope === 'character' ? [book.ownerId] : [], conversationIds: [],
        primaryCharacterIds: book.scope === 'character' ? [book.ownerId] : [] }
      const scope = text(params.scope), owner = text(params.owner, scope === 'character' ? this.currentCharacterId(conversationId) : conversationId)
      const selection = scope === 'character' ? object(params.names) : {}
      const names = scope === 'global' ? array(params.names).map(String) : scope === 'character'
        ? [selection.primary, ...array(selection.additional)].filter(present).map(String) : params.names == null ? [] : [String(params.names)]
      for (const selected of names) if (!all.some(book => book.name === selected)) throw new Error(`世界书不存在：${selected}`)
      if (!['global', 'character', 'chat'].includes(scope)) throw new Error(`世界书绑定归属无效：${scope}`)
      if (scope !== 'global' && !owner) throw new Error('绑定需要指定角色或聊天。')
      for (const book of all) {
        const binding = stored[book.key]!, selected = names.includes(book.name)
        if (scope === 'global') binding.global = selected
        else if (scope === 'character') {
          binding.characterIds = binding.characterIds.filter(id => id !== owner)
          binding.primaryCharacterIds = (binding.primaryCharacterIds ?? []).filter(id => id !== owner)
          if (selected) binding.characterIds.push(owner)
          if (selection.primary === book.name) binding.primaryCharacterIds.push(owner)
        } else {
          binding.conversationIds = binding.conversationIds.filter(id => id !== owner)
          if (selected) binding.conversationIds.push(owner)
        }
      }
      data.saveGlobalSettingLibrary({ ...library, worldbookBindings: stored })
      this.owner.eleckoiCharacterConfigurationChanges.publish({ kind: 'configuration', domain: 'settingLibraries', characterId: library.characterId })
      return this.worldbookBindings()
    }
    if (method === 'worldbook.getOrCreateChat') {
      const owner = text(params.owner, conversationId)
      if (!owner) throw new Error('聊天世界书需要指定聊天。')
      const current = object(this.worldbookBindings().chat)[owner]
      if (current) return current
      const nextName = text(params.name, `聊天设定-${owner}`)
      if (!all.some(book => book.name === nextName)) await this.worldbookOperation(owner, 'worldbook.create', { name: nextName, entries: [] }, state)
      await this.worldbookOperation(owner, 'worldbook.bindings', { scope: 'chat', owner, names: nextName }, state)
      return nextName
    }
    if (method === 'worldbook.create') {
      if (found) return false
      if (!name.trim()) throw new TypeError('世界书名称不能为空。')
      const library = data.readGlobalSettingLibrary(), id = randomUUID(), now = new Date().toISOString()
      data.replaceGlobalSettingLibraryContent({ ...library, groups: [...library.groups, { id, name, parentId: '', order: library.groups.length + 1,
        treeViewOrder: library.groups.length, createdAt: now, updatedAt: now, sillyTavern: { worldbook: true } }] })
      await this.worldbookOperation(conversationId, 'worldbook.replace', params, state)
      return true
    }
    if (method === 'worldbook.delete') {
      if (!found) return false
      const library = found.scope === 'global' ? data.readGlobalSettingLibrary() : data.readSettingLibrary(found.ownerId)
      const selected = new Set(found.entries.map(entry => String(entry.id)))
      const groups = new Set(found.groupId ? [found.groupId] : [])
      for (let changed = true; changed;) {
        changed = false
        for (const group of library.groups) if (groups.has(group.parentId) && !groups.has(group.id)) { groups.add(group.id); changed = true }
      }
      const next = { ...library, entries: library.entries.filter(entry => !selected.has(entry.id)), groups: library.groups.filter(group => !groups.has(group.id)) }
      if (found.scope === 'global') data.replaceGlobalSettingLibraryContent(next)
      else data.replaceSettingLibraryContent(found.ownerId, next)
      const global = data.readGlobalSettingLibrary(), bindings = global.worldbookBindings ?? {}
      bindings[found.key] = { global: false, characterIds: [], conversationIds: [], primaryCharacterIds: [], deleted: true }
      data.saveGlobalSettingLibrary({ ...global, worldbookBindings: bindings })
      this.owner.eleckoiCharacterConfigurationChanges.publish({ kind: 'configuration', domain: 'settingLibraries', characterId: found.ownerId })
      return true
    }
    if (!found) throw new Error(`原生设定库不存在：${name}`)
    let entries = array(params.entries).map(object)
    if (method === 'worldbook.createEntries') {
      const previous = found!.entries
      let uid = Math.max(0, ...previous.map(entry => Number(entry.uid) || 0)) + 1
      entries = [...previous, ...entries.map(entry => ({ ...entry, uid: entry.uid ?? uid++ }))]
    } else if (method === 'worldbook.deleteEntries') { const selected = array(params.ids).map(String); entries = found!.entries.filter(entry => !selected.includes(String(entry.uid ?? entry.id))) }
    else if (method !== 'worldbook.replace') throw new Error(`未知世界书操作：${method}`)
    entries = entries.map((entry, index) => ({ ...entry, uid: entry.uid ?? entry.id ?? index }))
    const library = found.scope === 'global' ? data.readGlobalSettingLibrary() : data.readSettingLibrary(found.ownerId)
    const fields = object(state.worldbookEntryFields)
    const native = entries.map((entry, index) => {
      const previous = found.entries.find(item => String(item.uid) === String(entry.uid))
      const item = this.nativeEntry({ ...entry, id: text(entry.id, text(previous?.id, randomUUID())), kind: 'normal' }, index)
      item.kind = 'normal'
      if (found.groupId) item.groupId = found.groupId
      item.openingMessages = []
      item.defaultOpeningMessageId = ''
      const unknown = clone(entry)
      const positionMetadata = clone(object(entry.position))
      for (const key of ['role', 'order']) delete positionMetadata[key]
      for (const key of Object.keys(item)) delete unknown[key]
      for (const key of ['id', 'name', 'title', 'comment', 'content', 'key', 'keysecondary', 'keywords', 'conditionKeywords', 'disable', 'enabled', 'constant', 'kind', 'openingMessages', 'defaultOpeningMessageId', 'createdAt', 'updatedAt']) delete unknown[key]
      if (Object.keys(positionMetadata).length) unknown.position = positionMetadata
      fields[`${found.ownerId}:${item.id}`] = unknown
      item.sillyTavern = remoteJson({ ...unknown, name: text(entry.name, text(entry.comment, item.title)), comment: text(entry.comment, item.title) }) as TavernCompatibilityRecord
      return item
    })
    const selectedIds = new Set(found.entries.map(entry => String(entry.id)))
    const protectedEntries = library.entries.filter(entry => !selectedIds.has(entry.id))
    const protectedIds = new Set(protectedEntries.map(entry => entry.id))
    if (native.some(entry => protectedIds.has(entry.id))) throw new Error('普通条目编号不能覆盖原生开场白或其他受保护条目。')
    const titles = new Set<string>()
    for (const entry of native) {
      const base = entry.title || `设定 ${String(entry.sillyTavern?.uid ?? native.indexOf(entry))}`
      let title = base, suffix = 2
      while (titles.has(`${entry.groupId}:${title.toLocaleLowerCase()}`)) title = `${base} (${suffix++})`
      entry.title = title; titles.add(`${entry.groupId}:${title.toLocaleLowerCase()}`)
    }
    if (new Set(native.map(entry => entry.id)).size !== native.length) throw new Error('设定库条目编号不能重复。')
    if (found.scope === 'global') data.replaceGlobalSettingLibraryContent({ ...library, entries: [...protectedEntries, ...native] })
    else data.replaceSettingLibraryContent(found.ownerId, { ...library, entries: [...protectedEntries, ...native] })
    state.worldbookEntryFields = fields
    this.owner.eleckoiCharacterConfigurationChanges.publish({ kind: 'configuration', domain: 'settingLibraries', characterId: found.ownerId })
    await this.saveState(state)
    return native.map((entry, index) => this.publicEntry(entry, index, state, found.ownerId))
  }

  private async importRaw(conversationId: string, method: string, params: RecordValue): Promise<unknown> {
    const data = this.owner.eleckoiProductData
    const raw = text(params.raw), name = text(params.name, 'Import.json')
    const document = { displayName: name, mimeType: text(params.mimeType, 'application/json'), base64: text(params.base64, Buffer.from(raw).toString('base64')) }
    if (method === 'import.character') {
      const bytes = Buffer.from(document.base64, 'base64')
      const chunks = isPng(bytes) ? readPngText(bytes) : undefined
      const encoded = chunks?.get('ccv3')?.trim() || chunks?.get('chara')?.trim()
      const original = object(JSON.parse(encoded ? Buffer.from(encoded, 'base64').toString('utf8') : bytes.toString('utf8')))
      const preview = data.prepareCharacterImports([document], 'sillytavern')
      const result = data.commitCharacterImports(preview.token)
      const state = this.state(), fields = object(state.characterFields)
      for (const id of result.importedCharacterIds) fields[id] = { ...clone(original), ...clone(object(original.data)) }
      state.characterFields = fields
      await this.saveState(state)
      this.owner.eleckoiProductRecordChanges.publish({ kind: 'records', domain: 'characters', ids: result.importedCharacterIds })
      return result
    }
    if (method === 'import.preset') return data.importAgentPreset('sillytavern', document, 'roleplay')
    if (method === 'import.chat') return this.owner.eleckoiConversationsApi.importArchive(this.currentCharacterId(conversationId), raw)
    if (method === 'import.worldbook') { const parsed = JSON.parse(raw); const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : Object.values(parsed.entries ?? {}); return this.dispatch(conversationId, 'worldbook.create', { name: name.replace(/\.[^.]+$/, ''), entries }) }
    if (method === 'import.regex') {
      const characterId = this.currentCharacterId(conversationId), collection = data.readRegexRules(characterId)
      return data.importRegexRules(characterId, 'Global', [{ displayName: name, json: raw }], collection.revision)
    }
    throw new Error(`未知导入操作：${method}`)
  }
}
