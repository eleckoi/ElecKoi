import { randomUUID } from 'node:crypto';

/** Real HTTP requests and provider packets; no status or response body is manufactured. */
export class NetworkOperations {
  constructor(publish, fetchImpl = fetch) { this.publish = publish; this.fetch = fetchImpl; this.running = new Map(); }
  cancel(id) { const task = this.running.get(id); if (!task) return false; task.abort(new Error(`Request cancelled: ${id}`)); return true; }
  async request(params, generation = false, callbacks = {}) {
    const id = params.id || randomUUID();
    if (this.running.has(id)) throw new Error(`Request id is already running: ${id}`);
    const url = params.url || params.endpoint;
    if (!url) throw new TypeError('HTTP request requires url or endpoint');
    const controller = new AbortController(); this.running.set(id, controller);
    const headers = { ...(params.headers || {}) }, body = params.body;
    const method = params.method || (body === undefined ? 'GET' : 'POST');
    const encoded = body && typeof body === 'object' ? JSON.stringify(body) : body;
    if (body && typeof body === 'object' && !Object.keys(headers).some(name => name.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
    try {
      const response = await this.fetch(url, { method, headers, ...(encoded === undefined ? {} : { body: encoded }), signal: controller.signal });
      const metadata = { id, status: response.status, ok: response.ok, headers: Object.fromEntries(response.headers), url: response.url };
      const stream = params.stream === true || body?.stream === true;
      if (generation && stream && response.ok && !/application\/(?:[\w.+-]*\+)?json/i.test(response.headers.get('content-type') || '')) {
        this.publish({ event: 'generation.response', payload: metadata });
        await callbacks.response?.(metadata);
        await readPackets(response.body, params.streamFormat || 'sse', async data => {
          this.publish({ event: 'generation.packet', payload: { id, data } }); await callbacks.packet?.(data);
        }, controller.signal);
        this.publish({ event: 'generation.requestFinished', payload: metadata }); return metadata;
      }
      const output = { ...metadata, body: params.responseType === 'base64' ? Buffer.from(await response.arrayBuffer()).toString('base64') : await response.text() };
      if (generation) this.publish({ event: 'generation.requestFinished', payload: output });
      return output;
    } finally { this.running.delete(id); }
  }
  close() { for (const controller of this.running.values()) controller.abort(new Error('Network Host closed')); this.running.clear(); }
}
export async function readPackets(body, format, consume, signal) {
  if (!body) throw new Error('Streaming HTTP response has no body');
  const reader = body.getReader(), decoder = new TextDecoder(); let buffer = '', fields = [];
  const packet = async () => { if (fields.length) { await consume(fields.join('\n')); fields = []; } };
  const line = async text => {
    if (format === 'ndjson') { if (text.trim()) await consume(text); }
    else if (text === '') await packet();
    else if (text.startsWith('data:')) fields.push(text.slice(5).replace(/^ /, ''));
  };
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason;
      const result = await reader.read(); if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      let index; while ((index = buffer.indexOf('\n')) >= 0) { await line(buffer.slice(0, index).replace(/\r$/, '')); buffer = buffer.slice(index + 1); }
    }
    buffer += decoder.decode(); if (buffer) await line(buffer.replace(/\r$/, '')); await packet();
  } finally { reader.releaseLock(); }
}
export function remoteTokenizerRequest(config, options) {
  const base = String(options.baseUrl || config.baseURL || config.baseUrl || '').replace(/\/$/, '').replace(/\/v1$/, '');
  if (!base) throw new Error('Remote tokenizer requires an actual provider endpoint');
  const model = options.model || config.model, text = options.text || '';
  const mapping = {
    kobold: ['/extra/tokencount', { prompt: text }], koboldcpp: ['/api/extra/tokencount', { prompt: text, special: false }],
    tabby: ['/v1/token/encode', { text, add_bos_token: false, encode_special_tokens: false }],
    llamacpp: ['/tokenize', { model, content: text }], vllm: ['/tokenize', { model, prompt: text }],
    aphrodite: ['/v1/tokenize', { model, prompt: text }], ooba: ['/v1/internal/encode', { text }]
  };
  const target = mapping[options.type || 'ooba']; if (!target) throw new Error(`Unknown remote tokenizer source: ${options.type}`);
  return { url: base + target[0], method: 'POST', body: target[1], headers: { ...(config.headers || {}),
    ...(config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {}) } };
}
export function remoteTokenizerResult(response) {
  if (response.status < 200 || response.status >= 300) throw new Error(`Remote tokenizer HTTP ${response.status}: ${response.body}`);
  const value = JSON.parse(response.body); if (value.error) throw new Error(`Remote tokenizer failed: ${JSON.stringify(value.error)}`);
  const ids = value.tokens || value.ids || [];
  if (!Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id))) throw new Error('Remote tokenizer returned invalid token IDs');
  const count = [value.length, value.count, value.value].find(Number.isSafeInteger) ?? ('tokens' in value || 'ids' in value ? ids.length : undefined);
  if (count === undefined || count < 0) throw new Error('Remote tokenizer did not return a valid count or token IDs');
  return { count, ids };
}
