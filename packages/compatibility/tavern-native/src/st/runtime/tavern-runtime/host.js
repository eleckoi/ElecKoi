// Live bindings used by the unchanged ST modules. Native operations go through the common SDK.
import Fuse from 'fuse.js';
import { chat_completion_sources } from '../vendor/sillytavern/public/scripts/eleckoi-chat-sources.js';
export { chat_completion_sources };
let context;
let options;
let readOnly = false;
export let chat = [], chat_metadata = {}, characters = [], groups = [], selected_group = null;
export let this_chid;
export let name1 = '', name2 = '', main_api = 'openai', extension_prompts = {}, extension_settings = {}, world_names = [];
export const neutralCharacterName = 'Assistant';
export const extension_prompt_roles = { SYSTEM: 0, USER: 1, ASSISTANT: 2 };
export const extension_prompt_types = { NONE: -1, IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
export const system_message_types = { GENERIC: 'generic', NARRATOR: 'narrator' };
export const textgenerationwebui_banned_in_macros = [];
export let tags = [], tag_map = {};
export const toastPositionClasses = ['toast-top-right', 'toast-top-left', 'toast-top-center', 'toast-bottom-right', 'toast-bottom-left', 'toast-bottom-center'];
export let power_user = {};
export const eventSource = { on: (...args) => context.eventSource.on(...args), emit: (...args) => context.eventSource.emit(...args) };
export let event_types = {};
export const accountStorage = {
  init: state => { Object.assign(context.extensionSettings.eleckoi_accountStorage ||= {}, state); context.saveSettingsDebounced(); },
  getItem: key => Object.hasOwn(context.extensionSettings.eleckoi_accountStorage || {}, key) ? String(context.extensionSettings.eleckoi_accountStorage[key]) : null,
  setItem: (key, value) => {
    const state = context.extensionSettings.eleckoi_accountStorage ||= {};
    if (Object.hasOwn(state, key) && state[key] === String(value)) return;
    state[key] = String(value); context.saveSettingsDebounced();
  },
  removeItem: key => { const state = context.extensionSettings.eleckoi_accountStorage || {}; if (Object.hasOwn(state, key)) { delete state[key]; context.saveSettingsDebounced(); } },
  getState: () => JSON.parse(JSON.stringify(context.extensionSettings.eleckoi_accountStorage || {})),
};
export function attach(ctx, api, configuration) { context = ctx; options = { api, ...configuration }; sync(); }
export function sync() {
  if (readOnly) return;
  chat = context.chat; chat_metadata = context.chatMetadata; characters = context.characters;
  main_api = context.mainApi;
  this_chid = context.characterId;
  if (characters[this_chid]) {
    const character = characters[this_chid];
    characters = [...characters];
    characters[this_chid] = { ...character, data: { ...character.data, extensions: { ...character.data?.extensions,
      regex_scripts: options.regex?.('character') || character.data?.extensions?.regex_scripts || [] } } };
  }
  name1 = context.name1; name2 = context.name2; selected_group = context.groupId;
  groups = context.groups || []; event_types = context.eventTypes;
  tags = context.tags || []; tag_map = context.tagMap || {};
  extension_settings = context.extensionSettings;
  extension_settings.disabledExtensions ||= [];
  extension_settings.regex = options.regex?.('global') || [];
  extension_settings.character_allowed_regex ||= characters.map(value => value.avatar);
  extension_settings.preset_allowed_regex ||= { openai: [options.presetName?.() || ''] };
  extension_settings.connectionManager ||= { profiles: [] };
  power_user = extension_settings.power_user ||= {};
  power_user.stscript ||= { parser: { flags: {} } };
  power_user.instruct ||= { enabled: false }; power_user.sysprompt ||= { enabled: false };
  power_user.reasoning ||= { name:'Think XML', prefix:'<think>', suffix:'</think>', separator:'\n', auto_parse:false, add_to_prompts:false, max_additions:1 };
  power_user.trim_spaces ??= true;
  power_user.context ||= {}; power_user.personas = Object.fromEntries((options.personas?.() || []).map(value => [value.avatar_id, value.name]));
  Object.assign(oai_settings, extension_settings.eleckoi_chat_completion || {});
  power_user.experimental_macro_engine = true;
  extension_prompts = context.extensionPrompts || {}; world_names = options.worldbooks?.() || [];
}
export const substituteParams = (...args) => context.substituteParams(...args);
export const substituteParamsExtended = (text, environment = {}, transform) => {
  if (!transform) return context.substituteParams(text, environment);
  return String(text).replace(/\{\{[^{}]*\}\}/g, value => transform(context.substituteParams(value, environment)));
};
export const getPresetManager = (api = '') => context.__eleckoiPresetManagers?.(api) ?? null;
export const writeExtensionField = async (id, path, value) => {
  const character = characters[id]; if (!character) throw new Error(`Character does not exist: ${id}`);
  character.data.extensions ||= {}; character.data.extensions[path] = value;
  await context.writeCharacterExtension(character.avatar, path, value);
};
export const saveSettingsDebounced = () => { if (!readOnly) context.saveSettingsDebounced(); };
export const saveMetadataDebounced = () => { if (!readOnly) context.saveMetadataDebounced(); };
export function withReadOnlyVariables(services, callback) {
  const original = { chat_metadata, extension_settings, variables: context.variables, readOnly };
  chat_metadata = JSON.parse(JSON.stringify(chat_metadata)); extension_settings = JSON.parse(JSON.stringify(extension_settings));
  context.variables = services; readOnly = true;
  try { return callback(); }
  finally { chat_metadata = original.chat_metadata; extension_settings = original.extension_settings; context.variables = original.variables; readOnly = original.readOnly; }
}
export const getCurrentChatId = () => context.getCurrentChatId();
export const getGeneratingModel = () => context.getChatCompletionModel();
export const getMaxContextTokens = () => Number(options.preset?.().settings.max_context ?? options.preset?.().settings.openai_max_context ?? 8192);
export const getMaxResponseTokens = () => Number(options.preset?.().settings.max_tokens ?? options.preset?.().settings.openai_max_tokens ?? 1024);
export const getMaxPromptTokens = () => getMaxContextTokens() - getMaxResponseTokens();
export const isMobile = () => /Android|iPhone|Mobile/i.test(globalThis.navigator?.userAgent || '');
export const shouldSendOnEnter = () => !power_user.send_on_enter || power_user.send_on_enter === 'always';
export const getCurrentLocale = () => globalThis.navigator?.language || 'en';
export function t(strings, ...values) { return typeof strings === 'string' ? strings : strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''); }
export const findExtension = name => options.extensions?.().find(value => value.id === name || value.name === name);
export const getGroupMembers = (id = selected_group) => (groups.find(value => value.id === id)?.members || []).map(avatar => characters.find(value => value.avatar === avatar)).filter(Boolean);
export const searchCharByName = name => characters.find(value => value.avatar === name || value.name.toLowerCase() === name.toLowerCase())?.avatar;
export function performFuzzySearch(type, data, keys, searchValue, fuzzySearchCaches = null) {
  const cache = fuzzySearchCaches?.[type];
  if (cache?.resultMap.has(searchValue)) return cache.resultMap.get(searchValue);
  const results = new Fuse(data, { keys, includeScore: true, ignoreLocation: true, useExtendedSearch: true, threshold: 0.2 }).search(searchValue);
  if (fuzzySearchCaches) fuzzySearchCaches[type].resultMap.set(searchValue, results);
  return results;
}
export const getTagsList = avatar => (tag_map[avatar] || []).map(id => tags.find(value => value.id === id)).filter(Boolean);
export function getCharacterCardFieldsLazy() {
  const raw = characters[context.characterId], data = raw?.data || {}, metadata = chat_metadata;
  return { system: metadata.system_prompt ?? data.system_prompt ?? '', jailbreak: data.post_history_instructions ?? '',
    description: raw?.description ?? data.description ?? '', personality: data.personality ?? '', scenario: metadata.scenario ?? data.scenario ?? '',
    persona: options.personas?.().find(value => value.avatar_id === context.user_avatar)?.description ?? '',
    mesExamples: data.mes_example ?? '', version: data.character_version ?? '', charDepthPrompt: data.extensions?.depth_prompt?.prompt ?? '',
    creatorNotes: data.creator_notes ?? '', firstMessage: data.first_mes ?? '', alternateGreetings: data.alternate_greetings ?? [] };
}
export function parseMesExamples(text) { return String(text).split(/<START>/gi).map(value => value.trim()).filter(Boolean); }
export function formatInstructModeExamples(examples, user, character) {
  const input = power_user.instruct;
  return examples.map(example => example.split('\n').map(line => line.startsWith(`${user}:`) ? `${input.input_sequence || ''}${line.slice(user.length + 1).trim()}${input.input_suffix || ''}`
    : line.startsWith(`${character}:`) ? `${input.output_sequence || ''}${line.slice(character.length + 1).trim()}${input.output_suffix || ''}` : line).join('\n')).join('\n');
}
export const sendSystemMessage = (_type, text) => options.api.messages.insert([{ role: 'system', content: text }]);
export const executeSlashCommandsWithOptions = (text, configuration) => options.execute(text, configuration);

// Original ToolManager uses the current connection and saves tool history through common context.
export const custom_prompt_post_processing_types = { NONE: '', MERGE_TOOLS: 'merge_tools', SEMI_TOOLS: 'semi_tools', STRICT_TOOLS: 'strict_tools' };
export let model_list = [];
export const oai_settings = { function_calling: true, chat_completion_source: 'custom', custom_prompt_post_processing: '' };
export const getChatCompletionModel = () => context.getChatCompletionModel();
export const getGeneratingApi = () => main_api;
export const system_avatar = '', systemUserName = 'System';
export const addOneMessage = (...args) => context.addOneMessage(...args);
export const saveChatConditional = () => context.saveChat();

export const messageFormatting = (...args) => context.messageFormatting(...args);
export const stopGeneration = () => context.stopGeneration();
export const reloadCurrentChat = () => context.reloadCurrentChat();
export const getTokenCountAsync = (...args) => context.getTokenCountAsync(...args);
export const getTextTokens = (...args) => context.getTextTokens(...args);
export const decodeTextTokens = (...args) => context.decodeTextTokens(...args);
export const getFriendlyTokenizerName = () => ({ tokenizerName: options.api.tokens.info().encoding, tokenizerId: options.api.tokens.info().encoding });
export const getContext = () => context;
export const setExtensionPrompt = (...args) => context.setExtensionPrompt(...args);
