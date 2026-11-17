import { useMemo, useRef, useSyncExternalStore } from 'react';
import { blankConfigForProvider } from '../../src/modules/models/model/modelProviderCatalog.js';
import { withRequiredAgentPresetEntries, withRequiredAgentPresetPromptPositions } from '../../../../packages/shared/src/contracts/presets/builtIns';
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from '../../../../packages/shared/src/contracts/settings/schemas';

const noop = () => {};
const artwork = index => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="${['#c5c8dd', '#cdd9ce', '#e0ced3'][index % 3]}"/><circle cx="150" cy="145" r="62" fill="#f3eee8"/><path d="M55 400V305a95 95 0 0 1 190 0v95" fill="#838ca5"/></svg>`);
export const collection = { groups: ['分组一', '分组二'], items: Array.from({ length: 1001 }, (_, index) => ({
  id: `tablet-card-${index}`, name: `示例角色 ${String(index + 1).padStart(4, '0')}`, authorName: '示例作者',
  group: index % 2 ? '分组一' : '分组二', persona: { assistant_cover: artwork(index) }, addedAtEpochMs: index,
})) };
const characterSnapshot = { status: 'ready', error: '', collection };
export const characters = { refresh: async () => collection, subscribe: () => noop, getSnapshot: () => characterSnapshot };
export const previewActions = [];
const record = (action, value) => previewActions.push({ action, value });
function memory(initial) {
  let snapshot = initial;
  const listeners = new Set();
  return { subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, getSnapshot: () => snapshot,
    update: change => { snapshot = change(snapshot); listeners.forEach(fn => fn()); return snapshot; } };
}
const preset = index => ({ id: `tablet-preset-${index}`, purpose: index % 3 === 2 ? 'creator' : 'roleplay',
  name: index === 1 ? '合成预设：较长名称用于检查平板列表与菜单边界' : `合成预设 ${String(index + 1).padStart(3, '0')}`,
  libraryGroupId: `preset-group-${index % 3}`, profile: { authorName: '合成作者', authorAvatarPath: artwork(index), usageInstructions: '这是用于平板布局检查的合成说明。\n\n这里包含较长正文，用来检查编辑页面、滚动和返回。', timeline: [] },
  modelTags: [{ id: 'general', label: '通用' }], activeVersionId: '', groups: [], expandedGroupIds: [],
  entries: withRequiredAgentPresetEntries([]), promptPositions: withRequiredAgentPresetPromptPositions([]),
  roleplayPlan: { steps: ['合成任务', '输出正文'] }, toolGroups: [], regexRules: [],
});
const catalog = { presets: Array.from({ length: 61 }, (_, index) => preset(index)),
  groups: Array.from({ length: 3 }, (_, index) => ({ id: `preset-group-${index}`, name: `合成分组${index + 1}`, purpose: index === 2 ? 'creator' : 'roleplay' })),
  activePresetIds: { roleplay: 'tablet-preset-0', creator: 'tablet-preset-2' } };
const presetState = memory({ status: 'ready', catalog, error: '' });
const changeCatalog = change => presetState.update(state => ({ ...state, catalog: change(state.catalog) })).catalog;
export const presets = { ...presetState, refresh: async () => presetState.getSnapshot().catalog,
  adopt: next => changeCatalog(() => next), subscribeDetail: () => noop,
  read: async id => structuredClone(presetState.getSnapshot().catalog.presets.find(item => item.id === id)),
  save: async draft => { record('preset.save', draft.id); changeCatalog(value => ({ ...value, presets: value.presets.map(item => item.id === draft.id ? structuredClone(draft) : item) })); return structuredClone(draft); },
  setActive: async id => { record('preset.activate', id); return changeCatalog(value => ({ ...value, activePresetIds: { ...value.activePresetIds, [value.presets.find(item => item.id === id).purpose]: id } })); },
  assignGroup: async (id, libraryGroupId) => { record('preset.group', id); return changeCatalog(value => ({ ...value, presets: value.presets.map(item => item.id === id ? { ...item, libraryGroupId } : item) })); },
  delete: async id => { record('preset.delete', id); return changeCatalog(value => ({ ...value, presets: value.presets.filter(item => item.id !== id) })); },
  create: async (name, libraryGroupId, purpose) => { const item = { ...preset(Date.now()), name, libraryGroupId, purpose }; changeCatalog(value => ({ ...value, presets: [...value.presets, item] })); return item; },
  createGroup: async (name, purpose) => changeCatalog(value => ({ ...value, groups: [...value.groups, { id: `group-${Date.now()}`, name, purpose }] })),
  renameGroup: async (id, name) => changeCatalog(value => ({ ...value, groups: value.groups.map(item => item.id === id ? { ...item, name } : item) })),
  deleteGroup: async id => changeCatalog(value => ({ ...value, groups: value.groups.filter(item => item.id !== id), presets: value.presets.map(item => item.libraryGroupId === id ? { ...item, libraryGroupId: '' } : item) })),
  reorderGroups: async (ids, purpose) => changeCatalog(value => ({ ...value, groups: [...value.groups.filter(item => item.purpose !== purpose), ...ids.map(id => value.groups.find(item => item.id === id))] })),
};
const configs = Array.from({ length: 31 }, (_, index) => ({ ...blankConfigForProvider(index === 30 ? 'openai_image' : 'custom'),
  id: `tablet-model-${index}`, name: index === 1 ? '合成配置：较长名称用于检查模型列表和编辑页面' : `合成模型配置 ${String(index + 1).padStart(2, '0')}`,
  base_url: 'https://synthetic.invalid/v1', api_key: '', model: 'synthetic-model',
  model_options: [{ id: 'synthetic-model', name: '合成模型', isUserAdded: true, inputModalities: ['text', 'image'], supportsImageInput: true }], custom_headers: {} }));
const modelState = memory({ status: 'ready', error: '', configs, providers: [{ provider: 'synthetic-builtin', displayName: '合成内置提供商', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'synthetic-builtin'] }] });
export const models = { ...modelState,
  save: async draft => { record('model.save', draft.id); modelState.update(value => ({ ...value, configs: value.configs.some(item => item.id === draft.id) ? value.configs.map(item => item.id === draft.id ? structuredClone(draft) : item) : [...value.configs, structuredClone(draft)] })); return draft; },
  deleteConfig: async id => { record('model.delete', id); modelState.update(value => ({ ...value, configs: value.configs.filter(item => item.id !== id) })); },
  revealApiKey: async () => '', discover: async () => { record('model.discover'); return [{ id: 'synthetic-discovered', name: '合成发现模型' }]; },
};
const sessions = collection.items.map((item, index) => ({ id: `tablet-chat-${index}`, character_id: item.id, character_name: item.name,
  summary: index === 1 ? '合成消息摘要，用于验证长文字在平板横屏和竖屏时的截断与行高。'.repeat(6) : `这是第 ${index + 1} 条合成对话摘要。`, updated_at: '2026-11-17T00:00:00Z' }));
const chatState = memory({ sessions, pinnedIds: ['tablet-chat-0'], sessionId: '', input: '', notice: null });
export const messages = Array.from({ length: 24 }, (_, index) => ({ id: `tablet-message-${index}`, role: index % 2 ? 'user' : 'assistant', content: '这是合成对话正文，用于检查平板显示。\n\n横竖屏切换后，正文与操作按钮应保持在视口内。', status: 'complete', created_at: '2026-11-17T00:00:00Z',
  runtimeSessionId: 'tablet-runtime', sessionEventSeq: index + 1, renderKey: `dsh-reply-tablet-runtime-${index + 1}` }));
export function useChatClient({ navigation }) {
  const state = useSyncExternalStore(chatState.subscribe, chatState.getSnapshot), scrollRef = useRef(null);
  return useMemo(() => { const session = state.sessions.find(item => item.id === state.sessionId); return {
    ...state, activeSection: navigation.selectedPanelId, characters: collection, persona: { user_name: '示例用户' },
    chatCharacter: { character_id: session?.character_id || '' }, chatPersona: { user_name: '示例用户', assistant_name: session?.character_name || '合成角色' },
    currentTitle: session?.character_name || '合成对话', messages, filteredSessions: [...state.sessions].sort((a,b) => Number(state.pinnedIds.includes(b.id)) - Number(state.pinnedIds.includes(a.id))), status: '就绪', historyOpen: false,
    notify: (type, message) => chatState.update(value => ({ ...value, notice: { type, message } })), dismissNotice: () => chatState.update(value => ({ ...value, notice: null })),
    selectCharacter: noop, saveCharacterGroups: async () => {}, closeHistory: noop,
    loadChat: async id => { record('chat.open', id); chatState.update(value => ({ ...value, sessionId: id })); },
    openCharacterChat: async id => { const item = sessions.find(value => value.character_id === id); chatState.update(value => ({ ...value, sessionId: item.id })); }, refreshSessionsOnly: noop,
    togglePinChat: async id => { record('chat.pin', id); chatState.update(value => ({ ...value, pinnedIds: value.pinnedIds.includes(id) ? value.pinnedIds.filter(item => item !== id) : [...value.pinnedIds, id] })); },
    hideChatEntry: async id => { record('chat.hide', id); chatState.update(value => ({ ...value, sessions: value.sessions.filter(item => item.id !== id) })); },
    scrollRef, runtimeSessionId: 'tablet-runtime', inputImages: [], inputFiles: [], chatModelConfigs: configs, modelOptionsByKey: {},
    setInput: input => chatState.update(value => ({ ...value, input })),
  }; }, [state, navigation.selectedPanelId]);
}
export const useWindowAppearance = () => ({ chatDisplay: DEFAULT_CHAT_DISPLAY_PREFERENCES, sidebarCharacterArtwork: 'cover' });
export const characterConfiguration = { regexRules: { test: async () => ({ text: '合成检查' }), editor: () => {
  const value = { target: { scope: 'preset', ownerId: 'synthetic' }, ownerRevision: '0'.repeat(64), globalRules: [], agentPresetRules: [], characterRules: [], versions: [], activeVersionId: '', revision: 0 };
  const snapshot = { status: 'ready', value }; return { subscribe: () => noop, getSnapshot: () => snapshot, read: async () => value, save: async next => next };
} } };
export const studioState = memory({ status: 'ready', error: '', active: { sessionId: 'tablet-runtime', characterId: '', presetId: 'tablet-preset-2' }, reference: { sessionId: 'tablet-runtime' }, blank: false });
export const creatorStudio = { sessions: { ...studioState, release: noop, refresh: async () => {}, restoreRecent: async () => studioState.getSnapshot().active,
  create: async characterId => { record('studio.create', characterId); studioState.update(value => ({ ...value, blank: true, active: { ...value.active, characterId } })); },
  selectCharacter: async characterId => { record('studio.character', characterId); studioState.update(value => ({ ...value, active: { ...value.active, characterId } })); },
  startWorkspace: async id => record('studio.workspace', id), readDefaultModel: async () => null,
  regenerate: async () => record('studio.regenerate'), messages: async () => messages.map((message,index) => ({ eventSeq:index+1,role:message.role,text:message.content })),
  deleteMessagesFrom: async index => record('studio.delete-from', index),
} };
