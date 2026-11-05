import { defineTool } from '@deepseek-ai/dsh-tools'
import { describeVariableRuleFailure } from '@eleckoi/dsh-product-data/variables'
import { readToolResult, resultReadParameter } from '@eleckoi/dsh-client-roleplay/host/tool-result-access.mjs'
import {
  ELECKOI_FAILURE_CODES,
  isCodedFailure,
  runRuntimePluginApply,
  runtimePluginFailure,
  withRuntimePluginExit
} from './runtime-plugin-failure.mjs'

const fixedObjectId = 'fixed-variable-initialization-object'
export const name = 'eleckoi-variable-tools'
export const inject = ['tools', 'eleckoiVariableProcessing', 'eleckoiRuntimeContexts']

export function apply(ctx) {
  return runRuntimePluginApply(ctx, name, () => {
    const register = (definition) => ctx.tools.register(withRuntimePluginExit(ctx, name, definition))
    return [
      register(globTool(ctx)),
      register(grepTool(ctx)),
      register(readTool(ctx)),
      register(patchTool(ctx)),
    ]
  })
}

function outputDefinition() {
  return {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

function globTool(ctx) {
  return defineTool({
    name: 'eleckoi_glob_variables',
    description: '使用 Glob 查找虚拟变量路径。每轮最终回复前至少调用一次；省略 pattern 和 path，以 ** 一次列出全部变量路径及当前 required_variables。已有完整路径就直接读取；仅需筛选已知变量组时传 path，它会递归搜索子组。同一轮变量结构未变化时不要重复相同搜索。返回真实 JSON Pointer 路径，不返回完整值或规则。required_variables 不受 pattern 或 path 影响，本回合必须逐项读取。',
    parameters: {
      pattern: { type: 'string', description: '变量路径 Glob，例如 **、角色/**、**/*好感*。' },
      path: { type: 'string', description: '可选的精确变量组 JSON Pointer；留空表示全部变量，指定后递归搜索该组下的变量。' },
    },
    output: outputDefinition(),
    async execute(args, exec) {
      const bridge = readVariables(ctx, exec)
      if (!bridge.enabled) return {
        status: 'ok', pattern: String(args.pattern || '**').trim() || '**', path: '',
        required_variables: [], paths: [], truncated: false, omitted: 0
      }
      const catalog = variableCatalog(bridge)
      const scope = normalizeScope(args.path)
      if (scope === null || !validScope(catalog, scope)) return failure('invalid_path', 'path 必须是当前变量配置中真实存在的 JSON Pointer 变量组。')
      const pattern = String(args.pattern || '**').trim() || '**'
      let matcher
      try { matcher = globRegex(pattern) } catch (error) { return failure('glob_error', errorMessage(error)) }
      const scoped = inScope(catalog, scope)
      const selected = scoped.filter((entry) => matcher.test(relativePath(entry.path, scope)))
      return {
        status: selected.length ? 'ok' : 'no_matches',
        pattern,
        path: scope,
        required_variables: requiredVariables(catalog),
        paths: selected.map((entry) => entry.path),
        truncated: false,
        omitted: 0,
      }
    },
  })
}

function grepTool(ctx) {
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
    },
    output: outputDefinition(),
    async execute(args, exec) {
      const pattern = String(args.pattern || '')
      if (!pattern) return failure('invalid_arguments', 'pattern 不能为空。')
      const bridge = readVariables(ctx, exec)
      if (!bridge.enabled) return {
        status: 'no_matches', pattern, path: '', output_mode: args.output_mode || 'files_with_matches',
        required_variables: [], matches: [], omitted: 0
      }
      const catalog = variableCatalog(bridge)
      const scope = normalizeScope(args.path)
      if (scope === null || !validScope(catalog, scope)) return failure('invalid_path', 'path 必须是当前变量配置中真实存在的 JSON Pointer 变量组。')
      const mode = args.output_mode || 'files_with_matches'
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
        matches,
      }
    },
  })
}

function readTool(ctx) {
  return defineTool({
    name: 'eleckoi_read_variables',
    description: '按 JSON Pointer 读取当前回合变量，给出当前值、默认值、说明和完整更新规则。默认返回完整值，也可显式按子项或字符分页；大结果按溢出提示通过本入口续读。每轮先用变量 Glob 获取 required_variables 并读取这些必读变量；上轮读取不能代替本轮状态。修改前应先读并遵守作者规则。变量工具结果溢出时，只传 result 按提示续读全文或搜索结果文件。',
    parameters: {
      paths: { type: 'array', items: { type: 'string' }, description: '普通读取必填：一个或多个完整变量 JSON Pointer 路径；与 result 二选一。可使用分页结果返回的精确子路径继续读取。' },
      result: resultReadParameter,
      offset: { type: 'integer', description: '对象或数组的子项起始位置，默认 0。' },
      limit: { type: 'integer', description: '可选的本页子项数；省略时返回其余全部子项。' },
      char_offset: { type: 'integer', description: '长文本的字符起始位置，默认 0。' },
      char_limit: { type: 'integer', description: '可选的本页字符数；省略时返回其余完整文本。' },
    },
    output: outputDefinition(),
    async execute(args, exec) {
      if (Object.hasOwn(args, 'result')) return readToolResult(ctx, args, exec, 'variables')
      const paths = [...new Set((args.paths || []).filter((path) => typeof path === 'string' && path.startsWith('/')))]
      if (!paths.length) return failure('invalid_arguments', '至少需要读取一个变量路径。')
      const bridge = readVariables(ctx, exec)
      if (!bridge.enabled) return { status: 'ok', variables: [] }
      const catalog = variableCatalog(bridge)
      const options = {
        offset: nonnegativeInteger(args.offset, 0),
        limit: args.limit === undefined ? undefined : positiveInteger(args.limit),
        charOffset: nonnegativeInteger(args.char_offset, 0),
        charLimit: args.char_limit === undefined ? undefined : positiveInteger(args.char_limit),
      }
      const resolved = paths.map((path) => {
        const entry = catalogEntryForPath(catalog, path)
        const current = valueAtPointer(bridge.state, path)
        const initial = valueAtPointer(bridge.config.initialState, path)
        return { path, entry, current, initial }
      })
      const missing = resolved.filter((item) => !item.entry || (!item.current.present && !item.initial.present)).map((item) => item.path)
      if (missing.length) return { ...failure('not_found', '存在当前变量配置中没有的路径，请重新使用 Glob 或 Grep。'), paths: missing }
      return {
        status: 'ok',
        variables: resolved.map(({ path, entry, current, initial }) => {
          return {
            path,
            ...(entry.path === path ? {} : { configured_path: entry.path }),
            read_mode: entry.readMode,
            type: inferredType(current.present ? current.value : initial.value),
            default: pageVariableValue(initial, path, options),
            current: pageVariableValue(current, path, options),
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

function patchTool(ctx) {
  const processing = ctx.eleckoiVariableProcessing
  return defineTool({
    name: 'eleckoi_apply_variable_patch',
    description: '修改剧情运行时变量值。支持 replace、delta、insert、remove；path 使用 JSON Pointer。状态只保存当前值，不要用 value/min/max/description/update_rule 包装简单值。作者 Zod 校验失败时状态不改变。',
    parameters: {
      operations: {
        type: 'array',
        required: true,
        description: '按顺序执行的非空变量补丁列表。',
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
    async execute(args, exec) {
      if (!args.operations.length) return failure('invalid_arguments', 'operations 不能为空。')
      const runtime = ctx.eleckoiRuntimeContexts.get(exec?.agent?.session?.id)
      const bridge = readVariables(ctx, exec)
      if (!bridge.enabled) return {
        status: 'ok', applied_operations: 0, paths: [], state_unchanged: true
      }
      let next, patched
      try {
        const snapshot = runtime
        if (!snapshot.conversationId || !processing) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '当前 Session 缺少受管变量处理服务或聊天归属。', { what: '变量处理服务' })
        const processed = await processing.process({ conversationId: snapshot.conversationId,
          before: bridge.state, schemaCode: bridge.config.schemaCode, signal: exec.signal,
          apply: state => {
            try { return applyOperations(state, args.operations) }
            catch (error) {
              // 已带契约码的失败不再盖补丁戳（盖了会把码表里的码换成 VARIABLE_PATCH_ERROR）。
              if (!isCodedFailure(error)) error.code = 'VARIABLE_PATCH_ERROR'
              throw error
            }
          } })
        next = processed.state
        patched = processed.patched
      } catch (error) {
        if (exec.signal?.aborted) throw exec.signal.reason
        // 边界④：带码失败不是作者规则失败，原样抛给 apply() 装的统一出口（日志与再抛都在那里）。
        if (isCodedFailure(error)) throw error
        if (error.code === 'VARIABLE_PATCH_ERROR') return { ...failure('patch_error', errorMessage(error)), paths: operationPaths(args.operations), state_unchanged: true }
        const validation = describeVariableRuleFailure(error)
        return {
          ...failure(validation.error_stage === 'validation' ? 'validation_error' : 'rule_error',
            validation.error_stage === 'validation' ? '变量状态不符合 Zod 规则' : '作者变量规则处理失败'),
          ...validation,
          ...(error.code ? { error_code: error.code } : {}),
          schema_source: 'author_rules',
          paths: operationPaths(args.operations),
          state_unchanged: true,
          repair_guidance: validation.error_stage === 'validation'
            ? '本次修改未生效。按 issues 中的字段与原因修改参数后，可再次调用变量工具；不要重复已成功的补丁。'
            : '本次修改未生效。请报告作者规则处理失败的阶段与原因；不能把它当作变量值校验失败或已更新成功。',
        }
      }
      if (bridge.config.schemaCode.trim()) {
        const conflicts = normalizationConflicts(patched, next, args.operations)
        if (conflicts.length) return {
          ...failure('normalization_conflict', '作者 Zod 归一化结果没有保留本次修改路径。'),
          detail: '未保留的路径：' + conflicts.join('、'),
          schema_source: 'author_zod',
          paths: conflicts,
          state_unchanged: true,
        }
      }
      exec.signal?.throwIfAborted()
      if (ctx.eleckoiRuntimeContexts.get(exec?.agent?.session?.id) !== runtime || runtime.variables !== bridge) return { ...failure('state_conflict', '处理期间本轮变量已变化，请重新读取后再试。'), state_unchanged: true }
      runtime.variables = { ...bridge, state: next }
      return {
        status: 'ok',
        applied_operations: args.operations.length,
        paths: operationPaths(args.operations),
        message: '变量补丁已通过校验并暂存，将随本回合成功完成后提交。',
      }
    },
  })
}

function readVariables(ctx, exec) {
  const value = ctx.eleckoiRuntimeContexts.get(exec?.agent?.session?.id).variables
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isObject(value.state)) {
    throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '变量运行时尚未准备好。', { what: '变量运行时' })
  }
  if (value.enabled && (!isObject(value.config) || !isObject(value.config.initialState))) {
    throw runtimePluginFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量运行时配置不正确。', { what: '变量运行时配置' })
  }
  return value
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

function catalogEntryForPath(catalog, path) {
  const candidates = catalog.filter((entry) => path === entry.path || path.startsWith(entry.path + '/'))
  const authored = candidates.filter((entry) => entry.variable || entry.object)
  return (authored.length ? authored : candidates).sort((left, right) => right.path.length - left.path.length)[0]
}

function pageVariableValue(result, path, options) {
  if (!result.present) return null
  const value = result.value
  if (typeof value === 'string' && (options.charLimit !== undefined || options.charOffset > 0)) {
    const text = value.slice(options.charOffset, options.charLimit === undefined ? undefined : options.charOffset + options.charLimit)
    const nextOffset = options.charOffset + text.length
    return {
      kind: 'text_page',
      text,
      total_chars: value.length,
      char_offset: options.charOffset,
      ...(options.charLimit === undefined ? {} : { char_limit: options.charLimit }),
      returned_chars: text.length,
      has_more: nextOffset < value.length,
      ...(nextOffset < value.length ? { next_char_offset: nextOffset } : {}),
    }
  }
  const pairs = Array.isArray(value)
    ? value.map((item, index) => ({ key: index, value: item }))
    : isObject(value)
      ? Object.entries(value).map(([key, item]) => ({ key, value: item }))
      : null
  if (pairs === null) return value

  const selected = pairs.slice(options.offset, options.limit === undefined ? undefined : options.offset + options.limit)
  const entries = selected.map(pair => ({ key: pair.key, path: `${path}/${encodePointer(pair.key)}`, value: pair.value }))
  const nextOffset = options.offset + entries.length
  return {
    kind: Array.isArray(value) ? 'array_page' : 'object_page',
    total: pairs.length,
    offset: options.offset,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    returned: entries.length,
    has_more: nextOffset < pairs.length,
    ...(nextOffset < pairs.length ? { next_offset: nextOffset } : {}),
    entries,
  }
}

function nonnegativeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

function positiveInteger(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid, '分页数量必须是正整数。', { field: 'limit' })
  return value
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
  if (/~(?:[^01]|$)/.test(value)) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'path 包含无效的 JSON Pointer 转义', { field: 'path' })
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
