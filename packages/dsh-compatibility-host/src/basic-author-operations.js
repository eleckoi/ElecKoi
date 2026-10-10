import { randomUUID } from 'node:crypto';
import { APP_VERSION } from './component-metadata.js';

export const BASIC_AUTHOR_METHODS = ['app.getInfo', 'app.getCapabilities', 'context.current',
  'variables.getState', 'variables.getConfig', 'variables.setState', 'variables.merge', 'variables.applyPatch', 'variables.reset',
  'openings.list', 'openings.current', 'openings.select', 'messages.deleteFrom', 'messages.regenerate', 'messages.editAndRegenerate',
  'chat.current', 'chat.list', 'chat.getGenerationState', 'chat.getAgentTrajectory', 'chat.getModels', 'chat.send', 'chat.stopGeneration',
  'chat.create', 'chat.open', 'chat.delete', 'chat.selectModel', 'models.select', 'character.current', 'settingLibrary.current', 'settingLibrary.getSummary',
  'media.getMessageAttachments', 'media.getMessageAttachment', 'events.list'];
const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
const text = value => typeof value === 'string' ? value : '';
const requireText = (value, name) => { const result = text(value[name]); if (!result) throw new TypeError(`Missing Author field: ${name}`); return result; };
const requireObject = (value, name) => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be a JSON object`); return value; };
function mergeVariableObjects(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const previous = Object.hasOwn(result, key) ? result[key] : undefined;
    const merged = previous && typeof previous === 'object' && !Array.isArray(previous)
      && value && typeof value === 'object' && !Array.isArray(value)
      ? mergeVariableObjects(previous, value) : value;
    Object.defineProperty(result, key, { value: merged, enumerable: true, writable: true, configurable: true });
  }
  return result;
}

/** Original Android Author names delegate to the native product and Agent services. */
export class BasicAuthorOperations {
  constructor(services) { Object.assign(this, services); }
  chat(p) { const id = requireText(p, 'conversationId'); this.data.readConversationDetails(id); return id; }
  async messages(p) { return this.compatibility({ method: 'messages.read', params: { conversationId: this.chat(p) } }); }
  async message(p) {
    const messages = await this.messages(p), id = text(p.messageId) || text(p.id), result = id ? messages.find(message => message.id === id) : messages.at(-1);
    if (!result) throw new Error(`Author message does not exist: ${id}`); return result;
  }
  async state(p) {
    const id = this.chat(p);
    if (p.messageId) {
      const message = await this.message(p);
      if (!message.variableStateJson) throw new Error(`Historical native variable snapshot is unavailable: ${message.id}`);
      return requireObject(JSON.parse(message.variableStateJson), 'Variable state');
    }
    return requireObject(JSON.parse(this.data.readAuthorConversationState(id).currentVariableStateJson || '{}'), 'Variable state');
  }
  async saveState(p, state) { await this.conversations.replaceVariableState(this.chat(p), JSON.stringify(state)); return clone(state); }
  openings(p) {
    const opening = this.data.readConversationDetails(this.chat(p)).messages.find(message => message.id === 'opening');
    return { items: (opening?.openingOptions || []).map(item => ({ ...item, initialVariableState: JSON.parse(item.initialVariableStateJson || '{}') })), selectedId: opening?.selectedOpeningId };
  }
  async summary(p) {
    const id = this.chat(p), details = this.data.readConversationDetails(id), messages = await this.messages(p);
    return { id, title: details.conversation.title, preview: messages.at(-1)?.displayContent ?? messages.at(-1)?.content ?? '',
      createdAt: details.conversation.createdAt, updatedAt: details.conversation.updatedAt,
      characterId: details.metadata.characterId || '', characterName: details.metadata.characterName, characterAvatar: details.metadata.characterAvatar || '' };
  }
  async invoke({ method, params: p }) {
    switch (method) {
      case 'app.getInfo': return { name: 'ElecKoi', version: APP_VERSION, apiVersion: '0.1.0', stage: 'preview' };
      case 'app.getCapabilities': return this.methods().map(method => ({ method, namespace: method.split('.')[0], since: '0.1.0', stage: 'preview' }));
      case 'context.current': {
        const chat = this.chat(p), details = this.data.readConversationDetails(chat), messages = await this.messages(p), message = p.messageId ? await this.message(p) : messages.at(-1);
        return { surface: p.messageId ? 'message-renderer' : 'chat-ui', scope: 'current-character', conversationId: chat,
          conversationTitle: details.conversation.title, messageId: message?.id || '', characterId: details.metadata.characterId || '' };
      }
      case 'variables.getState': return this.state(p);
      case 'variables.getConfig': return clone(this.data.readAuthorConversationState(this.chat(p)).variableConfig);
      case 'variables.setState': return this.saveState(p, requireObject(p.state, 'state'));
      case 'variables.merge': return this.saveState(p, mergeVariableObjects(await this.state({ ...p, messageId: '' }), requireObject(p.state, 'state')));
      case 'variables.applyPatch': return this.saveState(p, applyNativeVariablePatch(await this.state({ ...p, messageId: '' }), p.patch));
      case 'variables.reset': return this.saveState(p, requireObject(JSON.parse(this.data.readAuthorConversationState(this.chat(p)).initialVariableStateJson || '{}'), 'Initial variable state'));
      case 'openings.list': return { items: this.openings(p).items };
      case 'openings.current': { const state = this.openings(p); return state.items.find(item => item.id === state.selectedId) || null; }
      case 'openings.select': { await this.conversations.selectOpening(this.chat(p), requireText(p, 'id')); return { selectedId: p.id }; }
      case 'messages.deleteFrom': {
        const message = await this.message(p);
        if (!Number.isSafeInteger(message.sessionEventSeq)) throw new Error('Opening removal must use the native opening service');
        const result = await this.conversations.deleteMessagesFrom(this.chat(p), message.sessionEventSeq, message.role);
        return { ok: true, deletedMessageCount: result.deletedMessageCount, remainingMessageCount: result.remainingMessageCount };
      }
      case 'messages.regenerate': case 'messages.editAndRegenerate': {
        const messages = await this.messages(p), selected = await this.message(p), index = messages.findIndex(message => message.id === selected.id);
        const user = selected.role === 'user' ? selected : messages.slice(0, index).findLast(message => message.role === 'user');
        if (!user || !Number.isSafeInteger(user.sessionEventSeq)) throw new Error('Regeneration requires a saved native user input');
        const requestId = randomUUID(), chat = this.chat(p), replacement = method === 'messages.editAndRegenerate' ? text(p.text) : undefined;
        await this.conversations.regenerateMessage(chat, user.sessionEventSeq, requestId, replacement);
        return this.conversations.startRegeneration(chat, requestId, false);
      }
      case 'chat.current': return this.summary(p);
      case 'chat.list': { const id = this.chat(p), characterId = this.data.readConversationDetails(id).metadata.characterId; return { items: (await this.conversations.list(new AbortController().signal)).filter(item => item.characterId === characterId || item.metadata?.characterId === characterId).map(item => item.conversation ? { ...item.conversation, ...item.metadata } : item) }; }
      case 'chat.getGenerationState': return this.generationState(this.chat(p), p.presentation);
      case 'chat.getAgentTrajectory': { const conversationId = this.chat(p); return { ...await this.trajectory(conversationId, { ...(p.beforeIndex === undefined ? {} : { beforeIndex: p.beforeIndex }), ...(p.limit === undefined ? {} : { limit: p.limit }) }), conversationId }; }
      case 'chat.getModels': {
        const selected = await this.models.current(this.chat(p)), configs = await this.compatibility({ method: 'models.list', params: {} });
        return { current: { ...selected, configId: selected.provider }, items: configs.map(config => ({ configId: config.id, name: config.name, provider: config.provider,
          defaultModel: config.model, models: config.models.map(model => ({ ...model, contextWindowTokens: model.contextWindowTokens ?? model.contextWindow,
            maxOutputTokens: model.maxOutputTokens ?? model.maxTokens, supportsImageInput: model.input?.includes('image') || model.supportsImageInput === true })) })) };
      }
      case 'chat.send': return this.send(this.chat(p), p);
      case 'chat.stopGeneration': return this.stop(this.chat(p));
      case 'chat.create': {
        const characterId = text(p.characterId) || (p.conversationId ? this.data.readConversationDetails(this.chat(p)).metadata.characterId : '');
        const details = await this.conversations.create({ title: text(p.title), ...(characterId ? { metadata: { characterId } } : {}) });
        return { conversationId: details.conversation.id, id: details.conversation.id };
      }
      case 'chat.open': { const id = text(p.sessionId) || text(p.id) || text(p.chatId) || this.chat(p); this.data.readConversationDetails(id); return this.ui('chats.open', { id }, this.chat(p)); }
      case 'chat.delete': { const id = text(p.sessionId) || text(p.id) || this.chat(p); await this.compatibility({ method: 'chats.deleteStored', params: { id } }); return { deleted: true, conversationId: id }; }
      case 'models.select': case 'chat.selectModel': {
        const configId = method === 'models.select' ? requireText(p, 'id') : text(p.configId) || requireText(p, 'provider');
        const config = method === 'models.select' ? (await this.compatibility({ method: 'models.list', params: {} })).find(item => item.id === configId) : undefined;
        if (method === 'models.select' && !config) throw new Error(`Model configuration does not exist: ${configId}`);
        const model = text(p.model) || config?.model;
        if (!model) throw new Error('Model selection requires a model');
        await this.models.select(this.chat(p), { provider: configId, model, ...(p.reasoningEffort ? { reasoningEffort: p.reasoningEffort } : {}) });
        return method === 'models.select' ? { ...config, model } : { configId, model };
      }
      case 'character.current': {
        const details = this.data.readConversationDetails(this.chat(p)), id = this.data.compatibilityStore().get('group-rounds', p.conversationId)?.characterId || details.metadata.characterId;
        return this.data.readCharacters().items.find(character => character.id === id) || null;
      }
      case 'settingLibrary.current': return clone(this.data.readAuthorConversationState(this.chat(p)).settingLibrary);
      case 'settingLibrary.getSummary': return clone(this.data.readAuthorConversationState(this.chat(p)).settingLibrarySummary);
      case 'media.getMessageAttachments': {
        const message = await this.message(p), attachments = [...(message.attachments || []), ...(message.images || []), ...(message.imageAttachments || []), ...(message.inputImageAttachments || []), ...(message.inputFileAttachments || [])];
        const unique = [...new Map(attachments.map(item => [item.id || item.attachmentId || item.url, item])).values()];
        return { items: await Promise.all(unique.map(item => this.mediaResource(item))) };
      }
      case 'media.getMessageAttachment': { const all = await this.invoke({ method: 'media.getMessageAttachments', params: p }), id = text(p.attachmentId) || requireText(p, 'id'); const item = all.items.find(item => item.id === id || item.attachmentId === id); if (!item) throw new Error(`Message attachment does not exist: ${id}`); return item; }
      case 'events.list': return this.events();
      default: throw new Error(`Original Author method is not connected: ${method}`);
    }
  }
}

/** Main-chat state uses the genuine streaming projection and never a previous saved reply. */
export function authorGenerationState(conversationId, sessionId, running, presentation) {
  const current = presentation?.conversationId === conversationId ? presentation : null, stream = current?.generation;
  const message = current?.messages?.findLast(item => item.role === 'assistant' && item.status === 'streaming');
  return { active: running, conversationId, stats: null, ...(running ? { runId: stream?.runId || sessionId,
    messageId: stream?.messageId || message?.id || '', accumulated: stream?.content ?? message?.content ?? '', sequence: stream?.sequence ?? 0 } : {}) };
}

/** Matches the original native variable patch dialect; saves once only after every operation succeeds. */
export function applyNativeVariablePatch(current, patch) {
  if (!Array.isArray(patch)) throw new TypeError('Variable patch must be an array');
  const state = clone(requireObject(current, 'Variable state'));
  for (const item of patch) {
    requireObject(item, 'Patch operation');
    if (typeof item.path !== 'string' || !item.path.startsWith('/') || item.path === '/') throw new TypeError('Variable patch requires a nonempty JSON pointer');
    const parts = item.path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    let parent = state;
    for (const part of parts.slice(0, -1)) { if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, part)) throw new Error(`Variable patch parent does not exist: ${item.path}`); parent = parent[part]; }
    const key = parts.at(-1), array = Array.isArray(parent);
    if (!parent || typeof parent !== 'object') throw new Error(`Variable patch parent is not an object/array: ${item.path}`);
    const index = array ? key === '-' ? parent.length : /^(0|[1-9]\d*)$/.test(key) ? Number(key) : NaN : key;
    const exists = Object.hasOwn(parent, index);
    if (array && (!Number.isSafeInteger(index) || index < 0 || index > parent.length)) throw new Error(`Variable patch array index is invalid: ${item.path}`);
    if (['replace', 'delta', 'insert'].includes(item.op) && !Object.hasOwn(item, 'value')) throw new TypeError(`Variable patch value is missing: ${item.path}`);
    switch (item.op) {
      case 'replace': if (!exists) throw new Error(`Variable patch target is missing: ${item.path}`); parent[index] = clone(item.value); break;
      case 'delta': if (!exists || typeof parent[index] !== 'number' || typeof item.value !== 'number') throw new TypeError(`Variable delta requires numbers: ${item.path}`); if (!Number.isFinite(parent[index] + item.value)) throw new RangeError('Variable delta overflow'); parent[index] += item.value; break;
      case 'insert': if (array) parent.splice(index, 0, clone(item.value)); else { if (exists) throw new Error(`Variable insert target already exists: ${item.path}`); Object.defineProperty(parent, index, { value: clone(item.value), enumerable: true, writable: true, configurable: true }); } break;
      case 'remove': if (!exists) throw new Error(`Variable remove target is missing: ${item.path}`); if (array) parent.splice(index, 1); else delete parent[index]; break;
      default: throw new Error(`Unsupported native variable patch operation: ${item.op}`);
    }
  }
  return state;
}
