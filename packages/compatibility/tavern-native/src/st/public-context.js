const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/** Browser facilities and direct native delegates for the pinned ST public context. */
export function installPublicContext(rt, helper, context, st, services) {
  const { request, commit, find, preset, sync } = services, view = rt.window;
  const cleanup = services.cleanup;
  const messageIndex = value => {
    const index = value === undefined ? context.chat.length - 1 : Number(value);
    const resolved = index < 0 ? context.chat.length + index : index;
    if (!Number.isInteger(resolved) || resolved < 0 || resolved >= context.chat.length) throw new RangeError(`Message index out of range: ${value}`);
    return resolved;
  };
  const hostWindow = () => {
    let current = view;
    while (current.parent && current.parent !== current) {
      try { void current.parent.document; current = current.parent; } catch { break; }
    }
    return current;
  };
  const chatElement = () => hostWindow().document.querySelector('#chat, [data-eleckoi-chat]');
  const templates = rt.shared.extensionTemplates ?? (rt.shared.extensionTemplates = new Map());
  const locales = rt.shared.locales ?? (rt.shared.locales = new Map());
  const debugs = rt.shared.debugFunctions ?? (rt.shared.debugFunctions = new Map());
  const scrapers = rt.shared.dataBankScrapers ?? (rt.shared.dataBankScrapers = new Map());
  function render(template, data) { return st.libs.Handlebars.compile(template)(data); }
  const templateKey = (extension, name) => `${extension}/${name}`;
  const rawWorld = entry => ({ ...entry, key: entry.key ?? entry.keys ?? [], keysecondary: entry.keysecondary ?? entry.secondary_keys ?? [],
    disable: entry.disable ?? entry.enabled === false, comment: entry.comment ?? entry.name ?? '' });
  Object.defineProperties(context, {
    chatId: { enumerable: true, get: () => context.getCurrentChatId() },
    onlineStatus: { enumerable: true, get: () => rt.snapshot.connection?.onlineStatus ?? (rt.snapshot.connection?.model ? 'connected' : 'no_connection') },
    maxContext: { enumerable: true, get: () => Number(preset().settings.max_context ?? preset().settings.openai_max_context ?? 8192) },
    streamingProcessor: { enumerable: true, get: () => rt.streamingProcessor ?? null },
    menuType: { enumerable: true, get: () => rt.snapshot.context?.menuType ?? 'characters' },
  });
  Object.assign(context, {
    event_types: context.eventTypes, symbols: { ignore: st.IGNORE_SYMBOL },
    deleteMessage: async id => { await helper.deleteChatMessages([messageIndex(id)]); sync(); },
    deleteLastMessage: async () => { if (context.chat.length) await helper.deleteChatMessages([context.chat.length - 1]); sync(); },
    clearChat: async () => { await helper.deleteChatMessages(context.chat.map((_item,index) => index)); sync(); },
    saveReply: async (type, text, fromSwipe = false, generationStarted, generationFinished) => {
      const extra = { generationStarted, generationFinished };
      if (['append','continue','swipe'].includes(type) && context.chat.length) {
        const index = context.chat.length - 1, existing = context.chat[index];
        if (type === 'swipe') {
          const swipes = [...(existing.swipes ?? [existing.mes]), String(text)];
          await helper.setChatMessages([{message_id:index, message:String(text), swipes, swipe_id:swipes.length - 1, extra}]);
        } else await helper.setChatMessages([{message_id:index, message:`${existing.mes}${text}`, extra:{...existing.extra,...extra}}]);
      } else await helper.createChatMessages([{role:'assistant', name:context.name2, message:String(text), extra}]);
      sync(); return context.chat.at(-1);
    },
    sendGenerationRequest: (type, data) => context.__eleckoiSendRequest(context.mainApi === 'openai' ? 'openai' : 'textgenerationwebui', {...data,type,stream:false}, false),
    sendStreamingRequest: (type, data) => context.__eleckoiSendRequest(context.mainApi === 'openai' ? 'openai' : 'textgenerationwebui', {...data,type,stream:true}, false),
    generateRawData: (options = {}) => request('generation.raw', options),
    registerSlashCommand: (name, callback, aliases = [], helpString = '') => st.SlashCommandParser.addCommandObject(st.SlashCommand.fromProps({name,callback,aliases,helpString})),
    executeSlashCommands: (text, options = {}) => context.executeSlashCommandsWithOptions(text,options),
    registerHelper: () => {}, // Upstream 1.19 intentionally retires this deprecated function.
    registerFunctionTool: (...args) => st.ToolManager.registerFunctionTool(...args),
    unregisterFunctionTool: (...args) => st.ToolManager.unregisterFunctionTool(...args),
    isToolCallingSupported: (...args) => st.ToolManager.isToolCallingSupported(...args),
    canPerformToolCalls: (...args) => st.ToolManager.canPerformToolCalls(...args),
    registerDebugFunction: (name, description, fn) => { debugs.set(name,{description,fn}); cleanup.add(()=>debugs.delete(name)); },
    renderExtensionTemplate: (extension, name, data = {}) => {
      const source = templates.get(templateKey(extension,name));
      if (source === undefined) throw new Error(`Extension template is not loaded: ${extension}/${name}; use renderExtensionTemplateAsync.`);
      return render(source,data);
    },
    renderExtensionTemplateAsync: async (extension, name, data = {}) => {
      const key = templateKey(extension,name);
      if (!templates.has(key)) templates.set(key,await request('extensions.template',{extension,name}));
      return render(templates.get(key),data);
    },
    registerDataBankScraper: scraper => {
      if (!scraper?.id || typeof scraper.scrape !== 'function') throw new TypeError('A Data Bank scraper needs an id and scrape function.');
      scrapers.set(scraper.id,scraper); cleanup.add(()=>scrapers.delete(scraper.id)); return scraper;
    },
    showLoader: options => st.loader.show(options), hideLoader: handle => st.loader.hide(handle),
    writeExtensionFieldBulk: async (id, fields) => {
      for (const [key,value] of Object.entries(fields)) await context.writeExtensionField(id,key,value);
    },
    shouldSendOnEnter: () => context.powerUserSettings.send_on_enter !== 'never',
    isMobile: () => /Android|iPhone|Mobile/i.test(view.navigator.userAgent),
    addLocaleData: (locale, data) => { const records = locales.get(locale) ?? {}; Object.assign(records,data); locales.set(locale,records); },
    translate: text => locales.get(view.navigator.language)?.[text] ?? text,
    createCharacterData: data => helper.createCharacter(data.name ?? 'Unnamed',data),
    getCharacterSource: id => context.characters[id ?? context.characterId]?.data?.extensions?.source_url ?? '',
    importFromExternalUrl: (url, options = {}) => commit('import.external',{url,options}),
    humanizedDateTime: timestamp => st.libs.moment(timestamp).format('LLL'),
    updateMessageBlock: (id, message) => {
      const index = messageIndex(id); if (message) Object.assign(context.chat[index],message);
      return helper.refreshOneMessage(index);
    },
    appendMediaToMessage: async (message, media) => {
      st.ensureMessageMediaIsArray(message);
      message.extra.media.push(media); await context.saveChat();
      const index = context.chat.indexOf(message); if (index >= 0) await helper.refreshOneMessage(index);
    },
    scrollChatToBottom: () => { const element=chatElement(); if(element)element.scrollTop=element.scrollHeight; },
    scrollOnMediaLoad: element => {
      const handler = () => context.scrollChatToBottom(); element.addEventListener('load',handler); cleanup.add(()=>element.removeEventListener('load',handler));
    },
    loadWorldInfo: async name => ({entries:Object.fromEntries((await helper.getWorldbook(name)).map(entry=>[entry.uid ?? entry.id,rawWorld(entry)]))}),
    saveWorldInfo: (name, data) => helper.replaceWorldbook(name, Array.isArray(data.entries) ? data.entries : Object.values(data.entries ?? {})),
    reloadWorldInfoEditor: () => request('worldbook.openEditor'),
    updateWorldInfoList: async () => { await rt.refresh?.(); return helper.getWorldbookNames(); },
    getWorldInfoPrompt: async (chat, maxContext, isDryRun, globalScanData) => {
      const result = await request('worldbook.prompt',{chat,maxContext,isDryRun,globalScanData});
      const { worldInfoString, worldInfoBefore, worldInfoAfter, worldInfoExamples, worldInfoDepth, anBefore, anAfter, outletEntries } = result;
      return { worldInfoString, worldInfoBefore, worldInfoAfter, worldInfoExamples, worldInfoDepth, anBefore, anAfter, outletEntries };
    },
    getWorldInfoNames: () => [...helper.getWorldbookNames()],
    getTextGenServer: type => context.extensionSettings.eleckoi_api_urls?.[type] ?? rt.snapshot.connection?.baseUrl ?? '',
    updateReasoningUI: id => helper.refreshOneMessage(messageIndex(id)),
    getReasoningTemplateByName: name => context.__eleckoiPresetManagers('reasoning')?.getCompletionPresetByName(name),
    unshallowGroupMembers: async () => Promise.all(context.groups.find(item=>item.id===context.groupId)?.members.map(avatar=>context.unshallowCharacter(avatar)) ?? []),
    getExtensionManifest: name => {
      const normalize = value => String(value ?? '').replace(/^third-party\//, '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
      const entries = Array.isArray(rt.snapshot.extensions) ? rt.snapshot.extensions : rt.snapshot.extensions?.items ?? [];
      const selected = entries.find(entry => normalize(entry.name ?? entry.id) === normalize(name));
      return selected?.manifest ? structuredClone(selected.manifest) : null;
    },
    openThirdPartyExtensionMenu: name => request('extensions.openMenu',{name}),
  });
  context.t = (strings,...values) => typeof strings === 'string' ? context.translate(strings) : context.translate(strings.join('${}')).split('${}').map((part,index)=>part+(values[index] ?? '')).join('');
  const navigate = async (index,settings={}) => {
    const id=messageIndex(settings.messageId),message=context.chat[id],swipes=message.swipes ?? [message.mes];
    if (!Number.isInteger(index) || index < 0 || index >= swipes.length) return false;
    await helper.setChatMessages([{message_id:id,message:swipes[index],swipe_id:index}]); sync(); return true;
  };
  const swipeButtons = visible => {
    const nodes=hostWindow().document.querySelectorAll('.swipe_left,.swipe_right,[data-swipe-control]');for(const node of nodes)node.hidden=!visible;
  };
  context.swipe = {
    to: navigate, left: settings => navigate((context.chat.at(-1)?.swipe_id ?? 0)-1,settings), right: settings => navigate((context.chat.at(-1)?.swipe_id ?? 0)+1,settings),
    show: () => swipeButtons(true), hide: () => swipeButtons(false), refresh: () => swipeButtons(context.swipe.isAllowed()),
    isAllowed: () => !!context.chat.length && !context.duringGenerating,
    state: () => context.duringGenerating ? st.constants.SWIPE_STATE?.GENERATING ?? 'generating' : st.constants.SWIPE_STATE?.READY ?? 'ready',
  };
  return context;
}
