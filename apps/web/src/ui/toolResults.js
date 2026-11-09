import { sourceText } from '../app/i18n/productCopy.js';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function parseToolJson(value) {
  if (typeof value !== 'string') return undefined;
  try { const result = JSON.parse(value); return record(result) ? result : undefined; } catch { return undefined; }
}

/** Keep every returned path and matching line; input records remain unchanged. */
export function normalizePathToolResult(definition, payload, tUi = sourceText) {
  if (!definition || !payload || !['ok', 'partial', 'no_matches'].includes(payload.status)) return undefined;
  const { domain, operation } = definition;
  const field = operation === 'grep' ? 'matches' : domain === 'settings' ? 'files' : operation === 'read' ? 'variables' : 'paths';
  if (!Array.isArray(payload[field])) return undefined;
  if (field !== 'paths' && payload[field].some(value => !record(value))) return undefined;
  const required = operation === 'read' ? [] : payload[domain === 'settings' ? 'required_entries' : 'required_variables'];
  if (required !== undefined && !Array.isArray(required)) return undefined;
  const entries = new Map();
  const admit = (source, requiredOnly) => {
    const path = typeof source === 'string' ? source : source?.path;
    if (typeof path !== 'string' || !path) return false;
    const value = record(source) ? source : undefined;
    let entry = entries.get(path);
    if (!entry) {
      entry = { key: path, path, source: value, required: false, requiredOnly, matches: [] };
      entries.set(path, entry);
    } else if (!requiredOnly) { entry.requiredOnly = false; entry.source = value ?? entry.source; }
    if (requiredOnly) {
      entry.required = true;
      if (value) entry.source = { ...value, ...entry.source };
    }
    if (operation === 'grep' && !requiredOnly) entry.matches.push(source);
    if (value?.read_strategy === 'required' || value?.read_mode === 'required') entry.required = true;
    if (!entry.title || value?.title) entry.title = value?.title || resultLeaf(path, domain);
    return true;
  };
  // Invalid shapes retain the native Tool card, including the original output.
  if (!payload[field].every(value => admit(value, false))) return undefined;
  if (!(required || []).every(value => admit(value, true))) return undefined;
  const values = [...entries.values()];
  const counts = { matched: 0, fixed: 0, turn: 0, required: 0 };
  for (const entry of values) {
    if (!entry.requiredOnly) counts.matched += 1;
    const kind = resultReadingBadge(entry, domain, tUi)?.kind;
    if (kind && Object.hasOwn(counts, kind)) counts[kind] += 1;
  }
  return { entries: values, payload, domain, operation, counts };
}

export function resultReadingBadge(entry, domain, tUi = sourceText) {
  if (domain === 'presetPrompts') {
    if (entry.source?.read_strategy === 'required') return { kind: 'required', label: tUi('必读') };
    if (entry.source?.read_strategy === 'normal') return { kind: 'optional', label: tUi('选读') };
  } else if (domain === 'settings') {
    const strategy = entry.source?.read_strategy;
    if (strategy === 'required') return { kind: 'fixed', label: tUi("固定必读") };
    if (entry.required) return { kind: 'turn', label: tUi("本轮须读") };
    if (strategy === 'keyword') return { kind: 'keyword', label: tUi("关键词") };
    if (strategy === 'normal') return { kind: 'optional', label: tUi("选读") };
  } else if (entry.required) return { kind: 'required', label: tUi("必读") };
  return undefined;
}

export function resultLeaf(path, domain) {
  const leaf = path.split('/').at(-1) || path;
  return domain === 'variables' ? leaf.replace(/~1/g, '/').replace(/~0/g, '~') : leaf;
}

export function resultValueText(value) {
  if (typeof value === 'string') return value || '""';
  return JSON.stringify(value, null, 2);
}

export function resultMatchesQuery(entry, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const includes = value => typeof value === 'string' && value.toLocaleLowerCase().includes(needle);
  if ([entry.title, entry.path, entry.source?.selection_hint, entry.source?.description,
    entry.source?.content, entry.source?.update_rule].some(includes)) return true;
  if (entry.matches.some(match => includes(match.text))) return true;
  if (entry.fields?.some(field => includes(field.label) || includes(resultValueText(field.value)))) return true;
  return entry.source && ['current', 'default'].some(key => Object.hasOwn(entry.source, key)
    && includes(resultValueText(entry.source[key])));
}

/** Partition the complete display text; chunk boundaries never discard characters. */
export function resultTextSegments(text) {
  const segments = [];
  for (let start = 0; start < text.length;) {
    const newline = text.indexOf('\n', start);
    let end = Math.min(text.length, start + 2048);
    if (newline >= start && newline < end) end = newline + 1;
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end -= 1;
    segments.push(text.slice(start, end)); start = end;
  }
  return segments;
}
