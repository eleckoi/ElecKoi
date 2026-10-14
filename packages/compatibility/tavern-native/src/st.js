import * as st from './st/exports.js';
import { attach } from './st/runtime/tavern-runtime/host.js';
import { registerNativeCommands } from './st/runtime/tavern-runtime/native-commands.js';
import { restoreMediaPresentation } from './st/runtime/tavern-runtime/media-commands.js';
import events from './st/events.json';
import { installPublicContext } from './st/public-context.js';
import { createNativeNetwork, createMediaServices } from './media-services.js';
import { createYouTubeServices } from './youtube-services.js';
import * as variables from './st/runtime/vendor/sillytavern/public/scripts/variables.js';
import { rawPromptSettings, typedPromptSettings } from './st/runtime/tavern-runtime/prompt-manager.js';

const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const rows = value => Array.isArray(value) ? value : value?.items ?? [];
const stringify = value => typeof value === 'string' ? value : JSON.stringify(value);
function reconcile(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) { target.splice(0, target.length, ...source.map(copy)); return target; }
  for (const key of Object.keys(target)) if (!Object.hasOwn(source, key)) delete target[key];
  for (const [key, value] of Object.entries(source)) target[key] = copy(value);
  return target;
}
/** ST Slash controllers publish cancellation on the controller, rather than on a DOM signal. */
function generationSignal(view, explicit, controller) {
  const source = explicit ?? controller?.signal;
  if (!source) return { signal: undefined, dispose() {} };
  if (typeof source.addEventListener === 'function') return { signal: source, dispose() {} };
  if (!controller?.addEventListener) throw new TypeError('Generation requires an AbortSignal or a Slash abort controller.');
  const bridge = new view.AbortController();
  const abort = () => bridge.abort(new view.DOMException(String(source.reason || 'Slash generation aborted'), 'AbortError'));
  controller.addEventListener('abort', abort);
  if (source.aborted) abort();
  return { signal: bridge.signal, dispose: () => controller.removeEventListener('abort', abort) };
}

function characterView(character) {
  const raw = character.character ?? character.cardData ?? character;
  const data = raw.data ?? character.data ?? { ...character };
  return { ...copy(raw), ...copy(data), native_id: character.id, avatar: character.avatar_id ?? raw.avatar_id ?? character.avatar ?? character.id, avatar_path: character.avatar_path ?? character.avatar, name: character.name, data: copy(data) };
}
function messageView(message) {
  return { ...copy(message), native_id: message.id, mes: message.content ?? '', name: message.speakerName ?? '',
    is_user: message.role === 'user', is_system: message.isHidden ?? message.role === 'system',
    role: message.role, swipe_id: message.swipeId ?? 0, swipes: copy(message.swipes ?? [message.content ?? '']),
    swipe_info: copy(message.swipesInfo ?? []), extra: { ...copy(message.extra ?? {}), ...(message.reasoning ? { reasoning: message.reasoning } : {}) },
    send_date: message.createdAt ?? new Date().toISOString() };
}
function typedPreset(value) {
  const raw = value?.data ?? value ?? {};
  const prompts = raw.prompts ?? (raw.promptEntries ?? []).map(prompt => ({ ...prompt, id: prompt.id ?? prompt.identifier, role: prompt.role ?? 'system', enabled: prompt.enabled !== false, position: { type: 'relative' } }));
  return { ...raw, settings: raw.settings ?? {}, prompts, prompts_unused: raw.prompts_unused ?? [] };
}

/** ST 1.19 objects backed by the native runtime; the helper argument is the independent public facade. */
export function createSillyTavernApi(rt, helper) {
  const view = rt.window ?? globalThis;
  const cleanup = new Set(), running = new Set(), chat = [], characters = [], groups = [];
  const shared = rt.shared ?? (rt.shared = {});
  const extensionSettings = shared.extensionSettings ?? (shared.extensionSettings = copy(rt.snapshot.extensionSettings ?? {}));
  extensionSettings.variables ??= { global: copy(rt.snapshot.variableScopes?.global?.[''] ?? rt.snapshot.variableScopes?.global?.default ?? {}) };
  extensionSettings.variables.global ??= {};
  const metadata = copy(rt.snapshot.chatMetadata ?? {});
  metadata.variables ??= copy(rt.snapshot.variables ?? {});
  const report = error => { view.console?.error?.('[SillyTavern]', error); };
  const track = task => { const pending = Promise.resolve(task); rt.track?.(pending); pending.catch(report); return pending; };
  const request = (method, params = {}) => rt.request(method, params);
  const commit = (method, params = {}) => rt.commit(method, params);
  const remoteTokenizerType = value => typeof value === 'string' && value.startsWith('remote-') || value === st.tokenizers.API_TEXTGENERATIONWEBUI || value === st.tokenizers.API_KOBOLD;
  const syncRemoteTokenizer = (method, params) => {
    const Xhr = view.XMLHttpRequest;
    if (typeof Xhr !== 'function') throw new Error('远端 tokenizer 的同步接口需要 XMLHttpRequest。');
    const rpcId = `tokenizer-${view.crypto?.randomUUID?.() ?? Date.now()}`;
    const xhr = new Xhr();
    xhr.open('POST', '/api/eleckoiTavernCompatibility/invoke', false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ type: 'client-request', rpcId, method: 'eleckoiTavernCompatibility/invoke',
      payload: { args: { conversationId: rt.snapshot.context?.conversationId ?? '', method, params } } }));
    if (xhr.status < 200 || xhr.status >= 300) throw new Error(`远端 tokenizer 请求失败：HTTP ${xhr.status}`);
    let body;
    try { body = JSON.parse(xhr.responseText); } catch (cause) { throw new Error('远端 tokenizer 返回了无效 RPC 响应。', { cause }); }
    if (body?.rpcId !== rpcId) throw new Error('远端 tokenizer RPC 编号不匹配。');
    if (body?.result?.ok !== true) throw new Error(body?.result?.error?.message || '远端 tokenizer 请求失败。');
    return body.result.value;
  };
  const on = (event, listener) => { const stop = rt.on(event, listener); cleanup.add(stop); return stop; };
  const capture = () => ({ conversationId: rt.snapshot.context?.conversationId, characterId: rt.snapshot.context?.characterId });
  const activeId = kind => rt.snapshot[kind]?.activeId ?? rt.snapshot.context?.[`${kind.slice(0, -1)}Id`];
  const find = (kind, reference = 'current') => {
    const id = ['current', 'in_use', undefined].includes(reference) ? activeId(kind) : reference;
    return rows(rt.snapshot[kind]).find(item => item.id === id || item.name === id || item.avatar === id);
  };
  const presetReference = (name = 'current') => ['current', 'in_use', undefined].includes(name)
    ? rt.snapshot.presets?.inUse ?? find('presets') : find('presets', name);
  const preset = (name = 'current') => typedPreset(presetReference(name));
  const connection = () => rt.snapshot.connection ?? rt.snapshot.selectedConnection ?? {};
  let lastMessages, lastCharacters, lastGroups, lastMetadata, lastVariables, lastGlobalVariables;
  function sync() {
    const messageStamp = JSON.stringify(rt.snapshot.messages ?? []);
    if (messageStamp !== lastMessages) { reconcile(chat, (rt.snapshot.messages ?? []).map(messageView)); lastMessages = messageStamp; }
    const characterStamp = JSON.stringify(rt.snapshot.characters ?? []);
    if (characterStamp !== lastCharacters) { reconcile(characters, rows(rt.snapshot.characters).map(characterView)); lastCharacters = characterStamp; }
    const groupStamp = JSON.stringify(rt.snapshot.groups ?? []);
    if (groupStamp !== lastGroups) { reconcile(groups, rows(rt.snapshot.groups)); lastGroups = groupStamp; }
    const metadataStamp = JSON.stringify(rt.snapshot.chatMetadata ?? {});
    if (metadataStamp !== lastMetadata) {
      reconcile(metadata, rt.snapshot.chatMetadata ?? {});
      metadata.variables = copy(rt.snapshot.variables ?? {});
      lastMetadata = metadataStamp;
    }
    const variableStamp = JSON.stringify(rt.snapshot.variables ?? {});
    if (variableStamp !== lastVariables) { metadata.variables = copy(rt.snapshot.variables ?? {}); lastVariables = variableStamp; }
    const globals = rt.snapshot.variableScopes?.global?.[''] ?? {};
    const globalStamp = JSON.stringify(globals);
    if (globalStamp !== lastGlobalVariables) { reconcile(extensionSettings.variables.global, globals); lastGlobalVariables = globalStamp; }
  }
  const eventSource = {
    on, once: (event, fn) => {
      const off = on(event, (...args) => { off(); return fn(...args); }); return off;
    }, emit: (event, ...args) => rt.emit(event, ...args), emitAndWait: (event, ...args) => rt.emitAndWait(event, ...args),
    removeListener: (event, fn) => rt.off?.(event, fn), makeFirst: (event, fn) => rt.moveListener?.(event, fn, true),
    makeLast: (event, fn) => rt.moveListener?.(event, fn, false),
  };
  const saveMetadata = () => commit('chat.metadata.set', { value: copy(metadata) });
  const saveVariables = () => helper.replaceVariables(copy(metadata.variables), { type: 'chat' });
  const saveSettings = () => {
    track(helper.replaceVariables(copy(extensionSettings.variables.global), { type: 'global' }));
    const value = copy(extensionSettings); delete value.variables;
    return commit('settings.set', { value });
  };
  const currentCharacter = () => characters.findIndex(item => item.native_id === rt.snapshot.context?.characterId);
  const context = {
    chat, chatMetadata: metadata, characters, extensionSettings, eventSource, eventTypes: events,
    groups, extensionPrompts: shared.extensionPrompts ?? (shared.extensionPrompts = {}),
    mainApi: 'openai', chatCompletionSettings: extensionSettings.eleckoi_chat_completion ?? (extensionSettings.eleckoi_chat_completion = {}),
    textCompletionSettings: extensionSettings.eleckoi_text_completion ?? (extensionSettings.eleckoi_text_completion = {}),
    flush: () => rt.flush(), getCurrentChatId: () => rt.snapshot.context?.conversationId ?? '',
    getChatTitle: () => rt.snapshot.context?.title ?? rt.snapshot.title ?? rt.snapshot.context?.conversationId ?? '',
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
    getCharacters: async () => { await rt.refresh?.(); sync(); return characters; },
    getOneCharacter: async avatar => characters.find(item => item.avatar === avatar),
    unshallowCharacter: async avatar => characters.find(item => item.avatar === avatar),
    selectCharacterById: id => commit('character.select', { id: characters[Number(id)]?.native_id ?? id }),
    openCharacterChat: async id => { await rt.flush(); return request('chat.open', { id: String(id).replace(/\.jsonl$/, '') }); },
    openGroupChat: async id => { const conversationId = await commit('group.open', { id });
      if (typeof conversationId !== 'string' || !conversationId) throw new Error('Native group chat did not return a conversation id.');
      await rt.flush(); return request('chat.open', { id: conversationId }); },
    renameChat: (oldName, newName) => commit('chat.rename', { id: newName === undefined ? context.getCurrentChatId() : oldName, name: newName ?? oldName }),
    saveMetadata, saveMetadataDebounced: () => track(Promise.all([saveMetadata(), saveVariables()])),
    saveSettingsDebounced: () => track(saveSettings()),
    updateChatMetadata: (value, reset = false) => { if (reset) reconcile(metadata, {}); Object.assign(metadata, value); },
    saveChat: async () => {
      await commit('messages.replace', { messages: chat.map(message => ({ id: message.native_id, role: message.is_user ? 'user' : message.role === 'system' ? 'system' : 'assistant',
        content: message.mes ?? '', speakerName: message.name, isHidden: !!message.is_system, reasoning: message.reasoning ?? message.extra?.reasoning,
        swipeId: message.swipe_id, swipes: copy(message.swipes), swipesInfo: copy(message.swipe_info), extra: copy(message.extra ?? {}) })) });
      await saveMetadata(); await saveVariables(); sync();
    },
    addOneMessage: async (message, options = {}) => {
      if (!chat.includes(message)) chat.splice(options.insertAfter === undefined ? chat.length : Number(options.insertAfter) + 1, 0, message);
      await context.saveChat(); const index = chat.indexOf(message); if (index >= 0) await rt.refreshMessage?.(rt.snapshot.messages[index]?.id);
    },
    writeCharacterExtension: async (avatar, key, value) => {
      const raw = characters.find(item => item.avatar === avatar || item.native_id === avatar); if (!raw) throw new Error(`Unknown character: ${avatar}`);
      const data = copy(raw.data); st.libs.lodash.set(data.extensions ?? (data.extensions = {}), key, value);
      return helper.replaceCharacter(raw.native_id, data);
    },
    writeExtensionField: (id, key, value) => context.writeCharacterExtension(characters[id]?.avatar ?? id, key, value),
    getCharacterCardFields: ({ chid } = {}) => {
      const card = characters[chid ?? currentCharacter()], data = card?.data ?? {};
      return { system: data.system_prompt ?? '', jailbreak: data.post_history_instructions ?? '', description: data.description ?? '',
        personality: data.personality ?? '', scenario: metadata.scenario ?? data.scenario ?? '', persona: find('personas')?.description ?? '',
        mesExamples: data.mes_example ?? '', version: data.character_version ?? '', charDepthPrompt: data.extensions?.depth_prompt?.prompt ?? '',
        creatorNotes: data.creator_notes ?? '', firstMessage: data.first_mes ?? '', alternateGreetings: data.alternate_greetings ?? [] };
    },
    messageFormatting: (text, name, isSystem, isUser, messageId) => rt.formatMessage(String(text), messageId),
    reloadCurrentChat: async () => { await rt.refresh?.(); sync(); },
    stopGeneration: async () => { const auxiliary = await helper.stopGeneration(); const main = await request('generation.stop'); return auxiliary || main.cancelled; },
    generate: async (type = 'normal', options = {}, dryRun = false) => {
      await rt.flush();
      const { signal, abortController, ...settings } = options;
      const linked = generationSignal(view, signal, abortController);
      const activeSignal = linked.signal;
      try {
        activeSignal?.throwIfAborted();
        if (dryRun) {
          const input = rt.native?.request ? await rt.native.request('input.get', {}) : { text: settings.quiet_prompt ?? '' };
          return request('generation.preview', { type, options: settings, text: input.text });
        }
        if (type === 'quiet' || type === 'impersonate') {
          const generationId = st.uuidv4(), cancel = () => track(helper.stopGeneration(generationId));
          activeSignal?.addEventListener('abort', cancel, { once: true });
          let result;
          try { result = await helper.generate({ generation_id: generationId, user_input: settings.quiet_prompt, json_schema: settings.jsonSchema,
            ...(settings.quietName ? { overrides: { char_name: settings.quietName } } : {}) }); }
          finally { activeSignal?.removeEventListener('abort', cancel); }
          activeSignal?.throwIfAborted();
          const text = typeof result === 'string' ? result : result.content;
          if (type === 'impersonate') await helper.setInput(text);
          else if (settings.quietToLoud) await helper.createChatMessages([{ role:'assistant', message:text, name:settings.quietName ?? context.name2 }]);
          return text;
        }
        sync();
        const groupId = context.groupId, selectedGroup = groupId ? groups.find(group => group.id === groupId) : null;
        let memberIds;
        if (groupId && settings.force_chid !== undefined && settings.force_chid !== null) {
          const reference = String(settings.force_chid);
          const forced = characters.find(card => card.native_id === reference || card.avatar === reference)
            ?? (Number.isSafeInteger(Number(reference)) ? characters[Number(reference)] : undefined);
          if (!forced) throw new Error(`Forced group character does not exist: ${reference}`);
          if (!selectedGroup || !selectedGroup.members.includes(forced.avatar)) throw new Error(`Character is not a member of the current group: ${reference}`);
          const originalActor = (rt.snapshot.messages ?? []).findLast(message => message.role === 'assistant')?.speakerCharacterId;
          if (type !== 'normal' && originalActor !== forced.native_id) throw new Error('Group regeneration and continuation retain the original actor; use normal generation to choose a speaker.');
          if (type === 'normal') memberIds = [forced.native_id];
        }
        const params = { type, options: settings, ...(groupId ? { groupId } : {}), ...(memberIds ? { memberIds } : {}) };
        const prior = type === 'swipe' ? copy((rt.snapshot.messages ?? []).findLast(message => message.role === 'assistant')) : undefined;
        const generated = rt.native?.request
          ? await rt.native.request('generation.generate', params, { signal: activeSignal })
          : await request('generation.generate', params);
        if (groupId && type === 'normal') {
          await rt.refresh(); sync();
          const reply = (rt.snapshot.messages ?? []).findLast(message => message.role === 'assistant');
          if (!reply) throw new Error('Native group generation produced no assistant message.');
          return reply.content ?? generated;
        }
        if (type === 'continue') {
          await rt.refresh(); sync();
          const reply = (rt.snapshot.messages ?? []).findLast(message => message.role === 'assistant');
          if (!reply) throw new Error('Native continuation produced no assistant message.');
          return reply.content ?? generated;
        }
        if (prior) {
          await rt.refresh();
          const messages = rt.snapshot.messages ?? [], index = messages.findLastIndex(message => message.role === 'assistant'), current = messages[index];
          if (!current) throw new Error('Native swipe generation produced no assistant message.');
          const candidates = prior.swipes?.length ? prior.swipes : [prior.content ?? ''];
          const data = candidates.map((_, index) => prior.swipesData?.[index] ?? prior.variableState ?? {});
          const info = candidates.map((_, index) => prior.swipesInfo?.[index] ?? {});
          await helper.setChatMessages([{ message_id: index, swipes: [...candidates, String(generated)],
            swipes_data: [...data, current.variableState ?? {}], swipes_info: [...info, {
              send_date: current.createdAt, extra: copy(current.extra ?? {}),
              ...(current.reasoning ? { reasoning: current.reasoning } : {}),
            }], swipe_id: candidates.length }]);
          sync();
        }
        return generated;
      } finally { linked.dispose(); }
    },
    generateQuietPrompt: (prompt, quietToLoud, skipWIAN, quietImage, quietName) => helper.generateRaw({ ordered_prompts: [{ role: 'user', content: prompt }], quietToLoud, skipWIAN, quietImage, quietName }),
    generateRaw: (prompt, api, instruct, quietToLoud, systemPrompt) => helper.generateRaw({ ordered_prompts: [{ role: 'system', content: systemPrompt ?? '' }, { role: 'user', content: prompt }], api, instruct, quietToLoud }),
    getChatCompletionModel: () => connection().model ?? '',
    getTokenCount: (text, padding = 0) => {
      if (remoteTokenizerType(rt.tokens?.encoding)) return Number(syncRemoteTokenizer('tokens.count', { text: String(text), encoding: rt.tokens.encoding })) + padding;
      if (!rt.tokens?.count) throw new Error('Use getTokenCountAsync until a native synchronous tokenizer is loaded.');
      return rt.tokens.count(String(text)) + padding;
    },
    getTokenCountAsync: async (text, padding = 0) => {
      const selected = rt.snapshot.selectedConnection ?? {}, configuration = selected.configuration ?? {}
      const params = { text: String(text), encoding: rt.tokens?.encoding ?? rt.snapshot.tokenizer?.encoding, model: selected.model ?? '',
        url: configuration.url ?? configuration.apiurl ?? configuration.baseURL ?? configuration.base_url,
        apiType: configuration.apiType ?? configuration.api_type ?? configuration.type, headers: configuration.headers }
      const result = await request('tokens.count', Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)))
      return (typeof result === 'number' ? result : result.count) + padding
    },
    getTextTokens: (type, text) => {
      if (remoteTokenizerType(type)) return syncRemoteTokenizer('tokens.encode', { text: String(text), type });
      if (!rt.tokens?.encode) throw new Error('A native synchronous tokenizer is required for getTextTokens.');
      return rt.tokens.encode(text, type);
    },
    decodeTextTokens: (type, tokens) => {
      if (remoteTokenizerType(type)) throw new Error('远端 tokenizer 没有公共 decode 接口。');
      if (!rt.tokens?.decode) throw new Error('A native synchronous tokenizer is required for decodeTextTokens.');
      return { text: rt.tokens.decode(tokens, type), chunks: tokens.map(token => rt.tokens.decode([token], type)) };
    },
    getThumbnailUrl: (type, file) => type === 'avatar' ? characters.find(card => card.avatar === file)?.avatar_path ?? file : file,
    deactivateSendButtons: () => { context.duringGenerating = true; }, activateSendButtons: () => { context.duringGenerating = false; },
    tags: extensionSettings.eleckoi_tags ?? (extensionSettings.eleckoi_tags = []), tagMap: extensionSettings.eleckoi_tag_map ?? (extensionSettings.eleckoi_tag_map = {}),
    importTags: (names, index) => {
      const avatar = characters[index]?.avatar; if (!avatar) throw new Error('No selected character.');
      const assigned = context.tagMap[avatar] ?? (context.tagMap[avatar] = []);
      for (const name of names) { let tag = context.tags.find(item => item.name === name); if (!tag) context.tags.push(tag = { id: st.uuidv4(), name }); if (!assigned.includes(tag.id)) assigned.push(tag.id); }
      context.saveSettingsDebounced();
    },
  };
  Object.defineProperties(context, {
    characterId: { enumerable: true, get: currentCharacter },
    groupId: { enumerable: true, get: () => rt.snapshot.context?.groupId ?? rt.snapshot.groupId ?? null },
    name1: { enumerable: true, get: () => find('personas')?.name ?? rt.snapshot.context?.userName ?? 'User' },
    name2: { enumerable: true, get: () => find('characters')?.name ?? rt.snapshot.context?.characterName ?? 'Assistant' },
    user_avatar: { enumerable: true, get: () => find('personas')?.avatar ?? '' },
    powerUserSettings: { enumerable: true, get: () => extensionSettings.power_user ?? (extensionSettings.power_user = {}) },
  });
  Object.assign(context, st);
  context.messageFormatting = (text, name, isSystem, isUser, messageId) => {
    const metadata = {name, isSystem, isUser, messageId, characterId: context.characterId};
    const stages = st.formatting_stage, formatter = st.MessageFormatter;
    let result = formatter.runStage(stages.BEFORE_REGEX, String(text), metadata);
    result = helper.formatAsTavernRegexedString?.(result, isUser ? 'user_input' : 'ai_output', 'display', {depth: messageId}) ?? result;
    result = formatter.runStage(stages.AFTER_REGEX, result, metadata);
    const converter = new st.libs.showdown.Converter({tables: true, strikethrough: true});
    result = formatter.runStage(stages.AFTER_MARKDOWN, converter.makeHtml(result), metadata);
    return st.libs.DOMPurify.sanitize(result);
  };
  context.constants = { unset: Symbol('unset'), ...st.constants };
  context.libs = st.libs;
  context.messageFormatter = st.MessageFormatter;
  context.tokenizers = st.tokenizers;
  context.getTokenizerModel = () => st.resolveTokenizerModel({mainApi: context.mainApi, chatCompletionSettings: context.chatCompletionSettings, textCompletionSettings: context.textCompletionSettings, modelList: rt.snapshot.connection?.models ?? [], textModels: []});
  const localServices = prefix => Object.fromEntries(['get', 'set', 'add', 'inc', 'dec', 'del', 'has'].map((key, index) => {
    const action = ['get', 'set', 'add', 'increment', 'decrement', 'delete', 'exists'][index];
    return [key, variables[`${action}${prefix}Variable`]];
  }));
  context.variables = { local: localServices('Local'), global: localServices('Global') };
  context.substituteParams = (text, user, character, original, group, replaceCharacterCard = true, environment = {}) => {
    context.activate?.(); sync(); return st.substitute(text, typeof user === 'object' && user !== null ? user : { name1Override: user, name2Override: character, original, groupOverride: group, replaceCharacterCard, ...environment });
  };
  context.substituteParamsExtended = context.substituteParams;
  context.executeSlashCommandsWithOptions = context.executeSlashCommands = (text, options = {}) => { context.activate?.(); sync(); return st.execute(text, options); };
  context.callPopup = (content, type, value = '', options = {}) => new st.Popup(content, typeof type === 'string' ? st.POPUP_TYPE[type.toUpperCase()] : type, value, options).show();
  context.callGenericPopup = st.callGenericPopup;
  const promptOwners = shared.extensionPromptOwners ??= new Map();
  const ownedPrompts = new Map();
  cleanup.add(() => { for (const [name, entry] of ownedPrompts) if (promptOwners.get(name) === entry) {
    if (context.extensionPrompts[name] === entry.value) delete context.extensionPrompts[name];
    promptOwners.delete(name);
  } });
  context.setExtensionPrompt = (name, value, position, depth, scan = true, role = 0, filter) => {
    const prompt = { value, position, depth, scan, role, filter };
    context.extensionPrompts[name] = prompt;
    const entry = { value: prompt, runtime: rt }; promptOwners.set(name, entry); ownedPrompts.set(name, entry);
  };
  context.registerMacro = (name, handler, description = '') => st.macros.registry.registerMacro(name, {
    description, handler: invocation => handler(invocation), returns: '',
  });
  context.unregisterMacro = name => st.macros.registry.unregisterMacro(name);
  context.registerMacroLike = (name, handler) => context.registerMacro(name, handler);
  context.unregisterMacroLike = context.unregisterMacro;

  // ST command implementations read immediate snapshots; public TavernHelper functions remain asynchronous.
  context.helper = Object.assign(Object.create(view), helper, { __ElecKoiSt: st,
    RawCharacter: class RawCharacter { static find({ name = 'current' } = {}) { const found = find('characters', name); return found ? characterView(found) : null; } },
    getCharData: (name = 'current') => { const found = find('characters', name); return found ? characterView(found) : null; },
    getPreset: preset, getPersona: (name = 'current') => { const found = find('personas', name); return found ? { ...found, avatar_id: found.avatar_id ?? found.id } : null; },
    replacePreset: (name, data, options) => helper.replacePreset(name === 'in_use' ? 'current' : name, data, options),
    getTavernRegexes: options => helper.getTavernRegexes({ ...options, scope: options?.type ?? options?.scope ?? 'all' }),
    replaceTavernRegexes: (rules, options) => helper.replaceTavernRegexes(rules, { ...options, scope: options?.type ?? options?.scope ?? 'all' }),
    createLorebookEntries: async (name, entries) => {
      const result = await helper.createWorldbookEntries(name, entries);
      return result?.new_uids ? result : { new_uids: (Array.isArray(result) ? result : result?.entries ?? []).map(item => item.uid ?? item.id) };
    },
    builtin: { ...helper.builtin, copyText: text => view.navigator.clipboard.writeText(text), renderPromptManager: async () => { await context.promptManager.render(false); context.promptManager.showPopup(); } },
  });
  const api = createNativeServices(rt, helper, context, preset, connection, request, commit);
  context.tts = api.tts;
  context.tokenizerRegistry = api.tokens;
  context.media = api.media; context.net = api.net; context.youtube = api.youtube;
  api.quickReplies = st.createQuickReplyApi(context, { flush: rt.flush.bind(rt), document: () => view.document,
    input: text => api.input.set(text), send: () => api.input.send(), on: on, ready: () => Promise.resolve(),
    owner: rt.ownerId ?? 'frontend', shared, cleanup, report });
  context.quickReplyApi = api.quickReplies;
  context.printMessages = () => Promise.all(chat.map((_message, index) => helper.refreshOneMessage(index)));
  context.sendSystemMessage = (_type, text) => api.messages.insert([{role:'system', content:text}]);
  const presetBridge = { shared, cleanup, report, document: () => view.document, names: () => rows(rt.snapshot.presets).map(item => item.name),
    name: () => find('presets')?.name ?? '', preset,
    presetId: () => presetReference()?.id, presetReference: () => presetReference(), reference: () => presetReference(),
    rawRegex: value => ({ ...value, scriptName: value.script_name, findRegex: value.find_regex, replaceString: value.replace_string, disabled: value.enabled === false }),
    reconcile: (target, _previous, next) => reconcile(target, next), flush: () => rt.flush(),
    load: name => { track(helper.loadPreset(name)); return !!find('presets', name); },
    applyRaw: raw => helper.replacePreset('current', typedPromptSettings(preset(), raw)),
    importRaw: (name, raw) => commit('import.preset', { name, content: JSON.stringify(raw) }),
    rename: (name, newName) => helper.renamePreset(name, newName), delete: name => helper.deletePreset(name),
    update: value => { const item = presetReference(); if (item) Object.assign(item, copy(value)); },
    persist: (value, id) => track(helper.replacePreset(id, value)), persistenceError: report,
    updateList: (_name, value) => { const item = presetReference(); if (item) Object.assign(item, typedPromptSettings(preset(), value)); },
    export: (value, filename) => { const anchor = view.document.createElement('a'); anchor.href = view.URL.createObjectURL(new view.Blob([JSON.stringify(value,null,2)],{type:'application/json'})); anchor.download=filename; anchor.click(); view.setTimeout(()=>view.URL.revokeObjectURL(anchor.href),0); },
    updateExtensions: extensions => track(helper.updatePresetWith('current', current => ({ ...current, extensions }))),
    render: () => context.promptManager?.render(false), renderDebounced: st.libs.lodash.debounce(() => context.promptManager?.render(false), 20),
  };
  sync();
  view.__ElecKoiSt = st;
  const result = { getContext: () => { context.activate?.(); sync(); return context; }, libs: st.libs, version: '1.19.0' };
  view.SillyTavern = result;
  const configuration = { personas: () => rows(rt.snapshot.personas), preset,
    presetName: presetBridge.name, regex: type => context.helper.getTavernRegexes({ type }),
    extensions: () => rows(rt.snapshot.extensions), worldbooks: helper.getWorldbookNames, execute: context.executeSlashCommandsWithOptions };
  st.initialize(context, api, configuration);
  context.activate = () => {
    attach(context, api, configuration);
    if (shared.activeSillyTavernContext !== context) { registerNativeCommands(context,api); shared.activeSillyTavernContext=context; }
  };
  context.activate();
  st.installPresetManagers(context, presetBridge);
  context.promptManager = st.createPromptManager(context, presetBridge);
  Object.assign(context, st.installRequestServices(context, { ready: () => Promise.resolve(), capture, connection, preset,
    flush: () => rt.flush(), on: on, call: request, cleanup, running, report }));
  installPublicContext(rt,helper,context,st,{request,commit,find,preset,sync,cleanup});
  let mediaStamp, mediaRevision = 0;
  const restoreMedia = () => {
    const stamp = JSON.stringify([rt.snapshot.context?.characterId, context.groupId,
      context.groupId ? context.chat.findLast(message => !message.is_user && !message.is_system)?.name : null,
      context.extensionSettings.expressions, rows(rt.snapshot.characters).map(card => [card.id, card.expressions])]);
    if (stamp === mediaStamp) return;
    mediaStamp = stamp;
    const revision = ++mediaRevision;
    track(Promise.resolve().then(() => restoreMediaPresentation(context, api, () => revision === mediaRevision)));
  };
  const off = rt.on('snapshot.updated', () => { sync(); restoreMedia(); }); cleanup.add(off);
  cleanup.add(() => { ++mediaRevision; view.document.getElementById('expression-image')?.remove(); });
  restoreMedia();
  result.dispose = () => { for (const fn of cleanup) fn?.(); cleanup.clear(); };
  return result;
}

function createNativeServices(rt, helper, context, preset, connection, request, commit) {
  const messages = () => rt.snapshot.messages ?? [];
  const options = value => value && typeof value === 'object' ? value : {};
  const api = { flush: () => rt.flush(), call: async (method, params) => {
    if (method === 'characters.put') return params.id ? helper.replaceCharacter(params.id, params.character?.data ?? params.character) : helper.createCharacter(params.name, params.character?.data ?? params.character);
    return commit(method, params);
  }, events: { on: (event, fn) => rt.on(event, fn) }, ui: {
    mediaSrc: reference => rt.mediaSrc(reference),
    getChatDocument: () => rt.window.document, setCssVariable: (_target, name, value) => rt.window.document.documentElement.style.setProperty(name, value),
    reloadChat: () => context.reloadCurrentChat(), chatPanels: mode => commit('ui.chatPanels', { mode }),
  }, input: {
    set: text => helper.setInput?.(text) ?? commit('composer.set', { text }),
    clear: () => helper.setInput?.('') ?? commit('composer.set', { text: '' }),
    send: () => rt.native?.request ? rt.native.request('input.send', {}) : request('composer.send'),
  }, messages: {
    insert: (items, settings) => helper.createChatMessages(items.map(item => ({ ...item, message: item.content ?? item.message ?? item.mes ?? '', name: item.name ?? item.speakerName,
      ...(item.extra || item.metadata?.extra ? { extra: item.extra ?? item.metadata.extra } : {}),
      ...(item.metadata?.is_hidden !== undefined ? { is_hidden: item.metadata.is_hidden } : {}) })), settings),
    read: index => {
      const compatible = message => message && { ...copy(message), name: message.speakerName ?? message.name,
        metadata: { ...copy(message.metadata ?? {}), is_hidden: message.isHidden ?? message.metadata?.is_hidden ?? false,
          extra: copy(message.extra ?? message.metadata?.extra ?? {}) } };
      return typeof index === 'object' || index === undefined ? messages().map(compatible) : compatible(messages()[Number(index)]);
    },
    update: (updates, settings) => commit('messages.update', {updates: updates.map(item => ({id: item.id, patch: {content: item.content, extra: item.metadata?.extra, isHidden: item.metadata?.is_hidden}})), options: settings}),
  }, tokens: {
    info: () => ({ ...rt.snapshot.tokenizer, encoding: rt.tokens?.encoding, available: rt.tokenizerRegistry?.names ?? [] }),
    select: encoding => commit('tokens.select', { encoding }),
    registerVocabulary: async (name, file, options = {}) => {
      if (!rt.tokenizerRegistry) throw new Error('Browser tokenizer registry is not initialized.');
      const data = typeof file?.arrayBuffer === 'function' ? new Uint8Array(await file.arrayBuffer()) : file instanceof Uint8Array ? file : new Uint8Array(file);
      const kind = options.kind ?? (/\.model$/i.test(file?.name ?? '') ? 'sentencepiece' : 'json');
      await rt.tokenizerRegistry.registerVocabulary(name, { data, kind, source: options.source, license: options.license });
      let binary = ''; for(let offset=0;offset<data.length;offset+=32768)binary += String.fromCharCode(...data.subarray(offset,offset+32768));
      try { return await request('tokens.register', { name, kind, base64: rt.window.btoa(binary), source: options.source, license: options.license }); }
      catch(error) { rt.tokenizerRegistry.unregisterVocabulary(name); throw error; }
    },
    unregisterVocabulary: async name => { await request('tokens.unregister', { name }); return rt.tokenizerRegistry?.unregisterVocabulary(name) ?? false; },
  },
  generation: {
    invoke: async params => ({ content: await helper.generateRaw({ ...params, ordered_prompts: [{ role: 'user', content: params.prompt ?? '' }] }) }),
    invokeRaw: async params => ({ content: await helper.generateRaw({...params, ordered_prompts: params.ordered_prompts ?? params.messages ?? [{role:'user',content:params.prompt ?? ''}]}) }), cancel: id => helper.stopGeneration?.(id) ?? commit('generation.stop', { id }),
  }, chat: {
    open: id => context.openCharacterChat(id), createStored: async (settings = {}) => {
      const card = settings.characterId ? context.characters.find(value => value.native_id === settings.characterId) : null;
      const created = await request('chat.create', { ...settings, ...(card ? { characterName: card.name } : {}) });
      if (typeof created?.id !== 'string' || !created.id) throw new Error('Native chat creation did not return a conversation id.');
      return created.id;
    }, delete: id => request('chat.delete', { id }),
    branch: (index, settings) => request('chat.branch', { index, messageId: messages()[index]?.id, ...options(settings) }), openHistory: () => request('chat.openHistory'),
    temporary: params => request('chat.temporary', params), close: id => request('chat.close', { id }),
  }, characters: { rename: (id, name, settings) => commit('character.rename', { id, name, ...options(settings) }) },
  personas: { select: id => commit('persona.select', { id }), put: (id, name, data) => data === undefined ? helper.replacePersona(id.id ?? id.avatar_id, id) : helper.createPersona(name,{...data,id}) },
  notes: {
    get: () => context.chatMetadata.author_note ?? { content: '', depth: 4, frequency: 1, position: 1, role: 0 },
    set: async value => { const next = { ...api.notes.get(), ...value }; context.chatMetadata.author_note = next; await context.saveMetadata(); return next; },
  }, worldbooks: { timedEffect: (name, entry, kind, value) => commit('worldbook.timedEffect', { name, entry, kind, value }) },
  extensions: { info: name => (Array.isArray(rt.snapshot.extensions) ? rt.snapshot.extensions : rt.snapshot.extensions?.items ?? []).find(item => item.name === name || item.id === name) },
  plugins: { list: () => request('extensions.list'), setEnabled: (id, enabled) => commit('extensions.setEnabled', { id, enabled }) },
  groups: { put: value => commit('group.replace', { data: value }) },
  tts: {
    speak: (text, settings) => request('tts.speak', { text, ...options(settings) }),
    stop: () => request('tts.stop'), voices: settings => request('tts.voices', options(settings)),
    settings: () => request('tts.settings'), configure: settings => commit('tts.configure', { settings }),
    synthesize: (text, settings) => request('tts.synthesize', { text, ...options(settings) }),
    providers: () => ['system', 'openai', ...(rt.shared.ttsProviders?.keys() ?? [])],
    registerProvider: (name, provider) => {
      if (typeof name !== 'string' || !name.trim() || ['system', 'openai'].includes(name) || typeof provider?.speak !== 'function') throw new TypeError('A speech provider needs a unique name and a speak function.');
      const providers = rt.shared.ttsProviders ??= new Map();
      if (providers.has(name)) throw new Error(`Speech provider is already registered: ${name}`);
      providers.set(name, provider);
      let releaseCleanup = () => {};
      const unregister = () => { if (providers.get(name) !== provider) return false; providers.delete(name); releaseCleanup(); return true; };
      releaseCleanup = rt.addCleanup(unregister);
      return unregister;
    },
  },
  };
  // Original commands forward to native services; unsupported methods are rejected by the Host.
  for (const namespace of ['appearance', 'summary']) api[namespace] = new Proxy({}, { get: (_target, method) => (...args) => request(`${namespace}.${String(method)}`, { args }) });
  api.net = createNativeNetwork(rt);
  api.media = createMediaServices(rt, api.net);
  api.youtube = createYouTubeServices(rt, api.net);
  const databank = {};
  for (const name of ['list', 'get', 'read', 'put', 'delete', 'setEnabled', 'settings', 'configure', 'ingest', 'purge', 'search', 'embed', 'matchRecords', 'cancel'])
    databank[name] = (...args) => request(`databank.${name}`, { args });
  databank.importFile = async (file, settings = {}) => {
    if (!file || typeof file.text !== 'function') throw new TypeError('Data Bank import needs a File.');
    const scraper = settings.scraper ? rt.shared.dataBankScrapers?.get(settings.scraper) : undefined;
    if (settings.scraper && !scraper) throw new Error(`Data Bank scraper is not registered: ${settings.scraper}`);
    const textual = /^text\//.test(file.type) || /\.(?:txt|md|markdown|json|jsonl|csv|tsv|yaml|yml|html|xml|log)$/i.test(file.name ?? '');
    if (!scraper && !textual) throw new Error(`This file needs a registered Data Bank scraper: ${file.type || file.name}`);
    const result = scraper ? await scraper.scrape(file, settings) : await file.text();
    let content = typeof result === 'string' ? result : result?.text;
    if (typeof content !== 'string') throw new TypeError('Data Bank scraper did not return text.');
    if (!scraper && (file.type === 'text/html' || /\.html?$/i.test(file.name ?? ''))) {
      const document = new view.DOMParser().parseFromString(content, 'text/html');
      for (const element of document.querySelectorAll('script,style,noscript')) element.remove();
      content = document.body.textContent || '';
    }
    return databank.put({ ...settings, name: settings.name ?? file.name, text: content });
  };
  api.databank = databank;
  api.connections = {
    current: connection, list: () => request('connections.list'), get: id => request('connections.get',{id}),
    select: (id,model) => commit('connections.select',{provider:id,model:model ?? connection().model}),
    configure: patch => commit('connections.configure',patch),
    endpoint: (key,value,settings) => value === undefined ? request('connections.get',{id:key}) : commit('connections.configure',{namespace:key,value,...settings}),
    modelInfo: (provider,model) => request('connections.modelInfo',{provider,model}),
    requestOptions: () => ({provider:connection().provider,model:connection().model}),
  };
  return api;
}
