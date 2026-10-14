const clone = value => value === undefined ? undefined : structuredClone(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/** One application-owned event bus, shared by all author frames. */
export class SharedEventHub {
  constructor() { this.events = new Map(); }
  on(event, listener, once = false, first = false) {
    if (typeof event !== 'string' || !event || typeof listener !== 'function') throw new TypeError('事件名和回调函数必须有效。');
    const entries = this.events.get(event) ?? [];
    if (!entries.some(entry => entry.listener === listener)) {
      const entry = { listener, once };
      first ? entries.unshift(entry) : entries.push(entry);
      this.events.set(event, entries);
    }
    return () => this.remove(event, listener);
  }
  remove(event, listener) {
    const entries = this.events.get(event);
    if (!entries) return;
    const next = entries.filter(entry => entry.listener !== listener);
    next.length ? this.events.set(event, next) : this.events.delete(event);
  }
  move(event, listener, first) {
    const entries = this.events.get(event);
    const entry = entries?.find(entry => entry.listener === listener);
    if (!entry) { this.on(event, listener, false, first); return; }
    this.remove(event, listener);
    const next = this.events.get(event) ?? [];
    first ? next.unshift(entry) : next.push(entry); this.events.set(event, next);
  }
  listeners(event) { return [...(this.events.get(event) ?? [])]; }
  emit(event, ...args) {
    const results = [];
    for (const entry of this.listeners(event)) {
      if (!(this.events.get(event) ?? []).includes(entry)) continue;
      if (entry.once) this.remove(event, entry.listener);
      results.push(entry.listener(...args));
    }
    return results;
  }
  async emitAndWait(event, ...args) {
    const results = [];
    for (const entry of this.listeners(event)) {
      if (!(this.events.get(event) ?? []).includes(entry)) continue;
      if (entry.once) this.remove(event, entry.listener);
      results.push(await entry.listener(...args));
    }
    return results;
  }
  clearEvent(event) { this.events.delete(event); }
  clearListener(listener) { for (const event of this.events.keys()) this.remove(event, listener); }
  clearAll() { this.events.clear(); }
}

export function createEventFunctions(rt) {
  const shared = rt.shared ?? (rt.shared = {});
  const hub = shared.eventHub ?? (shared.eventHub = new SharedEventHub());
  const owned = new Map();
  const unregister = (event, listener) => {
    const entries = owned.get(event), entry = entries?.get(listener);
    if (!entry) return;
    entry.stop(); entries.delete(listener); if (!entries.size) owned.delete(event);
  };
  const register = (event, listener, once = false) => {
    const entries = owned.get(event) ?? new Map();
    if (!entries.has(listener)) {
      if (typeof listener !== 'function') throw new TypeError('事件回调必须是函数。');
      const wrapped = (...args) => { if (once) unregister(event, listener); return listener(...args); };
      entries.set(listener, { wrapped, stop: hub.on(event, wrapped, once) }); owned.set(event, entries);
    }
    return { stop: () => unregister(event, listener) };
  };
  const reorder = (event, listener, first) => {
    const subscription = register(event, listener);
    hub.move(event, owned.get(event).get(listener).wrapped, first); return subscription;
  };
  const clearEvent = event => { for (const listener of [...(owned.get(event)?.keys() ?? [])]) unregister(event, listener); };
  const clearAll = () => { for (const event of [...owned.keys()]) clearEvent(event); };
  rt.addCleanup?.(clearAll);
  return {
    eventOn: (event, listener) => register(event, listener),
    eventOnce: (event, listener) => register(event, listener, true),
    eventMakeFirst: (event, listener) => reorder(event, listener, true),
    eventMakeLast: (event, listener) => reorder(event, listener, false),
    eventOnButton: (event, listener) => { clearEvent(event); register(event, listener); },
    eventEmit: async (event, ...args) => { await Promise.all(hub.emit(event,...args)); },
    eventEmitAndWait: (event, ...args) => { rt.track(hub.emitAndWait(event,...args)); },
    eventRemoveListener: unregister,
    eventClearEvent: clearEvent,
    eventClearListener: listener => { for (const event of [...owned.keys()]) unregister(event, listener); },
    eventClearAll: clearAll,
    eventWaitOnce: (event, options = {}) => new Promise((resolve, reject) => {
      if (typeof options === 'number') options = { timeout: options };
      const signal = options.signal;
      let timer, removeCleanup;
      const finish = () => { unregister(event, listener); if (timer !== undefined) rt.window.clearTimeout(timer); signal?.removeEventListener('abort', cancel); removeCleanup?.(); };
      const cancel = () => { finish(); reject(signal.reason ?? new Error('等待事件已取消。')); };
      const listener = (...args) => {
        if (options.predicate && !options.predicate(...args)) return;
        finish(); resolve(args);
      };
      if (signal?.aborted) { reject(signal.reason); return; }
      register(event, listener);
      removeCleanup=rt.addCleanup?.(()=>{finish();reject(new Error('等待事件的脚本已关闭。'));});
      signal?.addEventListener('abort', cancel, { once: true });
      if (Number.isFinite(options.timeout) && options.timeout >= 0) timer = rt.window.setTimeout(() => { finish(); reject(new Error(`等待事件超时：${event}`)); }, options.timeout);
    })
  };
}

export function createRuntimeFunctions(rt) {
  const shared = rt.shared ?? (rt.shared = {});
  const globals = shared.globals ?? (shared.globals = new Map());
  const waitingGlobals = shared.globalWaiters ?? (shared.globalWaiters = new Map());
  const request = (method, params = {}) => rt.native?.request
    ? rt.native.request(method, params) : rt.api?.request ? rt.api.request(method, params) : Promise.reject(new Error(`原生运行时未提供 ${method} 入口。`));
  const scripts = () => Array.isArray(rt.snapshot.scripts) ? rt.snapshot.scripts : [];
  const installedGlobals = new Map();
  const publishGlobal = (name,value) => {
    if (!installedGlobals.has(name)) installedGlobals.set(name,Object.getOwnPropertyDescriptor(rt.window,name));
    Object.defineProperty(rt.window,name,{configurable:true,get:()=>globals.get(name)});
  };
  for (const [name,value] of globals) publishGlobal(name,value);
  rt.on('eleckoi:global-initialized',publishGlobal);
  rt.addCleanup(()=>{ for (const [name,descriptor] of installedGlobals) { if(descriptor) Object.defineProperty(rt.window,name,descriptor); else delete rt.window[name]; } });
  if (rt.native.subscribe) for (const event of ['audio.state.changed','audio.time.updated']) {
    const stop=rt.native.subscribe(event,payload=>{ if(payload.state) (rt.shared.audio??={})[payload.state.channel]=clone(payload.state); }); rt.addCleanup(stop);
  }
  let buttonsSignature='', buttonStops=[];
  const registerButtons = () => {
    if (!rt.scriptId || !rt.native.registerButton) return;
    const script=scripts().find(item=>item.id===rt.scriptId);
    const values=script?.enabled!==false&&script?.libraryEnabled!==false&&script?.button?.enabled!==false?script?.button?.buttons??[]:[];
    const signature=JSON.stringify(values); if (signature===buttonsSignature) return;
    buttonsSignature=signature; buttonStops.forEach(stop=>stop()); buttonStops=[];
    for (const [index,button] of values.entries()) if(button.visible!==false) buttonStops.push(rt.native.registerButton({
      id:button.id??`${script.id}:${index}`,label:button.name,onClick:()=>shared.eventHub.emitAndWait(`eleckoi:script-button:${script.id}:${button.name}`),
    }));
  };
  registerButtons(); rt.on('snapshot.updated',registerButtons); rt.addCleanup(()=>buttonStops.forEach(stop=>stop()));
  const currentScript = id => {
    const selected = id ?? rt.snapshot.context?.scriptId ?? rt.scriptId;
    const script = scripts().find(script => script.id === selected || script.name === selected);
    if (!script) throw new Error(`原生脚本不存在或当前页面没有脚本身份：${selected ?? ''}`);
    return script;
  };
  const scriptParams = id => { const script = currentScript(id); return { id: script.id, scope: script.scope, ownerId: script.ownerId }; };
  const treeParams = options => {
    const settings = typeof options === 'string' ? { type: options } : object(options);
    return { scope: settings.scope ?? settings.type ?? 'global', ownerId: settings.ownerId ?? settings.character_id ?? settings.preset_id };
  };
  const change = (method, field, value, id) => {
    const params=scriptParams(id), candidate=clone(value);
    rt.stage(method,{ ...params,[field]:candidate },snapshot=>{
      for (const script of snapshot.scripts??[]) if (script.id===params.id) { if (field==='buttons') script.button={...script.button,buttons:candidate}; else script[field]=candidate; }
      for (const entry of snapshot.scriptLibraries??[]) for (const tree of entry.trees) for (const script of tree.type==='folder' ? tree.scripts : [tree]) if (script.id===params.id) { if (field==='buttons') script.button={...script.button,buttons:candidate}; else script[field]=candidate; }
    });
  };
  const update = (method, field, getter, updater, id) => {
    if (typeof updater !== 'function') throw new TypeError('更新器必须是函数。');
    const previous=clone(getter(id)), result=updater(previous);
    const save=value=>{ value=value??previous; change(method,field,value,id); return value; };
    return result && typeof result.then==='function' ? result.then(save) : save(result);
  };
  const library = options => {
    const params=treeParams(options), context=rt.snapshot.context;
    const owner=params.ownerId??(params.scope==='global'?'':params.scope==='character'?context.characterId:context.presetId);
    const found=(rt.snapshot.scriptLibraries??[]).find(item=>item.scope===params.scope && item.ownerId===owner);
    if (!found) throw new Error(`当前页面没有该脚本库：${params.scope}:${owner}`);
    return found;
  };
  const replaceTrees = (trees, options) => {
    const normalize=tree=>{
      const id=tree.id??rt.window.crypto.randomUUID();
      if(tree.type==='folder'||Array.isArray(tree.scripts))return {type:'folder',enabled:true,name:'',icon:'',color:'',...clone(tree),id,scripts:(tree.scripts??[]).map(normalize)};
      return {type:'script',enabled:true,name:'',content:'',info:'',data:{},...clone(tree),id,button:{enabled:true,buttons:[],...tree.button},export_with:{data:true,button:true,...tree.export_with}};
    };
    trees=trees.map(normalize);
    const selected=library(options),params={scope:selected.scope,ownerId:selected.ownerId,trees:clone(trees)};
    rt.stage('scripts.replaceTrees',params,snapshot=>{
      const target=snapshot.scriptLibraries.find(item=>item.scope===selected.scope && item.ownerId===selected.ownerId); target.trees=clone(trees);
      snapshot.scripts=snapshot.scripts.filter(item=>!(item.scope===selected.scope && item.ownerId===selected.ownerId));
      snapshot.scripts.push(...trees.flatMap(tree=>tree.type==='folder'?tree.scripts.map(script=>({...script,enabled:tree.enabled&&script.enabled})):[tree]).map(script=>({...script,scope:selected.scope,ownerId:selected.ownerId,libraryEnabled:selected.enabled})));
    }); return clone(trees);
  };
  const info = id => currentScript(id).info ?? '';
  const buttons = id => clone(currentScript(id).button?.buttons ?? []);
  const audioChannel = type => type === 'amb' ? 'ambient' : type ?? 'bgm';
  const version = name => {
    const value = rt.snapshot.versions?.[name] ?? (name === 'tavernHelper' ? rt.version : undefined);
    if (typeof value !== 'string' || !value) throw new Error(`原生宿主未提供 ${name} 的实际版本。`);
    return value;
  };
  return {
    initializeGlobal: (name, value) => {
      if (typeof name !== 'string' || !name) throw new TypeError('共享名称不能为空。');
      globals.set(name,value);
      for (const waiter of waitingGlobals.get(name) ?? []) waiter.resolve(value);
      waitingGlobals.delete(name);
      shared.eventHub.emit('eleckoi:global-initialized',name,value);
    },
    waitGlobalInitialized: (name, options = {}) => {
      if (globals.has(name)) return Promise.resolve(globals.get(name));
      return new Promise((resolve, reject) => {
        const waiters = waitingGlobals.get(name) ?? new Set();
        let cancel;
        const cleanup = () => { waiters.delete(waiter); if(!waiters.size)waitingGlobals.delete(name); if(cancel)options.signal.removeEventListener('abort',cancel); stopCleanup(); };
        const stopCleanup=rt.addCleanup(()=>waiter.reject(new Error('等待共享对象的脚本已关闭。')));
        const waiter = { resolve: value => { cleanup(); resolve(value); }, reject: error => { cleanup(); reject(error); } }; waiters.add(waiter); waitingGlobals.set(name, waiters);
        if (options.signal) {
          cancel = () => waiter.reject(options.signal.reason);
          if (options.signal.aborted) cancel(); else options.signal.addEventListener('abort', cancel, { once: true });
        }
      });
    },
    getScriptId: () => currentScript().id, getScriptName: () => currentScript().name,
    getScriptTrees: (options = {}) => clone(library(options).trees),
    replaceScriptTrees: (trees, options = {}) => { replaceTrees(trees,options); },
    updateScriptTreesWith: (updater, options = {}) => {
      if (typeof updater !== 'function') throw new TypeError('脚本树更新器必须是函数。');
      const previous=clone(library(options).trees), result=updater(previous);
      return result && typeof result.then==='function' ? result.then(value=>replaceTrees(value??previous,options)) : replaceTrees(result??previous,options);
    },
    getScriptInfo: info, replaceScriptInfo: (value, id) => change('scripts.setInfo', 'info', value, id),
    updateScriptInfoWith: (updater, id) => update('scripts.setInfo', 'info', info, updater, id),
    getScriptButtons: buttons, replaceScriptButtons: (value, id) => change('scripts.setButtons', 'buttons', value, id),
    updateScriptButtonsWith: (updater, id) => update('scripts.setButtons', 'buttons', buttons, updater, id),
    appendInexistentScriptButtons: (values, id) => change('scripts.setButtons', 'buttons', [...buttons(id), ...clone(values).filter(button => !buttons(id).some(existing => existing.name === button.name))], id),
    getScriptButtonEvent: name => `eleckoi:script-button:${currentScript().id}:${name}`,
    getButtonEvent: name => `eleckoi:script-button:${currentScript().id}:${name}`,
    getAllEnabledScriptButtons: () => Object.fromEntries(scripts().filter(script => script.libraryEnabled && script.enabled && script.button?.enabled !== false)
      .map(script=>[script.id,(script.button?.buttons??[]).filter(button=>button.visible!==false).map((button,index)=>({button_id:button.id??`${script.id}:${index}`,button_name:button.name}))])),
    getScriptData: id => clone(currentScript(id).data ?? {}),
    replaceScriptData: (value, id) => change('scripts.setSettings', 'data', value, id),
    resumeAudio:(type='bgm')=>request('audio.resume',{channel:audioChannel(type)}),
    stopAudio:(type='bgm')=>request('audio.stop',{channel:audioChannel(type)}),
    seekAudio:(type,seconds)=>request('audio.seek',{channel:audioChannel(type),seconds}),
    getAudioState:(type='bgm')=>request('audio.getState',{channel:audioChannel(type)}),
    getExtensionNames: () => (rt.snapshot.extensions ?? []).map(item => typeof item === 'string' ? item : item.name),
    isExtensionInstalled: name => (rt.snapshot.extensions ?? []).some(item => (typeof item === 'string' ? item : item.name) === name),
    isExtensionEnabled: name => (rt.snapshot.extensions ?? []).some(item => typeof item !== 'string' && item.name === name && item.enabled),
    installExtension: (url, options = {}) => rt.commit('extensions.install', { url, options: clone(options) }),
    uninstallExtension: name => rt.commit('extensions.uninstall', { name }),
    enableExtension: name => rt.commit('extensions.enable', { name }), disableExtension: name => rt.commit('extensions.disable', { name }),
    updateExtension: name => rt.commit('extensions.update', { name }),
    getTavernVersion: () => version('sillyTavern'), getTavernHelperVersion: () => version('tavernHelper'), getSillyTavernVersion: () => version('sillyTavern'),
    getTavernHelperExtensionId: () => { if (!rt.extensionId) throw new Error('当前原生兼容包没有扩展标识。'); return rt.extensionId; }
  };
}
