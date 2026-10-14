import { specialTextRequest } from './special-text-backends.js';
import { createRequestServices } from '../vendor/sillytavern/public/scripts/eleckoi-request-services.js';
import { extractMessageFromData } from '../vendor/sillytavern/public/scripts/eleckoi-media.js';
import { extractReasoningFromData, extractJsonFromData, getStreamingReply } from '../vendor/sillytavern/public/scripts/eleckoi-service-responses.js';
import { chat_completion_sources } from './host.js';
import { CONNECT_API_MAP } from '../vendor/sillytavern/public/scripts/eleckoi-connect-map.js';
import { yaml } from './libraries.js';
import { getPromptNames, postProcessPrompt } from '../vendor/sillytavern/public/scripts/eleckoi-prompt-post-processing.js';
import instructTemplates from './instruct-templates.json';
import textSettingNames from './textgen-setting-names.json';

const hosts = { openai: 'https://api.openai.com/v1', claude: 'https://api.anthropic.com/v1', deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1', groq: 'https://api.groq.com/openai/v1', mistralai: 'https://api.mistral.ai/v1',
  makersuite: 'https://generativelanguage.googleapis.com/v1beta', xai: 'https://api.x.ai/v1', moonshot: 'https://api.moonshot.ai/v1' };
const hostFields = new Set(['chat_completion_source','custom_url','api_type','api_server','secret_id','configId','reverse_proxy','proxy_password',
  'stopping_strings','custom_prompt_post_processing','use_sysprompt','user_name','char_name','group_names','type','include_reasoning','custom_include_headers','custom_include_body','custom_exclude_body','api_key','request_id']);
function objectSetting(value) {
  if (!value) return {};
  const parsed = typeof value === 'string' ? yaml.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('Custom request additions require an object');
  return parsed;
}

export function installRequestServices(context, host) {
  context.CONNECT_API_MAP = CONNECT_API_MAP;
  const settings = () => context.extensionSettings;
  const presetManager = type => context.__eleckoiPresetManagers?.(type) || ({
    getCompletionPresetByName: name => {
      if (type === 'openai') return host.preset(name)?.settings;
      const value = settings().eleckoi_completion_presets?.[type]?.find(value => value.name === name);
      return value?.settings ?? value ?? (type === 'instruct' ? instructTemplates.find(value=>value.name===name) : undefined);
    },
  });
  Object.defineProperty(context,'__eleckoiPresetManager',{configurable:true,value:presetManager});
  const textSettingsSnapshot = () => ({ ...Object.fromEntries([...textSettingNames,'temperature','genamt'].map(key => [key,undefined])),
    ...(context.__eleckoiCompletionSettings?.('textgenerationwebui') || context.textCompletionSettings) });
  async function prepareRequest(kind, original, signal = null, fixed = {}) {
    await host.ready();
    const scope = fixed.scope || host.capture(), connection = { ...(fixed.connection || host.connection()) };
    await host.flush();
    if (signal?.aborted) throw signal.reason || new DOMException('Request aborted', 'AbortError');
    original = structuredClone(original);
    if (!fixed.dryRun) await context.eventSource.emit(context.eventTypes[kind === 'textgenerationwebui' ? 'TEXT_COMPLETION_SETTINGS_READY' : 'CHAT_COMPLETION_SETTINGS_READY'],original);
    if (signal?.aborted) throw signal.reason || new DOMException('Request aborted', 'AbortError');
    const source = original.chat_completion_source || connection.source || 'custom';
    const type = original.api_type || context.textCompletionSettings.type || 'ooba';
    const text = kind === 'textgenerationwebui';
    let body = Object.fromEntries(Object.entries(original).filter(([key, value]) => !hostFields.has(key) && value !== undefined));
    const base = (original.reverse_proxy || (text ? original.api_server : original.custom_url) || (source === connection.source || source === 'custom' ? connection.baseUrl : hosts[source]) || '').replace(/\/$/, '');
    if (!base) throw new Error(`No endpoint configured for ${text ? original.api_type : source}`);
    let endpoint = `${base}/${text ? 'completions' : 'chat/completions'}`;
    const headers = objectSetting(original.custom_include_headers);
    Object.assign(body, objectSetting(original.custom_include_body));
    if (!text && Array.isArray(body.messages)) {
      const processing=original.custom_prompt_post_processing ?? context.chatCompletionSettings.custom_prompt_post_processing;
      if (processing) body.messages=postProcessPrompt(structuredClone(body.messages),processing,
        getPromptNames({body:{user_name:context.name1,char_name:context.name2,...original}}));
    }
    if (original.stop === undefined && context.powerUserSettings.custom_stopping_strings) {
      const strings=JSON.parse(context.powerUserSettings.custom_stopping_strings);
      if (!Array.isArray(strings)) throw new TypeError('custom_stopping_strings must be an array');
      body.stop=strings.filter(value=>typeof value==='string' && value.length).map(value=>
        context.powerUserSettings.custom_stopping_strings_macro === false ? value : context.substituteParams(value));
    }
    for (const field of typeof original.custom_exclude_body === 'string' ? original.custom_exclude_body.split(/[,\n]/).map(value => value.trim()).filter(Boolean) : original.custom_exclude_body || []) delete body[field];
    let key = original.api_key ?? original.proxy_password;
    if (!body.model) body.model = connection.model;
    if (text) {
      const root = base.replace(/\/v1$/, '');
      endpoint = `${root}/v1/completions`;
      if (type === 'dreamgen') endpoint = `${root.replace(/\/api\/openai$/, '')}/api/openai/v1/completions`;
      if (type === 'mancer') endpoint = `${root.replace(/\/oai$/, '')}/oai/v1/completions`;
      if (type === 'openrouter') { endpoint = `${root}/v1/chat/completions`;
        body.messages = [{role:'user',content:body.images?.length ? [{type:'text',text:body.prompt},...body.images.map(url=>({type:'image_url',image_url:{url}}))] : body.prompt}]; delete body.prompt; delete body.images;
      }
      if (body.temperature === undefined && body.temp !== undefined) body.temperature = body.temp;
      delete body.temp;
      if (body.repetition_penalty === undefined && body.rep_pen !== undefined) body.repetition_penalty = body.rep_pen;
      if (body.repetition_penalty_range === undefined && body.rep_pen_range !== undefined) body.repetition_penalty_range = body.rep_pen_range;
      if (type !== 'kobold') { delete body.rep_pen; delete body.rep_pen_range; }
      delete body.max_new_tokens;
      if (type === 'ollama') { endpoint = `${base.replace(/\/v1$/, '')}/api/generate`;
        body.options = { ...body.options };
        for (const [source,target] of Object.entries({max_tokens:'num_predict',temperature:'temperature',top_p:'top_p',top_k:'top_k',min_p:'min_p',typical_p:'typical_p',repetition_penalty:'repeat_penalty',repetition_penalty_range:'repeat_last_n',seed:'seed',stop:'stop'})) {
          if (body[source] !== undefined) { body.options[target] = body[source]; delete body[source]; }
        }
        body.raw = true; // ST has already formatted the instruct prompt.
      }
      if (type === 'kobold') {
        endpoint = `${root}/api/${body.stream ? 'extra/generate/stream' : 'v1/generate'}`;
        body.max_length = body.max_tokens; delete body.max_tokens; delete body.model;
        if (body.rep_pen === undefined) body.rep_pen = body.repetition_penalty;
        if (body.rep_pen_range === undefined) body.rep_pen_range = body.repetition_penalty_range;
        delete body.repetition_penalty; delete body.repetition_penalty_range;
        if (body.stop !== undefined) { body.stop_sequence = body.stop; delete body.stop; }
      }
      if (type === 'llamacpp') { endpoint = `${base.replace(/\/v1$/, '')}/completion`; body.n_predict = body.max_tokens; delete body.max_tokens; }
      if (original.json_schema) {
        const descriptor = original.json_schema, schema = descriptor.schema ?? descriptor.value ?? descriptor;
        delete body.json_schema;
        if (type === 'ollama') body.format = schema;
        else if (type === 'llamacpp') body.json_schema = schema;
        else body.response_format = {type:'json_schema',json_schema:{...descriptor,schema}};
      }
      if (type === 'novel') {
        endpoint = `${base.replace(/\/(?:v1|ai)$/, '')}/ai/generate${body.stream ? '-stream' : ''}`;
        if (Array.isArray(body.stop)) body.stop_sequences = body.stop.map(value => typeof value === 'string'
          ? context.getTextTokens(body.model.includes('erato') ? context.tokenizers.LLAMA3 : body.model.includes('kayra') ? context.tokenizers.NERD2 : body.model.includes('clio') ? context.tokenizers.NERD : context.tokenizers.GPT2,value) : value);
        body = specialTextRequest(type,body);
      }
      if (type === 'horde') {
        endpoint = `${base.replace(/\/(?:v1|api\/v2)$/, '')}/api/v2/generate/text/async`;
        body = specialTextRequest(type,body);
        headers['Client-Agent'] ||= 'ElecKoi:compat-1.19.0:github.com/eleckoi/ElecKoi-app';
        if (key !== undefined) headers.apikey = key || '0000000000';
        headers.Authorization = '';
      }

    } else if (source === 'claude') {
      endpoint = `${base}/messages`; headers['anthropic-version'] = '2023-06-01';
      if (key !== undefined) { headers['x-api-key'] = key; headers.Authorization = ''; }
      const system = body.messages.filter(message => message.role === 'system');
      body.system = system.map(message => message.content).join('\n\n'); body.messages = body.messages.filter(message => message.role !== 'system');
      body.max_tokens ??= 4096;
      if (body.stop) { body.stop_sequences=body.stop; delete body.stop; }
    } else if (source === 'makersuite') {
      endpoint = `${base}/models/${encodeURIComponent(body.model)}:${body.stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
      if (key !== undefined) { headers['x-goog-api-key'] = key; headers.Authorization = ''; }
      body.systemInstruction = { parts: body.messages.filter(message => message.role === 'system').map(message => ({ text: message.content })) };
      body.contents = body.messages.filter(message => message.role !== 'system').map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
      body.generationConfig = { maxOutputTokens: body.max_tokens, temperature: body.temperature, topP: body.top_p, topK: body.top_k, stopSequences:body.stop };
      for (const key of ['messages','model','max_tokens','temperature','top_p','top_k','stream','stop']) delete body[key];
    }
    if (original.json_schema && !text && source !== 'claude' && source !== 'makersuite') { body.response_format = { type: 'json_schema', json_schema: original.json_schema }; delete body.json_schema; }
    if (host.beforeRequest && !fixed.dryRun) body = await host.beforeRequest(scope.conversationId,
      text ? 'TextCompletions' : source === 'claude' ? 'AnthropicMessages' : source === 'makersuite' ? 'GoogleGemini' : 'ChatCompletions', body);
    if (signal?.aborted) throw signal.reason || new DOMException('Request aborted', 'AbortError');
    const stream = type === 'horde' ? false : body.stream ?? !!original.stream;
    if (text && original.api_type === 'kobold') endpoint = `${base.replace(/\/(?:api\/v1|v1)$/, '')}/api/${stream ? 'extra/generate/stream' : 'v1/generate'}`;
    if (!text && source === 'makersuite') endpoint = `${base}/models/${encodeURIComponent(original.model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    return { ...scope, endpoint, body, stream, headers, authMode: text ? type === 'horde' ? 'horde' : 'custom' : source,
      streamFormat: text && type === 'ollama' ? 'ndjson' : 'sse',
      ...(text && type === 'horde' ? {lifecycle:'horde'} : {}),
      configId: original.configId || original.secret_id || connection.configId,
      custom_api: { apiurl: base, source: 'custom', ...(key === undefined ? {} : { key }) } };
  }
  Object.defineProperty(context, '__eleckoiPrepareRequest', {configurable:true,value:prepareRequest});
  async function sendRequest(kind, original, extractData = true, signal = null, fixed = {}) {
    const plan = await prepareRequest(kind, original, signal, fixed);
    const {body,stream} = plan, source = original.chat_completion_source || fixed.connection?.source || host.connection().source || 'custom';
    const text = kind === 'textgenerationwebui';
    const id = original.request_id || `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const packets = []; let wake, finished = false, failed, started = false, resolveHeaders, rejectHeaders, cancellation, fallback;
    const headerPromise = new Promise((resolve, reject) => { resolveHeaders = resolve; rejectHeaders = reject; });
    // Non-stream callers don't await headers, so failures still have a handled header promise.
    headerPromise.catch(() => {});
    const on = (event, fn) => host.on(event, value => { if (value.id === id) fn(value); });
    const stopHeader = on('generation.response', value => { started = true; resolveHeaders(value); });
    const stopPacket = on('generation.packet', value => { packets.push(value.data); wake?.(); });
    const cancel = () => cancellation ||= host.call('generation.cancel', { id });
    const abort = () => { failed = signal?.reason || new DOMException('Request aborted', 'AbortError'); rejectHeaders(failed); wake?.(); cancel().catch(host.report); };
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => { stopHeader(); stopPacket(); signal?.removeEventListener('abort', abort); host.cleanup.delete(close); host.running.delete(id); };
    const close = () => { failed = new Error('Request document closed'); rejectHeaders(failed); wake?.(); cancel().catch(host.report); };
    host.cleanup.add(close); host.running.add(id);
    const request = host.call('generation.request', { ...plan, id });
    const completion = request.then(result => {
      if (result.status < 200 || result.status >= 300) throw new Error(`Model HTTP ${result.status}: ${result.body}`);
      if (stream && result.body?.trim()) fallback = JSON.parse(result.body);
      finished = true; if (!started) resolveHeaders(result); wake?.(); return result;
    }).catch(error => { failed = error; finished = true; rejectHeaders(error); wake?.(); throw error; }).finally(cleanup);
    function extractReply(data, parseSchema = true) {
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      if (!extractData) return data;
      const normalized = source === 'makersuite' ? { ...data, text: data.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join(''), responseContent: data.candidates?.[0]?.content }
        : text && ['koboldcpp','kobold'].includes(original.api_type) && data.results?.[0]?.text !== undefined ? { ...data, content: data.results[0].text }
        : text && original.api_type === 'ollama' ? { ...data, content: data.response } : text && original.api_type === 'novel' ? { ...data, content:data.output } : text && original.api_type === 'horde' ? { ...data, content:data.text ?? data.choices?.[0]?.text } : data;
      const content = !text && original.json_schema && parseSchema ? JSON.parse(extractJsonFromData(normalized, { mainApi: kind, chatCompletionSource: source })) : extractMessageFromData(normalized, kind);
      const reasoning = extractReasoningFromData(normalized, { mainApi: kind, textGenType: original.api_type, chatCompletionSource: source, ignoreShowThoughts: true });
      return { content, reasoning };
    }
    if (!stream) {
      const result = await completion; if (failed) throw failed;
      return extractReply(JSON.parse(result.body));
    }
    completion.catch(() => {});
    await headerPromise;
    return async function* streamData() {
      let textValue = ''; const swipes = [], state = { reasoning: '', images: [], signature: '', toolSignatures: {} };
      try {
        while (true) {
          if (failed) throw failed;
          if (!packets.length) {
            if (finished) {
              if (fallback) {
                const reply = extractReply(fallback, false); fallback = null;
                textValue += typeof reply.content === 'string' ? reply.content : JSON.stringify(reply.content);
                state.reasoning += reply.reasoning || '';
                yield {text:textValue,swipes,state};
              }
              return;
            }
            await new Promise(resolve => { wake = resolve; }); wake = null; continue;
          }
          const raw = packets.shift(); if (raw === '[DONE]') return;
          const data = JSON.parse(raw); if (data.error || data.type === 'error') throw new Error(data.error?.message || JSON.stringify(data));
          let reply;
          if (text) { reply = data.choices?.[0]?.text ?? data.choices?.[0]?.delta?.content ?? data.content ?? data.response ?? (typeof data.token === 'string' ? data.token : data.token?.text) ?? data.output ?? ''; state.reasoning += data.choices?.[0]?.reasoning ?? data.choices?.[0]?.delta?.reasoning ?? data.choices?.[0]?.delta?.reasoning_content ?? data.thinking ?? ''; }
          else reply = getStreamingReply(data, state, { chatCompletionSource: source, overrideShowThoughts: true });
          if (data.choices?.[0]?.index > 0) { const index = data.choices[0].index - 1; swipes[index] = (swipes[index] || '') + reply; }
          else textValue += reply;
          yield { text: textValue, swipes, state };
          if (data.done === true) return;
        }
      } finally { if (!finished) await cancel(); cleanup(); }
    };
  }
  Object.defineProperty(context,'__eleckoiSendRequest',{configurable:true,value:sendRequest});
  return createRequestServices(context, {
    sendRequest, presetManager, textSettingNames: [...textSettingNames,'temperature'], textSettings: textSettingsSnapshot(), textSettingsSnapshot, textServer: type => settings().eleckoi_api_urls?.[type] || host.connection().baseUrl,
    proxies: settings().eleckoi_proxy_presets ||= [],
    modelIcon: (api, model) => { const icon = document.createElement('span'); icon.className = 'model-icon'; icon.dataset.api = api; icon.title = model || api; icon.textContent = api; return icon; },
    textPayload: (settings, model, prompt, max_tokens) => ({ ...settings, model, prompt, max_tokens,
      temperature: settings.temp ?? settings.temperature,
      repetition_penalty: settings.rep_pen ?? settings.repetition_penalty,
      repetition_penalty_range: settings.rep_pen_range ?? settings.repetition_penalty_range,
      typical_p: settings.typical_p ?? settings.typical,
    }),
    chatPayload: async (settings, model, _type, messages) => ({ generate_data: {
      messages, model, temperature: settings.temp_openai ?? settings.temperature, top_p: settings.top_p_openai ?? settings.top_p,
      top_k: settings.top_k_openai ?? settings.top_k, top_a: settings.top_a_openai ?? settings.top_a, min_p: settings.min_p_openai ?? settings.min_p,
      repetition_penalty: settings.repetition_penalty_openai ?? settings.repetition_penalty,
      frequency_penalty: settings.freq_pen_openai ?? settings.frequency_penalty, presence_penalty: settings.pres_pen_openai ?? settings.presence_penalty,
      max_tokens: settings.openai_max_tokens ?? settings.max_completion_tokens, chat_completion_source: settings.chat_completion_source,
      reasoning_effort: settings.reasoning_effort, n: settings.n ?? settings.reply_count, stop: settings.stop, seed: settings.seed,
      stream: settings.stream_openai ?? settings.should_stream ?? false, verbosity: settings.verbosity,
      logit_bias: settings.bias_presets?.[settings.bias_preset_selected],
      custom_include_headers: settings.custom_include_headers, custom_include_body: settings.custom_include_body, custom_exclude_body: settings.custom_exclude_body,
    } }),
  });
}
