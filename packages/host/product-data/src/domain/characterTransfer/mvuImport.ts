import { randomUUID } from 'node:crypto'
import jsonPatch, { type Operation } from 'fast-json-patch'
import JSON5 from 'json5'
import { parseDocument } from 'yaml'
import { z } from 'zod'
import type {
  VariableConfig, VariableConfigVersion, VariableItemConfig,
  VariableObjectConfig, VariableValueType
} from '@shared/contracts/variables/schemas'
import { DEFAULT_VARIABLE_CONFIG_VERSION_ID } from '@shared/contracts/variables/schemas'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { assertMvuJson, loadMvuSchema, structuralMvuSchema, type ImportedMvuSchema } from './mvuSchema'

type JsonObject = Record<string, unknown>

export interface MvuVariableConversion {
  config?: VariableConfig
  warnings: string[]
  openingVersionIds: string[]
  consumedEntries: Set<JsonObject>
}

export function convertMvuVariables(
  extensions: JsonObject | undefined, worldBook: JsonObject | undefined, openings: string[]
): MvuVariableConversion {
  const warnings: string[] = []
  let schema: ImportedMvuSchema | undefined
  try { schema = loadMvuSchema(enabledScripts(record(extensions?.tavern_helper)?.scripts)) }
  catch (error) { warnings.push(`变量规则未导入：${errorMessage(error)}`) }
  const consumedEntries = new Set<JsonObject>()
  const rules = new Map<string, string>()
  let bookState: JsonObject = {}
  for (const entry of worldBookEntries(worldBook)) {
    const title = text(entry.name) || text(entry.comment)
    if (title.toLowerCase().includes('[initvar]')) {
      bookState = mergeState(bookState, parseStateObject(text(entry.content)))
      consumedEntries.add(entry)
    } else if (title.toLowerCase().includes('[mvu_update]')) {
      const translated = parseUpdateRules(text(entry.content))
      for (const [path, rule] of translated) rules.set(path, rule)
    }
  }
  const recognized = schema || consumedEntries.size || openings.some(opening => /<(?:initvar|json_?patch)(?:\s|>)/i.test(opening))
  if (!recognized) return { warnings, openingVersionIds: [], consumedEntries }
  const states = (openings.length ? openings : ['']).map((opening, index) => {
    try {
      const inline = taggedBlocks(opening, 'initvar')
      let state = inline.length
        ? inline.reduce<JsonObject>((result, source) => mergeState(result, parseStateObject(source)), {})
        : structuredClone(bookState)
      if (schema) state = schema.initialize(state)
      const patches = taggedBlocks(opening, 'json_?patch')
      for (const source of patches) state = applyOpeningPatch(state, source)
      if (schema && patches.length) state = schema.initialize(state)
      assertMvuJson(state)
      return state
    } catch (error) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `开场白 ${index + 1} 的变量初始化失败：${errorMessage(error)}`, { what: '开场白的变量初始化内容', path: `openings[${index}]` })
    }
  })
  const versions: VariableConfigVersion[] = []
  const byState = new Map<string, VariableConfigVersion>()
  const openingVersionIds = states.map((state, index) => {
    const identity = JSON.stringify(canonicalValue(state))
    let version = byState.get(identity)
    if (!version) {
      const projection = projectState(state, schema?.schema, rules)
      version = {
        id: versions.length ? `variable-config-${randomUUID()}` : DEFAULT_VARIABLE_CONFIG_VERSION_ID,
        name: index ? `开场 ${index + 1} 变量配置` : '变量配置',
        initialStateJson: JSON.stringify(state, null, 2), schemaCode: schema?.code ?? '',
        ...projection, expandedObjectIds: projection.objects.map(item => item.id), createdAt: '', updatedAt: ''
      }
      versions.push(version)
      byState.set(identity, version)
    }
    return version.id
  })
  const active = versions[0]!
  return {
    warnings,
    config: { characterId: 'pending-character', name: active.name, initialStateJson: active.initialStateJson,
      schemaCode: active.schemaCode, objects: active.objects, variables: active.variables,
      expandedObjectIds: active.expandedObjectIds, activeVersionId: active.id, versions },
    openingVersionIds: openings.length ? openingVersionIds : [], consumedEntries
  }
}

function projectState(state: JsonObject, schema: z.ZodType | undefined, rules: Map<string, string>) {
  const objects: VariableObjectConfig[] = []
  const variables: VariableItemConfig[] = []
  function visit(value: JsonObject, node: z.ZodType | undefined, parentId: string, path: string[]): void {
    const structural = structuralMvuSchema(node)
    const shape = structural instanceof z.ZodObject ? structural.shape as Record<string, z.ZodType> : undefined
    Object.entries(value).forEach(([key, child], index) => append(key, child, shape?.[key], parentId, [...path, key], index + 1))
  }
  function append(key: string, value: unknown, node: z.ZodType | undefined, parentId: string, path: string[], order: number): void {
    const structural = structuralMvuSchema(node)
    const childObject = record(value)
    const dynamicKey = structural instanceof z.ZodRecord
    const description = node?.description ?? structural?.description ?? ''
    const updateRule = rules.get(JSON.stringify(path)) ?? ''
    if (childObject) {
      checkKey(key)
      const id = `object-${randomUUID()}`
      objects.push({ id, name: key, parentId, enabled: true, description, updateRule, dynamicKey,
        order, treeViewOrder: order, createdAt: '', updatedAt: '' })
      if (dynamicKey) {
        const valueSchema = (structural as z.ZodRecord).valueType as z.ZodType
        const templateSchema = structuralMvuSchema(valueSchema)
        if (templateSchema instanceof z.ZodObject) {
          const initialized = valueSchema.safeParse({})
          const template: JsonObject = initialized.success && record(initialized.data) ? initialized.data as JsonObject : {}
          if (!initialized.success) {
            for (const [name, field] of Object.entries(templateSchema.shape as Record<string, z.ZodType>)) {
              const parsed = field.safeParse(undefined)
              if (parsed.success && parsed.data !== undefined) template[name] = parsed.data
            }
          }
          assertMvuJson(template)
          visit(template, valueSchema, id, [...path, '*'])
        }
      } else visit(childObject, node, id, path)
    } else {
      checkKey(key)
      variables.push({ id: `variable-${randomUUID()}`, title: key, objectId: parentId, enabled: true,
        type: valueType(value), defaultValue: typeof value === 'string' ? value : JSON.stringify(value),
        description, updateRule, readMode: 'on_demand', order, treeViewOrder: order, createdAt: '', updatedAt: '' })
    }
  }
  visit(state, schema, '', [])
  return { objects, variables }
}

function parseStateObject(source: string): JsonObject {
  const blocks = taggedBlocks(source, 'initvar')
  if (blocks.length) return blocks.reduce<JsonObject>((state, block) => mergeState(state, parseStateObject(block)), {})
  const clean = unfence(source)
  if (!clean) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量初始化内容为空。', { what: '变量初始化内容' })
  try {
    const parsed: unknown = /^(?:\{|\[)/.test(clean) ? JSON5.parse(clean) : parseYaml(clean)
    const state = record(parsed)
    if (!state) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '初始化内容必须是对象。', { what: '变量初始化内容' })
    assertMvuJson(state)
    return state
  } catch (error) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `变量初始化内容无法解析：${errorMessage(error)}`, { what: '变量初始化内容' })
  }
}

function parseYaml(source: string): unknown {
  const document = parseDocument(source, { merge: true, uniqueKeys: true })
  if (document.errors.length) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, document.errors.map(error => error.message).join('; '), { what: '变量初始化内容的 YAML' })
  return document.toJS({ maxAliasCount: -1 }) as unknown
}

function applyOpeningPatch(seed: JsonObject, source: string): JsonObject {
  const parsed: unknown = JSON5.parse(unfence(source))
  if (!Array.isArray(parsed)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'JSONPatch 内容必须是操作数组。', { what: 'JSONPatch 操作列表' })
  let state = structuredClone(seed)
  for (const candidate of parsed) {
    const operation = record(candidate)
    if (!operation || typeof operation.path !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'JSONPatch 操作缺少明确路径。', { what: 'JSONPatch 操作路径' })
    const path = statePointer(operation.path)
    let normalized: JsonObject = { ...operation, path }
    if (operation.op === 'delta') {
      const current: unknown = jsonPatch.getValueByPointer(state, path)
      if (typeof current !== 'number' || typeof operation.value !== 'number' || !Number.isFinite(current + operation.value)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'JSONPatch delta 只能更新已有的有限数值。', { what: 'JSONPatch delta 的目标数值' })
      }
      normalized = { op: 'replace', path, value: current + operation.value }
    } else if (operation.op === 'insert') normalized.op = 'add'
    if (typeof operation.from === 'string') normalized.from = statePointer(operation.from)
    const result: unknown = jsonPatch.applyPatch(state, [normalized as unknown as Operation], true, true, true).newDocument
    if (!record(result)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'JSONPatch 不能把变量根节点改为非对象。', { what: 'JSONPatch 修改后的变量根节点' })
    assertMvuJson(result)
    state = result as JsonObject
  }
  return state
}

function statePointer(path: string): string {
  return path === '/stat_data' ? '' : path.startsWith('/stat_data/') ? path.slice('/stat_data'.length) : path
}

function taggedBlocks(source: string, tag: string): string[] {
  const expression = new RegExp(`<(${tag})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1\\s*>`, 'gi')
  const matches = [...source.matchAll(expression)]
  const remainder = source.replace(expression, '')
  if (new RegExp(`<\\/?(?:${tag})(?:\\s|>)`, 'i').test(remainder)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量初始化或补丁标签未完整闭合。', { what: '变量初始化或补丁标签' })
  return matches.map(match => match[2]!)
}

function mergeState(left: JsonObject, right: JsonObject): JsonObject {
  const result = structuredClone(left)
  for (const [key, value] of Object.entries(right)) {
    const lhs = record(result[key])
    const rhs = record(value)
    Object.defineProperty(result, key, { value: lhs && rhs ? mergeState(lhs, rhs) : structuredClone(value), writable: true, enumerable: true, configurable: true })
  }
  return result
}

function parseUpdateRules(source: string): Map<string, string> {
  const rules = new Map<string, string>()
  let parsed: unknown
  try { parsed = parseYaml(unfence(source)) } catch { return rules }
  const root = record(record(parsed)?.['变量更新规则'])
  if (!root) return rules
  function visit(value: JsonObject, path: string[]): void {
    const checks = value.check
    if (typeof checks === 'string') rules.set(JSON.stringify(path), checks)
    else if (Array.isArray(checks) && checks.every(item => typeof item === 'string')) rules.set(JSON.stringify(path), checks.join('\n'))
    for (const [key, child] of Object.entries(value)) {
      const nested = record(child)
      if (nested) visit(nested, [...path, key])
    }
  }
  visit(root, [])
  return rules
}

function enabledScripts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(candidate => {
    const item = record(candidate)
    if (!item || item.enabled !== true) return []
    if (item.type === 'folder') return enabledScripts(item.scripts)
    return item.type === 'script' ? [text(item.content)] : []
  })
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  const object = record(value)
  return object ? Object.fromEntries(Object.keys(object).sort().map(key => [key, canonicalValue(object[key])])) : value
}

function valueType(value: unknown): VariableValueType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number' || typeof value === 'boolean') return typeof value as 'number' | 'boolean'
  if (typeof value === 'string') return 'string'
  throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '变量值不是受支持的 JSON 类型。', { what: '变量值的类型', expected: 'JSON 类型' })
}

function checkKey(key: string): void {
  if (!key || key !== key.trim()) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '变量键不能为空或包含首尾空格。', { field: 'key' })
}

function unfence(source: string): string { return source.trim().replace(/^```(?:yaml|yml|json|json5)?\s*\n/i, '').replace(/\n```\s*$/, '').trim() }
function worldBookEntries(book: JsonObject | undefined): JsonObject[] {
  const entries = book?.entries
  const values = Array.isArray(entries) ? entries : Object.values(record(entries) ?? {})
  return values.map(record).filter((value): value is JsonObject => !!value)
}
function record(value: unknown): JsonObject | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined }
function text(value: unknown): string { return typeof value === 'string' ? value : '' }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
