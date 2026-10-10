import descriptors from './command-contract.json';
import { SlashCommandParser } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandArgument.js';
import { isTrueBoolean } from '../vendor/sillytavern/public/scripts/utils.js';
import { slashCommandReturnHelper } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandReturnHelper.js';
import { serviceCommands } from './service-commands.js';
import { generationCommands } from './generation-commands.js';
import { presentationCommands } from './presentation-commands.js';
import { promptCommands } from './prompt-commands.js';
import { mediaCommands } from './media-commands.js';
import { summaryCommands } from './summary-commands.js';
import { youtubeCommands } from './youtube-commands.js';

export function registerNativeCommands(context, api) {
  const helper = globalThis;
  const stringify = value => typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const fields = args => Object.fromEntries(Object.entries(args).filter(([key]) => !key.startsWith('_') && !['char', 'select', 'persona'].includes(key))
    .map(([key, value]) => [key, ['tags', 'alternate_greetings', 'extensions'].includes(key) && typeof value === 'string' ? JSON.parse(value) : value]));
  const raw = reference => { const card = helper.RawCharacter.find({ name: reference || 'current' }); if (!card) throw new Error(`Character does not exist: ${reference}`); return card; };
  const persona = reference => { const value = helper.getPersona(reference || 'current'); if (!value) throw new Error(`Persona does not exist: ${reference}`); return value; };
  const saveCard = async (previous, changes, name) => {
    const character = { spec: 'chara_card_v2', spec_version: '2.0', ...(previous || {}), data: { ...(previous?.data || {}), ...changes, name } };
    const result = await api.call('characters.put', { id: previous?.native_id || '', name, character, raw: true });
    await context.getCharacters(); return result;
  };
  const document = async (args, reference) => {
    const docs = await api.databank.list({ source: args.source || '' });
    const found = docs.find(value => [value.id, value.name, value.url].includes(reference));
    if (!found) throw new Error(`Data Bank attachment does not exist: ${reference}`); return found;
  };
  const dbOptions = args => ({ source: args.source || '', ...(args.threshold === undefined || args.threshold === '' ? {} : { threshold: Number(args.threshold) }), ...(args.count === undefined || args.count === '' ? {} : { count: Number(args.count) }) });
  const group = () => { const value = context.groups.find(value => value.id === context.groupId); if (!value) throw new Error('This command requires a group chat'); return value; };
  const member = reference => {
    const members = group().members.map(avatar => context.characters.find(card => card.avatar === avatar)).filter(Boolean);
    const index = parseInt(reference);
    const card = Number.isNaN(index) ? new globalThis.__ElecKoiSt.libs.Fuse(members, { keys: ['avatar','name'] }).search(reference)[0]?.item : members[index];
    if (!card) throw new Error(`Group member does not exist: ${reference}`); return card;
  };
  const changeMember = async (reference, action) => {
    const value = structuredClone(group()), card = member(reference), index = value.members.indexOf(card.avatar);
    value.disabled_members ||= [];
    if (action === 'disable' && !value.disabled_members.includes(card.avatar)) value.disabled_members.push(card.avatar);
    if (action === 'enable') value.disabled_members = value.disabled_members.filter(avatar => avatar !== card.avatar);
    if (action === 'remove') { value.members.splice(index, 1); value.disabled_members = value.disabled_members.filter(avatar => avatar !== card.avatar); }
    if (action === 'up' && index > 0) [value.members[index-1],value.members[index]] = [value.members[index],value.members[index-1]];
    if (action === 'down' && index + 1 < value.members.length) [value.members[index+1],value.members[index]] = [value.members[index],value.members[index+1]];
    await api.groups.put(value); return '';
  };
  function range(value) {
    const ranges = (Array.isArray(value) ? value : String(value).split(/\s+/)).map(item => globalThis.__ElecKoiSt.stringToRange(item, 0, context.chat.length - 1));
    if (ranges.some(value => !value)) throw new RangeError(`Invalid message range: ${value}`);
    return [...new Set(ranges.flatMap(({ start, end }) => Array.from({ length: end - start + 1 }, (_, index) => start + index)))];
  }
  const promptEntries = args => { const preset = helper.getPreset('in_use');
    const list = value => value === undefined ? [] : Array.isArray(value) ? value : value.startsWith('[') ? JSON.parse(value) : [value];
    const ids = list(args.identifier), names = list(args.name);
    return { preset, prompts: [...preset.prompts, ...preset.prompts_unused].filter(prompt => ids.includes(prompt.id) || names.includes(prompt.name)) }; };
  const callbacks = {
    ...serviceCommands(context, api),
    ...generationCommands(context, api),
    ...presentationCommands(context, api),
    ...promptCommands(context),
    ...mediaCommands(context, api),
    ...summaryCommands(context, api),
    ...youtubeCommands(context, api),
    'branch-create': async (_args,value) => { const result=await api.chat.branch(messageIndex(context,value)); await context.openCharacterChat(result.id); return result.name; },
    'checkpoint-create': async (args,value) => (await api.chat.branch(messageIndex(context,args.mesId ?? args.mes),{checkpoint:true,name:value})).name,
    'checkpoint-get': (_args,value) => context.chat[messageIndex(context,value)].extra?.bookmark_link || '',
    'checkpoint-list': args => JSON.stringify(context.chat.flatMap((message,index) => message.extra?.bookmark_link ? [isTrueBoolean(args.links) ? message.extra.bookmark_link : index] : [])),
    'checkpoint-parent': () => context.chatMetadata.main_chat || '',
    'checkpoint-go': async (_args,value) => { const extra=context.chat[messageIndex(context,value)].extra;
      if (!extra?.bookmark_link) return ''; await context.openCharacterChat(extra.eleckoi_bookmark_chat_id || extra.bookmark_link); return extra.bookmark_link; },
    'checkpoint-exit': async () => { const name=context.chatMetadata.main_chat; if (!name) return '';
      await context.openCharacterChat(context.chatMetadata.eleckoi_parent_chat_id || name); return name; },
    'forcesave': async () => { context.saveSettingsDebounced(); await api.flush(); await context.saveChat(); return ''; },
    'speak': async (args, value) => { await api.tts.speak(value, { voice: args.voice }); return ''; },
    'note': async (_args, value) => { if (value) await api.notes.set({ content: value }); return api.notes.get().content; },
    'note-depth': (_args, value) => noteNumber('depth', value),
    'note-frequency': (_args, value) => noteNumber('frequency', value),
    'note-position': (_args, value) => noteEnum('position', value, { after: 0, scenario: 0, chat: 1, before_scenario: 2, before: 2 }),
    'note-role': (_args, value) => noteEnum('role', value, { system: 0, user: 1, assistant: 2 }),
    'qr': (_args, value) => api.quickReplies.executeQuickReplyByIndex(Number(value)),
    'qrset': () => { console.warn('/qrset is deprecated; use /qr-set'); return ''; },
    'qr-set': (args, value) => { api.quickReplies.toggleGlobalSet(value, args.visible === undefined || isTrueBoolean(args.visible)); return ''; },
    'qr-set-on': (args, value) => { api.quickReplies.addGlobalSet(value, args.visible === undefined || isTrueBoolean(args.visible)); return ''; },
    'qr-set-off': (_args, value) => { api.quickReplies.removeGlobalSet(value); return ''; },
    'qr-chat-set': (args, value) => { api.quickReplies.toggleChatSet(value, args.visible === undefined || isTrueBoolean(args.visible)); return ''; },
    'qr-chat-set-on': (args, value) => { api.quickReplies.addChatSet(value, args.visible === undefined || isTrueBoolean(args.visible)); return ''; },
    'qr-chat-set-off': (_args, value) => { api.quickReplies.removeChatSet(value); return ''; },
    'qr-set-list': (_args, value) => JSON.stringify(value === 'global' ? api.quickReplies.listGlobalSets() : value === 'chat' ? api.quickReplies.listChatSets() : api.quickReplies.listSets()),
    'qr-list': (_args, value) => JSON.stringify(api.quickReplies.listQuickReplies(value)),
    'qr-create': (args, value) => { api.quickReplies.createQuickReply(args.set, args.label || '', qrFields(args, value)); return ''; },
    'qr-get': args => { const reply = api.quickReplies.getQrByLabel(args.set, qrId(args)); if (!reply) throw new Error('Quick Reply does not exist'); return JSON.stringify(reply); },
    'qr-update': (args, value) => { api.quickReplies.updateQuickReply(args.set, qrId(args), qrFields(args, value?.trim() ? value : undefined)); return ''; },
    'qr-delete': (args, value) => { api.quickReplies.deleteQuickReply(args.set, qrId(args, value)); return ''; },
    'qr-contextadd': (args, value) => { api.quickReplies.createContextItem(args.set, qrId(args), value, isTrueBoolean(args.chain)); return ''; },
    'qr-contextdel': (args, value) => { api.quickReplies.deleteContextItem(args.set, qrId(args), value); return ''; },
    'qr-contextclear': (args, value) => { api.quickReplies.clearContextMenu(args.set, qrId(args, value)); return ''; },
    'qr-set-create': async (args, value) => { await api.quickReplies.createSet(args.name || value, qrSetFields(args)); return ''; },
    'qr-set-update': async (args, value) => { await api.quickReplies.updateSet(args.name || value, qrSetFields(args)); return ''; },
    'qr-set-delete': async (_args, value) => { await api.quickReplies.deleteSet(value); return ''; },
    'qr-arg': ({_scope}, [key,value]) => { _scope.setMacro(`arg::${key}`, value, key.includes('*')); return ''; },
    'import': (args, value) => api.quickReplies.importClosures(args.from, value, {scope:args._scope,abortController:args._abortController,debugController:args._debugController}),
    'regex': (args, value) => {
      const script = regexRule(args.name); return script.enabled ? globalThis.__ElecKoiSt.runRegexScript({ ...script,
        scriptName: script.script_name, findRegex: script.find_regex, replaceString: script.replace_string, trimStrings: script.trim_strings || [],
        substituteRegex: script.substituteRegex || 0, disabled: !script.enabled }, value) : value;
    },
    'regex-state': (_args, value) => String(regexRule(value).enabled),
    'regex-toggle': async (args, value) => {
      const script = regexRule(value), enabled = args.state === undefined || args.state === 'toggle' ? !script.enabled : isTrueBoolean(args.state);
      for (const type of ['global','preset','character']) {
        const rules = helper.getTavernRegexes({ type }); const index = rules.findIndex(rule => rule.id === script.id);
        if (index < 0) continue;
        rules[index].enabled = enabled; await helper.replaceTavernRegexes(rules, { type }); return script.script_name;
      }
      throw new Error(`Regex scope no longer exists: ${value}`);
    },
    'renamechat': async (_args, value) => { await context.renameChat(value); return ''; },
    'getchatname': () => context.getChatTitle(),
    'newchat': async () => { const id = await api.chat.createStored(); await api.chat.open(id); return ''; },
    'go': async (_args, value) => { const found = context.groups.find(group => group.name === value || group.id === value);
      if (found) { await context.openGroupChat(found.id); return found.name; }
      const card = raw(value); await context.selectCharacterById(context.characters.indexOf(card)); return card.name; },
    'random': async (_args, tagName) => { const tag = context.tags.find(value => value.name === tagName);
      const cards = tagName ? context.characters.filter(card => tag && context.tagMap[card.avatar]?.includes(tag.id)) : context.characters;
      if (!cards.length) throw new Error('No matching character for random chat'); const card = cards[Math.floor(Math.random() * cards.length)];
      const id = await api.chat.createStored({ characterId: card.native_id }); await api.chat.open(id); return ''; },
    'member-count': () => String(group().members.length),
    'member-get': ({ field = 'name' }, reference) => { const card = member(reference); return stringify({ name: card.name, avatar: card.avatar,
      id: context.characters.indexOf(card), index: group().members.indexOf(card.avatar) }[field]); },
    'member-disable': (_args, value) => changeMember(value, 'disable'), 'member-enable': (_args, value) => changeMember(value, 'enable'),
    'member-remove': (_args, value) => changeMember(value, 'remove'), 'member-up': (_args, value) => changeMember(value, 'up'), 'member-down': (_args, value) => changeMember(value, 'down'),
    'member-add': async (_args, reference) => { const card = raw(reference), value = structuredClone(group()); if (!value.members.includes(card.avatar)) value.members.push(card.avatar); await api.groups.put(value); return ''; },
    'member-peek': async (_args, reference) => { const card = member(reference); await context.callPopup(JSON.stringify(card.data, null, 2), 'text'); return ''; },
    'delname': async (_args, value) => { const ids = context.chat.map((message,index) => message.name === value ? index : -1).filter(index => index >= 0);
      if (ids.length) await helper.deleteChatMessages(ids); return ''; },
    'cut': async (_args, value) => { const ids = range(value), text = ids.map(index => context.chat[index].mes).join('\n'); await helper.deleteChatMessages(ids); return text; },
    'del': async (_args, value) => { if (!value) { await context.callPopup('Use /del N to remove the last N messages.', 'text'); return ''; }
      const count = Number(value); if (!Number.isInteger(count) || count < 1) throw new RangeError('Message count must be positive');
      const ids = Array.from({ length: Math.min(count, context.chat.length) }, (_,i) => context.chat.length - 1 - i).reverse();
      const text = ids.map(index => context.chat[index].mes).join('\n'); await helper.deleteChatMessages(ids); return text; },
    'swipe': async (args, value) => { await context.swipe.to(null, args.direction || 'right', value ? { forceSwipeId: Number(value) - 1 } : {}); return ''; },
    'addswipe': async (args, value) => { const index = context.chat.length - 1, message = context.chat[index];
      if (!message || message.is_user || message.is_system) throw new Error('The last message is not swipeable');
      const swipes = [...message.swipes || [message.mes], value], id = swipes.length - 1;
      await helper.setChatMessages([{ message_id: index, swipes, swipe_id: isTrueBoolean(args.switch) ? id : message.swipe_id || 0 }]); return String(id); },
    'delswipe': async (_args, value) => { const index = context.chat.length - 1, message = context.chat[index], id = value ? Number(value) - 1 : message.swipe_id || 0;
      const swipes = [...message.swipes || [message.mes]]; if (swipes.length <= 1) throw new Error('Cannot remove the only reply');
      if (!Number.isInteger(id) || id < 0 || id >= swipes.length) throw new RangeError('Swipe index out of range');
      swipes.splice(id, 1); const selected = Math.min(message.swipe_id || 0, swipes.length - 1);
      await helper.setChatMessages([{ message_id: index, swipes, swipe_id: selected, swipes_info: message.swipe_info?.filter((_,i) => i !== id) }]); return String(selected); },
    'getpromptentry': args => { const { prompts } = promptEntries(args), values = prompts.map(prompt => !!prompt.enabled);
      return args.return === 'dict' || prompts.length > 1 && args.identifier ? JSON.stringify(Object.fromEntries(prompts.map(prompt => [prompt.id, !!prompt.enabled])))
        : args.return === 'list' || prompts.length > 1 ? JSON.stringify(values) : stringify(values[0]); },
    'setpromptentry': async (args, value) => { const { preset, prompts } = promptEntries(args);
      for (const prompt of prompts) prompt.enabled = ['toggle','t',''].includes(value) ? !prompt.enabled : isTrueBoolean(value);
      await helper.replacePreset('in_use', preset); return ''; },
    'pm-render': async () => { await helper.builtin.renderPromptManager(); return ''; },
    'chat-render': () => { context.printMessages(); return ''; },
    'chat-jump': (_args, value) => { const index = messageIndex(context, value), element = helper.retrieveDisplayedMessage(index)[0]; if (!element) throw new Error('Message is not mounted'); element.scrollIntoView({ block: 'start' }); return ''; },
    'clipboard-set': async (_args, value) => { await helper.builtin.copyText(value); return ''; },
    'clipboard-get': async () => globalThis.navigator.clipboard.readText(),
    'vector-query': (_args, value) => setting('query', value, Number),
    'persona-duplicate': async (args, value) => { const source = persona(args.persona || value), id = globalThis.__ElecKoiSt.uuidv4() + '.png';
      await api.personas.put(id, source.name, { ...source, avatar_id: id, is_default: false }); if (isTrueBoolean(args.select)) await api.personas.select(id); return id; },
    'persona-sync': async (args, value) => { const current = persona(), ids = value ? range(value) : context.chat.map((_,i) => i);
      const changes = ids.filter(index => context.chat[index].is_user && (!args.from || context.chat[index].name === args.from)).map(index => ({ message_id: index, name: current.name }));
      if (changes.length) await helper.setChatMessages(changes); return ''; },
    'reasoning-collapse': (_args, value) => reasoningDisplay(value, false), 'reasoning-expand': (_args, value) => reasoningDisplay(value, true), 'reasoning-toggle': (_args, value) => reasoningDisplay(value),
    'char-find': (args, value) => { const cards = context.characters.filter(card => card.name.toLowerCase().includes(String(value).toLowerCase())); return args.multi === 'true' ? JSON.stringify(cards.map(card => card.avatar)) : cards[0]?.avatar || ''; },
    'char-get': (args) => { const card = raw(args.char); return stringify(args.field ? card.data?.[args.field] ?? card[args.field] : card.data); },
    'char-create': async args => { const card = fields(args); if (!card.name) throw new Error('/char-create requires name'); const result = await saveCard(null, card, card.name);
      if (args.select === undefined || isTrueBoolean(args.select)) await context.selectCharacterById(context.characters.findIndex(card => card.avatar === result.avatar)); return result.avatar; },
    'char-update': async args => { const card = raw(args.char); return (await saveCard(card, fields(args), args.name || card.name)).avatar; },
    'char-delete': async (args, value) => { await helper.deleteCharacter(args.char || value || 'current'); return ''; },
    'char-duplicate': async (args, value) => { const card = raw(args.char || value); const name = args.name || `${card.name} copy`; const { native_id, avatar, ...source } = card;
      const result = await saveCard(source, {}, name);
      await context.eventSource.emit(context.eventTypes.CHARACTER_DUPLICATED, {oldAvatar:card.avatar,newAvatar:result.avatar});
      if (args.select === undefined || isTrueBoolean(args.select)) await context.selectCharacterById(context.characters.findIndex(card => card.avatar === result.avatar)); return result.avatar; },
    'message-role': async (args, value) => { const index = messageIndex(context, args.at); const message = context.chat[index]; if (value) { if (!['user','assistant','system'].includes(value)) throw new Error(`Unknown message role: ${value}`);
      await helper.setChatMessages([{ message_id: index, role: value }]); } return value || (message.is_system ? 'system' : message.is_user ? 'user' : 'assistant'); },
    'message-name': async (args, value) => { const index = messageIndex(context, args.at); if (value) await helper.setChatMessages([{ message_id: index, name: value }]); return value || context.chat[index].name; },
    'hide': async (args, value) => { await helper.setChatMessages(helper.getChatMessages(value || '-1').filter(message => !args.name || message.name === args.name).map(message => ({ message_id: message.message_id, is_hidden: true }))); return ''; },
    'unhide': async (args, value) => { await helper.setChatMessages(helper.getChatMessages(value || '-1').filter(message => !args.name || message.name === args.name).map(message => ({ message_id: message.message_id, is_hidden: false }))); return ''; },
    'sys': async (args, value) => {
      const count = context.chat.length, requested = Number(args.at);
      const index = args.at === undefined ? count : requested < 0 || Object.is(requested, -0) ? count + requested : requested;
      if (!Number.isInteger(index) || index < 0 || index > count) throw new RangeError(`Message insertion index out of range: ${args.at}`);
      const message={name:args.name ?? context.chatMetadata.narrator_name ?? 'System',is_user:false,is_system:false,
        mes:context.substituteParams(String(value).trim()),send_date:new Date().toISOString(),
        force_avatar:'',extra:{type:'narrator',isSmallSys:isTrueBoolean(args.compact),gen_id:Date.now(),api:'manual',model:'slash command'}};
      await helper.createChatMessages([{...message,role:'system'}], {insert_at:index === count ? 'end' : index});
      return slashCommandReturnHelper.doReturn(args.return || 'none', message, {objectToStringFunc:message=>message.mes});
    },
    'comment': async (_args, value) => { await helper.createChatMessages([{ role: 'system', name: 'System', message: value, is_hidden: true, extra: { type: 'comment' } }]); return ''; },
    'sendas': async (args, value) => { const card = raw(args.name); await helper.createChatMessages([{ role: 'assistant', name: card.name, message: value }]); return ''; },
    'regenerate': async () => { await context.generate('regenerate'); return ''; },
    'continue': async (args, value) => {
      const injection = value ? helper.injectPrompts([{id:crypto.randomUUID(),content:value,role:'system',position:'in_chat',depth:0,
        anchor:'beforeLatestUserInput',should_scan:false}],{once:true}) : null;
      try { await context.generate('continue',{await:isTrueBoolean(args.await),abortController:args._abortController}); }
      catch (error) { injection?.uninject(); throw error; }
      return '';
    },
    'trigger': async (args, value) => {
      const speaker = value ? member(value).native_id : undefined;
      await context.generate('normal', { ...(speaker ? { force_chid: speaker } : {}), await:isTrueBoolean(args.await), abortController:args._abortController }); return '';
    },
    'setinput': async (_args, value) => { await api.input.set(value); return value; },
    'preset': async (args, value) => { if (value) await helper.loadPreset(value); return helper.getLoadedPresetName(); },
    'profile': async (_args,value) => value ? (await api.connections.select(value))?.name || '<None>' : api.connections.get()?.name || '<None>',
    'profile-list': () => JSON.stringify(api.connections.list().map(value => value.name)),
    'profile-get': (_args,value) => { const profile=api.connections.get(value); return profile ? JSON.stringify(profile) : ''; },
    'profile-create': async (_args,value) => (await api.connections.create(value)).name,
    'profile-update': async () => (await api.connections.update()).name,
    'model': async (_args,value) => { if (value) await api.connections.configure({model:value}); return api.connections.current().model; },
    'api': async (_args,value) => { if (value) await api.connections.configure({api:value}); return api.connections.current().source; },
    'api-url': (args,value) => api.connections.endpoint(args.api,value || undefined,{connect:args.connect === undefined || isTrueBoolean(args.connect)}),
    'proxy': async (_args,value) => { if (value) await api.connections.configure({proxy:value}); return context.extensionSettings.eleckoi_selected_proxy || ''; },
    'secret-id': (args,value) => api.connections.secret(args.key,value || undefined),
    'persona-get': args => { const selected = persona(args.persona); return stringify(args.field ? selected[args.field] : selected); },
    'persona-create': async args => { const name = args.name; if (!name) throw new Error('/persona-create requires name'); await helper.createPersona(name, fields(args)); const id = helper.getPersona(name).avatar_id;
      if (args.select === undefined || isTrueBoolean(args.select)) await api.personas.select(id); return id; },
    'persona-update': async args => { const selected = persona(args.persona); await helper.replacePersona(selected.avatar_id, fields(args)); return selected.avatar_id; },
    'persona-delete': async (args, value) => { await helper.deletePersona(args.name || value || 'current'); return ''; },
    'persona-set': async (args, value) => { await api.personas.select(persona(args.name || value).avatar_id); return ''; },
    'reasoning-get': (args, value) => { const message = context.chat[messageIndex(context, args.at ?? value)]; return message.extra?.reasoning || message.reasoning || ''; },
    'reasoning-set': async (args, value) => { const index = messageIndex(context, args.at); await helper.setChatMessages([{ message_id: index, reasoning: value,
      extra: { ...context.chat[index].extra, reasoning: value, ...(args.collapse === undefined ? {} : { reasoning_state: isTrueBoolean(args.collapse) ? 'done' : 'none' }) } }]); return value; },
    'reasoning-parse': (args, value) => {
      const result = context.parseReasoningFromString(value, { strict: !globalThis.__ElecKoiSt.isFalseBoolean(args.strict) });
      if (args.return === 'content') return result?.content ?? value;
      const reasoning = result?.reasoning || '';
      return globalThis.__ElecKoiSt.isFalseBoolean(args.regex) ? reasoning : globalThis.__ElecKoiSt.getRegexedString(reasoning, 6);
    },
    'reasoning-format': (args, value) => {
      const template = context.extensionSettings.power_user?.reasoning;
      if (!template?.prefix || !template?.suffix || !args.reasoning) return '';
      return globalThis.__ElecKoiSt.formatReasoning(String(args.reasoning), String(value ?? '')).formatted;
    },
    'extension-enable': async (_args, value) => { await api.plugins.setEnabled(value, true); return ''; },
    'extension-disable': async (_args, value) => { await api.plugins.setEnabled(value, false); return ''; },
    'extension-state': async (_args, value) => String((await api.extensions.info(value)).enabled),
    'extension-exists': async (_args, value) => String((await api.plugins.list())[value] !== undefined),
    'extension-toggle': async (_args, value) => { await api.plugins.setEnabled(value, !(await api.extensions.info(value)).enabled); return ''; },
    'getchatbook': () => helper.getChatWorldbookName('current') || '',
    'getglobalbooks': () => JSON.stringify(helper.getGlobalWorldbookNames()),
    'getcharbook': args => { const names = helper.getCharWorldbookNames(args.name || 'current'); return args.type === 'all' ? JSON.stringify([names.primary, ...names.additional].filter(Boolean)) : names.primary || ''; },
    'getpersonabook': () => helper.getPersona('current')?.lorebook || '',
    'findentry': async (args, value) => { const entries = await helper.getLorebookEntries(args.file); const field = args.field || 'key'; return String(entries.find(entry => stringify(entry[field]).includes(String(value)))?.uid ?? ''); },
    'getentryfield': async (args, value) => { const entry = (await helper.getLorebookEntries(args.file)).find(entry => entry.uid === Number(value)); if (!entry) throw new Error(`Worldbook entry does not exist: ${value}`); return stringify(entry[args.field || 'content']); },
    'setentryfield': async (args, value) => { const uid = Number(args.uid), field = args.field || 'content'; await helper.setLorebookEntries(args.file, [{ uid, [field]: value }]); return ''; },
    'createentry': async (args, value) => { const result = await helper.createLorebookEntries(args.file, [{ content: value, keys: args.key ? [args.key] : [] }]); return String(result.new_uids[0]); },
    'wi-get-timed-effect': async (args, value) => {
      const effect = await api.worldbooks.timedEffect(args.file, Number(value), args.effect);
      return String(String(args.format).toLowerCase() === 'number' ? effect.remaining : effect.active);
    },
    'wi-set-timed-effect': async (args, value) => { await api.worldbooks.timedEffect(args.file, Number(args.uid), args.effect, value); return ''; },
    'db-list': async args => { const values = await api.databank.list(dbOptions(args)); return JSON.stringify(values.map(value => value[args.field || 'name'])); },
    'db-get': async (args, value) => (await document(args, value)).text,
    'db-add': async (args, value) => (await api.databank.put({ name: args.name, source: args.source || 'chat', text: String(value) })).url,
    'db-update': async (args, value) => { const found = await document(args, args.url || args.name); return (await api.databank.put({ id: found.id, source: args.source || '', text: value })).url; },
    'db-delete': async (args, value) => { const found = await document(args, value); await api.databank.delete(found.id, dbOptions(args)); return ''; },
    'db-disable': async (args, value) => { const found = await document(args, value); await api.databank.setEnabled(found.id, false, dbOptions(args)); return ''; },
    'db-enable': async (args, value) => { const found = await document(args, value); await api.databank.setEnabled(found.id, true, dbOptions(args)); return ''; },
    'db-ingest': async args => { await api.databank.ingest(dbOptions(args)); return ''; },
    'db-purge': async args => { await api.databank.purge(dbOptions(args)); return ''; },
    'db-search': async (args, value) => { const options = dbOptions(args); await api.databank.ingest(options); const results = await api.databank.search(value, options);
      const urls = [...new Set(results.map(result => result.url))];
      if (args.return === 'chunks') return urls.map(url => [...new Set(results.filter(result => result.url === url).sort((a,b) => a.index - b.index).map(result => result.text))].join('\n') + '\n\n').join('');
      return slashCommandReturnHelper.doReturn(args.return || 'object', urls, { objectToStringFunc: list => list.join('\n') }); },
    'vector-threshold': async (_args, value) => setting('threshold', value, Number),
    'vector-max-entries': async (_args, value) => setting('count', value, Number),
    'vector-files-state': async (_args, value) => setting('enabled', value, isTrueBoolean),
    'tag-import': (_args, value) => { const card = raw(value); context.importTags(card.data?.tags || [], context.characters.indexOf(card)); return ''; },
    'tag-add': (args, value) => { const card = helper.RawCharacter.find({ name: args.name || 'current' }); if (!card) return 'false';
      const tag = context.tags.find(tag => tag.name === value), present = tag && (context.tagMap[card.avatar] || []).includes(tag.id);
      context.importTags([String(value)], context.characters.indexOf(card)); return String(!present); },
    'tag-remove': (args, value) => { const card = helper.RawCharacter.find({ name: args.name || 'current' }); if (!card) return 'false';
      const tag = context.tags.find(tag => tag.name === value); if (tag) {
      const list = context.tagMap[card.avatar] || []; const index = list.indexOf(tag.id); if (index >= 0) { list.splice(index, 1); context.saveSettingsDebounced(); return 'true'; } } return 'false'; },
    'tag-exists': (args, value) => { const card = raw(args.name), tag = context.tags.find(tag => tag.name === value); return String(!!tag && (context.tagMap[card.avatar] || []).includes(tag.id)); },
    'tag-list': args => { const card = raw(args.name); const names = (context.tagMap[card.avatar] || []).map(id => context.tags.find(tag => tag.id === id)?.name).filter(Boolean);
      return names.join(', '); },
  };
  function reasoningDisplay(value, opened) { const ids = value ? range(value) : context.chat.map((_,i) => i);
    for (const id of ids) helper.retrieveDisplayedMessage(id).find('.mes_reasoning').each(function() { this.open = opened ?? !this.open; }); return ''; }
  async function setting(key, value, convert) { const settings = value === '' || value === undefined ? await api.databank.settings() : await api.databank.configure({ [key]: convert(value) }); return String(settings[key]); }
  async function noteNumber(field, value) {
    if (value) { const number = Math.abs(Number(value)); if (!Number.isInteger(number)) throw new TypeError(`Invalid note ${field}: ${value}`); await api.notes.set({ [field]: number }); }
    return String(api.notes.get()[field]);
  }
  function regexRule(name) {
    const value = helper.getTavernRegexes().find(rule => globalThis.__ElecKoiSt.compareIgnoreCaseAndAccents(rule.script_name, String(name), (a,b) => a === b));
    if (!value) throw new Error(`Regex script does not exist: ${name}`); return value;
  }
  const qrId = (args, fallback) => args.id === undefined ? args.label ?? fallback : Number(args.id);
  function qrFields(args, message) {
    const fields = { icon:args.icon, title:args.title, newLabel:args.newlabel, message, automationId:args.automationId };
    for (const [key, value] of Object.entries({ showlabel:'showLabel', hidden:'isHidden', startup:'executeOnStartup', user:'executeOnUser',
      bot:'executeOnAi', load:'executeOnChatChange', new:'executeOnNewChat', group:'executeOnGroupMemberDraft', generation:'executeBeforeGeneration' })) {
      if (args[key] !== undefined) fields[value] = isTrueBoolean(args[key]);
    }
    return Object.fromEntries(Object.entries(fields).filter(([,value]) => value !== undefined));
  }
  function qrSetFields(args) { return Object.fromEntries(Object.entries({nosend:'disableSend',before:'placeBeforeInput',inject:'injectInput'})
    .filter(([key]) => args[key] !== undefined).map(([key,field]) => [field,isTrueBoolean(args[key])])); }
  async function noteEnum(field, value, values) {
    if (value) { const number = values[String(value).trim().toLowerCase()]; if (number === undefined) throw new TypeError(`Invalid note ${field}: ${value}`); await api.notes.set({ [field]: number }); }
    return Object.keys(values).find(key => values[key] === api.notes.get()[field]);
  }
  for (const [name, callback] of Object.entries(callbacks)) {
    const source = descriptors[name]; if (!source) throw new Error(`Missing upstream command descriptor: ${name}`);
    const types = value => (Array.isArray(value) ? value : [value || 'STRING']).map(type => ARGUMENT_TYPE[type] || ARGUMENT_TYPE.STRING);
    const named = (source.namedArgumentList || []).map(value => SlashCommandNamedArgument.fromProps({ ...value, typeList: types(value.typeList) }));
    if (name.startsWith('char-') || name.startsWith('persona-')) for (const field of ['name','description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions','tags','creator','character_version','alternate_greetings','extensions','avatar','char','persona','select']) {
      if (!named.some(arg => arg.name === field)) named.push(SlashCommandNamedArgument.fromProps({ name: field, typeList: [ARGUMENT_TYPE.STRING] }));
    }
    const unnamed = (source.unnamedArgumentList || []).map(value => SlashCommandArgument.fromProps({ ...value, typeList: types(value.typeList) }));
    const command = SlashCommand.fromProps({ ...source, namedArgumentList: named, unnamedArgumentList: unnamed, callback });
    const old = SlashCommandParser.commands[name]; if (old) for (const alias of [old.name, ...(old.aliases || [])]) delete SlashCommandParser.commands[alias];
    SlashCommandParser.addCommandObject(command);
  }
}

function messageIndex(context, value) {
  const number = value === undefined || value === '' ? context.chat.length - 1 : Number(value);
  const index = number < 0 ? context.chat.length + number : number;
  if (!Number.isInteger(index) || index < 0 || index >= context.chat.length) throw new RangeError(`Message index out of range: ${value}`);
  return index;
}
