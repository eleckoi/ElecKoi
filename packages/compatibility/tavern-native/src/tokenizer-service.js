import { Tiktoken } from 'js-tiktoken/lite';
import cl100k from 'js-tiktoken/ranks/cl100k_base';
import o200k from 'js-tiktoken/ranks/o200k_base';
import r50k from 'js-tiktoken/ranks/r50k_base';
import p50k from 'js-tiktoken/ranks/p50k_base';
import p50kEdit from 'js-tiktoken/ranks/p50k_edit';
import { Tokenizer } from './tokenizer-engine.js';
import manifest from './tokenizer-models/manifest.json' with { type: 'json' };

const ranks = { cl100k_base: cl100k, o200k_base: o200k, r50k_base: r50k, p50k_base: p50k, p50k_edit: p50kEdit };
const enums = { 0: 'estimate', 1: 'r50k_base', 3: 'llama', 4: 'nerdstash', 5: 'nerdstash_v2', 7: 'mistral', 8: 'yi',
  9: 'remote-textgenerationwebui', 10: 'remote-kobold', 11: 'claude', 12: 'llama3', 13: 'gemma', 14: 'jamba', 15: 'qwen2', 16: 'command-r', 17: 'nemo', 18: 'deepseek', 19: 'command-a' };
const aliases = { gpt2: 'r50k_base', llama2: 'llama', 'llama-2': 'llama', 'llama-3': 'llama3', nerd: 'nerdstash', nerd2: 'nerdstash_v2', command_r: 'command-r', command_a: 'command-a' };

export const TOKENIZER_NAMES = Object.freeze([...Object.keys(ranks), ...Object.keys(manifest), 'remote-textgenerationwebui', 'remote-kobold']);
export const TOKENIZER_MODELS = Object.freeze(manifest);

/** Resolve declared ST vocabulary selections; known families never fall through to OpenAI BPE. */
export function resolveTokenizerEncoding(model = '', requested) {
  if (typeof requested === 'number' && ![2, 6, 99].includes(requested)) {
    const name = enums[requested];
    if (!name) throw new Error(`Unknown ST tokenizer enum: ${requested}`);
    return name;
  }
  if (typeof requested === 'string' && requested.trim()) {
    const name = requested.toLowerCase().trim();
    if (name in aliases) return aliases[name];
    if (Object.keys(enums).some(id => enums[id] === name) || name in ranks || name in manifest) return name;
    const enumKey = { openai: 2, api_current: 6, best_match: 99 }[name];
    if (enumKey === undefined) throw new Error(`Unknown tokenizer encoding: ${requested}`);
  }
  const name = String(model).toLowerCase().trim();
  if (name in aliases) return aliases[name];
  if (name in ranks || name in manifest || Object.values(enums).includes(name)) return name;
  for (const [pattern, encoding] of [[/llama[-_ ]?3|\bl3\b/, 'llama3'], [/llama/, 'llama'], [/deepseek/, 'deepseek'],
    [/qwen|qwq/, 'qwen2'], [/nemo|pixtral/, 'nemo'], [/mistral|mixtral/, 'mistral'], [/gemma|gemini/, 'gemma'],
    [/command[-_ ]?a/, 'command-a'], [/command[-_ ]?r/, 'command-r'], [/claude/, 'claude'], [/jamba/, 'jamba'], [/\byi[-_/]/, 'yi']]) {
    if (pattern.test(name)) return encoding;
  }
  // This is ST's generic OpenAI vocabulary selection, explicitly exposed through .encoding.
  return /^(?:gpt-4o|chatgpt-4o|gpt-4\.1|gpt-[5-9]|o[134])(?:-|$)/.test(name) ? 'o200k_base' : 'cl100k_base';
}

// The WASM package initializes a shared module lazily; simultaneous first constructors race.
let vocabularyInitialization = Promise.resolve();
function initializeVocabulary(kind, bytes) {
  const operation = vocabularyInitialization.then(() => kind === 'sentencepiece'
    ? Tokenizer.fromSentencePiece(bytes) : Tokenizer.fromJSON(bytes));
  vocabularyInitialization = operation.then(() => undefined, () => undefined);
  return operation;
}

/** Remote ST tokenizer adapters are asynchronous because the provider owns the vocabulary. */
export async function remoteTokenizerRequest(kind, params, transport = fetch) {
  const text = String(params.text ?? '')
  const base = String(params.url ?? '').replace(/\/$/, '').replace(/\/v1$/, '')
  if (!/^https?:\/\//i.test(base)) throw new TypeError('远端 tokenizer 需要明确的 HTTP(S) URL。')
  let url, body
  if (kind === 'remote-kobold') {
    if (params.operation !== 'count' && params.operation !== 'encode') throw new Error('Kobold tokenizer 只提供 count/encode；后端没有 decode 接口。')
    url = `${base}/extra/tokencount`; body = { prompt: text }
  } else {
    const apiType = String(params.apiType ?? params.api_type ?? '')
    if (params.operation === 'decode') throw new Error('text-generation-webui tokenizer 后端没有公共 decode 接口。')
    if (apiType === 'tabby') { url = `${base}/v1/token/encode`; body = { text, add_bos_token: false, encode_special_tokens: false } }
    else if (apiType === 'koboldcpp') { url = `${base}/api/extra/tokencount`; body = { prompt: text, special: false } }
    else if (apiType === 'llamacpp') { url = `${base}/tokenize`; body = { model: String(params.model ?? ''), content: text } }
    else if (apiType === 'vllm') { url = `${base}/tokenize`; body = { model: String(params.model ?? ''), prompt: text } }
    else if (apiType === 'aphrodite') { url = `${base}/v1/tokenize`; body = { model: String(params.model ?? ''), prompt: text } }
    else { url = `${base}/v1/internal/encode`; body = { text } }
  }
  const headers = { 'Content-Type': 'application/json', ...Object.fromEntries(Object.entries(params.headers ?? {}).map(([key, item]) => [key, String(item)])) }
  const response = await transport(url, { method: 'POST', headers, body: JSON.stringify(body), ...(params.signal ? { signal: params.signal } : {}) })
  if (!response.ok) throw new Error(`远端 tokenizer HTTP ${response.status} ${response.statusText}`)
  const data = await response.json(), ids = data?.tokens ?? data?.ids
  if (params.operation === 'count') {
    const count = data?.count ?? data?.value ?? data?.length ?? (Array.isArray(ids) ? ids.length : undefined)
    if (!Number.isFinite(Number(count))) throw new Error('远端 tokenizer 未返回 token 数量。')
    return Number(count)
  }
  if (!Array.isArray(ids) || ids.some(item => !Number.isSafeInteger(item) || item < 0)) throw new Error('远端 tokenizer 未返回有效 token id 数组。')
  return ids
}

/** One engine for Host and browser; the caller supplies local resource loading. */
export function createTokenizerRegistry(loadModel) {
  const codecs = new Map(), loading = new Map(), custom = new Map();
  let disposed = false;
  const resolve = (model, requested) => {
    const name = typeof requested === 'string' ? requested.toLowerCase().trim() : String(model || '').toLowerCase().trim();
    return custom.has(name) ? name : resolveTokenizerEncoding(model, requested);
  };
  const missing = name => new Error(`Tokenizer resource is not bundled: ${name}. No alternative vocabulary was substituted.`);
  const get = name => {
    if (name in ranks) {
      if (!codecs.has(name)) {
        const codec = new Tiktoken(ranks[name]);
        codecs.set(name, { encode: (text, allowed = [], disallowed = []) => codec.encode(text, allowed, disallowed), decode: ids => codec.decode(ids) });
      }
    }
    if (!codecs.has(name)) throw name in manifest || custom.has(name) ? new Error(`Tokenizer is not initialized: ${name}; await prepare().`) : missing(name);
    return codecs.get(name);
  };
  const prepare = async (model = '', requested) => {
    if (disposed) throw new Error('Tokenizer registry 已关闭。');
    const name = resolve(model, requested);
    if (name === 'estimate') return name;
    if (name in ranks) { get(name); return name; }
    if (!(name in manifest) && !custom.has(name)) throw missing(name);
    if (!codecs.has(name)) {
      if (!loading.has(name)) loading.set(name, (async () => {
        const descriptor = custom.get(name) ?? manifest[name];
        const bytes = descriptor.data ?? await loadModel(name, descriptor);
        const codec = await initializeVocabulary(descriptor.kind, bytes);
        if (disposed) { codec.dispose?.(); throw new Error('Tokenizer registry 已关闭。'); }
        codecs.set(name, { encode: text => [...codec.encode(text)], decode: ids => codec.decode(Int32Array.from(ids)), dispose: () => codec.dispose() });
      })());
      await loading.get(name);
    }
    return name;
  };
  const forModel = (model = '', requested) => {
    const encoding = resolve(model, requested);
    const selected = type => resolve(model, type ?? requested);
    return {
      encoding,
      count: text => encoding === 'estimate' ? Math.ceil(new TextEncoder().encode(String(text)).length / 3.35) : get(encoding).encode(String(text), [], []).length,
      encode: (text, type, allowed = [], disallowed = []) => get(selected(type)).encode(String(text), allowed, disallowed),
      decode: (ids, type) => get(selected(type)).decode(ids),
    };
  };
  return { get names() { return [...TOKENIZER_NAMES, ...custom.keys()]; }, prepare, forModel,
    registerVocabulary: async (name, descriptor) => {
      name = String(name).toLowerCase().trim();
      if (!name || name in ranks || name in manifest || custom.has(name)) throw new Error(`Tokenizer name is already registered or invalid: ${name}`);
      if (!['json','sentencepiece'].includes(descriptor.kind) || !(descriptor.data instanceof Uint8Array || descriptor.data instanceof ArrayBuffer)) throw new TypeError('Tokenizer vocabulary needs actual JSON/SentencePiece bytes and a kind.');
      custom.set(name, { ...descriptor });
      try { await prepare('',name); } catch(error) { custom.delete(name); loading.delete(name); throw error; }
      return name;
    },
    unregisterVocabulary: name => {
      if (!custom.has(name)) return false;
      codecs.get(name)?.dispose?.(); codecs.delete(name); loading.delete(name); custom.delete(name); return true;
    },
    prepareAll: () => Promise.all(Object.keys(manifest).map(name => prepare('', name))),
    dispose: () => { disposed = true; for (const codec of codecs.values()) codec.dispose?.(); codecs.clear(); loading.clear(); custom.clear(); } };
}
