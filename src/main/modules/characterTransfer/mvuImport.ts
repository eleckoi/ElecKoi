import { randomUUID } from 'node:crypto'
import { parse as parseYaml } from 'yaml'
import type {
  VariableConfig,
  VariableConfigVersion,
  VariableItemConfig,
  VariableObjectConfig,
  VariableValueType
} from '@shared/contracts/variables/schemas'
import { DEFAULT_VARIABLE_CONFIG_VERSION_ID } from '@shared/contracts/variables/schemas'

type JsonObject = Record<string, unknown>

interface UpdateRules {
  byPath: Map<string, string>
  byLeaf: Map<string, string>
}

interface ObjectSchemaNode {
  kind: 'object'
  fields: Map<string, SchemaNode>
  description: string
}

interface RecordSchemaNode {
  kind: 'record'
  value: SchemaNode
  description: string
}

interface ValueSchemaNode {
  kind: 'value'
  type: VariableValueType
  defaultValue?: unknown
  enumValues: string[]
  minimum?: number
  maximum?: number
  integer: boolean
  description: string
}

type SchemaNode = ObjectSchemaNode | RecordSchemaNode | ValueSchemaNode

export interface MvuVariableConversion {
  config?: VariableConfig
  openingStates: string[]
}

export function isMvuInfrastructureEntry(entry: JsonObject, title: string): boolean {
  const normalized = title.trim().toLocaleLowerCase()
  if (normalized.startsWith('[initvar]') || normalized.startsWith('[mvu_update]')) return true
  return title.trim() === '变量列表' && string(entry.content).toLocaleLowerCase().includes('format_message_variable')
}

export function convertMvuVariables(
  extensions: JsonObject | undefined,
  worldBook: JsonObject | undefined,
  openings: string[]
): MvuVariableConversion {
  const helper = record(extensions?.tavern_helper)
  const explicitState = record(helper?.variables)
  const entries = worldBookEntries(worldBook)
  const initialSource = entries.find((entry) => entryTitle(entry).toLocaleLowerCase().startsWith('[initvar]'))
  const initialState = explicitState && Object.keys(explicitState).length > 0
    ? explicitState
    : parseStateObject(string(initialSource?.content)) ?? {}
  const updateSource = entries.find((entry) => {
    const title = entryTitle(entry).toLocaleLowerCase()
    return title.startsWith('[mvu_update]') && title.includes('更新规则')
  })
  const rules = parseUpdateRules(string(updateSource?.content))
  const scripts = objectList(helper?.scripts)
    .filter((script) => boolean(script.enabled, true))
    .map((script) => string(script.content))
  const schema = scripts.map(parseSchema).filter((item): item is SchemaNode => !!item).at(-1)
  const config = schema
    ? schemaToVariableConfig(schema, initialState, rules)
    : Object.keys(initialState).length > 0
      ? stateToVariableConfig(initialState, rules)
      : undefined
  const baseState = config?.initialStateJson || JSON.stringify(initialState, null, 2)
  return {
    ...(config ? { config } : {}),
    openingStates: openings.map((opening) => patchedOpeningState(baseState, opening))
  }
}

function schemaToVariableConfig(root: SchemaNode, initialState: JsonObject, rules: UpdateRules): VariableConfig {
  const objects: VariableObjectConfig[] = []
  const variables: VariableItemConfig[] = []

  function appendNode(name: string, node: SchemaNode, parentId: string, order: number, supplied: unknown, path: string[]): void {
    if (node.kind === 'object') {
      const id = importId('object')
      objects.push(variableObject(id, name, parentId, node.description, ruleForPath(rules, path), false, order))
      const suppliedObject = record(supplied)
      ;[...node.fields].forEach(([key, child], index) => appendNode(
        key, child, id, index + 1, suppliedObject?.[key], [...path, key]
      ))
      return
    }
    if (node.kind === 'record') {
      const id = importId('object')
      objects.push(variableObject(id, name || '动态对象', parentId, node.description, '', true, order))
      if (node.value.kind === 'object') {
        ;[...node.value.fields].forEach(([key, child], index) => appendNode(key, child, id, index + 1, undefined, [key]))
      }
      return
    }
    const value = supplied ?? node.defaultValue ?? fallbackValue(node)
    variables.push(variableItem(importId('variable'), name, parentId, node.type, serializedValue(value), node.description, ruleForPath(rules, path), order))
  }

  if (root.kind === 'object') {
    ;[...root.fields].forEach(([key, child], index) => appendNode(key, child, '', index + 1, initialState[key], [key]))
  } else if (root.kind === 'record') {
    appendNode('动态对象', root, '', 1, initialState, [])
  } else {
    appendNode('值', root, '', 1, initialState.值, ['值'])
  }
  const seeded = mergeDefaults(root, initialState)
  return makeVariableConfig(
    seeded && typeof seeded === 'object' && !Array.isArray(seeded) ? seeded as JsonObject : { 值: seeded },
    schemaCode(root),
    objects,
    variables
  )
}

function stateToVariableConfig(state: JsonObject, rules: UpdateRules): VariableConfig {
  const objects: VariableObjectConfig[] = []
  const variables: VariableItemConfig[] = []
  function visit(value: JsonObject, parentId: string, parentPath: string[]): void {
    Object.entries(value).forEach(([key, child], index) => {
      const path = [...parentPath, key]
      const childObject = record(child)
      if (childObject) {
        const id = importId('object')
        objects.push(variableObject(id, key, parentId, '', ruleForPath(rules, path), false, index + 1))
        visit(childObject, id, path)
      } else if (child !== null && child !== undefined) {
        variables.push(variableItem(importId('variable'), key, parentId, valueType(child), serializedValue(child), '', ruleForPath(rules, path), index + 1))
      }
    })
  }
  visit(state, '', [])
  return makeVariableConfig(state, '', objects, variables)
}

function makeVariableConfig(
  initialState: JsonObject,
  code: string,
  objects: VariableObjectConfig[],
  variables: VariableItemConfig[]
): VariableConfig {
  const version: VariableConfigVersion = {
    id: DEFAULT_VARIABLE_CONFIG_VERSION_ID,
    name: '变量配置',
    initialStateJson: JSON.stringify(initialState, null, 2),
    schemaCode: code ? `const Schema = ${code}` : '',
    objects,
    variables,
    expandedObjectIds: objects.map((item) => item.id),
    createdAt: '',
    updatedAt: ''
  }
  return {
    characterId: 'pending-character',
    name: version.name,
    initialStateJson: version.initialStateJson,
    schemaCode: version.schemaCode,
    objects,
    variables,
    expandedObjectIds: version.expandedObjectIds,
    activeVersionId: version.id,
    versions: [version]
  }
}

function variableObject(
  id: string, name: string, parentId: string, description: string,
  updateRule: string, dynamicKey: boolean, order: number
): VariableObjectConfig {
  return { id, name, parentId, enabled: true, description, updateRule, dynamicKey, order, treeViewOrder: order, createdAt: '', updatedAt: '' }
}

function variableItem(
  id: string, title: string, objectId: string, type: VariableValueType, defaultValue: string,
  description: string, updateRule: string, order: number
): VariableItemConfig {
  return { id, title, objectId, enabled: true, type, defaultValue, description, updateRule, readMode: 'on_demand', order, treeViewOrder: order, createdAt: '', updatedAt: '' }
}

function patchedOpeningState(baseState: string, opening: string): string {
  const inline = /<initvar(?:\s[^>]*)?>([\s\S]*?)<\/initvar>/i.exec(opening)?.[1]
  const initial = inline ? parseStateObject(inline) : undefined
  const seeded = parseObjectJson(baseState) ?? {}
  if (initial) mergeState(seeded, initial)
  const patchText = /<JSONPatch>([\s\S]*?)<\/JSONPatch>/i.exec(opening)?.[1]?.trim() ?? ''
  if (!patchText) return initial ? JSON.stringify(seeded, null, 2) : ''
  try {
    const operations: unknown = JSON.parse(patchText)
    if (!Array.isArray(operations)) return ''
    return JSON.stringify(applyOpeningPatch(seeded, operations), null, 2)
  } catch {
    return ''
  }
}

function applyOpeningPatch(seed: JsonObject, operations: unknown[]): JsonObject {
  let state = structuredClone(seed)
  for (const candidate of operations) {
    const operation = record(candidate)
    if (!operation) continue
    const rawPath = string(operation.path)
    const path = rawPath === '/stat_data' ? '' : rawPath.startsWith('/stat_data/') ? rawPath.slice('/stat_data'.length) : rawPath
    if (!path) {
      const rootValue = record(operation.value)
      if (rootValue) state = structuredClone(rootValue)
      continue
    }
    const segments = path.replace(/^\//, '').split('/').filter(Boolean).map((value) => value.replace(/~1/g, '/').replace(/~0/g, '~'))
    if (!segments.length) continue
    let parent = state
    for (const segment of segments.slice(0, -1)) {
      const next = record(parent[segment]) ?? {}
      parent[segment] = next
      parent = next
    }
    const key = segments.at(-1)!
    switch (string(operation.op).toLocaleLowerCase()) {
      case 'remove': delete parent[key]; break
      case 'delta': parent[key] = number(parent[key]) + number(operation.value); break
      case 'add':
      case 'insert':
      case 'replace': if (operation.value !== undefined) parent[key] = operation.value; break
    }
  }
  return state
}

function parseStateObject(source: string): JsonObject | undefined {
  const trimmed = source.trim().replace(/^```(?:yaml|yml|json)\s*/i, '').replace(/```\s*$/, '').trim()
  if (!trimmed) return undefined
  const parsed = parseObjectJson(trimmed)
  if (parsed) return parsed
  try {
    return record(parseYaml(trimmed, {
      maxAliasCount: 64,
      strict: false,
      uniqueKeys: false
    }))
  } catch {
    return undefined
  }
}

function parseUpdateRules(source: string): UpdateRules {
  const collected = new Map<string, string[]>()
  const path: Array<{ indent: number; key: string }> = []
  const lines = source.split(/\r?\n/)
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('-') || !trimmed.includes(':')) { index += 1; continue }
    const indent = line.search(/\S/)
    const key = trimmed.slice(0, trimmed.indexOf(':')).trim().replace(/^['"]|['"]$/g, '')
    while (path.length && indent <= path.at(-1)!.indent) path.pop()
    if (key === 'check') {
      let end = index + 1
      while (end < lines.length && (!(lines[end] ?? '').trim() || (lines[end] ?? '').search(/\S/) > indent)) end += 1
      const checks = lines.slice(index + 1, end).map((value) => value.trim()).filter(Boolean)
      const rulePath = path.map((item) => item.key).filter((item) => item !== '变量更新规则').join('.')
      if (rulePath && checks.length) collected.set(rulePath, [...(collected.get(rulePath) ?? []), ...checks])
      index = end
      continue
    }
    if (trimmed.endsWith(':') && !['变量更新规则', 'type', 'range'].includes(key)) path.push({ indent, key })
    index += 1
  }
  const byPath = new Map([...collected].map(([key, values]) => [key, [...new Set(values)].join('\n')]))
  const leafValues = new Map<string, string[]>()
  for (const [key, value] of byPath) {
    const leaf = key.split('.').at(-1)?.trim()
    if (leaf) leafValues.set(leaf, [...(leafValues.get(leaf) ?? []), value])
  }
  return { byPath, byLeaf: new Map([...leafValues].map(([key, values]) => [key, [...new Set(values)].join('\n')])) }
}

function ruleForPath(rules: UpdateRules, path: string[]): string {
  return rules.byPath.get(path.filter(Boolean).join('.')) ?? rules.byLeaf.get(path.at(-1) ?? '') ?? ''
}

function parseSchema(source: string): SchemaNode | undefined {
  const text = withoutJavaScriptComments(source).replace(/\b([A-Za-z_$][\w$]*)\.z\./g, 'z.')
  const environment = new Map<string, SchemaNode>()
  for (const match of text.matchAll(/\b(?:const|let|var)\s+/g)) {
    const start = (match.index ?? 0) + match[0].length
    let index = start
    let depth = 0
    let quote = ''
    let escaped = false
    while (index < text.length) {
      const character = text[index]!
      if (quote) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = ''
      } else if (`'\"\``.includes(character)) quote = character
      else if ('([{'.includes(character)) depth += 1
      else if (')]}'.includes(character)) depth -= 1
      else if (character === ';' && depth === 0) break
      index += 1
    }
    for (const declaration of splitTopLevel(text.slice(start, index), ',')) {
      const equal = topLevelIndexOf(declaration, '=')
      if (equal <= 0) continue
      const name = declaration.slice(0, equal).trim().split(/\s+/).at(-1) ?? ''
      const node = parseExpression(declaration.slice(equal + 1).trim(), environment)
      if (name && node) environment.set(name, node)
    }
  }
  return [...environment.values()].at(-1)
}

function parseExpression(source: string, environment: Map<string, SchemaNode>): SchemaNode | undefined {
  const value = source.trim()
  if (environment.has(value)) return environment.get(value)
  let base: SchemaNode | undefined
  if (value.startsWith('z.object(')) {
    const body = callArguments(value)?.[0]?.trim()
    if (!body?.startsWith('{') || !body.endsWith('}')) return undefined
    const fields = new Map<string, SchemaNode>()
    for (const field of splitTopLevel(body.slice(1, -1), ',')) {
      const colon = topLevelIndexOf(field, ':')
      if (colon <= 0) continue
      const key = field.slice(0, colon).trim().replace(/^['"]|['"]$/g, '')
      const child = parseExpression(field.slice(colon + 1), environment)
      if (key && child) fields.set(key, child)
    }
    base = { kind: 'object', fields, description: '' }
  } else if (value.startsWith('z.record(')) {
    const expression = callArguments(value)?.at(-1)?.trim()
    const child = expression ? environment.get(expression) ?? parseExpression(expression, environment) : undefined
    if (child) base = { kind: 'record', value: child, description: '' }
  } else if (value.startsWith('z.enum(')) {
    const start = value.indexOf('[')
    const end = matchingClose(value, start, '[', ']')
    let enumValues: string[] = []
    if (end !== undefined) {
      try {
        const parsed: unknown = JSON.parse(value.slice(start, end + 1).replace(/'/g, '"'))
        if (Array.isArray(parsed)) enumValues = parsed.filter((item): item is string => typeof item === 'string' && !!item)
      } catch { /* invalid enums are ignored */ }
    }
    base = valueNode('string', { enumValues })
  } else if (value.startsWith('z.coerce.number(') || value.startsWith('z.number(')) base = valueNode('number')
  else if (value.startsWith('z.boolean(') || value.startsWith('z.coerce.boolean(')) base = valueNode('boolean')
  else if (value.startsWith('z.array(')) base = valueNode('array')
  else if (value.startsWith('z.string(') || value.startsWith('z.coerce.string(')) base = valueNode('string')
  else return environment.get(value.split('.')[0] ?? '')
  return base ? applyChains(base, value) : undefined
}

function valueNode(type: VariableValueType, values: Partial<ValueSchemaNode> = {}): ValueSchemaNode {
  return { kind: 'value', type, enumValues: [], integer: false, description: '', ...values }
}

function applyChains(node: SchemaNode, source: string): SchemaNode {
  if (node.kind !== 'value') return node
  const defaultSource = /\.(?:prefault|default|catch)\(([^)]*)\)/.exec(source)?.[1]
  const description = /\.describe\((['"])(.*?)\1\)/.exec(source)?.[2] ?? ''
  const clamp = /clamp\([^,]+,\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/.exec(source)
  const minimum = numberOrUndefined(/\.(?:min|gte)\((-?\d+(?:\.\d+)?)/.exec(source)?.[1] ?? clamp?.[1])
  const maximum = numberOrUndefined(/\.(?:max|lte)\((-?\d+(?:\.\d+)?)/.exec(source)?.[1] ?? clamp?.[2])
  const defaultValue = defaultSource === undefined ? node.defaultValue : parseLiteral(defaultSource)
  return { ...node,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    description: description || node.description,
    ...(minimum !== undefined ? { minimum } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    integer: source.includes('.int(')
  }
}

function schemaCode(node: SchemaNode): string {
  if (node.kind === 'object') return `z.object({${[...node.fields].map(([key, value]) => `${JSON.stringify(key)}:${schemaCode(value)}`).join(',')}})`
  if (node.kind === 'record') return `z.record(z.string(),${schemaCode(node.value)})`
  let code = node.enumValues.length ? `z.enum(${JSON.stringify(node.enumValues)})`
    : node.type === 'number' ? 'z.coerce.number()'
      : node.type === 'boolean' ? 'z.boolean()'
        : node.type === 'array' ? 'z.array(z.unknown())' : 'z.string()'
  if (node.integer) code += '.int()'
  if (node.minimum !== undefined) code += `.min(${node.minimum})`
  if (node.maximum !== undefined) code += `.max(${node.maximum})`
  if (node.description) code += `.describe(${JSON.stringify(node.description)})`
  if (node.defaultValue !== undefined) code += `.prefault(${JSON.stringify(node.defaultValue)})`
  return code
}

function mergeDefaults(node: SchemaNode, supplied: unknown): unknown {
  if (node.kind === 'value') return supplied ?? fallbackValue(node)
  if (node.kind === 'record') return record(supplied) ?? {}
  const source = record(supplied)
  const result: JsonObject = {}
  for (const [key, child] of node.fields) result[key] = mergeDefaults(child, source?.[key])
  if (source) for (const [key, value] of Object.entries(source)) if (!(key in result)) result[key] = value
  return result
}

function fallbackValue(node: ValueSchemaNode): unknown {
  if (node.defaultValue !== undefined) return node.defaultValue
  if (node.type === 'number') return 0
  if (node.type === 'boolean') return false
  if (node.type === 'array') return []
  return node.enumValues[0] ?? ''
}

function withoutJavaScriptComments(source: string): string {
  let result = ''
  let index = 0
  let quote = ''
  let escaped = false
  while (index < source.length) {
    const character = source[index]!
    if (quote) {
      result += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      index += 1
      continue
    }
    if (`'\"\``.includes(character)) { quote = character; result += character; index += 1; continue }
    if (character === '/' && source[index + 1] === '/') {
      result += '  '; index += 2
      while (index < source.length && !['\n', '\r'].includes(source[index]!)) { result += ' '; index += 1 }
      continue
    }
    if (character === '/' && source[index + 1] === '*') {
      result += '  '; index += 2
      while (index < source.length) {
        if (source[index] === '*' && source[index + 1] === '/') { result += '  '; index += 2; break }
        result += ['\n', '\r'].includes(source[index]!) ? source[index]! : ' '
        index += 1
      }
      continue
    }
    result += character
    index += 1
  }
  return result
}

function splitTopLevel(source: string, separator: string): string[] {
  const result: string[] = []
  let start = 0
  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
    } else if (`'\"\``.includes(character)) quote = character
    else if ('([{'.includes(character)) depth += 1
    else if (')]}'.includes(character)) depth -= 1
    else if (character === separator && depth === 0) { result.push(source.slice(start, index).trim()); start = index + 1 }
  }
  result.push(source.slice(start).trim())
  return result.filter(Boolean)
}

function topLevelIndexOf(source: string, target: string): number {
  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
    } else if (`'\"\``.includes(character)) quote = character
    else if ('([{'.includes(character)) depth += 1
    else if (')]}'.includes(character)) depth -= 1
    else if (character === target && depth === 0) return index
  }
  return -1
}

function matchingClose(source: string, start: number, open: string, close: string): number | undefined {
  if (start < 0 || source[start] !== open) return undefined
  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }
    if (`'\"\``.includes(character)) quote = character
    else if (character === open) depth += 1
    else if (character === close && --depth === 0) return index
  }
  return undefined
}

function callArguments(value: string): string[] | undefined {
  const open = value.indexOf('(')
  const close = matchingClose(value, open, '(', ')')
  return close === undefined ? undefined : splitTopLevel(value.slice(open + 1, close), ',')
}

function parseLiteral(source: string): unknown {
  const value = source.trim()
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) return value.slice(1, -1)
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === '[]') return []
  if (value === '{}') return {}
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function mergeState(target: JsonObject, source: JsonObject): void {
  for (const [key, incoming] of Object.entries(source)) {
    const existing = record(target[key])
    const incomingObject = record(incoming)
    if (existing && incomingObject) mergeState(existing, incomingObject)
    else target[key] = incoming
  }
}

function worldBookEntries(worldBook: JsonObject | undefined): JsonObject[] {
  const entries = worldBook?.entries
  if (Array.isArray(entries)) return entries.map(record).filter((item): item is JsonObject => !!item)
  const map = record(entries)
  return map ? Object.keys(map).sort((left, right) => (Number(left) || Number.MAX_SAFE_INTEGER) - (Number(right) || Number.MAX_SAFE_INTEGER))
    .map((key) => record(map[key])).filter((item): item is JsonObject => !!item) : []
}

function entryTitle(entry: JsonObject): string { return string(entry.name) || string(entry.comment) }
function importId(kind: string): string { return `import-${kind}-${randomUUID()}` }
function parseObjectJson(source: string): JsonObject | undefined {
  try { return record(JSON.parse(source)) } catch { return undefined }
}
function record(value: unknown): JsonObject | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined }
function objectList(value: unknown): JsonObject[] { return Array.isArray(value) ? value.map(record).filter((item): item is JsonObject => !!item) : [] }
function string(value: unknown): string { return typeof value === 'string' ? value : '' }
function boolean(value: unknown, fallback = false): boolean { return typeof value === 'boolean' ? value : fallback }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0 }
function numberOrUndefined(value: string | undefined): number | undefined { const parsed = value === undefined ? NaN : Number(value); return Number.isFinite(parsed) ? parsed : undefined }
function serializedValue(value: unknown): string { return typeof value === 'string' ? value : JSON.stringify(value) }
function valueType(value: unknown): VariableValueType { return typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : Array.isArray(value) ? 'array' : 'string' }
