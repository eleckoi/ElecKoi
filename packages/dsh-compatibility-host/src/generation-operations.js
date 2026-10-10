import { randomUUID } from 'node:crypto';
import { BlockAssembler, createAssistantMessage, createSystemMessage, createToolResultMessage, attributionHeaders } from '@deepseek-ai/dsh-llm';
import { NetworkOperations, remoteTokenizerRequest, remoteTokenizerResult } from './network-operations.js';
import { composeGenerationPrompts } from './generation-prompts.js';
import { protocolFor } from './generation-protocol.js';

export const GENERATION_METHODS = ['generation.invoke', 'generation.preview', 'generation.cancel', 'generation.request', 'generation.start', 'generation.get',
  'network.request', 'network.cancel', 'tokens.model', 'tokens.info', 'tokens.encode', 'tokens.count', 'tokens.decode', 'tokens.remote',
  'prompts.set', 'prompts.remove', 'prompts.list', 'macros.register', 'macros.unregister'];
const clone = value => JSON.parse(JSON.stringify(value));
const contentText = value => typeof value === 'string' ? value : Array.isArray(value) ? value.filter(part => ['text', 'input_text'].includes(part.type)).map(part => part.text).join('\n') : '';
const advancedKeys = new Set(['frequency_penalty', 'presence_penalty', 'top_k', 'min_p', 'top_a', 'typical_p', 'tfs', 'tfs_z',
  'repetition_penalty', 'repetition_penalty_range', 'repetition_penalty_slope', 'rep_pen', 'rep_pen_range', 'rep_pen_slope', 'seed',
  'logit_bias', 'logprobs', 'top_logprobs', 'n', 'best_of', 'use_beam_search', 'length_penalty', 'early_stopping',
  'do_sample', 'mirostat_mode', 'mirostat_tau', 'mirostat_eta', 'dynatemp_low', 'dynatemp_high', 'dynatemp_exponent',
  'smoothing_factor', 'smoothing_curve', 'dry_multiplier', 'dry_base', 'dry_allowed_length', 'dry_sequence_breakers',
  'xtc_threshold', 'xtc_probability', 'epsilon_cutoff', 'eta_cutoff', 'sampler_order', 'samplers', 'banned_tokens',
  'response_format', 'tool_choice', 'parallel_tool_calls', 'grammar', 'json_schema']);
export function requiresAdvancedSettings(settings) { return Object.entries(settings || {}).some(([key, value]) => advancedKeys.has(key) && value !== undefined && value !== null); }
export function advancedSettings(settings) { return Object.fromEntries(Object.entries(settings || {}).filter(([key, value]) => advancedKeys.has(key) && value !== undefined && value !== null)); }

/** Auxiliary calls use the original LlmRuntime; no chat turn or second Agent is created. */
export class CompatibilityGeneration {
  constructor({ data, compatibility, readModel, readConnection, llm, callbacks, hasWebCallbacks, publish, worldbooks, projectBlock = /** @type {any} */ (undefined), isOwnerActive = _id => true }) {
    Object.assign(this, { data, compatibility, readModel, readConnection, llm, callbacks, hasWebCallbacks, publish, worldbooks, projectBlock, isOwnerActive });
    this.network = new NetworkOperations(publish); this.running = new Map(); this.tasks = new Map();
  }
  async invoke({ method, params }) {
    if (method.startsWith('tokens.')) return this.tokenizer(method, params);
    switch (method) {
      case 'network.request': return this.network.request(params);
      case 'network.cancel': return this.network.cancel(params.id);
      case 'generation.cancel': return this.cancel(params.id);
      case 'generation.request': {
        if (typeof params.endpoint !== 'string' || !params.endpoint) throw new TypeError('Low-level generation.request requires an explicit endpoint');
        const connection = await this.connection(params);
        return this.network.request({ ...params, headers: { ...this.authHeaders(connection, params.authMode), ...(params.headers || {}) },
          endpoint: params.endpoint }, true);
      }
      case 'generation.preview': {
        const plan = await this.prepare({ ...params, dryRun: true });
        return { ...plan, nativeRequest: await this.prepareNativeRequest(plan) };
      }
      case 'generation.invoke': return this.generate(params);
      case 'generation.start': return this.start(params);
      case 'generation.get': {
        const task = this.tasks.get(params.id);
        if (!task) throw new Error(`Generation task does not exist: ${params.id}`);
        return clone(task.state);
      }
      case 'prompts.remove': {
        const owner = params.pluginId || 'frontend';
        this.data.compatibilityStore().delete('prompt-injections', owner);
        this.publish({ event: 'prompts.changed', payload: { pluginId: owner, conversationId: params.conversationId || '' } }); return null;
      }
      case 'prompts.set': {
        if (!Array.isArray(params.entries)) throw new TypeError('Prompt injections must be an array');
        const owner = params.pluginId || 'frontend';
        for (const entry of params.entries) if (!entry.id || !['system', 'user', 'assistant'].includes(entry.role || 'system') || typeof entry.content !== 'string') throw new TypeError('Invalid Prompt injection');
        this.data.compatibilityStore().put('prompt-injections', owner, clone(params.entries));
        this.publish({ event: 'prompts.changed', payload: { pluginId: owner, conversationId: params.conversationId || '' } }); return null;
      }
      case 'prompts.list': return this.injections(params.conversationId);
      case 'macros.register': {
        if (typeof params.name !== 'string' || !params.name || typeof params.value !== 'string') throw new TypeError('Macro descriptor requires name and string value');
        this.data.compatibilityStore().put(`macros:${params.pluginId || 'frontend'}`, params.name, params.value); return null;
      }
      case 'macros.unregister': return this.data.compatibilityStore().delete(`macros:${params.pluginId || 'frontend'}`, params.name) > 0;
      default: throw new Error(`Generation Host method is not connected: ${method}`);
    }
  }
  callback(method, payload, options) { return this.callbacks.callback(method, payload, options); }
  requiresAdvancedSettings(settings) { return requiresAdvancedSettings(settings); }
  injections(conversationId) {
    return Object.entries(this.data.compatibilityStore().list('prompt-injections')).filter(([owner]) => this.isOwnerActive(owner))
      .flatMap(([, entries]) => entries).filter(entry => !entry.conversationId || entry.conversationId === conversationId);
  }
  async tokenizer(method, params) {
    if (method === 'tokens.remote') return remoteTokenizerResult(await this.network.request(remoteTokenizerRequest(await this.connection(params), params)));
    const selection = params.modelSnapshot || (params.conversationId ? await this.readModel(params.conversationId) : {});
    return this.callback(method, { ...params, model: params.model || selection.model,
      ...(method === 'tokens.decode' && params.ids === undefined ? { ids: params.tokens } : {}) }, { conversationId: params.conversationId });
  }
  start(params) {
    const id = params.id || randomUUID();
    if (this.tasks.has(id) || this.running.has(id)) throw new Error(`Generation id already exists: ${id}`);
    const task = { state: { id, status: 'running' } };
    this.tasks.set(id, task);
    task.promise = this.generate({ ...params, id }).then(result => {
      task.state = { id, status: 'completed', result };
      this.publish({ event: 'generation.completed', payload: { ...task.state, conversationId: params.conversationId || '' } });
    }, error => {
      task.state = { id, status: task.cancelled ? 'cancelled' : 'failed', error: error.message || String(error) };
      if (task.cancelled) this.publish({ event: 'generation.cancelled', payload: { ...task.state, conversationId: params.conversationId || '' } });
    });
    return { id, status: 'running' };
  }
  tokenCount(text, { conversationId, modelSnapshot } = {}) { return this.tokenizer('tokens.count', { text, conversationId, modelSnapshot }); }
  tokens(text, { conversationId, modelSnapshot, encoding } = {}) { return this.tokenizer('tokens.encode', { text, conversationId, modelSnapshot, encoding }); }
  decode(ids, { conversationId, modelSnapshot, encoding } = {}) { return this.tokenizer('tokens.decode', { ids, conversationId, modelSnapshot, encoding }); }
  async connection(params) {
    const selected = await this.readModel(params.conversationId || '');
    const configId = params.configId || selected.provider;
    const custom = params.custom_api || {};
    const model = custom.model || params.model || (params.configId ? undefined : selected.model);
    const saved = await this.readConnection(configId, model, { credentials: true });
    if (!saved.model && !model) throw new Error(`Model configuration has no default model: ${configId}`);
    return { ...saved, model: model || saved.model,
      ...(custom.apiurl !== undefined ? { baseURL: custom.apiurl } : {}),
      ...(custom.key !== undefined ? { apiKey: custom.key } : {}),
      ...(custom.source ? { api: custom.source } : {}),
      headers: { ...(saved.headers || {}), ...(custom.source === 'custom' ? custom.custom_include_headers || {} : {}) } };
  }
  authHeaders(connection, mode) {
    const format = mode || protocolFor(connection.api || '');
    return { ...attributionHeaders(), ...(connection.headers || {}), ...(connection.apiKey ? format === 'AnthropicMessages' || format === 'claude'
      ? { 'x-api-key': connection.apiKey, 'anthropic-version': '2023-06-01' } : format === 'GoogleGemini' || format === 'makersuite'
        ? { 'x-goog-api-key': connection.apiKey } : format === 'horde' ? { apikey: connection.apiKey } : { Authorization: 'Bearer ' + connection.apiKey } : {}) };
  }
  cancel(id) { const controller = this.running.get(id); if (controller) { const task = this.tasks.get(id); if (task) task.cancelled = true; controller.abort(new Error(`Generation cancelled: ${id}`)); } return this.network.cancel(id) || !!controller; }
  async prepare(params, signal) {
    if (!params.conversationId) throw new TypeError('Generation requires a captured conversationId');
    const conversationId = params.conversationId;
    this.data.readConversationDetails(conversationId);
    const selection = await this.readModel(conversationId);
    // A requested connection owns its default model. The current chat's model
    // belongs to its own provider and must not leak into another connection.
    const model = params.custom_api?.model || params.model || (params.configId
      ? (await this.connection(params)).model : selection.model);
    const request = { ...params, id: params.id || randomUUID(), model, configId: params.configId || selection.provider };
    if (this.hasWebCallbacks()) await this.callback('__ElecKoiBeforeGeneration', { ...request, purpose: request.purpose || 'plugin' }, { conversationId, signal });
    const call = (method, extra = {}) => this.compatibility({ method, params: { conversationId, pluginId: params.pluginId || 'frontend', ...extra } });
    let messages, preset = {}, round = null;
    if (params.tavernRequest) {
      const details = this.data.readConversationDetails(conversationId), characterId = details.metadata.characterId;
      const [state, presets, card, persona, sourceHistory] = await Promise.all([
        call('tavernPresets.state'), params.preset_name && params.preset_name !== 'in_use' ? call('tavernPresets.list') : [],
        characterId ? call('characters.raw', { characterId }) : {}, call('personas.get'), call('messages.read')
      ]);
      preset = params.preset_name && params.preset_name !== 'in_use' ? presets.find(value => value.name === params.preset_name || value.id === params.preset_name)?.preset : state.preset;
      if (!preset) throw new Error(`Preset does not exist: ${params.preset_name}`);
      const history = sourceHistory.filter(message => message.metadata?.is_hidden !== true).map(message => ({ role: message.role, content: message.content }));
      if (!params.skipWIAN && this.worldbooks()?.hasManagedBindings(conversationId)) {
        const info = await this.llm.resolveModelInfo(request.configId, model);
        round = await call('worldbooks.scan', { messages: history.map(message => contentText(message.content)), scanText: request.prompt || '',
          contextWindow: info.context?.contextWindow, modelSnapshot: { ...selection, model }, dryRun: request.dryRun === true });
      }
      messages = composeGenerationPrompts(request, preset, card, persona, history, round?.fragments || [], this.injections(conversationId));
    } else {
      // Explicit auxiliary messages still participate in plugin prompt injection.
      // Use the same depth/anchor projection without loading a Tavern preset or history.
      const source = request.messages || [{ role: 'user', content: request.userContent ?? request.prompt ?? '' }];
      messages = composeGenerationPrompts({ ...request, raw: true, messages: source }, {}, {}, {}, [], [], this.injections(conversationId));
    }
    const texts = [], indexes = [];
    for (const [index, message] of messages.entries()) {
      if (typeof message.content === 'string') { texts.push(message.content); indexes.push([index]); }
      else if (Array.isArray(message.content)) for (const [partIndex, part] of message.content.entries()) if (typeof part.text === 'string') { texts.push(part.text); indexes.push([index, partIndex]); }
    }
    messages = clone(messages);
    if (texts.some(text => text.includes('{{')) || this.hasWebCallbacks() && request.tavernRequest) {
      const expanded = await this.callback('__ElecKoiResolveMacros', { conversationId, texts, readOnly: request.dryRun === true }, { conversationId, signal });
      if (!Array.isArray(expanded) || expanded.length !== texts.length || expanded.some(value => typeof value !== 'string')) throw new TypeError('Macro callback returned an invalid prompt batch');
      indexes.forEach(([index, part], row) => { if (part === undefined) messages[index].content = expanded[row]; else messages[index].content[part].text = expanded[row]; });
    }
    if (signal?.aborted) throw signal.reason;
    // Persisted ST presets keep model settings in `settings`; accept legacy
    // flat presets while giving the canonical settings object precedence.
    const presetSettings = Object.fromEntries(Object.entries({ ...preset, ...preset.settings }).filter(([key]) => ['temperature', 'top_p', 'max_tokens', 'max_completion_tokens'].includes(key) || advancedKeys.has(key)));
    return { ...request, messages, presetSettings, worldbookScan: round?.scan || null };
  }
  async generate(params) {
    const id = params.id || randomUUID();
    if (this.running.has(id)) throw new Error(`Generation id is already running: ${id}`);
    const controller = new AbortController(); this.running.set(id, controller);
    this.publish({ event: 'generation.started', payload: { id, conversationId: params.conversationId || '' } });
    try {
      const plan = await this.prepare({ ...params, id }, controller.signal);
      const result = await this.generateNative(plan, controller.signal);
      this.publish({ event: 'generation.requestFinished', payload: { ...result, id, conversationId: params.conversationId || '' } });
      return result;
    } catch (error) {
      this.publish({ event: 'generation.failed', payload: { id, conversationId: params.conversationId || '', message: error.message || String(error) } });
      throw error;
    } finally { this.running.delete(id); }
  }
  async prepareNativeRequest(plan, signal) {
    const selection = await this.readModel(plan.conversationId), provider = plan.configId || selection.provider;
    const unsupported = Object.keys(advancedSettings(plan.presetSettings));
    for (const key of ['json_schema', 'tool_choice', 'topP']) if (plan[key] !== undefined) unsupported.push(key);
    if (plan.responseFormat === 'json') unsupported.push('responseFormat');
    if (Object.keys(plan.parameters || {}).length) unsupported.push('parameters');
    if (Object.keys(plan.custom_api || {}).length) unsupported.push('custom_api');
    if (plan.presetSettings?.top_p !== undefined) unsupported.push('top_p');
    if (unsupported.length) throw Object.assign(new Error(`The locked DSH request contract does not support: ${unsupported.join(', ')}`),
      { code: 'GENERATION_OPTION_NOT_SUPPORTED', fields: unsupported });
    const body = { model: plan.model, messages: plan.messages, ...plan.presetSettings,
      ...(plan.temperature === undefined ? {} : { temperature: plan.temperature }), ...(plan.topP === undefined ? {} : { top_p: plan.topP }),
      ...(plan.maxTokens === undefined ? {} : { max_tokens: plan.maxTokens }), ...(plan.tools?.length ? { tools: plan.tools } : {}), ...(plan.stop ? { stop: plan.stop } : {}) };
    const messages = body.messages.map(message => {
      const content = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;
      if (!Array.isArray(content) || content.some(block => !['text', 'reasoning'].includes(block.type)
        && !(['image', 'file'].includes(block.type) && block.attachment))) {
        throw Object.assign(new Error('SDK image/file content requires an admitted DSH attachment reference'), { code: 'ATTACHMENT_ADMISSION_REQUIRED' });
      }
      if (message.role === 'user') return { role: 'user', content };
      if (message.role === 'system') return createSystemMessage(contentText(message.content));
      if (message.role === 'assistant') return createAssistantMessage({ content: [...content, ...(message.tool_calls ?? []).map(call => ({
        type: 'tool-call', id: call.id, name: call.function.name, arguments: call.function.arguments
      }))], source: { provider, model: body.model } });
      if (message.role === 'tool') return createToolResultMessage({ callId: message.tool_call_id, content, isError: message.isError === true });
      throw new Error(`Unsupported native request role: ${message.role}`);
    });
    return { provider, model: body.model, messages, signal,
      ...(body.temperature === undefined ? {} : { temperature: body.temperature }), ...(body.top_p === undefined ? {} : { topP: body.top_p }),
      ...(body.max_tokens === undefined && body.max_completion_tokens === undefined ? {} : { maxTokens: body.max_completion_tokens ?? body.max_tokens }),
      ...(body.stop === undefined ? {} : { stop: body.stop }),
      ...(body.tools ? { tools: body.tools.map(tool => tool.function ? { name: tool.function.name, description: tool.function.description || '', parameters: tool.function.parameters || {} } : tool) } : {}),
      ...(provider !== selection.provider || body.model !== selection.model || selection.reasoningEffort === undefined
        ? {} : { reasoningEffort: selection.reasoningEffort }) };
  }
  async generateNative(plan, signal) {
    const options = await this.prepareNativeRequest(plan, signal), assembler = new BlockAssembler();
    for await (const chunk of this.llm.stream(options)) {
      assembler.push(chunk);
      if (plan.stream && ['text-delta', 'reasoning-delta'].includes(chunk.type)) this.publish({ event: 'generation.delta', payload: { id: plan.id,
        delta: chunk.type === 'text-delta' ? chunk.text : '', reasoning: chunk.type === 'reasoning-delta' ? chunk.text : '' } });
    }
    if (assembler.finish.kind === 'error' || assembler.finish.kind === 'aborted') throw Object.assign(new Error(assembler.finish.failure.message), assembler.finish.failure);
    const blocks = assembler.blocks(), replay = assembler.replayState, signatures = [];
    const toolCalls = blocks.filter(block => block.type === 'tool-call').map(block => ({ id: block.id, type: 'function', function: { name: block.name, arguments: block.arguments } }));
    let toolIndex = 0, reasoningSignature = '';
    for (const [index, block] of blocks.entries()) {
      const metadata = replay?.blocks?.[index];
      if (metadata?.textSignature) signatures.push(metadata.textSignature);
      if (metadata?.thinkingSignature) { signatures.push(metadata.thinkingSignature); reasoningSignature += metadata.thinkingSignature; }
      if (block.type === 'tool-call') { if (metadata?.thoughtSignature) toolCalls[toolIndex].thought_signature = metadata.thoughtSignature; toolIndex++; }
    }
    return { id: plan.id, model: options.model, content: blocks.filter(block => block.type === 'text').map(block => block.text).join(''),
      reasoning: blocks.filter(block => block.type === 'reasoning').map(block => block.text).join(''),
      tool_calls: toolCalls, signatures, ...(reasoningSignature ? { reasoning_signature: reasoningSignature } : {}),
      ...(replay ? { replayState: replay } : {}), ...(assembler.usage ? { usage: assembler.usage } : {}) };
  }
  close() { for (const id of this.running.keys()) this.cancel(id); this.network.close(); }
}
