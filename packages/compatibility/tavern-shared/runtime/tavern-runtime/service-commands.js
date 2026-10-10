import { isTrueBoolean, isFalseBoolean, compareIgnoreCaseAndAccents } from '../vendor/sillytavern/public/scripts/utils.js';
import { SlashCommandParser } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandParser.js';
import { Popup, POPUP_TYPE } from '../vendor/sillytavern/public/scripts/popup.js';
import Fuse from 'fuse.js';
import reasoningTemplates from './reasoning-templates.json';

/** Commands backed by the same services used by the SDK and the native Agent. */
export function serviceCommands(context, api) {
  const helper = globalThis;
  const save = async () => { context.saveSettingsDebounced(); await api.flush(); };
  const currentTokenizer = () => {
    const type = context.extensionSettings.power_user?.tokenizer ?? context.tokenizers.OPENAI;
    return typeof type === 'string' ? type : Object.keys(context.tokenizers).find(key => context.tokenizers[key] === type) || '';
  };
  return {
    'reasoning-template': async (args, name) => {
      const settings = (context.extensionSettings.power_user ||= {}).reasoning;
      if (!name) return settings?.name ?? '';
      const manager = context.__eleckoiPresetManagers?.('reasoning');
      const templates = manager ? manager.getAllPresets().map(name=>({...manager.getCompletionPresetByName(name),name}))
        : [...reasoningTemplates, ...(context.extensionSettings.eleckoi_reasoning_templates || [])];
      const template = templates.find(value => value.name.toLowerCase() === name.toLowerCase()) || new Fuse(templates, { keys:['name'] }).search(name)[0]?.item;
      if (!template) throw new Error(`Reasoning template does not exist: ${name}`);
      Object.assign((context.extensionSettings.power_user ||= {}).reasoning ||= {}, template);
      await save(); if (!isTrueBoolean(args.quiet)) helper.toastr?.success(`Reasoning template: ${template.name}`);
      return template.name;
    },
    'secret-read': (args,value) => api.connections.readSecret(args.key,value),
    'secret-write': (args,value) => api.connections.writeSecret(args.key,args.label?.trim() || new Date().toISOString(),String(value).trim(),isTrueBoolean(args.empty)),
    'secret-rename': (args,value) => api.connections.renameSecret(args.key,args.id,String(value).trim()),
    'secret-delete': (args,value) => api.connections.deleteSecret(args.key,value),
    'chat-manager': async () => { await api.chat.openHistory(); return ''; },
    'delchat': async () => {
      const id=context.getCurrentChatId();
      if (await Popup.show.confirm('Delete this chat?',context.getChatTitle())) await api.chat.delete(id);
      return '';
    },
    'rename-char': async (args,value) => {
      const card=helper.getCharData('current'); if (!card) throw new Error('No current character');
      let name=String(value || '').trim();
      if (!name && !isTrueBoolean(args.silent)) name=await Popup.show.input('Character name',card.name);
      if (!name) return 'false';
      let chats=args.chats === undefined || args.chats === '<null>' ? undefined : isTrueBoolean(args.chats);
      if (chats === undefined && !isTrueBoolean(args.silent)) chats=!!await Popup.show.confirm('Rename character in previous chats?',name);
      const result=await api.characters.rename(card.native_id,name,{chats:chats ?? false});
      return String(result);
    },
    'count': async () => {
      const count = await context.getTokenCountAsync(context.chat.filter(message => message.mes && !message.is_system).map(message => message.mes).join(' '));
      helper.toastr?.success(`Token count: ${count}`); return String(count);
    },
    'tokenizer': async (_args, value) => {
      if (value) await api.tokens.select(value); return currentTokenizer();
    },
    'sysname': async (_args, value) => {
      context.chatMetadata.narrator_name = value || 'System'; await context.saveMetadata(); return '';
    },
    'world': async (args, value) => {
      const active = new Set(helper.getGlobalWorldbookNames());
      if (!value?.trim()) active.clear();
      else for (const reference of value.trim().split(',')) {
        const name = helper.getWorldbookNames().find(name => name.toLowerCase() === reference.trim().toLowerCase());
        if (!name) throw new Error(`Worldbook does not exist: ${reference.trim()}`);
        if (args.state === 'off' || args.state === 'toggle' && active.has(name)) active.delete(name); else active.add(name);
      }
      await helper.rebindGlobalWorldbooks([...active]);
      if (!isTrueBoolean(args.silent)) helper.toastr?.success(`Active worlds: ${[...active].join(', ') || '(none)'}`);
      return '';
    },
    'persona-lock': async (args, value) => {
      const scope = args.type || 'chat', current = helper.getPersona('current');
      if (!current) throw new Error('No current Persona');
      const locked = await api.personas.binding(scope) === current.avatar_id;
      if (!value) return String(locked);
      const state = value.trim().toLowerCase();
      const enabled = ['toggle','t'].includes(state) ? !locked : isTrueBoolean(state) ? true : isFalseBoolean(state) ? false : undefined;
      if (enabled === undefined) throw new Error(`Unknown Persona lock state: ${value}`);
      await api.personas.binding(scope, enabled ? current.avatar_id : null); return String(enabled);
    },
    'regex-preset': async (args, reference) => {
      const presets = context.extensionSettings.regex_presets || [];
      if (!reference) return presets.find(preset => preset.isSelected)?.id || '';
      const preset = presets.find(preset => preset.id === reference || compareIgnoreCaseAndAccents(preset.name, reference, (a,b) => a === b));
      if (!preset) throw new Error(`Regex preset does not exist: ${reference}`);
      for (const [type, key] of [['global','global'], ['character','scoped'], ['preset','preset']]) {
        if (!Array.isArray(preset[key])) continue;
        const order = preset[key].map(item => item.id), rules = helper.getTavernRegexes({ type });
        for (const rule of rules) rule.enabled = order.includes(rule.id);
        rules.sort((a,b) => order.indexOf(a.id) - order.indexOf(b.id));
        await helper.replaceTavernRegexes(rules, { type });
      }
      for (const entry of context.extensionSettings.regex_presets || []) entry.isSelected = entry.id === preset.id;
      await save(); await context.reloadCurrentChat();
      if (!isTrueBoolean(args.quiet)) helper.toastr?.success(`Regex preset: ${preset.name}`);
      return preset.id;
    },
    '?': async (_args, topic) => {
      const doc = helper.top?.document || helper.document, content = doc.createElement('div');
      const commands = Object.values(SlashCommandParser.commands).filter((command,index,list) => list.indexOf(command) === index);
      const name = String(topic || '').replace(/^\//, ''), command = SlashCommandParser.commands[name];
      if (command) {
        const title = doc.createElement('h3'); title.textContent = `/${command.name}`; content.append(title);
        const help = doc.createElement('div'); help.innerHTML = command.helpString; content.append(help);
      } else if (name === 'macros') {
        const list = doc.createElement('pre'); list.textContent = context.macros.registry.getAllMacros().map(macro => `{{${macro.name}}}`).join('\n'); content.append(list);
      } else {
        for (const item of commands.filter(item => !name || item.name.includes(name)).sort((a,b) => a.name.localeCompare(b.name))) {
          const row = doc.createElement('p'); row.textContent = `/${item.name}${item.aliases?.length ? ' (' + item.aliases.join(', ') + ')' : ''}`; content.append(row);
        }
      }
      await new Popup(content, POPUP_TYPE.TEXT, '', { wide:true, large:true, allowVerticalScrolling:true }).show(); return '';
    },
    'beep': async () => {
      const realm = helper.top?.__ElecKoiShared ? helper.top : helper;
      const Audio = realm.AudioContext || realm.webkitAudioContext;
      if (!Audio) throw new Error('Web Audio is unavailable');
      const audio = new Audio();
      try {
        await audio.resume();
        const oscillator = audio.createOscillator(), volume = audio.createGain();
        oscillator.frequency.value = 880; volume.gain.value = 0.15;
        oscillator.connect(volume); volume.connect(audio.destination);
        await new Promise(resolve => { oscillator.onended = resolve; oscillator.start(); oscillator.stop(audio.currentTime + 0.12); });
      } finally { await audio.close(); }
      return '';
    },
  };
}
