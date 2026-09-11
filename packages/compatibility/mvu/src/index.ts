export interface MessageDisplayCompatibility {
  prepareAssistantText(text: string, complete: boolean, displayRulePatterns: Iterable<string>): string
  resolveVariableMacros(text: string, variableStateJson: string): string
}

export const MVU_STATUS_PLACEHOLDER = '<StatusPlaceHolderImpl/>'
const SNAPSHOT_BRIDGE_MARKER = 'eleckoi-mvu-snapshot-bridge'
const ACTION_BRIDGE_MARKER = 'eleckoi-mvu-action-bridge'
const getMessageVariableMacro = /\{\{get_message_variable::(.*?)\}\}/gi
const formatMessageVariableMacro = /\{\{format_message_variable::(.*?)\}\}/i

type JsonObject = Record<string, unknown>

function record(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined
}

function parseState(source: string): JsonObject {
  try { return record(JSON.parse(source || '{}')) ?? {} } catch { return {} }
}

function valueAtMessagePath(state: JsonObject, rawPath: string): unknown {
  const root = record(state.stat_data) ?? state
  const path = rawPath.trim()
  const relative = path === 'stat_data' ? '' : path.startsWith('stat_data.') ? path.slice('stat_data.'.length) : path
  if (!relative) return root
  let current: unknown = root
  for (const segment of relative.split('.').filter(Boolean)) {
    if (Array.isArray(current)) current = current[Number(segment)]
    else current = record(current)?.[segment]
    if (current === undefined || current === null) return null
  }
  return current
}

function compactValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  const text = String(value)
  if (!text) return '""'
  const ambiguous = text !== text.trim() || text.includes('\n') || text.includes(': ') || text.startsWith('#')
    || /^(?:null|true|false)$/i.test(text) || (text.trim() !== '' && Number.isFinite(Number(text)))
  return ambiguous ? JSON.stringify(text) : text
}

function yamlKey(value: string): string {
  return /^[\p{L}\p{N}_-]+$/u.test(value) ? value : JSON.stringify(value)
}

function yamlValue(value: unknown, indent = 0): string {
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return value.map((item) => {
      if (Array.isArray(item) || record(item)) return `-\n${' '.repeat(indent + 2)}${yamlValue(item, indent + 2).replace(/\n/g, `\n${' '.repeat(indent + 2)}`)}`
      return `- ${yamlScalar(item)}`
    }).join('\n')
  }
  const object = record(value)
  if (!object) return yamlScalar(value)
  const entries = Object.entries(object).filter(([key]) => !key.startsWith('$'))
  if (!entries.length) return '{}'
  return entries.map(([key, item]) => {
    if (Array.isArray(item) || record(item)) {
      const child = yamlValue(item, indent + 2).replace(/\n/g, `\n${' '.repeat(indent + 2)}`)
      return `${yamlKey(key)}:\n${' '.repeat(indent + 2)}${child}`
    }
    return `${yamlKey(key)}: ${yamlScalar(item)}`
  }).join('\n')
}

export function resolveMvuMessageVariableMacros(text: string, variableStateJson: string): string {
  if (!text.toLocaleLowerCase().includes('_message_variable::')) return text
  const state = parseState(variableStateJson)
  let output = text.replace(getMessageVariableMacro, (_match, path: string) => compactValue(valueAtMessagePath(state, path)))
  while (true) {
    const match = formatMessageVariableMacro.exec(output)
    if (!match || match.index === undefined) break
    const lineStart = output.lastIndexOf('\n', match.index - 1) + 1
    const prefix = ' '.repeat(match.index - lineStart)
    const formatted = yamlValue(valueAtMessagePath(state, match[1] ?? '')).replace(/\n/g, `\n${prefix}`)
    output = output.slice(0, match.index) + formatted + output.slice(match.index + match[0].length)
  }
  return output
}

function insertIntoHead(html: string, source: string): string {
  const head = /<head(?:\s[^>]*)?>/i.exec(html)
  if (!head || head.index === undefined) return source + html
  const index = head.index + head[0].length
  return html.slice(0, index) + source + html.slice(index)
}

function safeScriptString(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function snapshotBridge(variableStateJson: string): string {
  return `<script id="${SNAPSHOT_BRIDGE_MARKER}">
((global) => {
  'use strict';
  if (global.__ElecKoiMvuSnapshotBridge) return;
  const nativeSnapshot = JSON.parse(${safeScriptString(variableStateJson || '{}')});
  const snapshot = nativeSnapshot && typeof nativeSnapshot === 'object' && nativeSnapshot.stat_data && typeof nativeSnapshot.stat_data === 'object'
    ? nativeSnapshot : { initialized_lorebooks: {}, stat_data: nativeSnapshot || {} };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const deepGet = (source, path, fallback) => {
    if (path === undefined || path === null || path === '') return source;
    const segments = Array.isArray(path) ? path : String(path).replace(/\\[(['"]?)(.*?)\\1\\]/g, '.$2').split('.').filter(Boolean);
    let current = source;
    for (const segment of segments) {
      if (current === null || current === undefined || !(segment in Object(current))) return fallback;
      current = current[segment];
    }
    return current === undefined ? fallback : current;
  };
  if (!global._) global._ = Object.freeze({
    get: deepGet,
    escape: (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  });
  const bindings = new WeakMap();
  class MiniQuery {
    constructor(nodes) { this.nodes = Array.from(nodes || []).filter(Boolean); this.length = this.nodes.length; this.nodes.forEach((node, index) => { this[index] = node; }); }
    each(action) { this.nodes.forEach((node, index) => action.call(node, index, node)); return this; }
    text(value) { if (value === undefined) return this.nodes[0]?.textContent ?? ''; return this.each((_, node) => { node.textContent = String(value); }); }
    html(value) { if (value === undefined) return this.nodes[0]?.innerHTML ?? ''; return this.each((_, node) => { node.innerHTML = String(value); }); }
    val(value) { if (value === undefined) return this.nodes[0]?.value; return this.each((_, node) => { node.value = value; }); }
    show() { return this.each((_, node) => { node.style.removeProperty('display'); }); }
    hide() { return this.each((_, node) => { node.style.display = 'none'; }); }
    css(name, value) { if (value === undefined && typeof name === 'string') return this.nodes[0] ? global.getComputedStyle(this.nodes[0])[name] : undefined; return this.each((_, node) => { if (typeof name === 'object') Object.assign(node.style, name); else node.style[name] = value; }); }
    addClass(names) { const values = String(names || '').split(/\\s+/).filter(Boolean); return this.each((_, node) => node.classList.add(...values)); }
    removeClass(names) { const values = String(names || '').split(/\\s+/).filter(Boolean); return this.each((_, node) => node.classList.remove(...values)); }
    toggleClass(name, force) { return this.each((_, node) => node.classList.toggle(name, force)); }
    attr(name, value) { if (value === undefined) return this.nodes[0]?.getAttribute(name); return this.each((_, node) => node.setAttribute(name, String(value))); }
    data(name, value) { return this.attr('data-' + String(name).replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()), value); }
    find(selector) { return new MiniQuery(this.nodes.flatMap((node) => Array.from(node.querySelectorAll(selector)))); }
    first() { return new MiniQuery(this.nodes.slice(0, 1)); }
    eq(index) { return new MiniQuery([this.nodes.at(index)]); }
    empty() { return this.each((_, node) => { node.replaceChildren(); }); }
    append(value) { return this.each((_, node) => { if (value?.nodeType) node.append(value.cloneNode(true)); else node.insertAdjacentHTML('beforeend', String(value)); }); }
    on(names, handler) { String(names || '').split(/\\s+/).filter(Boolean).forEach((name) => this.each((_, node) => { const type = name.split('.')[0]; const wrapped = (event) => handler.call(node, event); node.addEventListener(type, wrapped); const records = bindings.get(node) || []; records.push({ name, type, wrapped }); bindings.set(node, records); })); return this; }
    off(names) { const requested = String(names || '').split(/\\s+/).filter(Boolean); return this.each((_, node) => { const kept = []; for (const record of bindings.get(node) || []) { const remove = !requested.length || requested.some((name) => record.name === name || (!name.includes('.') && record.type === name) || (name.startsWith('.') && record.name.endsWith(name))); if (remove) node.removeEventListener(record.type, record.wrapped); else kept.push(record); } bindings.set(node, kept); }); }
  }
  const query = (input) => {
    if (typeof input === 'function') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', input, { once: true }); else queueMicrotask(input); return new MiniQuery([]); }
    if (typeof input === 'string') return new MiniQuery(document.querySelectorAll(input));
    if (input instanceof MiniQuery) return input;
    if (input && typeof input.length === 'number' && !input.nodeType && input !== global) return new MiniQuery(input);
    return new MiniQuery(input ? [input] : []);
  };
  query.fn = MiniQuery.prototype;
  if (typeof global.jQuery !== 'function') global.jQuery = query;
  if (typeof global.$ !== 'function') global.$ = global.jQuery;
  const listeners = new Map();
  const eventOn = (name, listener) => { const values = listeners.get(name) || new Set(); values.add(listener); listeners.set(name, values); return listener; };
  const eventOff = (name, listener) => listeners.get(name)?.delete(listener);
  const eventEmit = (name, ...args) => (listeners.get(name) || []).forEach((listener) => listener(...args));
  const events = Object.freeze({ VARIABLE_INITIALIZED: 'mag_variable_initiailized', VARIABLE_UPDATE_STARTED: 'mag_variable_update_started', COMMAND_PARSED: 'mag_command_parsed', VARIABLE_UPDATE_ENDED: 'mag_variable_update_ended', BEFORE_MESSAGE_UPDATE: 'mag_before_message_update' });
  global.getAllVariables = () => clone(snapshot);
  global.Mvu = Object.freeze({ events, getMvuData: () => clone(snapshot), isDuringExtraAnalysis: () => false });
  global.eventOn = global.eventOn || eventOn; global.eventOff = global.eventOff || eventOff; global.eventEmit = global.eventEmit || eventEmit;
  global.initializeGlobal = global.initializeGlobal || ((name, value) => { global[name] = value; });
  global.waitGlobalInitialized = global.waitGlobalInitialized || (async (name) => { if (!(name in global)) throw new Error('Global is not available: ' + name); });
  global.errorCatched = global.errorCatched || ((action) => function(...args) { try { return Promise.resolve(action.apply(this, args)).catch(console.error); } catch (error) { console.error(error); } });
  Object.defineProperty(global, '__ElecKoiMvuSnapshotBridge', { value: Object.freeze({ version: 1, readOnly: true }), configurable: false });
})(window);
</script>`
}

function actionBridge(): string {
  return `<script id="${ACTION_BRIDGE_MARKER}">
((global) => {
  'use strict';
  if (global.__ElecKoiMvuActionBridge) return;
  const requireSdk = () => { const sdk = global.ElecKoi; if (!sdk?.chat?.send || !sdk?.openings?.list || !sdk?.openings?.select) throw new Error('ElecKoi card actions are unavailable'); return sdk; };
  const setChatMessages = async (updates) => {
    if (!Array.isArray(updates) || updates.length !== 1) throw new TypeError('ElecKoi supports one opening switch at a time');
    const update = updates[0];
    if (!update || typeof update !== 'object' || Object.keys(update).some((key) => !['message_id', 'swipe_id'].includes(key))) throw new Error('ElecKoi only supports opening switches through setChatMessages');
    const messageId = Number(update.message_id); const swipeId = Number(update.swipe_id);
    if (messageId !== 0 || !Number.isInteger(swipeId) || swipeId < 0) throw new RangeError('Opening switches require message_id 0 and a non-negative swipe_id');
    const sdk = requireSdk(); const openings = await sdk.openings.list(); const option = openings?.items?.[swipeId];
    if (!option?.id) throw new RangeError('The requested opening does not exist');
    return sdk.openings.select(option.id);
  };
  const triggerSlash = async (command) => {
    const value = String(command ?? '').trim(); const prefix = '/send '; const suffix = '|/trigger';
    if (!value.startsWith(prefix) || !value.endsWith(suffix)) throw new Error('ElecKoi only supports the /send ...|/trigger card action');
    const text = value.slice(prefix.length, value.length - suffix.length).trim();
    if (!text) throw new TypeError('The card action cannot send an empty message');
    return requireSdk().chat.send(text);
  };
  if (typeof global.setChatMessages !== 'function') Object.defineProperty(global, 'setChatMessages', { value: setChatMessages, configurable: false });
  if (typeof global.triggerSlash !== 'function') Object.defineProperty(global, 'triggerSlash', { value: triggerSlash, configurable: false });
  Object.defineProperty(global, '__ElecKoiMvuActionBridge', { value: Object.freeze({ version: 1 }), configurable: false });
})(window);
</script>`
}

export function injectMvuFrontendSnapshotBridge(text: string, variableStateJson: string): string {
  if (text.includes(SNAPSHOT_BRIDGE_MARKER)) return text
  const referencesRuntime = (text.includes('waitGlobalInitialized') && text.includes('Mvu'))
    || text.includes('Mvu.events.') || text.includes('Mvu.getMvuData') || text.includes('getAllVariables')
  return referencesRuntime ? insertIntoHead(text, snapshotBridge(variableStateJson)) : text
}

export function injectMvuFrontendActionBridge(text: string): string {
  if (text.includes(ACTION_BRIDGE_MARKER) || !/<script/i.test(text)) return text
  const referencesActions = text.includes('triggerSlash') || text.includes('setChatMessages')
  return referencesActions ? insertIntoHead(text, actionBridge()) : text
}

export const mvuMessageDisplayCompatibility: MessageDisplayCompatibility = {
  prepareAssistantText(text, complete, displayRulePatterns) {
    if (!complete || text.includes(MVU_STATUS_PLACEHOLDER)) return text
    const referencesPlaceholder = [...displayRulePatterns].some((pattern) => pattern.replace(/\\\//g, '/').includes(MVU_STATUS_PLACEHOLDER))
    return referencesPlaceholder ? `${text}\n\n${MVU_STATUS_PLACEHOLDER}` : text
  },
  resolveVariableMacros(text, variableStateJson) {
    return injectMvuFrontendActionBridge(
      injectMvuFrontendSnapshotBridge(
        resolveMvuMessageVariableMacros(text, variableStateJson),
        variableStateJson
      )
    )
  }
}
