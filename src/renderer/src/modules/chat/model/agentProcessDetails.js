import { processItemPresentation } from './agentProcessPresentation.js';
import { rootProcessItems } from './agentProcessHierarchy.js';

const SETTING_GLOB = 'eleckoi_glob_setting_files';
const VARIABLE_GLOB = 'eleckoi_glob_variables';
const SETTING_READ = 'eleckoi_read_setting_files';
const VARIABLE_READ = 'eleckoi_read_variables';

export function processBlocks(items) {
  const blocks = [];
  let pendingOperations = [];
  const visibleItems = rootProcessItems(items || []);
  const flushOperations = () => {
    if (!pendingOperations.length) return;
    const operationItems = pendingOperations;
    pendingOperations = [];
    blocks.push({
      type: 'operations',
      id: `operations:${operationItems[0].id}`,
      items: operationItems,
      presentation: processOperationGroupPresentation(operationItems),
    });
  };

  for (const item of visibleItems) {
    if (item?.kind === 'narrative' || item?.toolName === 'assistant_narrative') {
      flushOperations();
      const text = item.summary || item.detail;
      if (text?.trim()) blocks.push({ type: 'narrative', id: item.id, text });
      continue;
    }
    if (item?.kind === 'reasoning' || item?.toolName === 'reasoning') {
      const text = firstText(item.detail, item.summary);
      if (text || item.status === 'running') pendingOperations.push(item);
      continue;
    }
    if (item) pendingOperations.push(item);
  }
  flushOperations();
  return blocks;
}

export function processOperationGroupPresentation(items) {
  const presentations = items.map(processItemDetails);
  const reasoningIndexes = new Set(items.flatMap((item, index) => (
    item?.kind === 'reasoning' || item?.toolName === 'reasoning' ? [index] : []
  )));
  const onlyReasoning = items.length > 0 && reasoningIndexes.size === items.length;
  const titles = uniqueStrings(presentations.flatMap((entry, index) => reasoningIndexes.has(index) ? [] : [entry.title]));
  const status = items.some((item) => item.status === 'running')
    ? 'running'
    : items.some((item) => item.status === 'error')
      ? 'error'
      : items.some((item) => item.status === 'cancelled')
        ? 'cancelled'
        : 'complete';
  return {
    title: onlyReasoning ? '思考过程' : titles.join('，'),
    icon: onlyReasoning ? 'reasoning' : operationGroupIcon(presentations),
    status,
  };
}

function operationGroupIcon(presentations) {
  const icons = new Set(presentations.map((entry) => entry.icon));
  return ['bolt', 'list', 'groups', 'description', 'edit', 'search-setting', 'read', 'search', 'folder', 'terminal', 'wrench']
    .find((icon) => icons.has(icon)) || 'wrench';
}

export function processItemDetails(item) {
  const presentation = processItemPresentation(item);
  const argumentsValue = parseValue(item?.arguments);
  const result = resultRecord(item);
  const toolName = item?.toolName || '';
  const specialized = specializedResult(toolName, result, argumentsValue);
  const target = targetFor(item, argumentsValue, result, specialized);
  const statusLabel = item?.status === 'running' ? '进行中' : item?.status === 'error' ? '失败' : item?.status === 'cancelled' ? '已取消' : '已完成';
  return {
    ...presentation,
    target,
    statusLabel,
    result,
    specialized,
    argumentsValue,
    rawResult: result ? result : firstText(item?.summary, item?.detail),
  };
}

function specializedResult(toolName, result, args) {
  if (!result || typeof result !== 'object') return null;
  if (toolName === SETTING_GLOB || toolName === VARIABLE_GLOB) {
    const paths = uniqueStrings(toolName === SETTING_GLOB
      ? [...arrayOf(result.files).map((entry) => entry?.path), ...arrayOf(result.paths)]
      : arrayOf(result.paths));
    const required = uniqueStrings(toolName === SETTING_GLOB
      ? [...arrayOf(result.required_files).map((entry) => entry?.path || entry), ...arrayOf(result.required_paths)]
      : [...arrayOf(result.required_variables).map((entry) => entry?.path || entry), ...arrayOf(result.required_paths)]);
    return {
      type: 'glob',
      scope: stringValue(result.scope || result.path || args?.path) || '全部',
      pattern: stringValue(result.pattern || args?.pattern) || '**',
      paths,
      required,
      omitted: numberValue(result.omitted),
      truncated: result.truncated === true,
      pathDetails: arrayOf(result.files).filter(Boolean),
      requiredEntries: arrayOf(toolName === SETTING_GLOB ? result.required_files : result.required_variables),
    };
  }
  if (toolName === SETTING_READ && arrayOf(result.files).length) {
    return { type: 'settings', entries: arrayOf(result.files).map(settingEntry).filter(Boolean), truncated: result.truncated === true };
  }
  if (toolName === VARIABLE_READ && arrayOf(result.variables).length) {
    return { type: 'variables', entries: arrayOf(result.variables).map(variableEntry).filter(Boolean) };
  }
  if (toolName === 'eleckoi_apply_variable_patch') {
    const operations = arrayOf(result.operations).length ? arrayOf(result.operations) : arrayOf(parseValue(argumentsValue)?.operations);
    return { type: 'operations', operations: operations.map(operation).filter(Boolean), applied: numberValue(result.applied_operations) };
  }
  if (toolName === 'eleckoi_apply_setting_patch' || toolName === 'eleckoi_apply_setting_mutations') {
    const operations = arrayOf(result.operations).length ? arrayOf(result.operations) : [parseValue(argumentsValue)].filter((value) => value && typeof value === 'object');
    return { type: 'operations', operations: operations.map(operation).filter(Boolean), applied: numberValue(result.applied_operations) };
  }
  if (toolName === 'update_plan' || toolName === 'update_roleplay_plan' || toolName === 'todo_write') {
    const steps = arrayOf(result.steps).length ? arrayOf(result.steps) : arrayOf(result.plan).length ? arrayOf(result.plan) : arrayOf(parseValue(argumentsValue)?.steps);
    if (steps.length) return { type: 'plan', steps: steps.map(planStep).filter(Boolean) };
  }
  return null;
}

function targetFor(item, args, result, specialized) {
  if (specialized?.type === 'glob') {
    const pattern = specialized.pattern || stringValue(args?.pattern) || '全部';
    const count = specialized.paths.length;
    return count ? `“${pattern}” · ${count} 项` : `“${pattern}”`;
  }
  if (specialized?.type === 'settings') {
    return summarize(specialized.entries.map((entry) => entry.title || entry.path), 3);
  }
  if (specialized?.type === 'variables') {
    return summarize(specialized.entries.map((entry) => entry.path), 3);
  }
  const candidate = args?.path || args?.pattern || args?.query || args?.task || args?.command || args?.description
    || result?.path || result?.message || result?.target;
  return typeof candidate === 'string' ? truncate(candidate, 120) : item?.target || '';
}

function settingEntry(value) {
  if (!value || typeof value !== 'object') return null;
  const path = stringValue(value.path);
  return {
    path,
    title: stringValue(value.title) || displayName(path) || '未命名设定',
    groupPath: stringValue(value.group_path || value.groupPath),
    selectionHint: stringValue(value.selection_hint || value.selectionHint),
    readStrategy: stringValue(value.read_strategy || value.readStrategy),
    content: stringValue(value.content),
    truncated: value.truncated === true,
    references: arrayOf(value.resolved_references || value.resolvedReferences),
  };
}

function variableEntry(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    path: stringValue(value.path),
    type: stringValue(value.type),
    current: value.current_present === false ? '未返回' : displayValue(value.current),
    defaultValue: displayValue(value.default),
    description: stringValue(value.description),
    updateRule: stringValue(value.update_rule || value.updateRule),
  };
}

function operation(value) {
  if (!value || typeof value !== 'object') return null;
  const path = stringValue(value.path || value.destination || value.target);
  const op = stringValue(value.op || value.operation || value.kind);
  return { op: op || '更新', path: path || '未指定路径', detail: stringValue(value.description || value.reason) };
}

function planStep(value) {
  if (typeof value === 'string') return { title: value, status: '' };
  if (!value || typeof value !== 'object') return null;
  return {
    title: stringValue(value.title || value.step || value.description || value.name) || '未命名步骤',
    status: stringValue(value.status || value.state),
  };
}

function resultRecord(item) {
  const candidates = [parseValue(item?.detail), parseValue(item?.summary)].filter(Boolean);
  for (const candidate of candidates) {
    const found = findRecord(candidate, (value) => hasResultShape(value));
    if (found) return found;
  }
  return candidates.find((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate)) || null;
}

function hasResultShape(value) {
  return ['files', 'variables', 'paths', 'required_files', 'required_variables', 'matches', 'operations', 'steps', 'plan'].some((key) => key in value);
}

function findRecord(value, predicate, depth = 0) {
  if (depth > 7 || value == null) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findRecord(entry, predicate, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  if (predicate(value)) return value;
  for (const entry of Object.values(value)) {
    const found = findRecord(entry, predicate, depth + 1);
    if (found) return found;
  }
  return null;
}

function parseValue(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function arrayOf(value) { return Array.isArray(value) ? value : []; }
function stringValue(value) { return typeof value === 'string' ? value : ''; }
function numberValue(value) { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function uniqueStrings(values) { return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))]; }
function firstText(...values) { return values.find((value) => typeof value === 'string' && value.trim()) || ''; }
function truncate(value, length) { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
function summarize(values, limit) {
  const clean = uniqueStrings(values);
  if (!clean.length) return '';
  if (clean.length <= limit) return clean.join('、');
  return `${clean.slice(0, limit).join('、')}等 ${clean.length} 项`;
}
function displayName(path) { return typeof path === 'string' ? path.split('/').filter(Boolean).pop() || path : ''; }
function displayValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
