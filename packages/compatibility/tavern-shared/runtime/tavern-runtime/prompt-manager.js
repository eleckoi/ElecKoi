import { PromptManagerCore, TokenHandler } from '../vendor/sillytavern/public/scripts/eleckoi-prompt-models.js';
import { installPromptManagerUi } from './prompt-manager-ui.js';
import defaults from './preset-defaults.json';

const copy = value => JSON.parse(JSON.stringify(value));
const system = ['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'];
const markers = ['worldInfoBefore', 'personaDescription', 'charDescription', 'charPersonality', 'scenario', 'worldInfoAfter', 'dialogueExamples', 'chatHistory'];

// The raw ST document and the TH view describe the same saved preset, including unknown fields.
export function rawPromptSettings(preset) {
  const raw = copy(preset.eleckoi_raw_source || {}), old = raw.prompts || [];
  raw.prompts = [...preset.prompts, ...preset.prompts_unused].map(prompt => ({
    ...old.find(item => item.identifier === prompt.id), identifier: prompt.id, name: prompt.name, role: prompt.role,
    enabled: prompt.enabled, content: prompt.content ?? old.find(item => item.identifier === prompt.id)?.content ?? '',
    system_prompt: old.find(item => item.identifier === prompt.id)?.system_prompt ?? [...system, ...markers].includes(prompt.id),
    marker: old.find(item => item.identifier === prompt.id)?.marker ?? markers.includes(prompt.id),
    injection_position: prompt.position?.type === 'in_chat' ? 1 : 0, injection_depth: prompt.position?.depth ?? 4,
    injection_order: prompt.position?.order ?? 100, extra: prompt.extra || {},
  }));
  const globalOrder = (raw.prompt_order || []).find(entry => String(entry.character_id) === '100001');
  raw.prompt_order = [...(raw.prompt_order || []).filter(entry => String(entry.character_id) !== '100001'), {
    ...globalOrder, character_id: 100001,
    order: preset.prompts.map(prompt => ({ ...globalOrder?.order?.find(entry => entry.identifier === prompt.id),
      identifier: prompt.id, enabled: prompt.enabled })),
  }];
  return raw;
}

export function typedPromptSettings(previous, raw, activeId = 100001) {
  const order = raw.prompt_order.find(entry => String(entry.character_id) === String(activeId))?.order || [];
  const convert = (prompt, enabled = prompt.enabled ?? true) => ({
    id: prompt.identifier, name: prompt.name ?? prompt.identifier, role: prompt.role ?? 'system', enabled,
    content: prompt.content ?? '', extra: prompt.extra || {},
    position: prompt.injection_position === 1 ? { type: 'in_chat', depth: prompt.injection_depth ?? 4, order: prompt.injection_order ?? 100 } : { type: 'relative' },
  });
  const ids = new Set(order.map(item => item.identifier));
  return { ...copy(previous), eleckoi_raw_source: copy(raw), prompts: order.map(entry => {
    const prompt = raw.prompts.find(prompt => prompt.identifier === entry.identifier);
    if (!prompt) throw new Error(`Prompt order references a missing prompt: ${entry.identifier}`);
    return convert(prompt, entry.enabled);
  }), prompts_unused: raw.prompts.filter(prompt => !ids.has(prompt.identifier)).map(prompt => convert(prompt)) };
}

export function createPromptManager(context, bridge) {
  const manager = new PromptManagerCore();
  manager.configuration = { version:1, prefix:'completion_', containerIdentifier:'', listIdentifier:'', listItemTemplateIdentifier:'',
    toggleDisabled:[], promptOrder:{strategy:'global',dummyId:100001}, sortableDelay:30,
    warningTokenThreshold:1500, dangerTokenThreshold:500, defaultPrompts:{main:'',nsfw:'',jailbreak:'',enhanceDefinitions:''} };
  manager.systemPrompts = [...system];
  manager.overridablePrompts = ['main','jailbreak'];
  manager.overriddenPrompts = [];
  manager.messages = null;
  manager.error = null;
  Object.defineProperty(manager, 'activeCharacter', { configurable:true, get: () => manager.configuration.promptOrder.strategy === 'global'
    ? { id: manager.configuration.promptOrder.dummyId } : { id: context.characterId } });
  manager.tokenHandler = new TokenHandler(async messages => {
    const values = Array.isArray(messages) ? messages : [messages];
    return (await Promise.all(values.map(message => context.getTokenCountAsync(typeof message === 'string' ? message : JSON.stringify(message))))).reduce((a, b) => a + b, 0);
  });
  manager.tokenUsage = 0;
  manager.log = message => console.debug('[ElecKoi PromptManager]', message);
  manager.getActiveGroupCharacters = () => (manager.activeCharacter?.group?.members || context.groups.find(group => group.id === context.groupId)?.members || [])
    .map(avatar => context.characters.find(card => card.avatar === avatar)?.name ?? (avatar && avatar.substring(0,avatar.lastIndexOf('.')))).filter(Boolean);
  manager.render = bridge.render;
  manager.renderDebounced = bridge.renderDebounced;
  manager.save = () => { persist(); return bridge.flush(); };
  manager.saveServiceSettings = manager.save;

  bridge.shared.promptManagerDocuments ||= new Map();
  function persist(document = currentDocument()) {
    // This runs synchronously; queued native saves retain the chat/preset captured here.
    const current = bridge.presetId() === document.id;
    const preset = typedPromptSettings(current ? bridge.preset() : document.base, document.raw, document.activeId);
    if (current) bridge.update(preset);
    document.base = preset;
    if (current) document.reference = bridge.presetReference();
    bridge.persist(preset, document.id);
  }
  function reconcile(target, source) {
    if (Array.isArray(target) && Array.isArray(source)) {
      const key = item => item?.identifier ?? item?.character_id;
      const originals = new Map(target.map(item => [key(item), item]));
      const values = source.map((item, index) => {
        const previous = key(item) === undefined ? target[index] : originals.get(key(item));
        if (previous && item && typeof previous === 'object' && typeof item === 'object') { reconcile(previous, item); return previous; }
        return copy(item);
      });
      target.splice(0, target.length, ...values); return;
    }
    for (const key of Object.keys(target)) if (!Object.hasOwn(source, key)) delete target[key];
    for (const [key, value] of Object.entries(source)) {
      if (target[key] && value && typeof target[key] === 'object' && typeof value === 'object' && Array.isArray(target[key]) === Array.isArray(value)) reconcile(target[key], value);
      else target[key] = copy(value);
    }
  }
  function currentDocument() {
    const reference = bridge.presetReference(), id = bridge.presetId();
    const existing = bridge.shared.promptManagerDocuments.get(id);
    if (existing) {
      if (existing.reference !== reference) { reconcile(existing.raw, projectedSettings(bridge.preset())); existing.reference = reference; existing.base = bridge.preset(); }
      existing.activeId = manager.activeCharacter?.id ?? manager.configuration.promptOrder.dummyId;
      return existing;
    }
    const raw = projectedSettings(bridge.preset()), proxies = new WeakMap();
    const record = { reference, id, raw, base: bridge.preset(), activeId: manager.activeCharacter.id, scheduled: false };
    const changed = () => {
      if (record.scheduled) return;
      record.scheduled = true;
      // Compound array edits settle before validating/persisting their final document.
      Promise.resolve().then(() => { record.scheduled = false; persist(record); }).catch(bridge.persistenceError);
    };
    const wrap = value => {
      if (!value || typeof value !== 'object') return value;
      if (proxies.has(value)) return proxies.get(value);
      const proxy = new Proxy(value, { get: (target, key) => wrap(Reflect.get(target, key)),
        set: (target, key, next) => { const result = Reflect.set(target, key, next); changed(); return result; },
        deleteProperty: (target, key) => { const result = Reflect.deleteProperty(target, key); changed(); return result; } });
      proxies.set(value, proxy); return proxy;
    };
    record.proxy = wrap(raw); bridge.shared.promptManagerDocuments.set(id, record); return record;
  }
  Object.defineProperty(manager, 'serviceSettings', { enumerable: true, get: () => currentDocument().proxy,
    set: raw => { const record = currentDocument(); reconcile(record.raw, copy(raw)); persist(record); } });
  const defaultSettings=defaults.openai.find(record=>record.name==='Default')?.preset;
  if(!defaultSettings)throw new Error('Bundled ST default prompt settings are missing');
  function projectedSettings(preset) {
    const raw=rawPromptSettings(preset);
    // ST initializes mandatory prompts even for a native preset with only marker slots.
    // They stay unbound unless its saved order includes them. A read never queues a save.
    for(const prompt of defaultSettings.prompts)if(!raw.prompts.some(value=>value.identifier===prompt.identifier))raw.prompts.push(copy(prompt));
    return raw;
  }
  installPromptManagerUi(manager,context,{...bridge,defaults:()=>copy(defaultSettings)});
  return manager;
}
