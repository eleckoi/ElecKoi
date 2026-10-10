import Fuse from 'fuse.js';
import templates from './system-prompt-templates.json';
import instructTemplates from './instruct-templates.json';
import contextTemplates from './context-templates.json';
import { isTrueBoolean } from '../vendor/sillytavern/public/scripts/utils.js';
import { PROMPT_PROCESSING_TYPE } from '../vendor/sillytavern/public/scripts/eleckoi-prompt-post-processing.js';

export function promptCommands(context) {
  const power = () => context.extensionSettings.power_user ||= {};
  const system = () => power().sysprompt ||= { enabled:false };
  const save = async () => { context.saveSettingsDebounced(); await globalThis.ElecKoi.flush(); };
  const state = async enabled => { system().enabled=enabled; await save(); return ''; };
  const instruct = () => power().instruct ||= {enabled:false};
  const instructState = async enabled => { instruct().enabled=enabled; await save(); return ''; };
  const managed = (api,fallback) => {
    const manager = context.__eleckoiPresetManagers?.(api);
    return manager ? manager.getAllPresets().map(name=>({...manager.getCompletionPresetByName(name),name})) : fallback;
  };
  return {
    'context': async(args,name)=>{
      const current=power().context ||= {};
      if(!name)return current.name || '';
      const custom=context.extensionSettings.eleckoi_completion_presets?.context || [];
      const list=managed('context',[...contextTemplates.filter(item=>!custom.some(value=>value.name===item.name)),...custom]);
      const selected=list.find(item=>item.name===name) || new Fuse(list,{keys:['name']}).search(String(name))[0]?.item;
      if(!selected)throw new Error(`Context template not found: ${name}`);
      Object.assign(current,structuredClone(selected.settings ?? selected),{name:selected.name});await save();
      if(!isTrueBoolean(args.quiet))globalThis.toastr?.success(`Context template: ${selected.name}`);return selected.name;
    },
    'instruct-on': () => instructState(true), 'instruct-off': () => instructState(false),
    'instruct-state': async (_args,value) => {
      if (value) await instructState(isTrueBoolean(value));
      return String(instruct().enabled);
    },
    'instruct': async (args,name) => {
      if (!name) return instruct().enabled || isTrueBoolean(args.forceGet) ? instruct().preset || '' : '';
      const custom=context.extensionSettings.eleckoi_completion_presets?.instruct || [];
      const list=managed('instruct',[...instructTemplates.filter(item=>!custom.some(value=>value.name===item.name)),...custom]);
      const found=list.find(item=>item.name===name) || new Fuse(list,{keys:['name']}).search(String(name))[0]?.item;
      if (!found) { if (!isTrueBoolean(args.quiet)) globalThis.toastr?.warning(`Instruct template '${name}' not found`); return ''; }
      Object.assign(instruct(),structuredClone(found.settings ?? found),{enabled:true,preset:found.name});
      await save(); return found.name;
    },
    'stop-strings': async (args,value) => {
      if (!value?.trim() && !isTrueBoolean(args.force)) return power().custom_stopping_strings || '';
      const parsed = value?.trim() ? JSON.parse(value) : [];
      if (!Array.isArray(parsed)) throw new TypeError('The value must be a JSON-serialized array of strings');
      power().custom_stopping_strings=JSON.stringify(parsed.map(String)); await save();
      return power().custom_stopping_strings;
    },
    'start-reply-with': async (args,value) => {
      if (!value && !isTrueBoolean(args.force)) return power().user_prompt_bias || '';
      power().user_prompt_bias=String(value ?? ''); await save(); return power().user_prompt_bias;
    },
    'prompt-post-processing': async (_args,value) => {
      const settings = context.extensionSettings.eleckoi_chat_completion ||= {};
      if (!value) return settings.custom_prompt_post_processing || 'none';
      const selected=String(value).trim().toLowerCase();
      if (!['none',...Object.values(PROMPT_PROCESSING_TYPE)].includes(selected)) throw new Error(`Invalid prompt post-processing type: ${value}`);
      settings.custom_prompt_post_processing=selected === 'none' ? '' : selected;
      context.chatCompletionSettings.custom_prompt_post_processing=settings.custom_prompt_post_processing;
      await save(); return settings.custom_prompt_post_processing;
    },
    'sysprompt-on': () => state(true), 'sysprompt-off': () => state(false),
    'sysprompt-state': async (_args,value) => {
      if (value) await state(isTrueBoolean(value));
      return String(system().enabled);
    },
    'sysprompt': async (args,name) => {
      if (!system().enabled && !isTrueBoolean(args.forceGet)) return '';
      if (!name) return system().name || '';
      const custom=context.extensionSettings.eleckoi_completion_presets?.sysprompt || [];
      const list=managed('sysprompt',[...templates.filter(item=>!custom.some(value=>value.name===item.name)),...custom]);
      const found=list.find(item=>item.name.toLowerCase()===String(name).toLowerCase()) || new Fuse(list,{keys:['name']}).search(String(name))[0]?.item;
      if (!found) { if (!isTrueBoolean(args.quiet)) globalThis.toastr?.warning(`System prompt "${name}" not found`); return ''; }
      Object.assign(system(),structuredClone(found.settings ?? found),{name:found.name});
      await save(); return found.name;
    },
  };
}
