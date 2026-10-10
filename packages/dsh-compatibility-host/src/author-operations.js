import { createHash } from 'node:crypto';
import { decodePluginPackage } from './package-decoder.js';
import { activeScriptManifests, normalizeScriptTrees, scriptTreeKey, scriptTreesSnapshot, synchronizeScriptButtonUi } from './script-trees.js';
import { COMPATIBILITY_COMPONENT, COMPONENT_ID } from './extension-operations.js';

export const AUTHOR_METHODS = ['plugins.bootstrap', 'plugins.list', 'plugins.install', 'plugins.import', 'plugins.patch',
  'plugins.setEnabled', 'plugins.remove', 'plugins.runtimeReady', 'plugins.runtimeError', 'plugins.emitEvent', 'scripts.synchronize', 'scripts.read', 'scripts.get', 'scripts.replace'];
const clone = value => JSON.parse(JSON.stringify(value));
const text = value => typeof value === 'string' ? value : '';
const required = (value, name) => { const result = text(value[name]); if (!result) throw new TypeError(`Missing Author field: ${name}`); return result; };

/** Package/lifecycle domain only. Product state and database remain in original services. */
export class AuthorPluginOperations {
  constructor({ data, compatibility, publish, readModel }) {
    this.data = data; this.compatibility = compatibility; this.publish = publish; this.readModel = readModel;
    this.active = new Map(); this.runtimeStatus = new Map();
    this.media = undefined;
  }
  store() { return this.data.compatibilityStore(); }
  lookupManifest(id) { return this.store().get('plugins', id) ?? this.active.get(id) ?? null; }
  fingerprint(manifest) { return createHash('sha256').update(JSON.stringify({ source: manifest.source, resources: manifest.resources || {}, entry: manifest.entry || '' })).digest('hex'); }
  synchronizeButtons(manifests = activeScriptManifests(this.store(), this.scriptContext?.characterId || '', this.scriptContext?.presetId || '')) {
    synchronizeScriptButtonUi(this.store(), manifests, this.publish);
  }
  async invoke({ method, params: p }) {
    const store = this.store(), owner = text(p.pluginId) || 'frontend';
    switch (method) {
      case 'plugins.bootstrap': return this.bootstrap(p);
      case 'plugins.list': return Object.fromEntries(Object.entries(store.list('plugins')).map(([id, value]) => [id, { ...value,
        ...(this.runtimeStatus.get(id) || { status: value.enabled === false ? 'disabled' : 'not-started', error: '' }) }]));
      case 'plugins.import': {
        const manifest = decodePluginPackage(Buffer.from(required(p, 'base64'), 'base64'));
        return this.install(text(p.id) || text(manifest.id), manifest);
      }
      case 'plugins.install': return this.install(text(p.id) || owner, p.manifest);
      case 'plugins.patch': {
        const id = text(p.id) || owner, previous = store.get('plugins', id);
        if (!previous) throw new Error(`插件不存在：${id}`);
        if (!p.patch || typeof p.patch !== 'object' || Array.isArray(p.patch)) throw new TypeError('Plugin patch must be an object');
        if ('source' in p.patch || 'resources' in p.patch || 'entry' in p.patch) throw new Error('修改源码或资源请使用 plugins.install');
        const next = { ...previous, ...p.patch, id };
        store.put('plugins', id, next); this.synchronizeButtons(); this.publish({ event: 'scripts.changed', payload: { pluginId: id } }); return next;
      }
      case 'plugins.setEnabled': {
        const id = text(p.id) || owner, previous = store.get('plugins', id);
        if (!previous) throw new Error(`插件不存在：${id}`);
        if (typeof p.enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
        store.put('plugins', id, { ...previous, enabled: p.enabled });
        if (!p.enabled) { store.delete('prompt-injections', id); store.deleteScope(`macros:${id}`); }
        this.synchronizeButtons();
        this.publish({ event: 'plugins.changed', payload: { pluginId: id, enabled: p.enabled } }); return true;
      }
      case 'plugins.remove': {
        const id = text(p.id) || owner;
        const deleted = store.atomic(() => { const count = store.delete('plugins', id); store.deleteScope(`resources:${id}`); store.deleteScope(`ui:${id}`);
          store.delete('prompt-injections', id); store.deleteScope(`macros:${id}`); return count > 0; });
        this.active.delete(id); this.runtimeStatus.delete(id);
        if (deleted) this.publish({ event: 'plugins.changed', payload: { pluginId: id, deleted: true } });
        return deleted;
      }
      case 'plugins.runtimeReady': case 'plugins.runtimeError': {
        const status = method === 'plugins.runtimeReady' ? 'running' : 'error';
        const error = status === 'error' ? required(p, 'error') : '';
        this.runtimeStatus.set(owner, { status, error });
        this.publish({ event: 'plugins.status', payload: { pluginId: owner, status, error } }); return null;
      }
      case 'plugins.emitEvent': {
        await this.publish({ event: 'plugin.event', payload: { pluginId: owner, event: required(p, 'event'), payload: p.payload ?? null,
          ...(Object.hasOwn(p, 'conversationId') ? { conversationId: p.conversationId } : {}) } });
        return null;
      }
      case 'scripts.read': return scriptTreesSnapshot(store, text(p.characterId), text(p.presetId));
      case 'scripts.get': {
        const type = required(p, 'type');
        const characterId = type === 'character' ? text(p.characterId) || (p.conversationId ? this.data.readConversationDetails(p.conversationId).metadata.characterId : '') || this.data.readCharacters().active_character_id || '' : '';
        const presetId = type === 'preset' ? text(p.presetId) || this.data.readAgentPresetCatalog().activePresetId : '';
        return store.get('script-trees', scriptTreeKey(type, characterId, presetId)) ?? [];
      }
      case 'scripts.replace': {
        const type = required(p, 'type'), key = scriptTreeKey(type, text(p.characterId), text(p.presetId));
        const next = normalizeScriptTrees(p.trees); store.put('script-trees', key, next);
        this.synchronizeButtons();
        this.publish({ event: 'scripts.changed', payload: { type, characterId: p.characterId ?? '', presetId: p.presetId ?? '' } }); return next;
      }
      case 'scripts.synchronize': {
        const chat = text(p.conversationId), details = chat ? this.data.readConversationDetails(chat) : null;
        const characterId = details?.metadata.characterId || '', presetId = this.data.readAgentPresetCatalog().activePresetId;
        const manifests = activeScriptManifests(store, characterId, presetId);
        this.scriptContext = { characterId, presetId }; this.synchronizeButtons(manifests);
        this.active = new Map(Object.entries(manifests));
        return Object.fromEntries(Object.entries(manifests).map(([id, manifest]) => [id, { ...manifest, fingerprint: this.fingerprint(manifest),
          runtimeUrl: `/eleckoi/compat/plugin/${encodeURIComponent(id)}/__eleckoi_frame__.html` }]));
      }
      default: throw Object.assign(new Error(`Author Host method is not connected: ${method}`), { code: 'METHOD_NOT_AVAILABLE' });
    }
  }
  install(id, manifest) {
    if (!id) throw new TypeError('Plugin package requires id');
    if (!manifest || typeof manifest.source !== 'string' || !manifest.source.trim()) throw new Error('插件缺少 entry JavaScript');
    const next = { ...manifest, id, enabled: manifest.enabled ?? true };
    this.store().atomic(() => {
      this.store().deleteScope(`resources:${id}`);
      for (const [path, bytes] of Object.entries(next.resources || {})) {
        if (typeof bytes !== 'string') throw new TypeError(`Plugin resource must be base64: ${path}`);
        this.store().put(`resources:${id}`, path, bytes);
      }
      this.store().put('plugins', id, next);
    });
    this.runtimeStatus.delete(id); this.active.delete(id);
    this.synchronizeButtons();
    this.publish({ event: 'plugins.changed', payload: { pluginId: id, installed: true } }); return true;
  }
  async bootstrap(p) {
    const conversationId = text(p.conversationId) || null, owner = text(p.pluginId) || 'frontend';
    const details = conversationId ? this.data.readConversationDetails(conversationId) : null, metadata = details?.metadata;
    const presentation = conversationId ? p.presentation : null;
    if (conversationId && (!presentation || presentation.conversationId !== conversationId || !Array.isArray(presentation.messages))) {
      throw Object.assign(new Error('共同 Web Client 尚未提供该会话的正式 DSH 消息投影'), { code: 'PRESENTATION_NOT_READY' });
    }
    const invoke = (method, params = {}) => this.compatibility({ method, params: { conversationId, pluginId: owner, ...params } });
    const store = this.store(), collection = this.data.readCharacters(), characterId = conversationId
      ? store.get('group-rounds', conversationId)?.characterId || metadata.characterId || '' : null;
    const character = collection.items.find(item => item.id === characterId);
    const presetCatalog = this.data.readAgentPresetCatalog(), presetId = presetCatalog.activePresetId;
    const persona = this.data.readPersona();
    const model = conversationId ? await this.readModel(conversationId) : null;
    const variableScopes = ['chat', 'character', 'preset', 'global', 'script', 'extension', 'plugin'];
    const variables = Object.fromEntries(await Promise.all(variableScopes.map(async scope => [scope,
      scope === 'chat' && !conversationId || scope === 'character' && !characterId || scope === 'preset' && !presetId
        ? null : await invoke('variables.readScope', { scope, characterId, activePresetId: presetId })])));
    variables.message = presentation ? Object.fromEntries(await Promise.all(presentation.messages.map(async message => [message.id,
      await invoke('variables.readScope', { scope: 'message', messageId: message.id })]))) : null;
    const variableOwners = Object.fromEntries(['script', 'extension', 'plugin'].map(type => [type,
      Object.fromEntries(store.scopes(`variables:${type}:`).map(scope => [scope.slice(`variables:${type}:`.length), store.get(scope, 'state')]))]));
    const names = await invoke('worldbooks.list');
    const characterBooks = Object.fromEntries(await Promise.all(collection.items.map(async item => [item.id, {
      primary: store.get('worldbook-primaries', item.id)?.primary ?? `character:${item.id}`,
      additional: await invoke('worldbooks.bindings', { scope: 'character', characterId: item.id }) }])));
    const storedPersonas = Object.values(store.list('personas'));
    const personas = storedPersonas.length ? storedPersonas : [{ ...persona, avatar_id: 'default.png', name: persona.user_name,
      avatar: persona.user_avatar, description: '', is_default: true }];
    const personaId = (conversationId ? store.get('persona-selection', `chat:${conversationId}`) : null) ?? store.get('persona-selection', 'global') ?? personas[0]?.avatar_id ?? null;
    const presets = presetCatalog.presets.map(item => this.data.readAgentPreset(item.id));
    // The catalog owns imported card fields and the stable ST avatar identity.
    // A shallow native-record projection loses both when a Web realm refreshes.
    const rawCharacters = (await invoke('characters.rawList')).map(card => {
      const item = collection.items.find(item => item.id === card.native_id);
      const extensions = card.data?.extensions || {};
      return { ...card, data: { ...card.data, extensions: { ...extensions,
        eleckoi: { ...(extensions.eleckoi || {}), ...clone(item || {}) } } } };
    });
    return clone({ conversationId, title: details?.conversation.title ?? null, characterId,
      characterName: character?.name || metadata?.characterName || '', userName: persona.user_name, presetId,
      model: model?.model ?? null, connection: model ? { ...model, configId: model.provider } : null,
      isGenerating: presentation ? presentation.isGenerating === true : null, messages: presentation?.messages ?? null,
      metadata: conversationId ? await invoke('messages.metadata') : null, settings: await invoke('settings.get'), extensionSettings: await invoke('settings.get', { shared: true }),
      characters: collection.items, rawCharacters, personas, personaId, presets,
      tavernPresets: await invoke('tavernPresets.list'), tavernPresetState: await invoke('tavernPresets.state'),
      scripts: scriptTreesSnapshot(store, characterId, presetId), plugins: store.list('plugins'), components: { [COMPONENT_ID]: COMPATIBILITY_COMPONENT },
      groups: Object.values(store.list('groups')), groupId: conversationId ? store.get('group-bindings', conversationId) : null,
      regex: characterId ? (() => { const value = this.data.readRegexRules(characterId); return {
        ...value, global_rules: value.globalRules, prompt_preset_rules: value.agentPresetRules, character_rules: value.characterRules }; })()
        : (() => {
          // The existing regex service validates a card before exposing shared
          // scopes. Read only those scopes through an existing card; no selection
          // or character scope is inferred for this page.
          const value = collection.items.length ? this.data.readRegexRules(collection.items[0].id) : null;
          return { global_rules: value?.globalRules ?? null, prompt_preset_rules: value?.agentPresetRules ?? null, character_rules: null };
        })(),
      characterRegexes: Object.fromEntries(collection.items.map(item => [item.id, this.data.readRegexRules(item.id).characterRules])),
      worldbooks: { settings: await invoke('worldbooks.settings'), names, global: await invoke('worldbooks.bindings', { scope: 'global' }),
        characters: characterBooks, chats: conversationId ? { [conversationId]: (await invoke('worldbooks.bindings', { scope: 'chat' }))[0] ?? null } : null,
        lastScan: conversationId ? await invoke('worldbooks.lastScan') : null },
      ...(this.media ? { audio: this.media.bootstrap() } : {}), variables, variableOwners });
  }
}
