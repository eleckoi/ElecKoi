import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import Ajv2019 from 'ajv/dist/2019.js';
import addFormats from 'ajv-formats';
import { toJSONSchema } from 'zod';

const keyOf = target => `${target.scope}:${target.owner}`;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function registry(shared) {
  return shared.variableSchemaRegistry ??= { entries: new Map(), listeners: new Set(), revision: 0 };
}
function changed(store) { store.revision++; for (const listener of store.listeners) listener(); }
export function variableSchemaRevision(shared) { return registry(shared).revision; }
export function subscribeVariableSchemas(shared, listener) {
  const store = registry(shared); store.listeners.add(listener); return () => store.listeners.delete(listener);
}
export function variableSchemaTargets(shared) {
  return [...registry(shared).entries.values()].map(entries => [...entries.values()].at(-1)).map(entry => ({
    scope: entry.scope, owner: entry.owner, ...(entry.scriptId ? { scriptId: entry.scriptId } : {}),
  }));
}
/** The shared client retains the original realm's schema and callbacks until its owner closes. */
export function registerEditingVariableSchema(shared, target, schema, scriptId) {
  const store = registry(shared), key = keyOf(target), token = {}, entries = store.entries.get(key) ?? new Map();
  entries.set(token, { schema, scope: target.scope, owner: target.owner, scriptId }); store.entries.set(key, entries); changed(store);
  return () => {
    if (!entries.delete(token)) return;
    if (!entries.size) store.entries.delete(key);
    changed(store);
  };
}
function active(shared, target) { return [...(registry(shared).entries.get(keyOf(target))?.values() ?? [])].at(-1); }
async function resolveSchema(entry, variables) {
  const schema = typeof entry.schema === 'function' ? await entry.schema(structuredClone(variables)) : entry.schema;
  if (!object(schema) && typeof schema !== 'boolean') throw new TypeError('变量 schema 回调需要返回 Zod 或 JSON Schema。');
  return schema;
}
function zodSchema(schema) {
  return object(schema) && (typeof schema.safeParseAsync === 'function' || typeof schema.safeParse === 'function');
}
export async function describeEditingVariableSchema(shared, target, variables) {
  const entry = active(shared, target);
  if (!entry) return { kind: 'none', source: '', schema: null, note: '' };
  const schema = await resolveSchema(entry, variables);
  if (zodSchema(schema)) {
    if (schema._zod) return { kind: 'zod', source: entry.scriptId || '', schema: toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }), note: '' };
    return { kind: 'zod', source: entry.scriptId || '', schema: null, note: '此 Zod 版本不提供 JSON Schema 视图；保存时仍执行原始校验。' };
  }
  return { kind: 'json-schema', source: entry.scriptId || '', schema: structuredClone(schema), note: '' };
}
/** Editor-only validation; programmatic variable APIs do not call this function. */
export async function validateEditingVariables(shared, target, variables) {
  if (!object(variables)) throw new TypeError('变量根节点需要是 JSON 对象。');
  const entry = active(shared, target);
  if (!entry) return structuredClone(variables);
  const schema = await resolveSchema(entry, variables);
  let output = structuredClone(variables);
  if (zodSchema(schema)) {
    const result = typeof schema.safeParseAsync === 'function' ? await schema.safeParseAsync(output) : schema.safeParse(output);
    if (!result.success) {
      const issues = result.error?.issues ?? result.error?.errors ?? [];
      throw Object.assign(new Error(issues.map(issue => `${issue.path?.join('.') || '$'}: ${issue.message}`).join('\n') || '变量不符合注册的 Zod schema。'), { code: 'VARIABLE_SCHEMA_INVALID', issues });
    }
    output = result.data;
  } else {
    const Engine = object(schema) && /2020-12/.test(schema.$schema || '') ? Ajv2020 : object(schema) && /2019-09/.test(schema.$schema || '') ? Ajv2019 : Ajv;
    const validator = new Engine({ allErrors: true, strict: false }); addFormats(validator);
    const validate = validator.compile(schema), result = await validate(output);
    if (!result) {
      const issues = validate.errors ?? [];
      throw Object.assign(new Error(issues.map(issue => `${issue.instancePath || '$'}: ${issue.message}`).join('\n') || '变量不符合注册的 JSON Schema。'), { code: 'VARIABLE_SCHEMA_INVALID', issues });
    }
  }
  if (!object(output)) throw new TypeError('变量 schema 需要返回对象。');
  if (active(shared, target) !== entry) throw new Error('变量 schema 已更新或所属脚本已关闭，请重新保存。');
  return structuredClone(output);
}
