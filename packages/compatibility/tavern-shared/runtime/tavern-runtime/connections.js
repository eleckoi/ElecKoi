import { CONNECT_API_MAP } from '../vendor/sillytavern/public/scripts/eleckoi-connect-map.js';

const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const format = api => api === 'claude' ? 'anthropic_messages' : api === 'makersuite' ? 'google_gemini' : 'chat_completions';
const sourceOf = api => CONNECT_API_MAP[api]?.source || CONNECT_API_MAP[api]?.type || api;
const defaultEndpoint = (api,model) => api === 'horde' ? 'https://aihorde.net' : api === 'novel' ? /kayra|erato/.test(model || '') ? 'https://text.novelai.net' : 'https://api.novelai.net' : '';

export function createConnectionApi(context, bridge) {
  const settings = () => context.extensionSettings.connectionManager ||= {profiles:[],selectedProfile:null};
  const proxies = () => context.extensionSettings.eleckoi_proxy_presets ||= [];
  const endpoints = () => context.extensionSettings.eleckoi_api_urls ||= {};
  const secrets = () => context.extensionSettings.eleckoi_secret_ids ||= {};
  const find = reference => settings().profiles.find(profile => [profile.id,profile.name].includes(reference));
  const save = async () => { context.saveSettingsDebounced(); await bridge.flush(); };
  function snapshot() {
    const value = bridge.connection();
    return {mode: context.mainApi === 'openai' ? 'cc' : 'tc', exclude: [], api: (context.extensionSettings.eleckoi_api_kinds || {})[value.configId]?.api || value.source || 'custom', 'api-url':value.baseUrl || '', model:value.model || '',
      preset:bridge.presetName(), proxy:context.extensionSettings.eleckoi_selected_proxy || '',
      'secret-id':context.extensionSettings.eleckoi_secret_id || value.configId || '', eleckoi_config_id:value.configId || '',
      eleckoi_api_format:value.apiFormat};
  }
  async function apply(profile, {loadPreset = true, ownedConfig = false} = {}) {
    const priorApi = context.mainApi, priorSource = sourceOf(bridge.connection().source || 'custom');
    const mapping = CONNECT_API_MAP[profile.api];
    if (!mapping) throw new Error(`Unknown API type ${profile.api}`);
    if (!['openai','textgenerationwebui','kobold','novel','koboldhorde'].includes(mapping.selected)) throw new Error(`No native request transport for ${profile.api}`);
    if (mapping.selected === 'openai' && loadPreset && profile.preset) { if (!bridge.loadPreset(profile.preset)) throw new Error(`Preset does not exist: ${profile.preset}`); await bridge.flush(); }
    const textPreset = mapping.selected !== 'openai' && loadPreset && profile.preset
      ? context.__eleckoiPresetManagers?.(mapping.selected)?.getCompletionPresetByName(profile.preset) : null;
    if (mapping.selected !== 'openai' && loadPreset && profile.preset && !textPreset) throw new Error(`Text preset does not exist: ${profile.preset}`);
    const proxy = profile.proxy ? proxies().find(value => value.name === profile.proxy) : null;
    if (profile.proxy && !proxy) throw new Error(`Proxy preset does not exist: ${profile.proxy}`);
    const list = await bridge.call('models.list');
    const credentialId = profile['secret-id'] || profile.eleckoi_config_id;
    const credential = credentialId && list.find(value => [value.id,value.name].includes(credentialId));
    if (credentialId && !credential) throw new Error(`Secret connection does not exist: ${credentialId}`);
    // A saved profile owns a copy. Selecting it must not rewrite the user's source connection.
    const previous = list.find(value => value.id === (ownedConfig ? profile.eleckoi_owned_config_id : profile.eleckoi_config_id));
    const origin = list.find(value => value.id === profile.eleckoi_config_id) || credential;
    const source = sourceOf(profile.api), sameSource = source === sourceOf(bridge.connection().source || 'custom');
    const baseUrl = proxy?.url || proxy?.apiurl || profile['api-url'] || endpoints()[source] || origin?.baseUrl || defaultEndpoint(profile.api,profile.model) || bridge.connection().baseUrl;
    const config = await bridge.call('models.put', {config:{
      ...(previous ? {id:previous.id} : {}), name:profile.name || origin?.name || 'Plugin connection',
      provider:sameSource && origin ? origin.provider : source === 'claude' ? 'anthropic' : source === 'makersuite' ? 'gemini' : 'custom',
      baseUrl, model:profile.model || origin?.model || bridge.connection().model,
      apiFormat:mapping.selected !== 'openai' ? 'chat_completions' : profile.eleckoi_api_format || (sameSource ? origin?.apiFormat : undefined) || format(source),
      ...(origin?.customHeaders ? {customHeaders:origin.customHeaders} : {}),
      ...(proxy?.password !== undefined || proxy?.key !== undefined ? {apiKey:proxy.password ?? proxy.key} : {}),
      ...(credential && credential.id !== previous?.id ? {credentialConfigId:credential.id} : {}),
    }});
    const kind = {api:profile.api, mainApi:mapping.selected, type:mapping.type || (mapping.selected === 'koboldhorde' ? 'horde' : mapping.selected), instruct:profile.instruct || '', preset:profile.preset || ''};
    (context.extensionSettings.eleckoi_api_kinds ||= {})[config.id] = kind;
    (context.extensionSettings.eleckoi_api_sources ||= {})[config.id] = source;
    if (mapping.selected !== 'openai') {
      if (loadPreset && profile.preset) {
        Object.assign(context.__eleckoiCompletionSettings(mapping.selected),copy(textPreset.settings || textPreset));
      }
      context.__eleckoiCompletionSettings(mapping.selected).type = kind.type;
    }
    await save();
    const selected = await bridge.call('models.select', {...bridge.capture(),id:config.id,model:config.model});
    bridge.updateConnection({configId:selected.id,baseUrl:selected.baseUrl,model:selected.model,apiFormat:selected.apiFormat,provider:selected.provider,source});
    context.extensionSettings.eleckoi_selected_proxy = profile.proxy || '';
    context.extensionSettings.eleckoi_secret_id = credential?.id || selected.id;
    endpoints()[source] = selected.baseUrl; secrets()[source] = credential?.id || selected.id;
    (context.extensionSettings.eleckoi_api_sources ||= {})[selected.id] = source;
    if (bridge.notifySelection) await bridge.notifySelection();
    else {
      if (priorApi !== context.mainApi) await bridge.emit(context.eventTypes.MAIN_API_CHANGED,{apiId:context.mainApi});
      if (mapping.selected === 'openai' && priorSource !== source) await bridge.emit(context.eventTypes.CHATCOMPLETION_SOURCE_CHANGED,source);
    }
    return selected;
  }
  async function activateCredential(id) {
    const snapshotConfig = snapshot();
    const owned = context.extensionSettings.eleckoi_active_credential_config_id;
    const selected = await apply({...snapshotConfig,'secret-id':id,
      ...(owned === snapshotConfig.eleckoi_config_id ? {eleckoi_owned_config_id:owned} : {})}, {ownedConfig:true,loadPreset:false});
    context.extensionSettings.eleckoi_active_credential_config_id = selected.id;
  }
  const api = {
    current: () => copy(bridge.connection()),
    list: () => copy(settings().profiles), get: reference => { const profile = reference ? find(reference) : find(settings().selectedProfile); return profile ? copy(profile) : null; },
    async create(name) {
      if (!name || name === '<None>' || find(name)) throw new Error(`Invalid or duplicate connection profile: ${name}`);
      const profile = {...snapshot(),id:crypto.randomUUID(),name}; settings().profiles.push(profile); settings().selectedProfile = profile.id;
      await save(); await bridge.emit(context.eventTypes.CONNECTION_PROFILE_CREATED, profile); return copy(profile);
    },
    async update(reference, patch) {
      const profile = find(reference || settings().selectedProfile); if (!profile) throw new Error('No connection profile selected');
      const previous = copy(profile), values = patch || snapshot();
      for (const [key,value] of Object.entries(values)) if (!['id','eleckoi_owned_config_id'].includes(key) && !(profile.exclude || []).includes(key)) profile[key] = copy(value);
      await save(); await bridge.emit(context.eventTypes.CONNECTION_PROFILE_UPDATED,previous,profile); return copy(profile);
    },
    async delete(reference) { const profile = find(reference); if (!profile) return false;
      settings().profiles.splice(settings().profiles.indexOf(profile),1); if (settings().selectedProfile === profile.id) settings().selectedProfile = null;
      await save(); await bridge.emit(context.eventTypes.CONNECTION_PROFILE_DELETED,profile); return true;
    },
    async select(reference) {
      if (reference === '<None>' || reference === null) { settings().selectedProfile = null; await save(); await bridge.emit(context.eventTypes.CONNECTION_PROFILE_LOADED,'<None>'); return null; }
      const profile = find(reference); if (!profile) throw new Error(`Connection profile does not exist: ${reference}`);
      const effective = {...snapshot(),...copy(profile)};
      for (const key of profile.exclude || []) effective[key] = snapshot()[key];
      const selected = await apply(effective,{ownedConfig:true,loadPreset:!(profile.exclude || []).includes('preset')});
      // Loading a preset hydrates settings, so resolve the persisted profile again after awaits.
      const current = find(profile.id); if (!current) throw new Error(`Connection profile was deleted during selection: ${profile.name}`);
      current.eleckoi_owned_config_id = selected.id; settings().selectedProfile = current.id;
      await save(); await bridge.emit(context.eventTypes.CONNECTION_PROFILE_LOADED,current.name); return copy(current);
    },
    async configure(patch) {
      const profile = {...snapshot(),...patch};
      if (patch.api && sourceOf(patch.api) !== sourceOf(bridge.connection().source || 'custom')) {
        if (!Object.hasOwn(patch,'api-url')) profile['api-url'] = endpoints()[sourceOf(patch.api)] || '';
        if (!Object.hasOwn(patch,'secret-id')) profile['secret-id'] = secrets()[sourceOf(patch.api)] || '';
        delete profile.eleckoi_api_format; delete profile.eleckoi_config_id;
      }
      await apply(profile,{loadPreset:Object.hasOwn(patch,'preset')}); await save(); return api.current();
    },
    async endpoint(reference, url, {connect = true} = {}) {
      const source = sourceOf(reference || bridge.connection().source || 'custom');
      if (!CONNECT_API_MAP[source]) throw new Error(`Unknown API type ${source}`);
      if (url !== undefined) {
        endpoints()[source] = String(url);
        if (connect) {
          if (source !== sourceOf(bridge.connection().source || 'custom')) throw new Error('Switch API before connecting its endpoint, or use connect=false');
          await api.configure({'api-url':String(url)});
        } else await save();
      }
      return endpoints()[source] ?? (source === sourceOf(bridge.connection().source || 'custom') ? bridge.connection().baseUrl : '') ?? '';
    },
    async secret(key, reference) {
      const source = sourceOf(key?.replace(/^api_key_/, '') || bridge.connection().source || 'custom');
      const list = await bridge.call('models.list');
      if (reference) {
        const credential = list.find(value => [value.id,value.name].includes(reference));
        if (!credential) throw new Error(`Secret connection does not exist: ${reference}`);
        secrets()[source] = credential.id;
        if (source === sourceOf(bridge.connection().source || 'custom')) { await activateCredential(credential.id); await save(); }
        else await save();
        await bridge.emit(context.eventTypes.SECRET_ROTATED,key || `api_key_${source}`);
      }
      return secrets()[source] || (source === sourceOf(bridge.connection().source || 'custom') ? context.extensionSettings.eleckoi_secret_id || bridge.connection().configId : '') || '';
    },
    async findSecret(key, reference) {
      const source = sourceOf(key?.replace(/^api_key_/, '') || bridge.connection().source || 'custom');
      const list = await bridge.call('models.list');
      const id = reference || await api.secret(key);
      const value = list.find(value => [value.id,value.name].includes(id));
      if (!value) throw new Error(`Secret connection does not exist: ${id}`);
      return {id:value.id,source};
    },
    async readSecret(key, reference) {
      const {id} = await api.findSecret(key,reference); return bridge.call('secrets.read',{id});
    },
    async writeSecret(key, label, value, allowEmpty = false) {
      const {id:baseId,source} = await api.findSecret(key);
      const id = await bridge.call('secrets.write',{baseId,label,value,allowEmpty});
      secrets()[source] = id;
      if (source === sourceOf(bridge.connection().source || 'custom')) { await activateCredential(id); await save(); }
      else await save();
      await bridge.emit(context.eventTypes.SECRET_WRITTEN,key || `api_key_${source}`);
      return id;
    },
    async renameSecret(key, reference, label) {
      const {id,source} = await api.findSecret(key,reference);
      const result = await bridge.call('secrets.rename',{id,label});
      await bridge.emit(context.eventTypes.SECRET_EDITED,key || `api_key_${source}`); return result;
    },
    async deleteSecret(key, reference) {
      const {id,source} = await api.findSecret(key,reference);
      await bridge.call('secrets.delete',{id});
      // Profiles own endpoint copies, but deleting their shared source credential must clear those copies too.
      const copies = new Set(settings().profiles.filter(profile => profile['secret-id'] === id).map(profile => profile.eleckoi_owned_config_id).filter(Boolean));
      if (context.extensionSettings.eleckoi_secret_id === id) copies.add(bridge.connection().configId);
      for (const copyId of copies) if (copyId && copyId !== id) await bridge.call('models.put',{config:{id:copyId,apiKey:''}});
      if (secrets()[source] === id) delete secrets()[source];
      if (context.extensionSettings.eleckoi_secret_id === id) context.extensionSettings.eleckoi_secret_id = '';
      await save(); await bridge.emit(context.eventTypes.SECRET_DELETED,key || `api_key_${source}`); return id;
    },
    async requestOptions(reference) {
      const profile = api.get(reference); if (!profile) throw new Error('No connection profile selected');
      const effective = {...snapshot(),...profile};
      for (const key of profile.exclude || []) effective[key] = snapshot()[key];
      const mapping = CONNECT_API_MAP[effective.api];
      if (!mapping) throw new Error(`Unknown API type ${effective.api}`);
      if (!['openai', 'textgenerationwebui', 'kobold', 'novel', 'koboldhorde'].includes(mapping.selected)) {
        throw new Error(`ConnectionManager request service does not support ${effective.api}`);
      }
      const list = await bridge.call('models.list');
      const origin = list.find(value => value.id === effective.eleckoi_config_id);
      const credentialId = effective['secret-id'] || origin?.id;
      const credential = credentialId ? await api.readSecret(undefined,credentialId) : '';
      const proxy = effective.proxy ? proxies().find(value => value.name === effective.proxy) : null;
      if (effective.proxy && !proxy) throw new Error(`Proxy preset does not exist: ${effective.proxy}`);
      const endpoint = proxy?.url || proxy?.apiurl || effective['api-url'] || endpoints()[sourceOf(effective.api)] || origin?.baseUrl || defaultEndpoint(effective.api,effective.model) || '';
      const key = proxy?.password ?? proxy?.key ?? credential;
      if (mapping.selected !== 'openai') return {
        transport: 'textgenerationwebui', configId: origin?.id || credentialId, model: effective.model || origin?.model,
        preset_name: Object.hasOwn(profile, 'preset') ? effective.preset : undefined, instruct_name: effective.instruct,
        text_request: { api_type: mapping.type || (mapping.selected === 'koboldhorde' ? 'horde' : mapping.selected), api_server: endpoint, model: effective.model || origin?.model,
          configId: origin?.id || credentialId, api_key: key, custom_include_headers: origin?.customHeaders || {} },
      };
      return { configId:origin?.id, model:effective.model || origin?.model, preset_name:effective.preset,
        custom_api:{apiurl:endpoint,
          key, model:effective.model || origin?.model,
          source:({responses:'responses',anthropic_messages:'claude',google_gemini:'makersuite'})[effective.eleckoi_api_format || origin?.apiFormat] || sourceOf(effective.api),
          custom_include_headers:origin?.customHeaders || {}} };
    },
    proxies: () => copy(proxies()),
    async putProxy(value) { if (!value.name) throw new TypeError('Proxy requires a name'); const old = proxies().find(item => item.name === value.name);
      if (old) Object.assign(old,copy(value)); else proxies().push(copy(value)); await save(); return copy(old || value); },
    async deleteProxy(name) { const index = proxies().findIndex(value => value.name === name); if (index < 0) return false;
      proxies().splice(index,1); await save(); return true; },
  };
  return api;
}
