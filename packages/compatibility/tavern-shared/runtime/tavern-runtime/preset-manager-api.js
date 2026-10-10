import { lodash } from './libraries.js';
import { Popup } from '../vendor/sillytavern/public/scripts/popup.js';
import { createPresetManagerBase, presetFilteredKeys } from '../vendor/sillytavern/public/scripts/eleckoi-preset-manager.js';
import { convertNovelPreset } from '../vendor/sillytavern/public/scripts/eleckoi-novel-preset.js';
import { settingsToUpdate } from '../vendor/sillytavern/public/scripts/eleckoi-preset-setting-map.js';
import { rawPromptSettings } from './prompt-manager.js';
import defaults from './preset-defaults.json';
import { contextControls } from '../vendor/sillytavern/public/scripts/eleckoi-context-preset-controls.js';

const copy = value => value === undefined ? undefined : structuredClone(value);
const apiName = value => value === 'koboldhorde' ? 'kobold' : value;
const settingKeys = { max_context:'openai_max_context', max_completion_tokens:'openai_max_tokens', reply_count:'n', should_stream:'stream_openai',
  request_thoughts:'show_thoughts', enable_function_calling:'function_calling', allow_sending_videos:'video_inlining', wrap_user_messages_in_quotes:'wrap_in_quotes' };
function rawPreset(preset, rawRegex = value => value) {
  const raw = rawPromptSettings({...preset,prompts:preset.prompts || [],prompts_unused:preset.prompts_unused || []});
  for (const [key, value] of Object.entries(preset.settings || {})) raw[settingKeys[key] || key] = copy(value);
  raw.extensions = copy(preset.extensions || {});
  if (Array.isArray(raw.extensions.regex_scripts)) raw.extensions.regex_scripts = raw.extensions.regex_scripts.map(rawRegex);
  raw.image_inlining = preset.settings.allow_sending_images !== 'disabled';
  raw.inline_image_quality = raw.image_inlining ? preset.settings.allow_sending_images : 'auto';
  raw.names_behavior = {default:0, completion:1, content:2}[preset.settings.character_name_prefix] ?? -1;
  return raw;
}

// The existing native preset repository remains the owner of chat-completion presets.
// Formatting/text fields not present in that repository share the durable SDK settings store.
export function installPresetManagers(context, bridge) {
  const managers = new Map();
  const get = (api = '') => {
    api = apiName(api || context.mainApi);
    if (!Object.hasOwn(defaults, api)) return null;
    if (!managers.has(api)) managers.set(api, new PresetManager(api));
    const manager = managers.get(api); manager.syncSelect(); return manager;
  };
  const Base = createPresetManagerBase(context, get);
  const persist = async () => { context.saveSettingsDebounced(); await bridge.flush(); };
  const completionSettings = (api=context.mainApi) => {
    const selected=apiName(api);
    if (['novel','kobold'].includes(selected)) {
      const values=context.extensionSettings.eleckoi_api_completion ||= {};
      // Preserve the former common document once, then keep API-owned references.
      return values[selected] ||= copy(context.textCompletionSettings);
    }
    return context.textCompletionSettings;
  };
  class PresetManager extends Base {
    constructor(api) {
      super(); this.apiId = api; this.select = globalThis.document.createElement('select'); this.select.dataset.presetManagerFor = api;
      this.liveRecords = new Map(); this.presets = []; this.presetNames = this.isKeyedApi() ? [] : {};
      const change = () => { if (!this.dispatchingSelection) this.selectPreset(this.select.value).catch(bridge.report); };
      globalThis.$(this.select).on('change',change);
      bridge.cleanup.add(() => globalThis.$(this.select).off('change',change));
    }
    isAdvancedFormatting() { return ['context','instruct','sysprompt','reasoning'].includes(this.apiId); }
    isKeyedApi() { return this.apiId === 'textgenerationwebui' || this.isAdvancedFormatting(); }
    sourceRecords() {
      if (this.apiId === 'openai') return bridge.names().map(name => ({name, preset:rawPreset(bridge.preset(name), bridge.rawRegex)}));
      const state = context.extensionSettings;
      const custom = state.eleckoi_completion_presets?.[this.apiId] || [];
      const removed = state.eleckoi_deleted_presets?.[this.apiId] || [];
      const legacy = this.apiId === 'reasoning' ? state.eleckoi_reasoning_templates || [] : [];
      const overrides = [...legacy, ...custom].map(value => ({name:value.name, preset:value.settings ?? value}));
      return [...defaults[this.apiId].filter(item => !removed.includes(item.name) && !overrides.some(value => value.name === item.name)), ...overrides];
    }
    records() {
      const source = this.sourceRecords(), names = new Set(source.map(item => item.name));
      for (const name of this.liveRecords.keys()) if (!names.has(name)) this.liveRecords.delete(name);
      return source.map(item => {
        let record = this.liveRecords.get(item.name);
        if (!record) {
          record = {name:item.name,preset:copy(item.preset),committed:copy(item.preset)};
          this.liveRecords.set(item.name,record);
        } else {
          bridge.reconcile(record.preset,record.committed,item.preset,`presets.${this.apiId}.${item.name}`);
          record.committed = copy(item.preset);
        }
        return record;
      });
    }
    currentSettings() {
      if (this.apiId === 'openai') return context.chatCompletionSettings;
      if (this.isAdvancedFormatting()) return context.powerUserSettings[this.apiId] ||= {};
      return completionSettings(this.apiId);
    }
    getAllPresets() { return [...this.select.options].map(option=>option.text); }
    findPreset(name) { return [...this.select.options].find(option=>option.text===name)?.value; }
    hostSelectedPresetName() {
      if (this.apiId === 'openai') return bridge.name();
      const settings = this.currentSettings();
      return (this.isAdvancedFormatting() ? settings.preset || settings.name : context.extensionSettings.eleckoi_selected_presets?.[this.apiId] || settings.preset) || '';
    }
    getSelectedPresetName() { return this.select.selectedOptions[0]?.text || ''; }
    getSelectedPreset() { return this.select.selectedOptions[0]?.value; }
    getPresetList(api = this.apiId) {
      const manager = get(api);
      if (!manager) return {presets:[],preset_names:{},settings:{}};
      const records = manager.records(), names = records.map(item => item.name);
      const settings = manager.currentSettings();
      if (manager.apiId === 'openai' && manager.liveReference !== bridge.reference()) {
        manager.liveReference = bridge.reference();
        const incoming = rawPreset(bridge.preset('in_use'), bridge.rawRegex);
        if (manager.lastSettings) bridge.reconcile(settings,manager.lastSettings,incoming,'presetSettings.openai');
        else Object.assign(settings,incoming);
        manager.lastSettings = copy(incoming);
      }
      manager.presets.splice(0,manager.presets.length,...records.map(item => item.preset));
      if (manager.isKeyedApi()) manager.presetNames.splice(0,manager.presetNames.length,...names);
      else {
        for (const name of Object.keys(manager.presetNames)) if (!names.includes(name)) delete manager.presetNames[name];
        names.forEach((name,index) => manager.presetNames[name] = index);
      }
      return {presets:manager.presets,preset_names:manager.presetNames,settings};
    }
    getCompletionPresetByName(name) { return this.records().find(item => item.name === name)?.preset; }
    async selectPreset(value) {
      const name = [...this.select.options].find(option=>option.value===String(value))?.text;
      if (!name || !this.sourceRecords().some(record=>record.name===name)) throw new Error(`Preset does not exist: ${value}`);
      if (this.apiId === 'openai') {
        await bridge.flush();
        const event = {preset:copy(this.getCompletionPresetByName(name)),presetName:name,presetNameBefore:this.getSelectedPresetName(),
          settings:this.currentSettings(),settingsToUpdate,savePreset:(name,settings)=>this.savePreset(name,settings)};
        await context.eventSource.emit(context.eventTypes.OAI_PRESET_CHANGED_BEFORE,event);
        if (!bridge.load(name)) throw new Error(`Preset could not be loaded: ${name}`);
        await bridge.flush();
        // Listener edits apply to the native runtime draft, preserving the saved preset.
        await bridge.applyRaw(event.preset);
        Object.assign(this.currentSettings(),event.preset);
        for (const [key,[,setting,,connection]] of Object.entries(event.settingsToUpdate))
          if ((!connection || this.currentSettings().bind_preset_to_connection) && event.preset[key] !== undefined)
            this.currentSettings()[setting] = copy(event.preset[key]);
        this.lastSettings = rawPreset(bridge.preset('in_use'), bridge.rawRegex); this.liveReference = bridge.reference();
        this.syncSelect();this.select.value=this.findPreset(name);
        await context.eventSource.emit(context.eventTypes.OAI_PRESET_CHANGED_AFTER);
      }
      else {
        const raw = copy(this.getCompletionPresetByName(name));
        this.applySettings(raw,name);
        (context.extensionSettings.eleckoi_selected_presets ||= {})[this.apiId] = name;
        await persist();
      }
      this.syncSelect();
      this.select.value=this.findPreset(name);
      this.notifySelection();
      if (!this.isAdvancedFormatting()) await context.eventSource.emit(context.eventTypes.PRESET_CHANGED,{apiId:this.apiId,name});
    }
    applySettings(raw,name) {
      const settings=this.currentSettings(),enabled=settings.enabled;
      Object.assign(settings,raw,this.isAdvancedFormatting()?{preset:name,name,...(enabled===undefined?{}:{enabled})}:{});
      if(this.apiId==='context') for(const control of contextControls) {
        const value=raw[control.property] ?? control.defaultValue;
        if(value!==undefined)(control.isGlobalSetting?context.powerUserSettings:settings)[control.property]=value;
      }
      if(this.apiId==='context'&&context.powerUserSettings.instruct.bind_to_context) {
        const instruct=get('instruct'),matched=instruct.getCompletionPresetByName(name);
        if(matched&&instruct.getSelectedPresetName()!==name) {
          instruct.applySettings(copy(matched),name);instruct.currentSettings().enabled=true;
          (context.extensionSettings.eleckoi_selected_presets ||= {}).instruct=name;
          instruct.syncSelect();instruct.notifySelection();
        }
      }
    }
    notifySelection() {
      this.dispatchingSelection=true;
      try { globalThis.$(this.select).trigger('change'); }
      finally { this.dispatchingSelection=false; }
    }
    syncSelect() {
      const names = this.records().map(record=>record.name), selected = this.hostSelectedPresetName(),previousValue=this.select.value;
      const existing = new Map([...this.select.options].map(option => [option.text,option]));
      names.forEach((name,index) => {
        const option = existing.get(name) || this.select.ownerDocument.createElement('option');
        option.text = name; option.value = this.isKeyedApi() ? name : String(index);
        if (this.select.options[index] !== option) this.select.insertBefore(option,this.select.options[index] || null);
        existing.delete(name);
      });
      for (const [name,option] of existing) if(this.managedOptionNames?.has(name))option.remove();
      this.managedOptionNames=new Set(names);
      if(this.lastHostSelection!==selected || ![...this.select.options].some(option=>option.value===previousValue))
        this.select.value = this.isKeyedApi() ? selected : String(names.indexOf(selected));
      else this.select.value=previousValue;
      this.lastHostSelection=selected;
    }
    getPresetSettings(name) {
      if (this.apiId === 'openai') return {...rawPreset(bridge.preset('in_use'), bridge.rawRegex),...copy(this.getPresetList().settings)};
      const settings = copy(this.currentSettings());
      if(this.apiId==='context') for(const control of contextControls) {
        const value=(control.isGlobalSetting?context.powerUserSettings:this.currentSettings())[control.property];
        settings[control.property]=control.isCheckbox?!!value:copy(value);
      }
      if (this.isAdvancedFormatting()) settings.name = name || settings.preset || settings.name;
      for (const key of presetFilteredKeys) delete settings[key];
      if (!this.isAdvancedFormatting()) {
        settings.genamt = context.chatCompletionSettings.openai_max_tokens ?? bridge.preset('in_use').settings.max_completion_tokens;
        settings.max_length = context.chatCompletionSettings.openai_max_context ?? bridge.preset('in_use').settings.max_context;
      }
      return settings;
    }
    async savePreset(name, settings, {skipUpdate = false} = {}) {
      if (!String(name || '').trim()) throw new Error('Preset requires a name');
      const raw = this.apiId === 'novel' ? convertNovelPreset(copy(settings ?? this.getPresetSettings(name))) : copy(settings ?? this.getPresetSettings(name));
      if (this.apiId === 'openai') await bridge.importRaw(name, raw);
      else {
        if (this.apiId === 'instruct' && settings && raw.system_prompt) {
          const system = get('sysprompt');
          if (await Popup.show.confirm('System prompt detected', 'Import the system prompt included in this instruct template?')) {
            await system.savePreset(name, {name,content:raw.system_prompt});
          }
        }
        const list = (context.extensionSettings.eleckoi_completion_presets ||= {})[this.apiId] ||= [];
        const index = list.findIndex(item => item.name === name), record = {...raw,name};
        if (index < 0) list.push(record); else list[index] = record;
        const removed = context.extensionSettings.eleckoi_deleted_presets?.[this.apiId];
        if (removed?.includes(name)) removed.splice(removed.indexOf(name),1);
        await persist();
      }
      this.syncSelect();
      if (!skipUpdate) await this.selectPreset(this.findPreset(name));
    }
    async updatePreset(options = {skipUpdate:false}) {
      if (this.getSelectedPreset() === 'gui') return;
      await this.savePreset(this.getSelectedPresetName(), null, options);
    }
    async savePresetAs() {
      const name = await Popup.show.input(this.isAdvancedFormatting() ? 'Template name:' : 'Preset name:', '', this.getSelectedPresetName());
      if (name) await this.savePreset(name);
    }
    async renamePreset(newName) {
      const oldName = this.getSelectedPresetName();
      if (oldName.localeCompare(newName, undefined, {sensitivity:'base'}) === 0) throw new Error('New name must be different from old name');
      if (this.apiId === 'openai') { if (!await bridge.rename(oldName,newName)) throw new Error(`Preset could not be renamed: ${oldName}`); this.syncSelect(); }
      else {
        await context.eventSource.emit(context.eventTypes.PRESET_RENAMED_BEFORE,{apiId:this.apiId,oldName,newName});
        await this.savePreset(newName); await this.deletePreset(oldName);
        await context.eventSource.emit(context.eventTypes.PRESET_RENAMED,{apiId:this.apiId,oldName,newName});
      }
    }
    updateList(name,preset) {
      // Immediate shared state; the common host also durably applies a native list update.
      if (this.apiId === 'openai') bridge.updateList(name,preset);
      else {
        const list = (context.extensionSettings.eleckoi_completion_presets ||= {})[this.apiId] ||= [];
        const index = list.findIndex(item => item.name === name), record = {...copy(preset),name};
        if (index < 0) list.push(record); else list[index] = record;
        this.applySettings(copy(preset),name);
        (context.extensionSettings.eleckoi_selected_presets ||= {})[this.apiId] = name;
        context.saveSettingsDebounced();
      }
      this.syncSelect();
      this.notifySelection();
    }
    async deletePreset(name = this.getSelectedPresetName()) {
      if (name === 'gui') return;
      const selected = this.getSelectedPresetName() === name;
      if (this.apiId === 'openai') { const result = await bridge.delete(name); this.syncSelect(); return result; }
      if (!this.getAllPresets().includes(name)) return false;
      const list = context.extensionSettings.eleckoi_completion_presets?.[this.apiId] || [];
      const index = list.findIndex(item => item.name === name); if (index >= 0) list.splice(index,1);
      if (defaults[this.apiId].some(item => item.name === name)) ((context.extensionSettings.eleckoi_deleted_presets ||= {})[this.apiId] ||= []).push(name);
      if (this.apiId === 'reasoning') context.extensionSettings.eleckoi_reasoning_templates = (context.extensionSettings.eleckoi_reasoning_templates || []).filter(item=>item.name !== name);
      await persist();
      if (selected && this.getAllPresets().length) await this.selectPreset(this.findPreset(this.getAllPresets()[0]));
      await context.eventSource.emit(context.eventTypes.PRESET_DELETED,{apiId:this.apiId,name});
      this.syncSelect(); return true;
    }
    async getDefaultPreset(name) { const found = defaults[this.apiId].find(item => item.name === name); return {isDefault:!!found,preset:copy(found?.preset || {})}; }
    readPresetExtensionField({name = this.getSelectedPresetName(),path}) {
      name ||= this.getSelectedPresetName();
      const source = name === this.getSelectedPresetName() ? this.getPresetList().settings : this.getCompletionPresetByName(name);
      if (!source) return null;
      const extensions = lodash.isPlainObject(source.extensions) ? source.extensions : {};
      return path ? lodash.get(extensions,path,null) : extensions;
    }
    async writePresetExtensionField({name = this.getSelectedPresetName(),path,value}) {
      name ||= this.getSelectedPresetName();
      if (name === this.getSelectedPresetName()) {
        const settings = this.getPresetList().settings;
        if(!lodash.isPlainObject(settings.extensions))settings.extensions={};
        if (path) lodash.set(settings.extensions,path,value); else settings.extensions = value;
        if (this.apiId === 'openai') await bridge.updateExtensions(settings.extensions); else await persist();
      }
      const preset = this.getCompletionPresetByName(name); if (!preset) return;
      if(!lodash.isPlainObject(preset.extensions))preset.extensions={};
      if (path) lodash.set(preset.extensions,path,value); else preset.extensions = value;
      await this.savePreset(name,preset,{skipUpdate:true});
    }
  }
  Object.defineProperty(context,'__eleckoiPresetManagers',{configurable:true,value:get});
  Object.defineProperty(context,'__eleckoiPresetManager',{configurable:true,value:get});
  Object.defineProperty(context,'__eleckoiCompletionSettings',{configurable:true,value:completionSettings});
  return get;
}
