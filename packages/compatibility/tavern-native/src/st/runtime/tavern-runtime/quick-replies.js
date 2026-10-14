import { SlashCommandScope } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandScope.js';
import { SlashCommandParser } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandParser.js';
import { SlashCommandClosure } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandClosure.js';
import { Popup, POPUP_TYPE, POPUP_RESULT } from '../vendor/sillytavern/public/scripts/popup.js';

const copy = value => JSON.parse(JSON.stringify(value));
const flags = ['showLabel','isHidden','preventAutoExecute','executeOnStartup','executeOnUser','executeOnAi','executeOnChatChange',
  'executeOnGroupMemberDraft','executeOnNewChat','executeBeforeGeneration'];

export function createQuickReplyApi(context, bridge) {
  const sets = () => context.extensionSettings.eleckoi_quick_reply_sets ||= [];
  const settings = () => context.extensionSettings.quickReplyV2 ||= { isEnabled: true, config: { setList: [] }, characterConfigs: {} };
  const chatMetadata = () => {
    if (!context.chatMetadata) throw Object.assign(new Error('当前页面尚未选定聊天会话'), { code: 'CHAT_NOT_READY' });
    return context.chatMetadata;
  };
  const config = scope => scope === 'chat' ? chatMetadata().quickReply ||= { setList: [] } : settings().config;
  const set = name => { const value = sets().find(value => value.name === name); if (!value) throw new Error(`Quick Reply set does not exist: ${name}`); return value; };
  const qr = (name, label) => { const value = set(name).qrList.find(value => Number.isInteger(label) ? value.id === label : value.label === label);
    if (!value) throw new Error(`Quick Reply does not exist: ${name}.${label}`); return value; };
  const save = scope => scope === 'chat' ? context.saveMetadataDebounced() : context.saveSettingsDebounced();
  const active = () => [...settings().config.setList, ...(context.chatMetadata?.quickReply?.setList || [])]
    .map(link => ({ link, set: sets().find(set => set.name === link.set) })).filter(value => value.set);
  function resolve(name) {
    const found = active().flatMap(({set}) => set.qrList.map(reply => ({set,reply}))).find(({reply}) => reply.label === name)
      || sets().flatMap(set => set.qrList.map(reply => ({set,reply}))).find(({set,reply}) => `${set.name}.${reply.label}` === name);
    if (!found) throw new Error(`No Quick Reply named ${name}`);
    return found;
  }
  function activate(scope, name, visible, action) {
    set(name); const links = config(scope).setList, index = links.findIndex(link => link.set === name);
    if (action === 'toggle') action = index < 0 ? 'add' : 'remove';
    if (action === 'add' && index < 0) links.push({ set: name, isVisible: visible });
    if (action === 'remove' && index >= 0) links.splice(index, 1);
    save(scope);
  }
  async function execute(name, label, args = {}, options = {}) {
    const currentSet = set(name), reply = qr(name, label), scope = new SlashCommandScope();
    if (options.scope) scope.parent = options.scope;
    for (const [key, value] of Object.entries(args)) if (!key.startsWith('_') && key !== 'isAutoExecute') scope.setMacro(`arg::${key}`, value);
    scope.setMacro('arg::*', '');
    const composer = bridge.document().querySelector('#send_textarea');
    let text = reply.message;
    if (!args.isAutoExecute && !options.isRun && currentSet.injectInput && composer?.value) text = currentSet.placeBeforeInput ? `${text} ${composer.value}` : `${composer.value} ${text}`;
    if (text.startsWith('/') && !currentSet.disableSend) return (await context.executeSlashCommandsWithOptions(text, { ...options, scope, source: `${name}.${reply.label}` })).pipe;
    text = context.substituteParams(text, { scope }); await bridge.input(text);
    if (!currentSet.disableSend) await bridge.send();
    return '';
  }
  const api = {
    getSetByName: name => sets().find(set => set.name === name),
    getQrByLabel: (name, label) => set(name).qrList.find(value => Number.isInteger(label) ? value.id === label : value.label === label),
    getSetByQr: reply => sets().find(value => value.qrList.includes(reply)),
    listSets: () => sets().map(set => set.name), listGlobalSets: () => settings().config.setList.map(link => link.set),
    listChatSets: () => (chatMetadata().quickReply?.setList || []).map(link => link.set), listQuickReplies: name => set(name).qrList.map(qr => qr.label),
    async createSet(name, options = {}) { if (!name) throw new Error('Quick Reply set requires a name');
      if (sets().some(value => value.name === name)) throw new Error(`Quick Reply set already exists: ${name}`);
      const value = { version: 2, name, qrList: [], idIndex: 0, disableSend: false, placeBeforeInput: false, injectInput: false, ...options };
      sets().push(value); save(); await bridge.flush(); return value; },
    async updateSet(name, options = {}) { const value = set(name); for (const [key, item] of Object.entries(options)) if (item !== undefined) value[key] = item;
      save(); await bridge.flush(); return value; },
    async deleteSet(name) { const value = set(name); sets().splice(sets().indexOf(value), 1);
      for (const scope of context.chatMetadata ? ['global','chat'] : ['global']) { const links = config(scope).setList; for (let index = links.length - 1; index >= 0; index--) if (links[index].set === name) links.splice(index, 1); save(scope); }
      for (const other of sets()) for (const reply of other.qrList) reply.contextList = reply.contextList.filter(link => link.set !== name);
      save(); await bridge.flush(); },
    createQuickReply(name, label, options = {}) { const value = set(name); const reply = { id: ++value.idIndex, label: label ?? '', message: '', icon: '', title: '',
      ...Object.fromEntries(flags.map(flag => [flag, false])), automationId: '', contextList: [], ...options };
      value.qrList.push(reply); save(); return reply; },
    updateQuickReply(name, label, options = {}) { const reply = qr(name, label); for (const [key, value] of Object.entries(options)) if (value !== undefined) reply[key === 'newLabel' ? 'label' : key] = value;
      save(); return reply; },
    deleteQuickReply(name, label) { const value = set(name), reply = qr(name, label); value.qrList.splice(value.qrList.indexOf(reply), 1); save(); },
    createContextItem(name, label, contextName, isChained = false) { set(contextName); const reply = qr(name, label);
      reply.contextList.push({ set: contextName, isChained }); save(); },
    deleteContextItem(name, label, contextName) { const reply = qr(name, label); reply.contextList = reply.contextList.filter(value => value.set !== contextName); save(); },
    clearContextMenu(name, label) { qr(name, label).contextList = []; save(); },
    toggleGlobalSet: (name, visible = true) => activate('global', name, visible, 'toggle'), addGlobalSet: (name, visible = true) => activate('global', name, visible, 'add'), removeGlobalSet: name => activate('global', name, true, 'remove'),
    toggleChatSet: (name, visible = true) => activate('chat', name, visible, 'toggle'), addChatSet: (name, visible = true) => activate('chat', name, visible, 'add'), removeChatSet: name => activate('chat', name, true, 'remove'),
    executeQuickReply: execute,
    executeQuickReplyByIndex: index => { const replies = active().flatMap(({set}) => set.qrList.map(reply => ({set,reply}))), found = replies[index];
      if (!found) throw new Error(`No Quick Reply at index ${index}`); return execute(found.set.name, found.reply.id); },
    executeByName: (name, args, options) => { const found = resolve(name); return execute(found.set.name, found.reply.id, args, {...options, isRun:true}); },
    importClosures(from, names, options) {
      const {reply} = resolve(from), parser = new SlashCommandParser();
      const closure = parser.parse(reply.message, true, [], options.abortController, options.debugController);
      closure.source = from;
      const candidates = closure.executorList.filter(executor => ['let','var'].includes(executor.command.name)).map(executor => {
        const named = executor.namedArgumentList.find(arg => arg.name === 'key');
        return { key: named?.value ?? executor.unnamedArgumentList[0]?.value, value: executor.unnamedArgumentList[named ? 0 : 1]?.value };
      }).filter(item => item.value instanceof SlashCommandClosure);
      for (let i = 0; i < names.length; i++) {
        const name = names[i], alias = names[i + 1] === 'as' ? names[i += 2] : name;
        const found = candidates.find(item => item.key === name);
        if (!found) throw new Error(`No scoped closure named "${name}" found in "${from}"`);
        if (options.scope.existsVariableInScope(alias)) options.scope.setVariable(alias, found.value);
        else options.scope.letVariable(alias, found.value);
      }
      return '';
    },
    exportSet: name => copy(set(name)),
    async importSet(value) { if (value.version !== 2 || !Array.isArray(value.qrList)) throw new Error('Invalid Quick Reply set');
      if (!value.name || typeof value.name !== 'string') throw new TypeError('Quick Reply set requires a name');
      value = {disableSend:false,placeBeforeInput:false,injectInput:false,...copy(value)};
      const ids = new Set(); let nextId = Math.max(0, Number(value.idIndex) || 0);
      value.qrList = value.qrList.map(reply => {
        if (typeof reply.message !== 'string' || typeof reply.label !== 'string') throw new TypeError('Quick Reply requires string label and message');
        let id = Number(reply.id); if (!Number.isInteger(id) || ids.has(id)) id = ++nextId;
        ids.add(id); nextId = Math.max(nextId,id);
        return {icon:'',title:'',automationId:'',contextList:[],...Object.fromEntries(flags.map(flag => [flag,false])),...reply,id};
      }); value.idIndex = nextId;
      const previous = sets().find(set => set.name === value.name); if (previous) sets().splice(sets().indexOf(previous), 1);
      sets().push(copy(value)); save(); await bridge.flush(); },
    renderInto(root) {
      if (root?.nodeType !== 1) throw new TypeError('Quick Reply UI requires a real DOM element'); root.replaceChildren();
      for (const {link,set} of active()) if (link.isVisible) for (const reply of set.qrList) if (!reply.isHidden) {
        const button = root.ownerDocument.createElement('button'); button.type = 'button'; button.title = reply.title || reply.message;
        if (reply.icon) { const icon = root.ownerDocument.createElement('i'); icon.className = `fa-solid ${reply.icon}`; button.append(icon); }
        if (!reply.icon || reply.showLabel) button.append(root.ownerDocument.createTextNode(reply.label));
        button.onclick = () => execute(set.name, reply.id).catch(bridge.report);
        button.oncontextmenu = event => { event.preventDefault(); const menu = root.ownerDocument.createElement('section');
          for (const link of reply.contextList) for (const choice of setByLink(link).qrList) {
            const item = root.ownerDocument.createElement('button'); item.textContent = choice.label;
            item.onclick = async () => { try { if (link.isChained) await execute(set.name, reply.id); await execute(link.set, choice.id); } catch(error) { bridge.report(error); } };
            menu.append(item);
          }
          new Popup(menu, POPUP_TYPE.TEXT).show().catch(bridge.report);
        }; root.append(button);
      }
      return root;
    },
    open: () => { const root = bridge.document().createElement('section'); api.renderInto(root); return new Popup(root, POPUP_TYPE.TEXT).show(); },
    async openManager(name) {
      const document = bridge.document(), root = document.createElement('section');
      const heading = document.createElement('h3'); heading.textContent = '快捷回复集合'; root.append(heading);
      const select = document.createElement('select');
      for (const value of sets()) { const option = document.createElement('option'); option.value = value.name; option.textContent = value.name; select.append(option); }
      root.append(select);
      const editor = document.createElement('textarea'); editor.style.cssText = 'width:100%;box-sizing:border-box;min-height:35vh'; root.append(editor);
      const render = () => { editor.value = JSON.stringify(select.value ? api.exportSet(select.value) : {version:2,name:'New Set',qrList:[],idIndex:0}, null, 2); };
      select.onchange = render; if (name) select.value = name; render();
      const add = document.createElement('button'); add.textContent = '新集合'; add.onclick = () => { select.value = ''; render(); }; root.append(add);
      const remove = document.createElement('button'); remove.textContent = '删除集合'; remove.onclick = async () => {
        try { if (select.value) { await api.deleteSet(select.value); select.selectedOptions[0].remove(); render(); } } catch(error) { bridge.report(error); }
      }; root.append(remove);
      const binding = document.createElement('select'); binding.innerHTML = '<option value="">保留绑定</option><option value="global">全局启用</option><option value="chat">当前聊天启用</option>'; root.append(binding);
      if (await new Popup(root, POPUP_TYPE.CONFIRM, '', {okButton:'保存',cancelButton:'取消',wide:true}).show() !== POPUP_RESULT.AFFIRMATIVE) return false;
      const value = JSON.parse(editor.value); await api.importSet(value);
      if (binding.value) activate(binding.value, value.name, true, 'add'); await bridge.flush(); return true;
    },
  };
  function setByLink(link) { return set(link.set); }
  bridge.shared.quickReplyRuntimes ||= new Map();
  bridge.shared.quickReplyRuntimes.set(bridge.owner, api);
  bridge.shared.quickReplyStarted ||= new Set();
  const executing = bridge.shared.quickReplyExecuting ||= new Set();
  const primary = () => bridge.shared.quickReplyRuntimes.values().next().value === api;
  async function automatic(flag, payload) {
    if (!primary() || settings().isEnabled === false) return;
    for (const {set} of active()) for (const reply of set.qrList) if ((flag ? reply[flag] : reply.automationId && payload?.some(entry => (entry.automationId || entry.extra?.automationId) === reply.automationId)) && !reply.preventAutoExecute) {
      const id = `${set.name}:${reply.id}`;
      if (executing.has(id) || flag === 'executeOnStartup' && bridge.shared.quickReplyStarted.has(id)) continue;
      if (flag === 'executeOnStartup') bridge.shared.quickReplyStarted.add(id);
      executing.add(id); try { await execute(set.name, reply.id, {isAutoExecute:true}); } finally { executing.delete(id); }
    }
  }
  for (const [event,flag] of [['MESSAGE_SENT','executeOnUser'],['MESSAGE_RECEIVED','executeOnAi'],['CHAT_CHANGED','executeOnChatChange'],
    ['GROUP_MEMBER_DRAFTED','executeOnGroupMemberDraft'],['CHAT_CREATED','executeOnNewChat'],['GENERATION_AFTER_COMMANDS','executeBeforeGeneration']]) {
    bridge.on(context.eventTypes[event], () => automatic(flag));
  }
  bridge.on(context.eventTypes.WORLD_INFO_ACTIVATED, entries => automatic(null, entries));
  bridge.ready().then(() => automatic('executeOnStartup')).catch(bridge.report);
  if (bridge.installUi) bridge.ready().then(() => bridge.installUi()).catch(bridge.report);
  bridge.cleanup.add(() => bridge.shared.quickReplyRuntimes.delete(bridge.owner));
  return api;
}
