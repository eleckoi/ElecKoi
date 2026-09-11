import { readFileSync, writeFileSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'

const fixedObjectId = 'fixed-variable-initialization-object'
export const name = 'eleckoi-variable-tools'
export const inject = ['tools']

export function apply(ctx) {
  if (process.env.ELECKOI_VARIABLES_ENABLED !== '1' || !process.env.ELECKOI_VARIABLE_STATE_FILE) return
  return [
    ctx.tools.register(globTool()),
    ctx.tools.register(grepTool()),
    ctx.tools.register(readTool()),
    ctx.tools.register(patchTool()),
  ]
}

function outputDefinition() {
  return {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

function globTool() {
  return defineTool({
    name: 'eleckoi_glob_variables',
    description: '按变量路径 Glob 查找变量。pattern 默认 **；返回真实 JSON Pointer 路径，不返回完整值。required_variables 是本回合必须逐项读取的必读变量。',
    parameters: {
      pattern: { type: 'string', description: '变量路径 Glob，例如 **、角色/**、**/*好感*。' },
      path: { type: 'string', description: '可选的精确变量组 JSON Pointer；留空表示全部变量。' },
    },
    output: outputDefinition(),
    async execute(args) {
      const bridge = readBridge()
      const catalog = variableCatalog(bridge)
      const scope = normalizeScope(args.path)
      if (scope === null || !validScope(catalog, scope)) return failure('invalid_path', 'path 必须是当前变量配置中真实存在的 JSON Pointer 变量组。')
      const pattern = String(args.pattern || '**').trim() || '**'
      let matcher
      try { matcher = globRegex(pattern) } catch (error) { return failure('glob_error', errorMessage(error)) }
      const scoped = inScope(catalog, scope)
      const selected = scoped.filter((entry) => matcher.test(relativePath(entry.path, scope)))
      const limit = 100
      return {
        status: selected.length ? 'ok' : 'no_matches',
        pattern,
        path: scope,
        required_variables: requiredVariables(catalog),
        paths: selected.slice(0, limit).map((entry) => entry.path),
        truncated: selected.length > limit,
        omitted: Math.max(0, selected.length - limit),
      }
    },
  })
}

function grepTool() {
  return defineTool({
    name: 'eleckoi_grep_variables',
    description: '用正则搜索变量路径、类型、默认值、当前值、说明和作者更新规则。找到路径后使用读取工具取得完整信息。required_variables 是本回合必须逐项读取的必读变量。',
    parameters: {
      pattern: { type: 'string', required: true, description: 'JavaScript 正则表达式。' },
      path: { type: 'string', description: '可选的精确变量组 JSON Pointer。' },
      glob: { type: 'string', description: '可选的变量路径 Glob 过滤器。' },
      output_mode: { type: 'string', enum: ['files_with_matches', 'content', 'count'], description: '默认 files_with_matches。' },
      ignore_case: { type: 'boolean' },
      multiline: { type: 'boolean' },
      limit: { type: 'integer' },
    },
    output: outputDefinition(),
    async execute(args) {
      const pattern = String(args.pattern || '')
      if (!pattern) return failure('invalid_arguments', 'pattern 不能为空。')
      const bridge = readBridge()
      const catalog = variableCatalog(bridge)
      const scope = normalizeScope(args.path)
      if (scope === null || !validScope(catalog, scope)) return failure('invalid_path', 'path 必须是当前变量配置中真实存在的 JSON Pointer 变量组。')
      const mode = args.output_mode || 'files_with_matches'
      const limit = Math.max(1, Math.min(1000, Number.isInteger(args.limit) ? args.limit : 100))
      let expression
      let pathMatcher
      try {
        expression = new RegExp(pattern, (args.ignore_case ? 'i' : '') + (args.multiline ? 'm' : ''))
        pathMatcher = args.glob ? globRegex(args.glob) : null
      } catch (error) {
        return failure('grep_error', errorMessage(error))
      }
      const candidates = inScope(catalog, scope).filter((entry) => !pathMatcher || pathMatcher.test(relativePath(entry.path, scope)))
      const found = []
      for (const entry of candidates) {
        const content = searchableText(entry, bridge)
        const { count, lines: matchingLines } = grepContent(content, expression, args.multiline === true)
        if (count > 0) found.push({ entry, count, lines: matchingLines })
      }
      const matches = []
      if (mode === 'content') {
        for (const item of found) for (const line of item.lines) matches.push({ ...candidateJson(item.entry), ...line })
      } else if (mode === 'count') {
        for (const item of found) matches.push({ ...candidateJson(item.entry), count: item.count })
      } else {
        for (const item of found) matches.push(candidateJson(item.entry))
      }
      return {
        status: found.length ? 'ok' : 'no_matches',
        pattern,
        path: scope,
        output_mode: mode,
        required_variables: requiredVariables(catalog),
        matches: matches.slice(0, limit),
        omitted: Math.max(0, matches.length - limit),
      }
    },
  })
}

function readTool() {
  return defineTool({
    name: 'eleckoi_read_variables',
    description: '读取 Glob 或 Grep 返回的变量路径，给出当前值、默认值、说明和完整更新规则。修改前应先读并遵守作者规则。',
    parameters: {
      paths: { type: 'array', items: { type: 'string' }, required: true, description: '1 到 16 个完整变量 JSON Pointer 路径。' },
    },
    output: outputDefinition(),
    async execute(args) {
      const paths = [...new Set(args.paths.filter((path) => typeof path === 'string' && path.startsWith('/')))]
      if (!paths.length || paths.length > 16) return failure('invalid_arguments', '一次必须读取 1 到 16 个变量路径。')
      const bridge = readBridge()
      const byPath = new Map(variableCatalog(bridge).map((entry) => [entry.path, entry]))
      const missing = paths.filter((path) => !byPath.has(path))
      if (missing.length) return { ...failure('not_found', '存在当前变量配置中没有的路径，请重新使用 Glob 或 Grep。'), paths: missing }
      return {
        status: 'ok',
        variables: paths.map((path) => {
          const entry = byPath.get(path)
          const current = valueAtPointer(bridge.state, path)
          const initial = valueAtPointer(bridge.config.initialState, path)
          return {
            path,
            read_mode: entry.readMode,
            type: entry.type,
            default: initial.value,
            current: current.value,
            current_present: current.present,
            write_guidance: entry.allowsDynamicChildren
              ? '这是对象容器；用 insert /当前路径/<新键> 创建新键，是否允许由作者 Zod 决定'
              : current.present ? '用 replace 修改当前值' : '该变量尚未存储；用 insert 首次创建',
            description: entry.description,
            update_rule: entry.updateRule,
          }
        }),
      }
    },
  })
}

function patchTool() {
  return defineTool({
    name: 'eleckoi_apply_variable_patch',
    description: '修改剧情运行时变量值。支持 replace、delta、insert、remove；path 使用 JSON Pointer。状态只保存当前值，不要用 value/min/max/description/update_rule 包装简单值。作者 Zod 校验失败时状态不改变。',
    parameters: {
      operations: {
        type: 'array',
        required: true,
        description: '按顺序执行的 1 到 200 项变量补丁。',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            op: { type: 'string', enum: ['replace', 'delta', 'insert', 'remove'], required: true },
            path: { type: 'string', required: true },
            value: { type: 'json' },
          },
        },
      },
    },
    output: outputDefinition(),
    async execute(args) {
      if (!args.operations.length || args.operations.length > 200) return failure('invalid_arguments', 'operations 必须包含 1 到 200 项。')
      const bridge = readBridge()
      let next
      try { next = applyOperations(bridge.state, args.operations) } catch (error) {
        return { ...failure('patch_error', errorMessage(error)), paths: operationPaths(args.operations), state_unchanged: true }
      }
      if (bridge.config.schemaCode.trim()) {
        const validation = validateWithZod(bridge.config.schemaCode, next)
        if (!validation.ok) return {
          ...failure('validation_error', '变量状态不符合 Zod 规则'),
          detail: validation.detail,
          schema_source: 'author_zod',
          paths: operationPaths(args.operations),
          state_unchanged: true,
        }
        const conflicts = normalizationConflicts(next, validation.state, args.operations)
        if (conflicts.length) return {
          ...failure('normalization_conflict', '作者 Zod 归一化结果没有保留本次修改路径。'),
          detail: '未保留的路径：' + conflicts.join('、'),
          schema_source: 'author_zod',
          paths: conflicts,
          state_unchanged: true,
        }
        next = validation.state
      }
      writeBridge({ ...bridge, state: next })
      return {
        status: 'ok',
        applied_operations: args.operations.length,
        paths: operationPaths(args.operations),
        message: '变量补丁已通过校验并暂存，将随本回合成功完成后提交。',
      }
    },
  })
}

function readBridge() {
  const value = JSON.parse(readFileSync(requireStateFile(), 'utf8'))
  if (!value?.enabled || !isObject(value.config) || !isObject(value.state) || !isObject(value.config.initialState)) {
    throw new Error('变量运行时尚未准备好。')
  }
  return value
}

function writeBridge(value) {
  writeFileSync(requireStateFile(), JSON.stringify(value, null, 2), 'utf8')
}

function requireStateFile() {
  const path = process.env.ELECKOI_VARIABLE_STATE_FILE
  if (!path) throw new Error('变量状态文件没有配置。')
  return path
}

function variableCatalog(bridge) {
  const objects = bridge.config.objects.filter((item) => item.id !== fixedObjectId)
  const variables = bridge.config.variables
  const objectsById = new Map(objects.map((item) => [item.id, item]))
  const enabledChain = (objectId) => {
    const chain = []
    const visited = new Set()
    let id = objectId
    while (id) {
      if (visited.has(id)) return null
      visited.add(id)
      const item = objectsById.get(id)
      if (!item?.enabled || !item.name.trim()) return null
      chain.unshift(item)
      id = item.parentId
    }
    return chain
  }
  const objectPaths = (objectId) => {
    if (!objectId) return [[]]
    const chain = enabledChain(objectId)
    if (!chain) return []
    let paths = [[]]
    for (const item of chain) {
      if (!item.dynamicKey) paths = paths.map((path) => [...path, item.name.trim()])
      else paths = paths.flatMap((path) => {
        const container = [...path, item.name.trim()]
        const value = valueAtSegments(bridge.state, container)
        return isObject(value) ? Object.keys(value).map((key) => [...container, key]) : []
      })
    }
    return paths
  }
  const entries = []
  for (const item of objects) {
    if (!item.enabled || !item.name.trim()) continue
    const containers = objectPaths(item.parentId).map((parent) => [...parent, item.name.trim()])
    for (const segments of containers) {
      entries.push(entryFor(pointer(segments), item, null, 'object', true, item.dynamicKey))
      if (item.dynamicKey) {
        const value = valueAtSegments(bridge.state, segments)
        if (isObject(value)) for (const [key, child] of Object.entries(value)) {
          entries.push(entryFor(pointer([...segments, key]), item, null, inferredType(child), isObject(child), isObject(child)))
        }
      }
    }
  }
  for (const item of variables) {
    if (!item.enabled || !item.title.trim()) continue
    for (const parent of objectPaths(item.objectId)) entries.push(entryFor(pointer([...parent, item.title.trim()]), null, item, item.type || 'string', false, false))
  }
  const configured = new Set(entries.filter((entry) => entry.variable).map((entry) => entry.path))
  const infer = (value, segments) => {
    const path = pointer(segments)
    if (configured.has(path)) return
    entries.push(entryFor(path, null, null, inferredType(value), isObject(value), isObject(value)))
    if (isObject(value)) for (const [key, child] of Object.entries(value)) infer(child, [...segments, key])
  }
  for (const [key, value] of Object.entries(bridge.state)) infer(value, [key])
  const unique = new Map()
  for (const entry of entries) if (!unique.has(entry.path)) unique.set(entry.path, entry)
  return [...unique.values()].sort((left, right) => Number(right.readMode === 'required') - Number(left.readMode === 'required') || left.path.localeCompare(right.path, 'zh-CN'))
}

function entryFor(path, object, variable, type, objectContainer, allowsDynamicChildren) {
  return {
    path,
    variable,
    object,
    type,
    objectContainer,
    allowsDynamicChildren,
    title: variable?.title || object?.name || pointerLeaf(path),
    description: variable?.description || object?.description || '',
    updateRule: variable?.updateRule || object?.updateRule || '',
    readMode: variable?.readMode === 'required' ? 'required' : 'on_demand',
  }
}

function applyOperations(source, operations) {
  const state = structuredClone(source)
  operations.forEach((operation, index) => {
    if (!isObject(operation) || !['replace', 'delta', 'insert', 'remove'].includes(operation.op)) throw patchError(index, '不支持的 op')
    const segments = parsePointer(operation.path, index)
    if (!segments.length) throw patchError(index, '不允许直接修改根对象')
    if (segments.some((segment) => segment.startsWith('*'))) throw patchError(index, '不能修改以 * 开头的只读变量')
    if (operation.op !== 'remove' && !Object.hasOwn(operation, 'value')) throw patchError(index, '缺少 value')
    const target = resolveTarget(state, segments, index, operation.op === 'insert')
    if (Array.isArray(target.parent)) applyArrayOperation(target.parent, target.key, operation, index)
    else if (isObject(target.parent)) applyObjectOperation(target.parent, target.key, operation, index)
    else throw patchError(index, '父级不是 object 或 array')
  })
  return state
}

function applyObjectOperation(parent, key, operation, index) {
  const exists = Object.hasOwn(parent, key)
  if (operation.op === 'insert') {
    if (exists) throw patchError(index, 'insert 的对象字段已经存在')
    parent[key] = operation.value
  } else if (operation.op === 'replace') {
    if (!exists) throw patchError(index, 'replace 的目标不存在')
    parent[key] = operation.value
  } else if (operation.op === 'delta') {
    if (!exists || typeof parent[key] !== 'number' || typeof operation.value !== 'number') throw patchError(index, 'delta 的目标和值必须是数字')
    const value = parent[key] + operation.value
    if (!Number.isFinite(value)) throw patchError(index, 'delta 数值无法计算')
    parent[key] = value
  } else {
    if (!exists) throw patchError(index, 'remove 的目标不存在')
    delete parent[key]
  }
}

function applyArrayOperation(parent, key, operation, index) {
  const arrayIndex = key === '-' && operation.op === 'insert' ? parent.length : arrayIndexOf(key, index)
  if (operation.op === 'insert') {
    if (arrayIndex > parent.length) throw patchError(index, '数组插入索引超出范围')
    parent.splice(arrayIndex, 0, operation.value)
  } else {
    if (arrayIndex >= parent.length) throw patchError(index, '数组索引超出范围')
    if (operation.op === 'replace') parent[arrayIndex] = operation.value
    else if (operation.op === 'delta') {
      if (typeof parent[arrayIndex] !== 'number' || typeof operation.value !== 'number') throw patchError(index, 'delta 的目标和值必须是数字')
      parent[arrayIndex] += operation.value
    } else parent.splice(arrayIndex, 1)
  }
}

function resolveTarget(root, segments, index, createParents) {
  let current = root
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) {
      const childIndex = arrayIndexOf(segment, index)
      if (childIndex >= current.length) throw patchError(index, '数组索引超出范围')
      current = current[childIndex]
    } else if (isObject(current)) {
      if (!Object.hasOwn(current, segment)) {
        if (!createParents) throw patchError(index, '路径中的对象字段不存在：' + segment)
        current[segment] = {}
      }
      current = current[segment]
    } else throw patchError(index, '路径经过了不能包含子项的值：' + segment)
  }
  return { parent: current, key: segments.at(-1) }
}

function validateWithZod(source, state) {
  try {
    const normalized = String(source).replace(/export\s+const\s+Schema\s*=/, 'const Schema =').replace(/export\s+default\s+/, 'const Schema = ')
    let schema
    try { schema = new Function('z', '"use strict"; ' + normalized + '; return typeof Schema !== "undefined" ? Schema : undefined;')(z) } catch { schema = undefined }
    if (!schema) schema = new Function('z', '"use strict"; return (' + source + ');')(z)
    if (!schema || typeof schema.safeParse !== 'function') return { ok: false, detail: '总校验配置没有返回 Zod schema' }
    const result = schema.safeParse(state)
    return result.success ? { ok: true, state: result.data } : { ok: false, detail: JSON.stringify(result.error.issues || result.error, null, 2).slice(0, 8000) }
  } catch (error) {
    return { ok: false, detail: errorMessage(error).slice(0, 8000) }
  }
}

function normalizationConflicts(patched, normalized, operations) {
  const conflicts = []
  for (const rawPath of operationPaths(operations)) {
    const path = rawPath.endsWith('/-') ? rawPath.slice(0, -2) : rawPath
    const before = valueAtPointer(patched, path)
    if (!before.present) {
      if (valueAtPointer(normalized, path).present) conflicts.push(path)
      continue
    }
    for (const leafPath of persistedLeafPaths(before.value, path)) {
      if (!valueAtPointer(normalized, leafPath).present) conflicts.push(leafPath)
    }
  }
  return [...new Set(conflicts)]
}

function persistedLeafPaths(value, path) {
  if (isObject(value)) {
    const keys = Object.keys(value)
    return keys.length ? keys.flatMap((key) => persistedLeafPaths(value[key], path + '/' + encodePointer(key))) : [path]
  }
  if (Array.isArray(value)) {
    return value.length ? value.flatMap((item, index) => persistedLeafPaths(item, path + '/' + index)) : [path]
  }
  return [path]
}

function valueAtPointer(root, path) {
  let current = root
  for (const segment of parsePointer(path)) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment) || Number(segment) >= current.length) return { present: false, value: null }
      current = current[Number(segment)]
    } else if (isObject(current) && Object.hasOwn(current, segment)) current = current[segment]
    else return { present: false, value: null }
  }
  return { present: true, value: current }
}

function valueAtSegments(root, segments) {
  let current = root
  for (const segment of segments) {
    if (!isObject(current) || !Object.hasOwn(current, segment)) return undefined
    current = current[segment]
  }
  return current
}

function searchableText(entry, bridge) {
  const initial = valueAtPointer(bridge.config.initialState, entry.path)
  const current = valueAtPointer(bridge.state, entry.path)
  return ['# ' + entry.path, 'type: ' + entry.type, 'title: ' + entry.title, 'read_mode: ' + entry.readMode,
    'default: ' + JSON.stringify(initial.value), 'current: ' + JSON.stringify(current.value),
    'description: ' + entry.description, 'update_rule: ' + entry.updateRule].join('\n')
}

function globRegex(pattern) {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === '*' && pattern[index + 1] === '*') { source += '.*'; index += 1 }
    else if (character === '*') source += '[^/]*'
    else if (character === '?') source += '[^/]'
    else source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  }
  return new RegExp(source + '$')
}

function matchCount(text, expression) {
  const flags = expression.flags.includes('g') ? expression.flags : expression.flags + 'g'
  return [...text.matchAll(new RegExp(expression.source, flags))].length
}

function grepContent(content, expression, multiline) {
  const sourceLines = content.split('\n')
  if (!multiline) {
    const lines = []
    let count = 0
    sourceLines.forEach((text, index) => {
      const matches = matchCount(text, expression)
      if (matches > 0) lines.push({ line: index + 1, text, match_count: matches })
      count += matches
    })
    return { count, lines }
  }

  const flags = expression.flags.includes('g') ? expression.flags : expression.flags + 'g'
  const matches = [...content.matchAll(new RegExp(expression.source, flags))]
  const countByLine = new Map()
  for (const match of matches) {
    const line = content.slice(0, match.index || 0).split('\n').length
    countByLine.set(line, (countByLine.get(line) || 0) + 1)
  }
  return {
    count: matches.length,
    lines: [...countByLine].map(([line, count]) => ({ line, text: sourceLines[line - 1] || '', match_count: count })),
  }
}

function normalizeScope(value) {
  const raw = String(value || '').trim().replace(/\/$/, '')
  if (!raw || raw === '/') return ''
  const path = raw.startsWith('/') ? raw : '/' + raw
  try { parsePointer(path); return path } catch { return null }
}

function validScope(catalog, scope) {
  return !scope || catalog.some((entry) => entry.path === scope && entry.objectContainer)
}

function inScope(catalog, scope) {
  return catalog.filter((entry) => !scope || entry.path === scope || entry.path.startsWith(scope + '/'))
}

function relativePath(path, scope) {
  return (scope ? path.slice(scope.length) : path).replace(/^\//, '')
}

function requiredVariables(catalog) {
  return catalog.filter((entry) => entry.readMode === 'required').map((entry) => candidateJson(entry))
}

function candidateJson(entry) {
  return { path: entry.path, read_mode: entry.readMode, ...(entry.readMode === 'required' ? { title: entry.title } : {}) }
}

function pointer(segments) { return '/' + segments.map(encodePointer).join('/') }
function pointerLeaf(path) { return decodePointer(path.split('/').at(-1) || '') }
function encodePointer(value) { return String(value).replace(/~/g, '~0').replace(/\//g, '~1') }
function decodePointer(value) {
  if (/~(?:[^01]|$)/.test(value)) throw new Error('path 包含无效的 JSON Pointer 转义')
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}
function parsePointer(path, index = 0) {
  if (typeof path !== 'string' || !path.startsWith('/')) throw patchError(index, 'path 必须以 / 开头')
  if (path === '/') return ['']
  return path.slice(1).split('/').map(decodePointer)
}
function arrayIndexOf(value, index) {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw patchError(index, '无效的数组索引：' + value)
  return Number(value)
}
function patchError(index, message) { return new Error('变量更新命令第 ' + (index + 1) + ' 项无效：' + message) }
function operationPaths(operations) { return [...new Set(operations.map((item) => item.path).filter((path) => typeof path === 'string'))] }
function inferredType(value) { return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value }
function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value) }
function failure(status, message) { return { status, message } }
function errorMessage(error) { return error instanceof Error ? error.message : String(error) }
