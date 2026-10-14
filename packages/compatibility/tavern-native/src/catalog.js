import { serializeWorldbookEntries, hydrateWorldbookEntries } from './worldbook-values.js';
const copy = value => value === undefined ? undefined : structuredClone(value);
const list = value => Array.isArray(value) ? value : value?.items ?? [];
const identity = value => typeof value === 'string' ? value : value?.id ?? value?.name;
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const merge = (previous, patch) => Object.fromEntries(Object.entries({ ...asObject(previous), ...asObject(patch) }).map(([key,value]) =>
  [key, value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Blob) && !(value instanceof RegExp)
    ? merge(previous?.[key],value) : copy(value)]));
const systemPromptIds = new Set(['main','nsfw','jailbreak','enhanceDefinitions']);
const placeholderPromptIds = new Set(['worldInfoBefore','personaDescription','charDescription','charPersonality','scenario','worldInfoAfter','dialogueExamples','chatHistory']);
const promptId = prompt => prompt?.id ?? prompt?.identifier;
const defaultPreset=()=>({settings:{max_context:8192,max_completion_tokens:1024,reply_count:1,should_stream:true,temperature:1,frequency_penalty:0,presence_penalty:0,top_p:1,repetition_penalty:1,min_p:0,top_k:0,top_a:0,seed:-1,squash_system_messages:false,reasoning_effort:'auto',request_thoughts:true,request_images:false,enable_function_calling:true,enable_web_search:false,allow_sending_images:'auto',allow_sending_videos:false,character_name_prefix:'none',wrap_user_messages_in_quotes:false},prompts:[],prompts_unused:[],extensions:{}});
const validatePreset = preset => {
  const seen=new Set();
  for (const prompt of [...preset.prompts??[],...preset.prompts_unused??[]]) {
    const id=promptId(prompt);
    if ((systemPromptIds.has(id)||placeholderPromptIds.has(id)) && seen.has(id)) throw new Error(`预设系统或占位提示词重复：${id}`);
    seen.add(id);
  }
  return preset;
};
const worldToLore = entry => {
  const strategy=entry.strategy??{}, position=entry.position??{}, recursion=entry.recursion??{}, effect=entry.effect??{};
  return { ...copy(entry), uid:entry.uid, display_index:entry.display_index??entry.viewOrder??0, comment:entry.name??entry.comment??'',
    type:strategy.type??entry.type??'selective', position:position.type==='at_depth'?`at_depth_as_${position.role??'system'}`:position.type??entry.position,
    depth:position.depth??null, order:position.order??entry.order??100, keys:copy(strategy.keys??entry.keys??[]),
    logic:strategy.keys_secondary?.logic??entry.logic??'and_any', filters:copy(strategy.keys_secondary?.keys??entry.filters??[]),
    scan_depth:strategy.scan_depth??entry.scan_depth??'same_as_global', probability:entry.probability??100,
    case_sensitive:entry.case_sensitive??'same_as_global', match_whole_words:entry.match_whole_words??'same_as_global', use_group_scoring:entry.use_group_scoring??'same_as_global',
    automation_id:entry.automation_id??null, exclude_recursion:recursion.prevent_incoming??false, prevent_recursion:recursion.prevent_outgoing??false,
    delay_until_recursion:recursion.delay_until??false, group:entry.group??'', group_prioritized:entry.group_prioritized??false, group_weight:entry.group_weight??100,
    sticky:effect.sticky??null, cooldown:effect.cooldown??null, delay:effect.delay??null };
};
const loreToWorld = entry => {
  const depth=/^at_depth_as_(system|assistant|user)$/.exec(entry.position??'');
  return { ...copy(entry), name:entry.comment??entry.name??'',
    strategy:{...asObject(entry.strategy),type:entry.type??entry.strategy?.type??'selective',keys:copy(entry.keys??entry.strategy?.keys??[]),
      keys_secondary:{logic:entry.logic??entry.strategy?.keys_secondary?.logic??'and_any',keys:copy(entry.filters??entry.strategy?.keys_secondary?.keys??[])},scan_depth:entry.scan_depth??entry.strategy?.scan_depth??'same_as_global'},
    position:{...asObject(entry.position),type:depth?'at_depth':typeof entry.position==='string'?entry.position:entry.position?.type??'before_character_definition',
      role:depth?.[1]??entry.position?.role??'system',depth:entry.depth??entry.position?.depth??0,order:entry.order??entry.position?.order??100},
    recursion:{prevent_incoming:entry.exclude_recursion??entry.recursion?.prevent_incoming??false,prevent_outgoing:entry.prevent_recursion??entry.recursion?.prevent_outgoing??false,
      delay_until:entry.delay_until_recursion===true?1:entry.delay_until_recursion===false?null:entry.delay_until_recursion??entry.recursion?.delay_until??null},
    effect:{sticky:entry.sticky??entry.effect?.sticky??null,cooldown:entry.cooldown??entry.effect?.cooldown??null,delay:entry.delay??entry.effect?.delay??null} };
};

/** Public catalog names are projections of the authoritative native snapshot. */
export function createCatalogFunctions(rt) {
  const items = kind => list(rt.snapshot[kind]);
  const names = kind => items(kind).map(item => item.name ?? item.id);
  const publicId = item => item.avatar_id ?? item.id;
  const ids = kind => items(kind).map(publicId);
  const active = kind => rt.snapshot[kind]?.activeId ?? rt.snapshot.context?.[`${kind.slice(0, -1)}Id`];
  const lookup = (kind,name,allowAvatar=true) => {
    const selected = name === undefined || name === 'current' || name === 'in_use' ? active(kind) : identity(name);
    const exact=items(kind).find(item=>item.id===selected || allowAvatar&&(item.avatar_id===selected||item.avatar===selected));
    if (exact) return exact;
    const matches=items(kind).filter(item=>item.name===selected);
    if (matches.length>1) throw new Error(`名称不唯一：${selected}`);
    return matches[0];
  };
  const resolve = (kind, name) => {
    const found=lookup(kind,name);
    if (!found) throw new Error(`找不到 ${kind}：${identity(name)??''}`);
    return found.id;
  };
  const currentName = kind => items(kind).find(item => item.id === active(kind))?.name ?? '';
  const cached = (kind,name) => copy(kind==='preset'&&['current','in_use',undefined].includes(name)&&rt.snapshot.presets.inUse?rt.snapshot.presets.inUse:items(`${kind}s`).find(item=>item.id===resolve(`${kind}s`,name)));
  const read = (kind, name) => kind === 'persona' || kind === 'preset' ? cached(kind, name) : rt.request(`${kind}.get`, { id: resolve(`${kind}s`, name) });
  const write = async (kind, name, data, mode = 'replace', options = {}) => {
    const value=copy(asObject(data));
    if (value.avatar && typeof value.avatar.arrayBuffer==='function') {
      const bytes=new Uint8Array(await value.avatar.arrayBuffer()); let binary='';
      for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
      value.avatar=`data:${value.avatar.type||'image/png'};base64,${rt.window.btoa(binary)}`;
    }
    if(kind==='preset')validatePreset(value);
    return rt.commit(`${kind}.${mode}`, {
      ...(mode === 'create' ? { name: identity(name) } : { id: resolve(`${kind}s`, name) }),...(kind==='preset'&&mode!=='create'?{inUse:name==='in_use'||name==='current'}:{}),data:value,options:copy(options)
    });
  };
  const create = async (kind, name, data, options) => {
    if (['current','in_use'].includes(identity(name)) || lookup(`${kind}s`,name) || kind==='persona'&&data?.avatar_id&&lookup('personas',data.avatar_id)) return false;
    await write(kind, name, data, 'create', options);
    return true;
  };
  const replace = async (kind, name, data, options) => { await write(kind, name, data, 'replace', options); };
  const upsert = async (kind, name, data, options) => {
    const exists = !!lookup(`${kind}s`,name);
    if (exists) { await replace(kind, name, data, options); return false; }
    await create(kind, name, data, options); return true;
  };
  const remove = async (kind, name, options) => {
    const key = ['current','in_use'].includes(name) ? active(`${kind}s`) : identity(name);
    let existing; try { existing=lookup(`${kind}s`,key); } catch { return false; }
    if (!existing) return false;
    await rt.commit(`${kind}.delete`, { id: existing.id, options: copy(options ?? {}) }); return true;
  };
  const update = async (kind, name, updater, options) => {
    if (typeof updater !== 'function') throw new TypeError('更新器必须是函数。');
    const value = copy(await read(kind, name));
    const result = await updater(value);
    await write(kind, name, result === undefined ? value : result, 'replace', options);
    return read(kind,name);
  };
  const worldbook = async name => hydrateWorldbookEntries(await rt.request('worldbook.get', { name: identity(name) }));
  const writeWorldbook = async (name, entries, mode = 'replace', options = {}) => {
    const result = await rt.commit(`worldbook.${mode}`, { name: identity(name), entries: serializeWorldbookEntries(entries), options: copy(options) });
    return Array.isArray(result) ? hydrateWorldbookEntries(result) : result;
  };
  const updateWorldbook = async (name, updater, options) => {
    if (typeof updater !== 'function') throw new TypeError('更新器必须是函数。');
    const entries = copy(await worldbook(name));
    const result = await updater(entries);
    return writeWorldbook(name, result === undefined ? entries : result, 'replace', options);
  };
  const binding = async (scope, owner, names) => { await rt.commit('worldbook.bindings', {
    scope, owner: owner === undefined || owner === 'current' ? undefined : scope === 'character' ? resolve('characters', owner) : identity(owner), names: copy(names)
  }); };
  const bindings = (scope, owner) => {
    const state = rt.snapshot.worldbooks?.bindings ?? {};
    if (scope === 'global') return copy(state.global ?? []);
    const id = owner === undefined || owner === 'current'
      ? (scope === 'character' ? rt.snapshot.context?.characterId : rt.snapshot.context?.conversationId)
      : (scope === 'character' ? resolve('characters', owner) : identity(owner));
    return copy(state[scope]?.[id] ?? (scope === 'chat' ? null : { primary: null, additional: [] }));
  };
  const regexes = options => {
    const collection = rt.snapshot.regexes ?? {};
    const scope = options?.scope ?? 'all';
    const result = scope === 'all' ? [...(collection.global ?? []), ...(collection.preset ?? []), ...(collection.character ?? [])] : collection[scope] ?? [];
    return copy(options?.enable_state === 'enabled' ? result.filter(rule => rule.enabled !== false) : options?.enable_state === 'disabled' ? result.filter(rule => rule.enabled === false) : result);
  };
  class RawCharacter {
    #card;
    constructor(data) { this.#card=copy(asObject(data)); }
    static async get(name='current') { return new RawCharacter(await read('character',name)); }
    static find({name='current'}={}) { return copy(lookup('characters',name))??null; }
    static findIndex(name) { const found=lookup('characters',name); return found?items('characters').indexOf(found):-1; }
    static getChatsFromFiles(data,isGroupChat=false) { return rt.request('chat.historyFiles',{data:copy(data),isGroupChat}); }
    getCardData() { return this.#card; }
    getAvatarId() { return this.#card.avatar_id??this.#card.avatar??this.#card.id??''; }
    getRegexScripts() {
      const scripts=this.#card.data?.extensions?.regex_scripts??this.#card.extensions?.regex_scripts??[];
      return copy(scripts.map(rule=>({...rule,scriptName:rule.scriptName??rule.name??'',findRegex:rule.findRegex??rule.find_regex??rule.pattern??'',replaceString:rule.replaceString??rule.replace_string??rule.replacement??'',
        trimStrings:rule.trimStrings??[],placement:rule.placement??Object.entries({user_input:1,ai_output:2,slash_command:3,world_info:5,reasoning:6}).filter(([name])=>rule.source?.[name]).map(([,value])=>value),
        disabled:rule.disabled??rule.enabled===false,markdownOnly:rule.markdownOnly??rule.displayOnly??false,promptOnly:rule.promptOnly??false,runOnEdit:rule.runOnEdit??true,
        substituteRegex:rule.substituteRegex??0,minDepth:rule.minDepth??rule.min_depth??null,maxDepth:rule.maxDepth??rule.max_depth??null})));
    }
    getCharacterBook() { return copy(this.#card.data?.character_book??this.#card.character_book??null); }
    getWorldName() { return this.#card.data?.extensions?.world??this.#card.extensions?.world??this.#card.worldbook??''; }
    get data() { return this.#card.data??this.#card; }
    getAvatarPath() { return this.#card.avatar_path??this.#card.avatar??this.#card.persona?.assistant_avatar??''; }
    getData() { return this.data; }
    async save() { return replace('character',this.#card.id??this.#card.name,this.#card); }
  }
  const result = {
    getCharacterNames: () => names('characters'), getCharacterIds: () => ids('characters'),
    getCurrentCharacterName: () => currentName('characters') || null, getCurrentCharacterId: () => { const item=lookup('characters','current'); return item?publicId(item):null; },
    createCharacter: (name, data, options) => create('character', name, data, options),
    createOrReplaceCharacter: (name, data, options) => upsert('character', name, data, options),
    deleteCharacter: (name, options) => remove('character', name, options),
    getCharacter: (name = 'current') => read('character', name),
    replaceCharacter: (name, data, options) => replace('character', name, data, options),
    updateCharacterWith: (name, updater, options) => update('character', name, updater, options),
    RawCharacter, getCharData: (name = 'current') => RawCharacter.find({name}),
    getCharAvatarPath: (name='current') => lookup('characters',name)?.avatar_path??lookup('characters',name)?.avatar??null,
    getChatHistoryBrief: (name='current',allowAvatar=true) => { const found=lookup('characters',name,allowAvatar); return found?rt.request('chat.historyBrief',{characterId:found.id}):Promise.resolve(null); },
    getChatHistoryDetail: (data,isGroupChat=false) => RawCharacter.getChatsFromFiles(data,isGroupChat),
    getPersonaNames: () => names('personas'), getPersonaIds: () => ids('personas'),
    getCurrentPersonaName: () => currentName('personas') || null, getCurrentPersonaId: () => { const item=lookup('personas','current'); return item?publicId(item):null; },
    getPersonaAvatarPath: (name='current') => { try { const item=lookup('personas',name); return item?.avatar_path??item?.avatar??null; } catch { return null; } },
    getPersona: (name = 'current') => read('persona', name),
    createPersona: (name, data, options) => create('persona', name, data, options),
    createOrReplacePersona: (name, data, options) => upsert('persona', name, data, options),
    deletePersona: (name, options) => remove('persona', name, options),
    replacePersona: (name, data, options) => replace('persona', name, data, options),
    updatePersonaWith: (name, updater, options) => update('persona', name, updater, options),
    isPresetNormalPrompt: prompt => !!prompt&&!systemPromptIds.has(promptId(prompt))&&!placeholderPromptIds.has(promptId(prompt)),
    isPresetSystemPrompt: prompt => systemPromptIds.has(promptId(prompt)),
    isPresetPlaceholderPrompt: prompt => placeholderPromptIds.has(promptId(prompt)),
    getPresetNames: () => names('presets'), getLoadedPresetName: () => currentName('presets'),
    loadPreset: name => {
      const item = items('presets').find(item => item.id === name || item.name === name); if (!item) return false;
      rt.stage('preset.select',{id:item.id},snapshot=>{snapshot.presets.activeId=item.id;snapshot.presets.inUse=copy(item);snapshot.context.presetId=item.id;}); return true;
    },
    getPreset: (name = 'current') => read('preset', name),
    default_preset:defaultPreset(),
    createPreset:(name,data,options)=>create('preset',name,data??defaultPreset(),options),
    createOrReplacePreset:(name,data,options)=>upsert('preset',name,data??defaultPreset(),options),
    deletePreset:(name,options)=>['in_use','current'].includes(name)?Promise.resolve(false):remove('preset',name,options),
    renamePreset: async (name,newName) => { const item=lookup('presets',name); if(!item||['in_use','current'].includes(name)||lookup('presets',newName))return false; await rt.commit('preset.rename',{id:item.id,name:newName}); return true; },
    replacePreset: (name, data, options) => replace('preset', name, data, options),
    updatePresetWith: (name, updater, options) => update('preset', name, updater, options),
    setPreset: async (name,data,options) => { if(typeof name!=='string'){options=data;data=name;name='in_use';} await write('preset',name,merge(cached('preset',name),data),'replace',options); return cached('preset',name); },
    getWorldbookNames: () => names('worldbooks'), getGlobalWorldbookNames: () => bindings('global'),
    rebindGlobalWorldbooks: values => binding('global', undefined, values),
    getCharWorldbookNames: (name = 'current') => bindings('character', name),
    rebindCharWorldbooks: (name, values) => binding('character', name, values),
    getChatWorldbookName: (chat = 'current') => bindings('chat', chat),
    rebindChatWorldbook: (chat, value) => binding('chat', chat, value),
    getOrCreateChatWorldbook: (chat = 'current', name) => rt.commit('worldbook.getOrCreateChat', { owner: chat === 'current' ? undefined : identity(chat), name }),
    getWorldbook: worldbook,
    createWorldbook: async (name, entries = [], options) => { if (names('worldbooks').includes(name)) return false; await writeWorldbook(name, entries, 'create', options); return true; },
    createOrReplaceWorldbook: async (name, entries = [], options) => { const fresh = !names('worldbooks').includes(name); await writeWorldbook(name, entries, fresh ? 'create' : 'replace', options); return fresh; },
    deleteWorldbook: async (name, options) => { if (!names('worldbooks').includes(name)) return false; await rt.commit('worldbook.delete', { name, options: copy(options ?? {}) }); return true; },
    updateWorldbookWith: updateWorldbook,
    getLorebookSettings: () => copy(rt.snapshot.lorebookSettings ?? {}),
    setLorebookSettings: patch => { const value={...rt.snapshot.lorebookSettings,...patch}; rt.stage('worldbook.settings',{data:copy(value)},snapshot=>{snapshot.lorebookSettings=copy(value);}); },
    getLorebooks: () => names('worldbooks'), getCharLorebooks: (options={}) => { const value=bindings('character',typeof options==='string'?options:options.name??'current'); return {primary:options.type==='additional'?null:value.primary,additional:options.type==='primary'?[]:value.additional}; },
    getCurrentCharPrimaryLorebook: () => bindings('character')?.primary ?? null,
    setCurrentCharLorebooks: value => binding('character',undefined,{...bindings('character'),...value}),
    getChatLorebook: (chat = 'current') => bindings('chat', chat),
    setChatLorebook: (name, chat = 'current') => binding('chat', chat, name),
    getLorebookEntries: async name => (await worldbook(name)).map(worldToLore),
    replaceLorebookEntries: async (name,entries,options) => { await writeWorldbook(name,entries.map(loreToWorld),'replace',options); },
    updateLorebookEntriesWith: async (name,updater,options) => { const previous=(await worldbook(name)).map(worldToLore); const result=await updater(previous); return (await writeWorldbook(name,(result??previous).map(loreToWorld),'replace',options)).map(worldToLore); },
    setLorebookEntries: async (name,updates,options) => result.updateLorebookEntriesWith(name,entries=>entries.map(entry=>merge(entry,updates.find(update=>update.uid===entry.uid)??{})),options),
    isCharacterTavernRegexesEnabled: () => rt.snapshot.regexes?.characterEnabled !== false,
    getTavernRegexes: regexes,
    replaceTavernRegexes: async (rules,options={}) => { await rt.commit('regex.replace',{rules:copy(rules),options:copy(options)}); },
    updateTavernRegexesWith: async (updater,options={}) => { const current=regexes(options); const changed=await updater(current); await rt.commit('regex.replace',{rules:copy(changed??current),options:copy(options)}); return regexes(options); },
    formatAsTavernRegexedString: (text, source, destination, options = {}) => {
      let value = String(text);
      for (const rule of regexes({scope:'all',enable_state:'enabled'})) {
        if(rule.scope==='character'&&!result.isCharacterTavernRegexesEnabled())continue;
        if(rule.source&&rule.source[source]===false)continue;
        if(rule.destination&&rule.destination[destination]===false)continue;
        const targets = rule.targets ?? rule.placement ?? [];
        if (targets.length && !targets.includes(source) && !targets.includes({ user_input: 1, ai_output: 2, slash_command: 3, world_info: 5, reasoning: 6 }[source]) && !targets.includes({ user_input: 'UserInput', ai_output: 'AiOutput', slash_command: 'SlashCommand', world_info: 'SettingContent', reasoning: 'Reasoning' }[source])) continue;
        if ((rule.displayOnly ?? rule.markdown_only) && destination !== 'display') continue;
        if ((rule.promptOnly ?? rule.prompt_only) && destination !== 'prompt') continue;
        const depth = options.depth;
        if (typeof depth === 'number' && ((rule.min_depth ?? rule.minDepth) != null && depth < (rule.min_depth ?? rule.minDepth) || (rule.max_depth ?? rule.maxDepth) != null && depth > (rule.max_depth ?? rule.maxDepth))) continue;
        const sourcePattern = rule.pattern ?? rule.find_regex ?? rule.findRegex ?? '';
        const literal = /^\/(.*)\/([a-z]*)$/s.exec(sourcePattern);
        const pattern = new RegExp(literal ? literal[1] : sourcePattern, literal ? literal[2] : 'g');
        value = value.replace(pattern,rule.replacement??rule.replace_string??rule.replaceString??'');
        for(const trim of rule.trimStrings??[])value=value.replaceAll(trim,'');
      }
      return value;
    }
  };
  result.createLorebook=result.createWorldbook; result.deleteLorebook=result.deleteWorldbook;
  result.getOrCreateChatLorebook=name=>result.getOrCreateChatWorldbook('current',name);
  result.replaceWorldbook=async (name,entries,options)=>{await writeWorldbook(name,entries,'replace',options);};
  result.createWorldbookEntries=async (name,entries,options)=>{
    const previous=await worldbook(name), updated=await writeWorldbook(name,entries,'createEntries',options), ids=new Set(previous.map(entry=>String(entry.uid)));
    return {worldbook:updated,new_entries:updated.filter(entry=>!ids.has(String(entry.uid)))};
  };
  result.deleteWorldbookEntries=async (name,selector,options)=>{
    const previous=await worldbook(name), selected=typeof selector==='function'?previous.filter(selector):previous.filter(entry=>(selector??[]).includes(entry.uid));
    const updated=hydrateWorldbookEntries(await rt.commit('worldbook.deleteEntries',{name,ids:selected.map(entry=>entry.uid),options:copy(options??{})}));
    return {worldbook:updated,deleted_entries:selected};
  };
  result.createLorebookEntries=async (name,entries,options)=>{ const value=await result.createWorldbookEntries(name,entries.map(loreToWorld),options); return {entries:value.worldbook.map(worldToLore),new_uids:value.new_entries.map(entry=>entry.uid)}; };
  result.deleteLorebookEntries=async (name,ids,options)=>{ const value=await result.deleteWorldbookEntries(name,ids,options); return {entries:value.worldbook.map(worldToLore),delete_occurred:value.deleted_entries.length>0}; };
  for (const [fn, kind] of Object.entries({ importRawCharacter: 'character', importRawChat: 'chat', importRawPreset: 'preset', importRawWorldbook: 'worldbook', importRawTavernRegex: 'regex' })) {
    result[fn] = async (file, contentOrOptions = {}) => {
      let options=contentOrOptions;
      if (typeof file === 'string' && (typeof contentOrOptions === 'string' || typeof contentOrOptions?.arrayBuffer === 'function')) { const name=file; file=contentOrOptions; options={name}; }
      const isBlob = typeof Blob !== 'undefined' && file instanceof Blob;
      if (isBlob && (kind === 'character' || kind === 'preset') && (file.type === 'image/png' || /\.png$/i.test(file.name ?? ''))) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        return rt.commit(`import.${kind}`, { base64: rt.window.btoa(binary), mimeType: 'image/png', name: file.name ?? options.name, options: copy(options) });
      }
      const raw = isBlob ? await file.text() : typeof file === 'string' ? file : JSON.stringify(file);
      return rt.commit(`import.${kind}`, { raw, name: file?.name ?? options.name, options: copy(options) });
    };
  }
  return result;
}
