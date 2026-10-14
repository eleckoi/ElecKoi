import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-plugin-manager'
import { BlockAssembler, ReasoningEffortId, ToolCallId, createAssistantMessage, createSystemMessage, createUserMessage, createToolResultMessage,
  type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { NativeTavernTokenizers } from './tavern-tokenizer-operations.js'
import { randomUUID } from 'node:crypto'
import type { TavernAuxiliaryGenerationEvent, TavernAuxiliaryGenerationResult, TavernCompatibilityRecord, TavernCompatibilityJson } from './types.js'
import { discoverDraftModels, readModelApiKey } from './modelConnection.js'
import { createAuxiliaryModelConnection } from './auxiliaryModelAdapter.js'
import { TavernExtensionInstallations } from './tavern-extension-installations.js'
import { TavernExtensionAssets } from './tavern-extension-assets.js'
import { NativeTavernMediaOperations } from './tavern-media-operations.js'
import { NativeTavernSpeechOperations } from './tavern-speech-operations.js'
import { NativeTavernNetworkOperations } from './tavern-network-operations.js'
import { NativeTavernDataBankOperations, type DataBankPromptContribution } from './tavern-databank-operations.js'

type Value = Record<string, unknown>
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {}
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const copy = <T>(value: T): T => structuredClone(value)
const generationJson = (value: unknown): TavernCompatibilityJson => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(generationJson)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,item]) => item !== undefined).map(([key,item]) => [key,generationJson(item)]))
  throw new TypeError('模型回放数据必须可序列化为 JSON。')
}


const methods = new Set([
  'configuration.list', 'configuration.get', 'configuration.describe', 'configuration.set', 'configuration.replace',
  'connections.list', 'connections.get', 'connections.current', 'connections.select', 'connections.models', 'connections.modelInfo', 'connections.configure',
  'tokens.count', 'tokens.encode', 'tokens.decode', 'tokens.encodings', 'tokens.register', 'tokens.unregister',
  'generation.auxiliary', 'generation.raw', 'auxiliary.generate', 'generation.cancel', 'generation.stop', 'generation.stopAll',
  'generation.details',
  'generation.models', 'generation.prepare', 'worldbook.prompt',
  'extensions.manifest', 'extensions.template',
  'extensions.list', 'extensions.isInstalled', 'extensions.install', 'extensions.uninstall', 'extensions.enable', 'extensions.disable', 'extensions.update', 'extensions.reinstall', 'extensions.info'
])

/** Dispatch existing profile/LLM services; token codecs contain actual BPE tables. */
export class NativeTavernOperations {
  private readonly databank: NativeTavernDataBankOperations
  private readonly media: NativeTavernMediaOperations
  private readonly speech: NativeTavernSpeechOperations
  private readonly network: NativeTavernNetworkOperations
  private readonly modelTokenizers = new NativeTavernTokenizers((url, init) => this.network.fetchResponse(url, init))
  private activeTokenizer: { model: string; encoding: string } = { model: '', encoding: 'cl100k_base' }
  private readonly generations = new Map<string, AbortController>()
  private readonly generationDetails = new Map<string, Value>()

  constructor(private readonly owner: Context) {
    this.media = new NativeTavernMediaOperations(owner)
    this.speech = new NativeTavernSpeechOperations(owner)
    this.network = new NativeTavernNetworkOperations(owner)
    this.databank = new NativeTavernDataBankOperations(owner)
    owner.effect(() => () => {
      for (const controller of this.generations.values()) controller.abort(new Error('ElecKoi Host 已卸载。'))
      this.generations.clear(); this.modelTokenizers.dispose(); this.generationDetails.clear()
    })
  }

  collectDataBankPrompt(conversationId: string, history: Array<{ role: string; content: string; hidden?: boolean; is_system?: boolean }>, signal?: AbortSignal): Promise<DataBankPromptContribution | null> {
    return this.databank.collectDataBankPrompt(conversationId, history, signal)
  }

  matchWorldbookEntries(conversationId: string, entries: Array<{ id: string; content: string }>, query: string, options: Value = {}, signal?: AbortSignal): Promise<string[]> {
    return this.databank.matchWorldbookEntries(conversationId, entries, query, options, signal)
  }

  has(method: string): boolean { return methods.has(method) || this.media.has(method) || this.databank.has(method) || this.speech.has(method) || this.network.has(method) }
  concurrent(method: string): boolean { return this.network.concurrent(method) || this.speech.concurrent(method) || this.databank.concurrent(method) || this.media.concurrent(method) || /^(?:generation\.|auxiliary\.)/.test(method) || method === 'worldbook.prompt' || method === 'extensions.install' }

  private descriptor(namespace: string) {
    const descriptor = this.owner.settings.describe({ redactSecrets: true }).find(item => item.ns === namespace)
    if (!descriptor) throw new Error(`原生配置命名空间不存在：${namespace}`)
    return descriptor
  }

  private path(params: Value): string[] {
    if (params.path === undefined) return []
    if (!Array.isArray(params.path) || params.path.some(part => typeof part !== 'string' || !part)) throw new TypeError('原生配置路径必须是非空字符串数组。')
    return params.path as string[]
  }

  private readPath(value: unknown, path: readonly string[]): unknown {
    let current = value
    for (const part of path) {
      if (!current || typeof current !== 'object' || !Object.hasOwn(current, part)) return undefined
      current = (current as Value)[part]
    }
    return copy(current)
  }

  private selection(): Value {
    const selected = this.owner.agentDefaultModel.currentSelection()
    return { provider: selected.provider, model: selected.model,
      ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: String(selected.reasoningEffort) }) }
  }

  private connections(): Value[] {
    const settings = this.owner.settings.describe({ redactSecrets: true })
    const entries = object(object(settings.find(item => item.ns === 'eleckoi-client-models')?.value).entries)
    const selected = this.selection()
    const providers = new Map(this.owner.llm.listProviders().map(provider => [provider.id, provider]))
    const directory = this.owner.llm.listConfigurableProviders()
    const result: Value[] = directory.map(item => {
      const stored = object(entries[item.provider])
      const descriptor = settings.find(row => row.ns === item.settingsNs)
      return { ...stored, id: item.provider, provider: item.provider, name: text(stored.name, item.displayName),
        registered: providers.has(item.provider), settingsNamespace: item.settingsNs,
        settingsPath: item.settingsPath, configuration: descriptor ? this.readPath(descriptor.value, item.settingsPath ?? []) : {},
        ...(selected.provider === item.provider ? { model: selected.model } : {}) }
    })
    for (const [id, provider] of providers) if (!result.some(item => item.id === id)) {
      result.push({ ...object(entries[id]), id, provider: id, name: provider.name, registered: true,
        ...(selected.provider === id ? { model: selected.model } : {}) })
    }
    return result
  }

  private async remoteTokenizerParams(params: Value): Promise<Value> {
    const settings = this.owner.settings.describe()
    const tokenizer = object(object(object(settings.find(row => row.ns === 'eleckoi-product-api')?.value).state).tokenizer)
    const explicit = params.encoding ?? params.type
    const requested = explicit === undefined || explicit === 6 || explicit === 99 || explicit === 'api_current' || explicit === 'best_match'
      ? tokenizer.encoding : explicit
    const encoding = requested === 9 ? 'remote-textgenerationwebui' : requested === 10 ? 'remote-kobold' : requested
    if (encoding !== 'remote-textgenerationwebui' && encoding !== 'remote-kobold') return params
    const selected = this.selection(), provider = text(params.provider, text(selected.provider))
    const entry = object(object(object(settings.find(row => row.ns === 'eleckoi-client-models')?.value).entries)[provider])
    const descriptor = this.owner.llm.listConfigurableProviders().find(item => item.provider === provider)
    const configuration = descriptor ? object(this.readPath(settings.find(row => row.ns === descriptor.settingsNs)?.value, descriptor.settingsPath ?? [])) : {}
    const profile = object(object(object(settings.find(row => row.ns === 'llm-pi-ai')?.value).providers)[provider])
    const stored = { ...entry, ...profile, ...configuration }
    const savedUrl = text(stored.url, text(stored.apiurl, text(stored.baseURL, text(stored.base_url))))
    const url = text(params.url, savedUrl)
    const sameOrigin = !params.url || !!savedUrl && new URL(url).origin === new URL(savedUrl).origin
    const headers = Object.fromEntries(Object.entries({ ...(sameOrigin ? object(entry.custom_headers) : {}),
      ...(sameOrigin ? object(profile.headers) : {}), ...(sameOrigin ? object(configuration.headers) : {}), ...object(params.headers) })
      .map(([name, value]) => [name, String(value)]))
    const hasAuthorization = Object.keys(headers).some(name => name.toLowerCase() === 'authorization')
    if (sameOrigin && !hasAuthorization && (entry.credentialRef || profile.apiKeyEnv || configuration.apiKeyEnv)) {
      headers.Authorization = `Bearer ${await readModelApiKey(this.owner, provider)}`
    }
    return { ...params, encoding, url, headers, model: text(params.model, text(selected.model, text(entry.model))),
      apiType: text(params.apiType, text(params.api_type, text(stored.apiType, text(stored.api_type, text(stored.type))))) }
  }

  async snapshot(): Promise<Value> {
    const manager = this.owner.get('pluginManager')
    const extensions = manager ? await manager.listBundles() : Array.from(this.owner.root.registry.values()).filter(runtime => runtime.name)
      .map(runtime => ({ name: runtime.name, enabled: Array.from(runtime.fibers).some(fiber => fiber.state === 2), kind: 'native-plugin' }))
    const installations = new TavernExtensionInstallations(this.owner)
    const assets = new TavernExtensionAssets(this.owner, extensions.flatMap(bundle => bundle.name ? [bundle.name] : []))
    return { connections: this.connections(), selectedConnection: this.selection(), extensions: await Promise.all(extensions.map(async bundle => {
      const installation = bundle.name ? installations.read(bundle.name) : undefined
      return { ...bundle, ...(installation ? { installation } : {}), ...(manager && bundle.name ? { manifest: await assets.manifest(bundle.name) } : {}) }
    })), administration: { writable: this.owner.settings.writable && !!manager },
      versions: { tavernHelper: '0.1.0', tavernCompatibility: '0.1.0', sillyTavern: '1.19.0' } }
  }

  async invoke(method: string, params: Value): Promise<unknown> {
    if (this.network.has(method)) return this.network.invoke(method, params)
    if (this.speech.has(method)) return this.speech.invoke(method, params)
    if (this.media.has(method)) return this.media.invoke(method, params)
    if (this.databank.has(method)) return this.databank.invoke(method, params)
    if (method === 'configuration.list') return this.owner.settings.describe({ redactSecrets: true }).map(item => ({ namespace: item.ns, value: copy(item.value), revision: item.revision, writable: this.owner.settings.writable }))
    if (method.startsWith('configuration.')) {
      const namespace = text(params.namespace, text(params.ns)), descriptor = this.descriptor(namespace), path = this.path(params)
      if (method === 'configuration.describe') return { namespace, value: copy(descriptor.value), revision: descriptor.revision, writable: this.owner.settings.writable, secrets: descriptor.secrets ?? [] }
      if (method === 'configuration.get') return this.readPath(descriptor.value, path)
      const revision = typeof params.expectedRevision === 'number' ? params.expectedRevision : descriptor.revision
      if (method === 'configuration.replace') {
        if (path.length) throw new Error('整段原生配置替换不接受字段路径。')
        await this.owner.settings.replace(namespace, object(params.value), revision)
      } else if (method === 'configuration.set') {
        if (path.length) await this.owner.settings.mutate(namespace, [{ op: 'set', path, value: params.value }], revision)
        else await this.owner.settings.update(namespace, object(params.value), revision)
      } else throw new Error(`未知原生配置操作：${method}`)
      return this.readPath(this.descriptor(namespace).value, path)
    }
    if (method === 'connections.list') return this.connections()
    if (method === 'connections.current') return this.selection()
    if (method === 'connections.get') {
      const id = text(params.id, text(params.name, text(params.provider)))
      const result = this.connections().find(item => item.id === id || item.name === id)
      if (!result) throw new Error(`原生连接配置不存在：${id}`)
      return result
    }
    if (method === 'connections.models') return this.owner.llm.listModels(text(params.provider, text(params.id)))
    if (method === 'connections.modelInfo') return this.owner.llm.resolveModelInfo(text(params.provider), text(params.model))
    if (method === 'connections.select') {
      const selected = object(params.selection ?? params)
      const resolved = await this.owner.llm.resolveCallConfig({ provider: text(selected.provider, text(selected.id)), model: text(selected.model),
        ...(typeof selected.reasoningEffort === 'string' ? { reasoningEffort: ReasoningEffortId(selected.reasoningEffort) } : {}) })
      await this.owner.agentDefaultModel.saveSelection(resolved)
      return this.selection()
    }
    if (method === 'connections.configure') {
      if (params.namespace !== undefined || params.ns !== undefined) return this.invoke('configuration.set', params)
      const provider = text(params.provider, text(params.id))
      const entry = this.owner.llm.listConfigurableProviders().find(item => item.provider === provider)
      if (!entry) throw new Error(`原生连接没有可写配置目录：${provider}`)
      return this.invoke('configuration.set', { ...params, namespace: entry.settingsNs, path: [...entry.settingsPath] })
    }
    if (method === 'tokens.encodings') return [...this.modelTokenizers.names(), 'gpt2']
    if (method.startsWith('tokens.')) return this.modelTokenizers.invoke(method,
      ['tokens.count', 'tokens.encode', 'tokens.decode'].includes(method) ? await this.remoteTokenizerParams(params) : params)
    if (method === 'worldbook.prompt') {
      const chat = array(params.chat)
      if (chat.some(value => typeof value !== 'string')) throw new TypeError('世界书扫描 chat 必须是倒序文本数组。')
      const prepared = object(await this.invoke('generation.prepare', {
        conversationId: params.conversationId, generationId: params.generationId, isDryRun: params.isDryRun,
        chat_history: [...chat].reverse().map(content => ({ role: 'user', content })),
        pending_input: false, worldbook_turn: chat.length, worldbook_scan_data: object(params.globalScanData),
        worldbook_controls: { ...(params.maxContext === undefined ? {} : { max_context: params.maxContext }) }
      }))
      const round = object(prepared.worldbook_round)
      const fragments = [...array(round.fragments), ...array(round.examples)].map(object)
      const positioned = (...positions: string[]) => fragments.filter(entry => positions.includes(text(entry.worldbookPosition)))
      const contents = (...positions: string[]) => positioned(...positions).reverse().map(entry => text(entry.content))
      const worldInfoBefore = contents('before_character_definition', 'before_base_instructions', 'instructions', 'insert_point_1').join('\n')
      const worldInfoAfter = contents('after_character_definition', 'insert_point_2').join('\n')
      const worldInfoExamples = positioned('before_example_messages', 'before_examples', 'after_example_messages', 'after_examples').reverse()
        .map(entry => ({ position: ['before_example_messages', 'before_examples'].includes(text(entry.worldbookPosition)) ? 0 : 1, content: text(entry.content) }))
      const depths = new Map<string, { depth: number; role: number; entries: string[] }>()
      for (const entry of positioned('at_depth')) {
        const depth = Number(entry.depth) || 0, role = ({ system: 0, user: 1, assistant: 2 } as Record<string, number>)[text(entry.role)] ?? 0
        const key = `${depth}:${role}`, group = depths.get(key) ?? { depth, role, entries: [] }
        group.entries.unshift(text(entry.content)); depths.set(key, group)
      }
      const worldInfoDepth = [...depths.values()]
      const anBefore = contents('top_of_an'), anAfter = contents('bottom_of_an')
      const outletEntries: Record<string, string[]> = {}
      for (const entry of positioned('outlet')) {
        const name = text(entry.outlet)
        if (name) (outletEntries[name] ??= []).push(text(entry.content))
      }
      const activatedEntries = array(prepared.activatedEntries)
      return { worldInfoString: worldInfoBefore + worldInfoAfter, worldInfoBefore, worldInfoAfter,
        worldInfoExamples, worldInfoDepth, anBefore, anAfter, outletEntries, activatedEntries,
        EMEntries: worldInfoExamples, WIDepthEntries: worldInfoDepth, ANBeforeEntries: anBefore, ANAfterEntries: anAfter,
        allActivatedEntries: activatedEntries }
    }
    if (method === 'generation.prepare') {
      const conversationId = text(params.conversationId)
      if (!conversationId) return { injections: [], worldbook_prompts: [] }
      const generationId = text(params.generationId) || randomUUID(), requestId = `auxiliary:${generationId}`
      if (this.generations.has(generationId)) throw new Error(`辅助生成编号正在使用：${generationId}`)
      const controller = new AbortController(), signal = controller.signal
      this.generations.set(generationId, controller)
      try {
      const data = this.owner.eleckoiProductData
      const presetId = text(params.presetId)
      const runtime = data.prepareConversationRuntime(conversationId, text(params.user_input), presetId
        ? { preset: { ...data.readAgentPreset(presetId), entries: [] } } : {})
      const context = runtime.conversationContext
      // Preset prompts are expanded by their public order in the calling realm.
      if (context.settingLibrary) context.settingLibrary = { ...context.settingLibrary,
        entries: context.settingLibrary.entries.filter(entry => !entry.id.startsWith('agent-preset:')) }
      const history = array(params.chat_history).map(value => {
        const item = object(value)
        return { role: text(item.role, 'user'), content: typeof item.content === 'string' ? item.content : array(item.content).map(block => text(object(block).text)).join('\n') }
      })
      if (params.pending_input !== false && params.user_input !== undefined) history.push({ role: 'user', content: text(params.user_input) })
      const dataBank = await this.collectDataBankPrompt(conversationId, history, signal)
      signal.throwIfAborted()
      if (dataBank) context.promptContributions = [...(context.promptContributions ?? []), dataBank]
      const compatibility = object(object(this.owner.settings.describe().find(item => item.ns === 'eleckoi-product-api')?.value).state)
      const scannerModule = '@eleckoi/dsh-client-roleplay/host/worldbook-scanner.mjs'
      const { evaluateWorldbookWithEvents, worldbookRandom, worldbookVectorInputs } = await import(scannerModule)
      const overrides = object(params.overrides), character = data.readCharacters().items.find(item => item.id === context.characterId)
      const card = object(object(character).data), contextual = object(context), controls = object(params.worldbook_controls)
      const scanContext = { ...context, personaDescription: text(overrides.persona_description, text(contextual.personaDescription, text(context.persona.description))),
        characterDescription: text(overrides.char_description, text(contextual.characterDescription, text(card.description, text(object(character).description, text(object(object(character).persona).description))))),
        characterPersonality: text(overrides.char_personality, text(contextual.characterPersonality, text(card.personality, text(object(character).personality)))),
        scenario: text(overrides.scenario, text(contextual.scenario, text(card.scenario, text(object(character).scenario)))), creatorNotes: text(contextual.creatorNotes, text(card.creator_notes, text(object(character).creator_notes))) }
      const globalScanData = object(params.worldbook_scan_data)
      for (const field of ['personaDescription', 'characterDescription', 'characterPersonality', 'characterDepthPrompt', 'scenario', 'creatorNotes', 'trigger']) {
        if (typeof globalScanData[field] === 'string') (scanContext as Value)[field] = globalScanData[field]
      }
      const settings = { ...object(compatibility.lorebookSettings), ...(controls.max_context === undefined ? {} : { max_context: controls.max_context }) }
      const scanText = array(params.scan_injects).map(value => { const content = object(value).content; return typeof content === 'string' ? content : array(content).map(block => text(object(block).text)).join('\n') })
      const vectors = object(object(compatibility.extensionSettings).vectors)
      const vectorSettings = { count: Number(vectors.max_entries ?? 5), threshold: Number(vectors.score_threshold ?? 0.25) }
      const eventApi = this.owner.eleckoiTavernCompatibilityApi
      const preview = params.isDryRun === true
      const tokenCounter = await this.createWorldbookTokenCounter({ ...params, requestId, conversationId }, signal)
      const evaluation = await evaluateWorldbookWithEvents(scanContext, {
            history, turn: Number(params.worldbook_turn ?? history.length), settings,
            state: this.owner.eleckoiRoleplaySessions.readWorldbookState(conversationId), scanText, signal, preview,
            eventSources: eventApi.worldbookEventSources(conversationId, scanContext),
            onEvent: (name: import('./types.js').TavernWorldbookEventName, payload: unknown, key: string) =>
              eventApi.dispatchWorldbookEvent(conversationId, requestId, key, name, payload, signal, preview),
            resolveVectors: async (entries: Value[]) => {
              const matches = new Set<string>()
              const loadedContext = { ...scanContext, settingLibrary: { ...scanContext.settingLibrary, entries } }
              for (const group of worldbookVectorInputs(loadedContext, { history, scanText, settings })) {
                for (const id of await this.matchWorldbookEntries(conversationId, group.entries, group.query, vectorSettings, signal)) matches.add(id)
              }
              return matches
            },
            random: worldbookRandom(requestId), tokenCount: tokenCounter.count,
          })
      signal.throwIfAborted()
      Object.assign(context, { worldbookRound: evaluation.round })
      const round = object(evaluation.round)
      const fragments = new Map([...array(round.fragments), ...array(round.examples)].map(value => {
        const fragment = object(value); return [text(fragment.sourceEntryId, text(fragment.id)), fragment]
      }))
      const library = context.settingLibrary
      const groups = new Map((library?.groups ?? []).map(group => [group.id, group]))
      const bookName = (entry: Value): string => {
        let group = groups.get(text(entry.groupId))
        while (group) {
          if (object(group.sillyTavern).worldbook === true) return group.name
          group = group.parentId ? groups.get(group.parentId) : undefined
        }
        return text(library?.name)
      }
      const positionCodes: Record<string, number> = { before_character_definition: 0, after_character_definition: 1,
        top_of_an: 2, bottom_of_an: 3, at_depth: 4, before_example_messages: 5, before_examples: 5,
        after_example_messages: 6, after_examples: 6, outlet: 7 }
      const entryMap = new Map([...(library?.entries ?? []), ...array(evaluation.activatedEntries)].map(value => { const entry = object(value); return [text(entry.id), entry] }))
      const activatedEntries = array(round.activatedEntryIds).map(value => {
        const id = String(value), entry = object(entryMap.get(id)), raw = object(entry.sillyTavern), fragment = fragments.get(id) ?? {}
        return { ...copy(entry), ...copy(raw), id, uid: entry.uid ?? raw.uid ?? id, world: text(entry.world, text(raw.world, bookName(entry))),
          key: copy(raw.key ?? object(raw.strategy).keys ?? entry.keywords ?? []), keysecondary: copy(raw.keysecondary ?? object(object(raw.strategy).keys_secondary).keys ?? entry.conditionKeywords ?? []),
          content: text(fragment.content, text(entry.content)), comment: text(raw.comment, text(entry.title)),
          position: positionCodes[text(fragment.worldbookPosition)] ?? raw.position ?? entry.position,
          role: ({ system: 0, user: 1, assistant: 2 } as Record<string, number>)[text(fragment.role)] ?? 0,
          depth: Number(fragment.depth) || 0, order: Number(fragment.order ?? entry.order) || 0,
          disable: false, constant: object(raw.strategy).type === 'constant' || raw.constant === true }
      })
      const managed = new Set(array(round.managedEntryIds).map(String))
      const nativeContext = { ...context, worldbookRound: undefined, ...(context.settingLibrary ? { settingLibrary: { ...context.settingLibrary, entries: context.settingLibrary.entries.filter(entry => !managed.has(entry.id)) } } : {}) }
      const promptPositions = new Map((context.settingLibrary?.promptPositions ?? []).map(item => [item.id, item]))
      const authorNote = object(round.authorNote)
      const worldbookPrompts = [...array(round.fragments), ...array(round.examples)].map(value => {
        const item = object(value), placement = object(item.nativePlacement)
        return { id: text(item.id), content: text(item.content), role: text(item.role, 'system'),
          position: Object.keys(placement).length ? promptPositions.get(text(placement.promptPositionId))?.anchor ?? text(placement.position, text(item.anchor)) : item.worldbookPosition === 'at_depth' ? 'at_depth' : item.worldbookPosition === 'outlet' ? 'outlet' : item.worldbookPosition === 'top_of_an' ? 'beforeAuthorNote' : item.worldbookPosition === 'bottom_of_an' ? 'afterAuthorNote' : text(item.anchor),
          ...(item.depth === undefined ? {} : { depth: Number(item.depth) }), order: Number(item.order) || 0 }
      })
      if (typeof controls.author_note === 'string' || authorNote.content || worldbookPrompts.some(item => ['beforeAuthorNote', 'afterAuthorNote'].includes(item.position))) worldbookPrompts.push({
        id: 'authors-note', content: text(controls.author_note, text(authorNote.content)), role: text(authorNote.role, 'system'),
        position: ({ before_prompt: 'beforeBaseInstructions', in_prompt: 'insert_point_2', in_chat: 'at_depth', none: 'none' } as Record<string, string>)[text(authorNote.position, 'in_chat')] ?? text(authorNote.position, 'at_depth'),
        depth: Number(authorNote.depth) || 0, order: Number(authorNote.order) || 0
      })
      const contributions = new Map((context.promptContributions ?? []).map(entry => [entry.id, entry]))
      const projectionModule = '@eleckoi/dsh-client-roleplay/host/conversation-context.mjs'
      const { settingInjections } = await import(projectionModule)
      return { worldbook_round: round, activatedEntries, worldbook_prompts: worldbookPrompts, injections: settingInjections(nativeContext).map((item: Value) => ({
        content: item.content, role: item.role, anchor: item.anchor, order: item.order,
        ...(item.anchor === 'chat_depth' ? { depth: item.depth } : {}),
        ...(contributions.has(String(item.id)) ? { source: text(object(contributions.get(String(item.id))).source, 'persona') } : {}),
      })) }
      } finally {
        this.generations.delete(generationId)
        await this.owner.eleckoiTavernCompatibilityApi.releaseMainPrompts(conversationId, requestId)
      }
    }
    if (method === 'generation.details') {
      const id = text(params.generationId, text(params.generation_id))
      const found = this.generationDetails.get(id)
      if (!found) throw new Error(`没有该生成任务的记录：${id}`)
      return copy(found)
    }
    if (method === 'generation.models') {
      const api=object(params.custom_api)
      return (await discoverDraftModels(this.owner,{configId:'eleckoi-auxiliary',api:'openai-completions',baseURL:text(api.apiurl),apiKey:text(api.key),headers:{}})).map(item=>item.id)
    }
    if (method === 'generation.cancel' || method === 'generation.stop') return this.cancel(text(params.generationId, text(params.id)))
    if (method === 'generation.stopAll') { const ids = [...this.generations.keys()]; for (const id of ids) this.cancel(id); return { cancelledIds: ids } }
    if (method === 'generation.auxiliary' || method === 'generation.raw' || method === 'auxiliary.generate') {
      let result: TavernAuxiliaryGenerationResult | undefined
      for await (const event of this.generate(params)) if (event.kind === 'finished') result = event
      if (!result) throw new Error('辅助生成没有正式结束结果。')
      return result
    }
    if (method.startsWith('extensions.')) return this.extension(method, params)
    throw new Error(`原生兼容操作尚未注册：${method}`)
  }

  /** Capture this scan's model, vocabulary and remote endpoint without loading unused resources. */
  async createWorldbookTokenCounter(params: Value = {}, signal?: AbortSignal): Promise<{ encoding: string; count: (content: string) => number | Promise<number> }> {
    signal?.throwIfAborted()
    const selected = this.selection(), custom = object(params.custom_api)
    const compatibility = object(object(this.owner.settings.describe().find(item => item.ns === 'eleckoi-product-api')?.value).state)
    const tokenizer = object(compatibility.tokenizer)
    const requested = tokenizer.encoding ?? params.encoding ?? params.type
    const model = text(custom.model, text(params.model, text(selected.model)))
    const provider = text(params.provider, text(selected.provider))
    const input = { ...params, model, provider, ...(requested === undefined ? {} : { encoding: requested }),
      ...(typeof custom.apiurl === 'string' ? { url: custom.apiurl } : {}),
      ...(typeof custom.key === 'string' && custom.key ? { headers: { ...object(params.headers), Authorization: `Bearer ${custom.key}` } } : {}) }
    const captured = await this.remoteTokenizerParams(input)
    signal?.throwIfAborted()
    if (captured.encoding === 'remote-textgenerationwebui' || captured.encoding === 'remote-kobold') {
      const counts = new Map<string, Promise<number>>()
      return { encoding: captured.encoding, count: (content: string) => {
        signal?.throwIfAborted()
        let pending = counts.get(content)
        if (!pending) {
          pending = (async () => {
            const value = await this.modelTokenizers.remote('tokens.count', { ...captured, text: content, signal,
              requestId: `${text(captured.requestId, 'worldbook')}:token:${randomUUID()}` })
            signal?.throwIfAborted()
            if (typeof value !== 'number') throw new TypeError('远端 tokenizer 未返回 token 数量。')
            return value
          })()
          counts.set(content, pending)
          pending.catch(() => { if (counts.get(content) === pending) counts.delete(content) })
        }
        return pending
      } }
    }
    const encoding = typeof requested === 'string' || typeof requested === 'number' ? requested : undefined
    const codec = this.modelTokenizers.captureCounter(model, encoding)
    let ready: Promise<string> | undefined
    return { encoding: codec.encoding, count: async (content: string) => {
      signal?.throwIfAborted()
      await (ready ??= this.modelTokenizers.prepare(model, encoding))
      signal?.throwIfAborted()
      return codec.count(content)
    } }
  }

  async prepareTokenCounter(model = '', encoding?: string | number): Promise<string> {
    const selected = this.selection(), selectedModel = model || text(selected.model)
    const chosen = encoding ?? (selectedModel ? undefined : 'cl100k_base')
    const result = await this.modelTokenizers.prepare(selectedModel, chosen)
    this.activeTokenizer = { model: selectedModel, encoding: result }
    return result
  }

  countTokens(content: string, encoding?: string): number {
    const chosen = encoding ?? this.activeTokenizer.encoding
    if (String(chosen).startsWith('remote-')) throw new Error('远端 tokenizer 只能异步调用，不能用于同步世界书预算。')
    return this.modelTokenizers.count(content, this.activeTokenizer.model, chosen)
  }

  cancel(generationId: string): { generationId: string; cancelled: boolean } {
    const controller = this.generations.get(generationId)
    if (!controller) return { generationId, cancelled: false }
    controller.abort(new Error('辅助生成已取消。'))
    return { generationId, cancelled: true }
  }

  /** True streaming LLM call; no Session or conversation transcript is written. */
  async *generate(params: Value, externalSignal?: AbortSignal): AsyncIterable<TavernAuxiliaryGenerationEvent> {
    const generationId = text(params.generationId, text(params.generation_id, randomUUID()))
    if (this.generations.has(generationId)) throw new Error(`辅助生成编号正在使用：${generationId}`)
    const controller = new AbortController()
    const abort = () => controller.abort(externalSignal?.reason)
    if (externalSignal?.aborted) externalSignal.throwIfAborted()
    externalSignal?.addEventListener('abort', abort, { once: true })
    this.generations.set(generationId, controller)
    const assembler = new BlockAssembler()
    let temporary: Awaited<ReturnType<typeof createAuxiliaryModelConnection>> | undefined
    const startedAt = Date.now()
    try {
      const defaultSelection = this.owner.agentDefaultModel.currentSelection()
      const input = { ...object(params.config), ...params }
      const custom = object(input.custom_api)
      let provider = text(input.provider, defaultSelection.provider), model = text(custom.model, text(input.model, defaultSelection.model))
      let llm = this.owner.llm
      const customParameters = ['max_tokens','temperature','frequency_penalty','presence_penalty','top_p','top_k']
      const extended = input.tool_choice !== undefined || input.json_schema !== undefined || customParameters.some(key => custom[key] !== undefined)
        || input.frequency_penalty !== undefined || input.presence_penalty !== undefined || input.top_k !== undefined
        || custom.source === 'custom' || array(input.messages).some(value => object(value).replayState || object(value).reasoning_signature
          || array(object(value).tool_calls).some(call => object(call).thought_signature))
      if (presentCustomEndpoint(input) || extended) {
        temporary = await createAuxiliaryModelConnection(this.owner, provider, model, input)
        provider = temporary.provider; llm = temporary.context.llm
      }
      const selection = await llm.resolveCallConfig({ provider, model,
        ...(typeof input.reasoningEffort === 'string' ? { reasoningEffort: ReasoningEffortId(input.reasoningEffort) } :
          input.reasoningEffort === undefined && defaultSelection.reasoningEffort !== undefined ? { reasoningEffort: defaultSelection.reasoningEffort } : {}) })
      const messages: GenerateOptions['messages'] = []
      const supplied = input.messages ?? input.prompts
      const rawMessages = supplied === undefined ? [{ role: 'user', content: text(input.prompt, text(input.user_input)) }] : array(supplied)
      for (const value of rawMessages) {
        const message = object(value), role = text(message.role, 'user')
        const blocks: import('@deepseek-ai/dsh-llm').ContentBlock[] = []
        const replayMetadata: Value[] = []
        if (role === 'assistant' && typeof message.reasoning === 'string') {
          blocks.push({ type: 'reasoning', text: message.reasoning }); replayMetadata.push({ type: 'reasoning', thinkingSignature: message.reasoning_signature })
        }
        const contents = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : array(message.content)
        for (const content of contents) {
          const block = object(content)
          if (block.type === 'text' || block.type === 'reasoning') {
            blocks.push({ type: block.type, text: text(block.text) })
            replayMetadata.push({type:block.type,...(block.type==='reasoning'&&block.signature?{thinkingSignature:block.signature}:{}),...(block.type==='text'&&block.signature?{textSignature:block.signature}:{})})
          }
          else if (block.type === 'tool-call') {
            blocks.push({ type: 'tool-call', id: ToolCallId(text(block.id)), name: text(block.name), arguments: text(block.arguments) })
            replayMetadata.push({type:'tool-call',...(block.thoughtSignature?{thoughtSignature:block.thoughtSignature}:{})})
          }
          else if (block.type === 'image' || block.type === 'image_url') {
            if (block.attachment) blocks.push(copy(block) as unknown as import('@deepseek-ai/dsh-llm').ImageBlock)
            else blocks.push(await this.imageBlock(block, controller.signal))
          } else if (block.type === 'file' && block.attachment) blocks.push(copy(block) as unknown as import('@deepseek-ai/dsh-llm').ContentBlock)
          else throw new TypeError(`不支持的模型消息块：${String(block.type)}`)
        }
        for (const callValue of array(message.tool_calls)) {
          const call = object(callValue), fn = object(call.function)
          blocks.push({ type: 'tool-call', id: ToolCallId(text(call.id)), name: text(fn.name), arguments: text(fn.arguments) })
          replayMetadata.push({type:'tool-call',...(call.thought_signature?{thoughtSignature:call.thought_signature}:{})})
        }
        if (role === 'system') messages.push(createSystemMessage(blocks.filter(block => block.type === 'text').map(block => block.text).join('')))
        else if (role === 'user') messages.push(createUserMessage({ source: { kind: 'user' }, content: blocks }))
        else if (role === 'assistant') messages.push(createAssistantMessage({ source: { provider, model,
          ...(message.replayState ? { replayState: copy(message.replayState) } : replayMetadata.some(item => item.thinkingSignature || item.thoughtSignature || item.textSignature) ?
            { replayState: { response: {kind:'pi-ai',version:2,provider,model,stopReason:blocks.some(item=>item.type==='tool-call')?'toolUse':'stop'}, blocks: replayMetadata } } : {})
        }, content: blocks }))
        else if (role === 'tool') messages.push(createToolResultMessage({ callId: ToolCallId(text(message.tool_call_id, text(message.callId))), content: blocks, isError: Boolean(message.isError) }))
        else throw new Error(`未知模型消息角色：${role}`)
      }
      if (input.image !== undefined || input.images !== undefined) {
        const images = Array.isArray(input.images ?? input.image) ? array(input.images ?? input.image) : [input.images ?? input.image]
        const blocks = await Promise.all(images.map(image => this.imageBlock(typeof image === 'string' ? { url: image } : object(image), controller.signal)))
        messages.push(createUserMessage({ source: { kind: 'user' }, content: blocks }))
      }
      if (!messages.length) throw new Error('辅助生成消息列表不能为空。')
      const options: GenerateOptions = { ...selection, messages, signal: controller.signal }
      if (typeof input.system === 'string') options.system = input.system
      if (Array.isArray(input.tools)) options.tools = input.tools.map(value => { const item = object(value), fn = object(item.function ?? item); return { name: text(fn.name), description: text(fn.description), parameters: object(fn.parameters) } })
      for (const [key, alternative] of [['temperature', 'temperature'], ['topP', 'top_p'], ['maxTokens', 'max_tokens']] as const) {
        const override = custom[key] ?? custom[alternative]
        const value = override === 'unset' ? undefined : override === undefined || override === 'same_as_preset' ? input[key] ?? input[alternative] : override
        if (value !== undefined) {
          if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || key === 'maxTokens' && (!Number.isSafeInteger(value) || value < 1)) throw new TypeError(`生成参数 ${key} 无效。`)
          options[key] = value
        }
      }
      if (input.stop !== undefined) {
        if (!Array.isArray(input.stop) || input.stop.some(item => typeof item !== 'string')) throw new TypeError('stop 必须是文本数组。')
        options.stop = input.stop as string[]
      }
      this.generationDetails.set(generationId, { generation_id: generationId, generationId, provider, model, startedAt, status: 'running', messages: copy(rawMessages) })
      yield { kind: 'started', generationId, provider, model }
      let output = '', reasoning = '', finished = false, rawReplay: import('@deepseek-ai/dsh-llm').ReplayEnvelope | undefined
      for await (const chunk of llm.stream(options)) {
        controller.signal.throwIfAborted()
        assembler.push(chunk)
        if (chunk.type === 'finish') { finished = true; rawReplay = chunk.replayState }
        if (chunk.type === 'text-delta') { output += chunk.text; yield { kind: 'delta', generationId, delta: chunk.text, text: output } }
        if (input.json_schema !== undefined && chunk.type === 'tool-call-delta') { output += chunk.argumentsDelta; yield { kind: 'delta', generationId, delta: chunk.argumentsDelta, text: output } }
        if (chunk.type === 'reasoning-delta') { reasoning += chunk.text; yield { kind: 'reasoning', generationId, delta: chunk.text, reasoning } }
      }
      controller.signal.throwIfAborted()
      if (!finished) throw new Error('原生模型输出流没有返回完成事件。')
      const finish = assembler.finish
      if (finish.kind === 'error' || finish.kind === 'aborted') throw Object.assign(new Error(finish.failure.message), { code: finish.failure.code })
      const blocks = assembler.blocks()
      const result: TavernAuxiliaryGenerationResult = { generationId, provider, model, text: blocks.filter(block => block.type === 'text').map(block => block.text).join(''),
        reasoning: blocks.filter(block => block.type === 'reasoning').map(block => block.text).join(''), usage: assembler.usage ?? null, finishReason: finish.kind,
        toolCalls: blocks.flatMap((block, index) => block.type === 'tool-call' ? [{ id: String(block.id), name: block.name, arguments: block.arguments,
          ...(typeof object(assembler.replayState?.blocks?.[index]).thoughtSignature === 'string' ? {thoughtSignature:String(object(assembler.replayState?.blocks?.[index]).thoughtSignature)} : {}) }] : []),
        ...(assembler.replayState ? { replayState: generationJson(assembler.replayState) as TavernCompatibilityRecord } : {}) }
      const signature = array(rawReplay?.blocks).map(object).findLast(item => typeof item.thinkingSignature === 'string' || typeof item.textSignature === 'string')
      if (signature) result.reasoningSignature = text(signature.thinkingSignature, text(signature.textSignature))
      if (input.json_schema !== undefined && result.toolCalls?.length) {
        result.text = result.toolCalls.map(call => call.arguments).join(''); delete result.toolCalls
      }
      this.generationDetails.set(generationId, { ...this.generationDetails.get(generationId), ...result, generation_id: generationId, finishedAt: Date.now(), status: 'completed' })
      yield { kind: 'finished', ...result }
    } catch (error) {
      this.generationDetails.set(generationId, { ...this.generationDetails.get(generationId), generationId, startedAt, finishedAt: Date.now(),
        status: controller.signal.aborted ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      await temporary?.dispose()
      controller.abort(new Error('辅助生成流已关闭。'))
      this.generations.delete(generationId)
      externalSignal?.removeEventListener('abort', abort)
    }
  }

  private async imageBlock(input: Value, signal: AbortSignal): Promise<import('@deepseek-ai/dsh-llm').ImageBlock> {
    const attachments = this.owner.get('attachments')
    if (!attachments) throw new Error('原生图片附件服务尚未加载。')
    const source = text(input.url, text(object(input.image_url).url, text(input.image_url, text(input.data))))
    let data: Uint8Array, mediaType: string
    const inline = /^data:([^;,]+);base64,([\s\S]+)$/.exec(source)
    if (inline) { mediaType = inline[1]!; data = new Uint8Array(Buffer.from(inline[2]!, 'base64')) }
    else if (input.base64 || input.mediaType) { mediaType = text(input.mediaType, text(input.mimeType, 'image/png')); data = new Uint8Array(Buffer.from(text(input.base64, source), 'base64')) }
    else {
      const response = await fetch(source, { signal })
      if (!response.ok) throw new Error(`图片读取失败：HTTP ${response.status}`)
      mediaType = response.headers.get('content-type')?.split(';')[0] ?? 'image/png'
      data = new Uint8Array(await response.arrayBuffer())
    }
    const attachment = await attachments.saveImage({ data, mediaType: mediaType as 'image/png', name: text(input.name, 'plugin-image') })
    return { type: 'image', attachment }
  }

  private async extension(method: string, params: Value): Promise<unknown> {
    if (method === 'extensions.manifest') return new TavernExtensionAssets(this.owner).manifest(text(params.name))
    if (method === 'extensions.template') return new TavernExtensionAssets(this.owner).template(text(params.extension), text(params.name))
    const manager = this.owner.get('pluginManager')
    if (!manager) throw new Error('原生插件管理服务尚未加载。')
    const installations = new TavernExtensionInstallations(this.owner)
    if (method === 'extensions.list') return (await manager.listBundles()).map(bundle => installations.describe(bundle))
    const name = text(params.name)
    if (method === 'extensions.isInstalled') return (await manager.listBundles()).some(bundle => bundle.name === name) ||
      (await manager.listPlugins()).some(plugin => String(plugin.entryId) === name || plugin.moduleName === name)
    if (method === 'extensions.install') {
      const spec = text(params.url, text(params.spec)), options = object(params.options)
      const result = await manager.installBundle(spec, { enabled: options.enabled !== false })
      await installations.save(spec, options.type, result)
      return result
    }
    if (method === 'extensions.uninstall') { const result = await manager.removeBundle(name); await installations.remove(name, result); return result }
    if (method === 'extensions.enable' || method === 'extensions.disable') {
      const enabled = method === 'extensions.enable'
      const bundles = await manager.listBundles()
      if (bundles.some(bundle => bundle.name === name)) return manager.setBundleEnabled(name, enabled)
      const plugin = (await manager.listPlugins()).find(item => String(item.entryId) === name || item.moduleName === name)
      if (!plugin) throw new Error(`原生插件不存在：${name}`)
      return manager.setPluginEnabled(plugin.entryId, enabled)
    }
    if (method === 'extensions.info') { const found = (await manager.listBundles()).find(bundle => bundle.name === name); if (!found) throw new Error(`插件不存在：${name}`); return installations.describe(found) }
    if (method === 'extensions.update' || method === 'extensions.reinstall') {
      const bundle = (await manager.listBundles()).find(item => item.name === name)
      if (!bundle) throw new Error(`插件不存在：${name}`)
      const spec = text(params.spec, typeof params.version === 'string' ? `${name}@${params.version}` : installations.spec(bundle, method === 'extensions.reinstall'))
      const result = await manager.installBundle(spec, { enabled: bundle.enabled })
      await installations.save(spec, installations.read(name)?.type, result, name)
      return result
    }
    throw new Error(`未知插件管理操作：${method}`)
  }
}

function presentCustomEndpoint(input: Value): boolean {
  return ['apiKey', 'api_key', 'baseURL', 'base_url', 'apiurl'].some(key => input[key] !== undefined)
    || ['apiurl','key','baseURL','api_key'].some(key=>object(input.custom_api)[key]!==undefined)
}
