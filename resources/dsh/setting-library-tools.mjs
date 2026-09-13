import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'eleckoi-setting-library-tools'
export const inject = ['tools']

export function apply(ctx) {
  if (process.env.ELECKOI_SETTING_LIBRARY_ENABLED !== '1' || !process.env.ELECKOI_SETTING_LIBRARY_STATE_FILE) return
  return [
    ctx.tools.register(globTool()),
    ctx.tools.register(grepTool()),
    ctx.tools.register(readTool()),
    ctx.tools.register(patchTool())
  ]
}

function globTool() {
  return defineTool({
    name: 'eleckoi_glob_setting_files',
    description: '按 Glob 查找当前对话可读取的虚拟设定文件。路径使用 / 分隔且不带 .md 后缀；required_files 包含固定必读、关键词命中和变量条件/EJS 触发后晋升的本回合必读设定。',
    parameters: {
      pattern: { type: 'string', description: '路径 Glob，例如 **、世界/**、**/*角色*。' },
      path: { type: 'string', description: '可选的精确目录路径；留空表示整个设定库。' }
    },
    output: output(),
    async execute(args) {
      const catalog = await runtimeCatalogOf(readBridge())
      const scope = normalizePath(args.path || '', true)
      if (scope === null || !directoryExists(catalog, scope)) return fail('invalid_path', 'path 必须是当前虚拟设定库中真实存在的目录。')
      let matcher
      try { matcher = globRegex(String(args.pattern || '**').trim() || '**') } catch (error) { return fail('glob_error', message(error)) }
      const entries = catalog.entries.filter((entry) => inScope(entry.path, scope) && matcher.test(relative(entry.path, scope)))
      return {
        status: entries.length ? 'ok' : 'no_matches',
        path: scope,
        required_files: requiredFiles(catalog),
        files: entries.slice(0, 100).map(summary),
        truncated: entries.length > 100,
        omitted: Math.max(0, entries.length - 100)
      }
    }
  })
}

function grepTool() {
  return defineTool({
    name: 'eleckoi_grep_setting_files',
    description: '用正则搜索当前对话虚拟设定文件的路径、读取提示和正文。找到路径后使用读取工具取得完整正文；required_files 是本回合晋升后的必读设定。',
    parameters: {
      pattern: { type: 'string', required: true, description: 'JavaScript 正则表达式。' },
      path: { type: 'string', description: '可选目录路径。' },
      glob: { type: 'string', description: '可选路径 Glob。' },
      output_mode: { type: 'string', enum: ['files_with_matches', 'content', 'count'] },
      ignore_case: { type: 'boolean' },
      limit: { type: 'integer' }
    },
    output: output(),
    async execute(args) {
      if (!String(args.pattern || '')) return fail('invalid_arguments', 'pattern 不能为空。')
      const catalog = await runtimeCatalogOf(readBridge())
      const scope = normalizePath(args.path || '', true)
      if (scope === null || !directoryExists(catalog, scope)) return fail('invalid_path', 'path 必须是当前虚拟设定库中真实存在的目录。')
      let expression, pathMatcher
      try {
        expression = new RegExp(String(args.pattern), args.ignore_case ? 'i' : '')
        pathMatcher = args.glob ? globRegex(String(args.glob)) : null
      } catch (error) { return fail('grep_error', message(error)) }
      const mode = args.output_mode || 'files_with_matches'
      const limit = Math.max(1, Math.min(1000, Number.isInteger(args.limit) ? args.limit : 100))
      const matches = []
      for (const entry of catalog.entries) {
        if (!inScope(entry.path, scope) || (pathMatcher && !pathMatcher.test(relative(entry.path, scope)))) continue
        const lines = (`${entry.path}\n${entry.selectionHint}\n${entry.content}`).split('\n')
        const hit = lines.flatMap((text, index) => expression.test(text) ? [{ line: index + 1, text }] : [])
        if (!hit.length) continue
        if (mode === 'content') matches.push(...hit.map((line) => ({ ...summary(entry), ...line })))
        else if (mode === 'count') matches.push({ ...summary(entry), count: hit.length })
        else matches.push(summary(entry))
      }
      return { status: matches.length ? 'ok' : 'no_matches', required_files: requiredFiles(catalog), matches: matches.slice(0, limit), omitted: Math.max(0, matches.length - limit) }
    }
  })
}

function readTool() {
  return defineTool({
    name: 'eleckoi_read_setting_files',
    description: '读取 Glob 或 Grep 已返回的虚拟设定文件完整正文。路径没有 .md 后缀；不得猜测路径；不会修改设定。',
    parameters: { paths: { type: 'array', items: { type: 'string' }, required: true, description: '1 到 16 个完整虚拟设定文件路径。' } },
    output: output(),
    async execute(args) {
      const paths = [...new Set((args.paths || []).map((path) => normalizePath(path, false)).filter(Boolean))]
      if (!paths.length || paths.length > 16) return fail('invalid_arguments', '一次必须读取 1 到 16 个文件。')
      const catalog = await runtimeCatalogOf(readBridge())
      const byPath = new Map(catalog.entries.map((entry) => [entry.path, entry]))
      const missing = paths.filter((path) => !byPath.has(path))
      if (missing.length) return { ...fail('not_found', '存在当前虚拟设定库没有的路径，请重新使用 Glob 或 Grep。'), paths: missing }
      let remaining = 120000
      return { status: 'ok', files: paths.map((path) => {
        const entry = byPath.get(path)
        const content = entry.content.slice(0, Math.min(40000, remaining)); remaining -= content.length
        return { ...summary(entry), group_path: entry.groupPath, selection_hint: entry.selectionHint, read_strategy: entry.readStrategy, content, truncated: content.length < entry.content.length }
      }) }
    }
  })
}

function patchTool() {
  return defineTool({
    name: 'eleckoi_apply_setting_patch',
    description: '对当前对话的虚拟设定执行一个结构化文件操作，修改只保存为当前对话差异，不会改动作者原设定。支持 write_file、edit_file、make_directory、move_file、move_directory、delete_file、delete_directory；路径使用 / 分隔且不带 .md 后缀。先用 Glob 或 Read 确认真实路径；一次调用只执行一个操作，失败时不提交。',
    parameters: {
      operation: { type: 'string', required: true, enum: ['write_file', 'edit_file', 'make_directory', 'move_file', 'move_directory', 'delete_file', 'delete_directory'], description: '要执行的单个文件操作。' },
      path: { type: 'string', required: true, description: '源文件或目录的完整逻辑路径。' },
      destination: { type: 'string', description: 'move_file 或 move_directory 的目标完整逻辑路径。' },
      content: { type: 'string', description: 'write_file 要写入的完整正文。' },
      selection_hint: { type: 'string', description: 'write_file 可选的 Agent 读取提示。' },
      old_string: { type: 'string', description: 'edit_file 要精确匹配的原文片段。' },
      new_string: { type: 'string', description: 'edit_file 的替换文本，可以为空字符串。' },
      replace_all: { type: 'boolean', description: 'edit_file 是否替换全部匹配；默认 false。' },
      overwrite: { type: 'boolean', description: 'move_file 遇到同名目标文件时是否覆盖；默认 true。' }
    },
    output: output(),
    async execute(args) {
      const bridge = readBridge()
      const original = structuredClone(bridge.library)
      try {
        const result = applyOperation(bridge.library, args)
        delete bridge.runtimeResolution
        writeBridge(bridge)
        return { status: 'ok', scope: 'current_conversation', ...result }
      } catch (error) {
        bridge.library = original
        return { ...fail('change_rejected', message(error)), state_unchanged: true }
      }
    }
  })
}

function applyOperation(library, args) {
  const operation = String(args.operation || '')
  const path = requiredPath(args.path)
  if (operation === 'write_file') return writeFile(library, path, args)
  if (operation === 'edit_file') return editFile(library, path, args)
  if (operation === 'make_directory') {
    const existed = Boolean(groupIdAt(library, path))
    ensureDirectory(library, path)
    return { operation, path, changed: !existed }
  }
  if (operation === 'move_file') return moveFile(library, path, requiredPath(args.destination), args.overwrite !== false)
  if (operation === 'move_directory') return moveDirectory(library, path, requiredPath(args.destination))
  if (operation === 'delete_file') return deleteFile(library, path)
  if (operation === 'delete_directory') return deleteDirectory(library, path)
  throw new Error(`不支持 operation：${operation}`)
}

function writeFile(library, path, args) {
  if (typeof args.content !== 'string') throw new Error('write_file 缺少 content。')
  const catalog = catalogOf(library)
  const current = catalog.byPath.get(path)
  if (groupIdAt(library, path)) throw new Error(`无法写入文件：${path} 已是目录。`)
  const { parent, leaf } = splitPath(path)
  const groupId = ensureDirectory(library, parent)
  const timestamp = new Date().toISOString()
  if (current) {
    Object.assign(current.raw, {
      title: leaf,
      groupId,
      content: args.content,
      agentSelectionHint: args.selection_hint === undefined
        ? current.raw.agentSelectionHint
        : normalizeSelectionHint(args.selection_hint),
      updatedAt: timestamp
    })
    return { operation: 'write_file', path, created: false, changed: true }
  }
  library.entries.push({
    id: randomUUID(), title: leaf, iconId: 'setting', kind: 'normal', groupId, content: args.content,
    openingMessages: [], defaultOpeningMessageId: '', agentSelectionHint: normalizeSelectionHint(args.selection_hint),
    agentReadStrategy: 'normal', agentReadCondition: '', dynamicMode: 'single_condition', keywords: [], keywordScanDepth: 1,
    conditionKeywords: [], keywordCondition: 'none', keywordUseRegex: false, keywordIgnoreCase: true, keywordWholeWord: false,
    keywordRecursionDepth: 0, triggerMode: 'agent_tool', enabled: true, position: null, promptPositionId: '', insertRole: 'user',
    order: Math.max(0, ...library.entries.map((entry) => Number(entry.order) || 0)) + 1,
    viewOrder: library.entries.length + 1, groupViewOrder: library.entries.filter((entry) => entry.groupId === groupId).length + 1,
    treeViewOrder: library.entries.length + library.groups.length + 1, createdAt: timestamp, updatedAt: timestamp
  })
  return { operation: 'write_file', path, created: true, changed: true }
}

function editFile(library, path, args) {
  const entry = requireEntry(library, path)
  if (typeof args.old_string !== 'string') throw new Error('edit_file 缺少 old_string。')
  if (typeof args.new_string !== 'string') throw new Error('edit_file 缺少 new_string。')
  const oldText = args.old_string
  const newText = args.new_string
  if (!oldText) throw new Error('edit_file 的 old_string 不能为空。')
  if (oldText === newText) throw new Error('edit_file 的 old_string 和 new_string 不能相同。')
  const count = entry.content.split(oldText).length - 1
  if (!count) throw new Error('正文中找不到 old_string。')
  if (count > 1 && args.replace_all !== true) throw new Error('old_string 出现多次，请提供更精确的文本或启用 replace_all。')
  entry.content = args.replace_all === true ? entry.content.split(oldText).join(newText) : entry.content.replace(oldText, newText)
  entry.updatedAt = new Date().toISOString()
  return { operation: 'edit_file', path, replacements: args.replace_all === true ? count : 1, changed: true }
}

function moveFile(library, source, destination, overwrite) {
  const entry = requireEntry(library, source)
  if (source === destination) return { operation: 'move_file', path: source, destination, changed: false }
  if (groupIdAt(library, destination)) throw new Error(`无法移动文件：目标 ${destination} 是目录。`)
  const target = catalogOf(library).byPath.get(destination)
  if (target && target.raw.id !== entry.id && !overwrite) throw new Error('目标文件已存在。')
  if (target && target.raw.id !== entry.id) library.entries = library.entries.filter((item) => item.id !== target.raw.id)
  const { parent, leaf } = splitPath(destination)
  entry.groupId = ensureDirectory(library, parent); entry.title = leaf; entry.updatedAt = new Date().toISOString()
  return { operation: 'move_file', path: source, destination, changed: source !== destination }
}

function moveDirectory(library, source, destination) {
  if (!source) throw new Error('不能移动根目录。')
  const sourceId = groupIdAt(library, source)
  if (!sourceId) throw new Error('找不到源目录。')
  if (destination === source) return { operation: 'move_directory', path: source, destination, changed: false }
  if (destination.startsWith(`${source}/`)) throw new Error('目录不能移动到自己的子目录。')
  if (catalogOf(library).byPath.has(destination) || groupIdAt(library, destination)) throw new Error('目标路径已存在。')
  const { parent, leaf } = splitPath(destination)
  const targetParentId = ensureDirectory(library, parent)
  const group = library.groups.find((item) => item.id === sourceId)
  group.parentId = targetParentId; group.name = leaf; group.updatedAt = new Date().toISOString()
  return { operation: 'move_directory', path: source, destination, changed: true }
}

function deleteFile(library, path) {
  const entry = requireEntry(library, path)
  library.entries = library.entries.filter((item) => item.id !== entry.id)
  return { operation: 'delete_file', path, changed: true }
}

function deleteDirectory(library, path) {
  if (!path) throw new Error('不能删除根目录。')
  const groupId = groupIdAt(library, path)
  if (!groupId) throw new Error('找不到目录。')
  const ids = new Set([groupId])
  let changed = true
  while (changed) { changed = false; for (const group of library.groups) if (ids.has(group.parentId) && !ids.has(group.id)) { ids.add(group.id); changed = true } }
  library.groups = library.groups.filter((group) => !ids.has(group.id))
  library.entries = library.entries.filter((entry) => !ids.has(entry.groupId))
  return { operation: 'delete_directory', path, changed: true }
}

function catalogOf(library) {
  const groups = Array.isArray(library?.groups) ? library.groups : []
  const entries = Array.isArray(library?.entries) ? library.entries : []
  const byGroup = new Map(groups.map((group) => [group.id, group]))
  const groupPath = (id) => {
    const parts = [], visited = new Set(); let current = byGroup.get(id)
    while (current && !visited.has(current.id)) { visited.add(current.id); parts.unshift(safeSegment(current.name)); current = byGroup.get(current.parentId) }
    return parts.filter(Boolean).join('/')
  }
  const readable = entries.filter((entry) => !isFixedEntry(entry) && entry.enabled && entry.triggerMode === 'agent_tool' && (String(entry.content || '').trim() || entry.dynamicMode === 'ejs_reference')).map((raw) => {
    const path = [groupPath(raw.groupId), safeSegment(raw.title || '未命名设定')].filter(Boolean).join('/')
    return { raw, path, groupPath: groupPath(raw.groupId), content: String(raw.content || ''), selectionHint: String(raw.agentSelectionHint || ''), readStrategy: raw.agentReadStrategy || 'normal' }
  })
  return { entries: readable, groups, byGroup, byPath: new Map(readable.map((entry) => [entry.path, entry])), groupPath }
}

function isFixedEntry(entry) {
  return ['fixed-opening-assistant', 'built-in-roleplay-history-compaction'].includes(entry.id)
    || ['opening', 'history_compaction'].includes(entry.kind)
}

async function runtimeCatalogOf(bridge) {
  const catalog = catalogOf(bridge.library)
  if (bridge.runtimeResolution?.version === 1) return applyRuntimeResolution(catalog, bridge.runtimeResolution)
  const keywordEntries = catalog.entries.filter((entry) => entry.readStrategy === 'keyword')
  const keywordMatches = matchingKeywordEntryIds(keywordEntries, bridge.history)
  const variableState = objectValue(bridge.variableState)

  let entries = catalog.entries
    .filter((entry) => entry.readStrategy !== 'keyword' || keywordMatches.has(entry.raw.id))
    .map((entry) => keywordMatches.has(entry.raw.id) ? { ...entry, promotedToRequiredThisTurn: true } : entry)

  const conditionMatches = evaluateVariableConditions(
    entries.filter((entry) => entry.readStrategy === 'variable_condition' && entry.raw.dynamicMode !== 'ejs_controller' && entry.raw.dynamicMode !== 'ejs_reference'),
    variableState
  )
  entries = entries
    .filter((entry) => {
      if (entry.readStrategy !== 'variable_condition') return true
      if (entry.raw.dynamicMode === 'ejs_controller') return true
      if (entry.raw.dynamicMode === 'ejs_reference') return false
      return conditionMatches.get(entry.raw.id) === true
    })
    .map((entry) => conditionMatches.get(entry.raw.id) === true || (entry.readStrategy === 'variable_condition' && entry.raw.dynamicMode === 'ejs_controller')
      ? { ...entry, promotedToRequiredThisTurn: true }
      : entry)

  const ejsCandidates = catalog.entries.filter((entry) => entry.readStrategy === 'variable_condition')
  const messages = runtimeMessages(bridge.history)
  entries = (await Promise.all(entries.map(async (entry) => {
    if (entry.raw.dynamicMode !== 'ejs_controller') return entry
    const rendered = await renderEjsController(entry, ejsCandidates, variableState, messages)
    return { ...entry, content: rendered.content, resolvedReferences: rendered.references }
  }))).filter((entry) => entry.content.trim())

  const resolution = {
    version: 1,
    visibleEntryIds: entries.map((entry) => entry.raw.id),
    promotedEntryIds: entries.filter((entry) => entry.promotedToRequiredThisTurn === true).map((entry) => entry.raw.id),
    renderedContents: Object.fromEntries(entries
      .filter((entry) => entry.raw.dynamicMode === 'ejs_controller')
      .map((entry) => [entry.raw.id, entry.content])),
    resolvedReferences: Object.fromEntries(entries
      .filter((entry) => entry.resolvedReferences?.length)
      .map((entry) => [entry.raw.id, entry.resolvedReferences]))
  }
  bridge.runtimeResolution = resolution
  writeBridge(bridge)
  return applyRuntimeResolution(catalog, resolution)
}

function applyRuntimeResolution(catalog, resolution) {
  const visible = new Set(resolution.visibleEntryIds)
  const promoted = new Set(resolution.promotedEntryIds)
  const rendered = objectValue(resolution.renderedContents)
  const references = objectValue(resolution.resolvedReferences)
  const entries = catalog.entries
    .filter((entry) => visible.has(entry.raw.id))
    .map((entry) => ({
      ...entry,
      content: Object.hasOwn(rendered, entry.raw.id) ? String(rendered[entry.raw.id]) : entry.content,
      promotedToRequiredThisTurn: promoted.has(entry.raw.id),
      resolvedReferences: Array.isArray(references[entry.raw.id]) ? references[entry.raw.id] : []
    }))
  return { ...catalog, entries, byPath: new Map(entries.map((entry) => [entry.path, entry])) }
}

function matchingKeywordEntryIds(entries, rawHistory) {
  const history = runtimeMessages(rawHistory)
  const directMatches = entries.filter((entry) => matchesKeywordText(entry.raw, recentKeywordText(history, entry.raw.keywordScanDepth)))
  const matchedIds = new Set(directMatches.map((entry) => entry.raw.id))
  let frontier = new Map(directMatches.map((entry) => [entry, nonNegativeInteger(entry.raw.keywordRecursionDepth)]))

  while (frontier.size) {
    const nextFrontier = new Map()
    for (const [source, remainingRounds] of frontier) {
      if (remainingRounds <= 0 || !source.content.trim()) continue
      for (const candidate of entries) {
        if (matchedIds.has(candidate.raw.id) || !matchesKeywordText(candidate.raw, source.content)) continue
        matchedIds.add(candidate.raw.id)
        nextFrontier.set(candidate, Math.max(remainingRounds - 1, nonNegativeInteger(candidate.raw.keywordRecursionDepth)))
      }
    }
    frontier = nextFrontier
  }
  return matchedIds
}

function recentKeywordText(history, scanDepth) {
  return history
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => message.content)
    .filter((content) => content.trim())
    .slice(-Math.max(1, positiveInteger(scanDepth, 1)))
    .join('\n')
}

function matchesKeywordText(entry, text) {
  const keywords = stringList(entry.keywords)
  if (!keywords.length || !keywords.some((keyword) => containsKeyword(text, keyword, entry))) return false
  const conditionKeywords = stringList(entry.conditionKeywords)
  if (!conditionKeywords.length) return true
  const matches = conditionKeywords.map((keyword) => containsKeyword(text, keyword, entry))
  const condition = entry.keywordCondition === 'all' || entry.keywordCondition === 'not_any'
    ? entry.keywordCondition
    : 'any'
  if (condition === 'all') return matches.length > 0 && matches.every(Boolean)
  if (condition === 'not_any') return matches.every((matched) => !matched)
  return matches.some(Boolean)
}

function containsKeyword(text, rawKeyword, entry) {
  const keyword = String(rawKeyword || '').trim()
  if (!keyword) return false
  if (entry.keywordUseRegex === true) {
    const expression = compileTavernKeywordRegex(keyword, entry.keywordIgnoreCase !== false)
    if (!expression) return false
    expression.lastIndex = 0
    return expression.test(text)
  }
  if (entry.keywordWholeWord !== true || [...keyword].some(isCjk)) {
    return entry.keywordIgnoreCase === false
      ? text.includes(keyword)
      : text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())
  }
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(keyword)}(?![\\p{L}\\p{N}_])`, entry.keywordIgnoreCase === false ? 'u' : 'iu').test(text)
  } catch {
    return false
  }
}

function compileTavernKeywordRegex(value, ignoreCase) {
  const slash = value.startsWith('/') ? lastUnescapedSlash(value) : -1
  const delimited = slash > 0
  const body = delimited ? value.slice(1, slash) : value
  const rawFlags = delimited ? value.slice(slash + 1) : ''
  if ([...rawFlags].some((flag) => !'dgimsuvy'.includes(flag))) return null
  const flags = [...new Set(`${rawFlags}${ignoreCase ? 'i' : ''}`)].join('')
  try { return new RegExp(body, flags) } catch { return null }
}

function lastUnescapedSlash(value) {
  for (let index = value.length - 1; index > 0; index -= 1) {
    if (value[index] !== '/') continue
    let escapes = 0
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) escapes += 1
    if (escapes % 2 === 0) return index
  }
  return -1
}

function evaluateVariableConditions(entries, state) {
  const matches = new Map()
  const getvar = createGetvar(state)
  for (const entry of entries) {
    const expression = String(entry.raw.agentReadCondition || '').trim()
    if (!expression) {
      matches.set(entry.raw.id, false)
      continue
    }
    const evaluate = new Function('getvar', 'variables', 'stat_data', `return Boolean((${expression}));`)
    matches.set(entry.raw.id, evaluate(getvar, state, state))
  }
  return matches
}

async function renderEjsController(target, candidates, state, messages) {
  const references = []
  const renderStack = []
  const sources = candidates.filter((candidate) => candidate.raw.id === target.raw.id || candidate.raw.dynamicMode === 'ejs_reference' || candidate.raw.dynamicMode === 'ejs_controller')
  const sourceByName = new Map()
  for (const source of sources) {
    if (source.raw.title) sourceByName.set(source.raw.title, source)
    if (source.path) sourceByName.set(source.path, source)
  }
  const getvar = createGetvar(state)
  const lastMessageId = messages.length ? messages.at(-1).id : 0
  const context = {
    getvar,
    variables: state,
    stat_data: state,
    matchChatMessages: createMessageMatcher(messages),
    _: createLodashCompat(),
    lastMessageId,
    TavernHelper: { getLastMessageId: () => lastMessageId }
  }

  async function render(source) {
    if (!source.content.includes('<%')) return source.content
    if (renderStack.includes(source.raw.id)) throw new Error(`getwi 循环引用：${[...renderStack, source.raw.id].join(' -> ')}`)
    renderStack.push(source.raw.id)
    try {
      const getwi = async (...args) => {
        const requested = [...args].reverse().find((value) => typeof value === 'string' && value.trim())
        if (!requested) return ''
        const nested = sourceByName.get(requested)
        if (!nested) throw new Error(`getwi 找不到条目：${requested}`)
        references.push({ id: nested.raw.id, title: nested.raw.title || '', path: nested.path })
        return render(nested)
      }
      return await compileEjs(source.content)({ ...context, getwi }, toText)
    } finally {
      renderStack.pop()
    }
  }

  return {
    content: await render(target),
    references: [...new Map(references.map((reference) => [reference.id, reference])).values()]
  }
}

function compileEjs(template) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const pattern = /<%([_=%\-#]?)([\s\S]*?)([-_]?%>)/g
  let cursor = 0
  let trimNext = ''
  let code = 'let __out = ""; const print = (...values) => { __out += values.map(__toText).join(" "); };'
  let match
  const appendText = (raw) => {
    let text = raw
    if (trimNext === 'all') text = text.replace(/^\s+/, '')
    if (trimNext === 'line') text = text.replace(/^\r?\n/, '')
    trimNext = ''
    if (text) code += `__out += ${JSON.stringify(text)};`
  }
  while ((match = pattern.exec(template)) !== null) {
    let text = template.slice(cursor, match.index)
    if (match[1] === '_') text = text.replace(/\s+$/, '')
    appendText(text)
    const marker = match[1]
    const body = match[2]
    if (marker === '=' || marker === '-') code += `__out += __toText((${body}));`
    else if (marker === '%') code += `__out += '<%' + ${JSON.stringify(body)} + '%>';`
    else if (marker !== '#') code += body
    trimNext = match[3].startsWith('_') ? 'all' : match[3].startsWith('-') ? 'line' : ''
    cursor = pattern.lastIndex
  }
  appendText(template.slice(cursor))
  code += 'return __out;'
  return new AsyncFunction('ctx', '__toText', `with (ctx) { ${code} }`)
}

function createMessageMatcher(messages) {
  return (pattern, options = {}) => {
    let selected = messages
    if (options.role) selected = selected.filter((message) => message.role === options.role)
    const start = Number.isInteger(options.start) ? options.start : -2
    const end = Number.isInteger(options.end) ? options.end : selected.length
    const from = start < 0 ? Math.max(selected.length + start, 0) : Math.min(start, selected.length)
    const to = end < 0 ? Math.max(selected.length + end, 0) : Math.min(end, selected.length)
    const patterns = (Array.isArray(pattern) ? pattern : [pattern]).map(asPattern)
    return selected.slice(from, to).some((message) => options.and === true
      ? patterns.every((expression) => testPattern(expression, message.content))
      : patterns.some((expression) => testPattern(expression, message.content)))
  }
}

function asPattern(value) {
  if (value instanceof RegExp) return value
  const text = String(value ?? '')
  const match = text.match(/^\/(.*)\/([dgimsuvy]*)$/)
  try { return match ? new RegExp(match[1], match[2]) : new RegExp(text) }
  catch { return { test: (candidate) => String(candidate).includes(text), lastIndex: 0 } }
}

function testPattern(expression, text) {
  expression.lastIndex = 0
  return expression.test(text)
}

function createLodashCompat() {
  const lodash = (value) => {
    let current = value
    return {
      pickBy(predicate) { current = Object.fromEntries(Object.entries(current ?? {}).filter(([key, item]) => predicate(item, key))); return this },
      values() { current = Object.values(current ?? {}); return this },
      value() { return current }
    }
  }
  lodash.get = (value, path, fallback) => readPath(value, path) ?? fallback
  lodash.values = (value) => Object.values(value ?? {})
  lodash.pickBy = (value, predicate) => Object.fromEntries(Object.entries(value ?? {}).filter(([key, item]) => predicate(item, key)))
  lodash.clamp = (number, lower, upper) => Math.min(Math.max(number, lower), upper)
  lodash.random = (lower = 0, upper = 1) => Math.floor(Math.random() * (upper - lower + 1)) + lower
  lodash.sample = (collection) => {
    const values = Array.isArray(collection) ? collection : Object.values(collection ?? {})
    return values.length ? values[Math.floor(Math.random() * values.length)] : undefined
  }
  return lodash
}

function createGetvar(state) {
  return (key, options = {}) => {
    if (key == null || !String(key).trim()) return state
    const segments = pathSegments(key)
    if (segments[0] === 'stat_data') segments.shift()
    const value = readPath(state, segments)
    return value === undefined && Object.hasOwn(options ?? {}, 'defaults') ? options.defaults : value
  }
}

function readPath(root, path) {
  const segments = Array.isArray(path) ? path : pathSegments(path)
  let value = root
  for (const segment of segments) {
    if (value == null || !Object.hasOwn(Object(value), segment)) return undefined
    value = value[segment]
  }
  return value
}

function pathSegments(path) {
  return String(path ?? '').trim()
    .replace(/\[\s*["']?([^\]"']+)["']?\s*\]/g, '.$1')
    .split('.')
    .map((value) => value.trim())
    .filter(Boolean)
}

function runtimeMessages(rawHistory) {
  return (Array.isArray(rawHistory) ? rawHistory : [])
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .map((item, index) => ({ id: item.id ?? index + 1, role: item.role, content: String(item.content || '') }))
}

function stringList(value) { return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [] }
function objectValue(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function positiveInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback }
function nonNegativeInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : 0 }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function isCjk(character) { const code = character.codePointAt(0); return code >= 0x3400 && code <= 0x9fff }
function toText(value) { return value == null ? '' : String(value) }

function ensureDirectory(library, path) {
  if (!path) return ''
  const parts = path.split('/'); let parentId = ''; let currentPath = ''
  for (const name of parts) {
    currentPath = [currentPath, name].filter(Boolean).join('/')
    if (catalogOf(library).byPath.has(currentPath)) throw new Error(`无法创建目录：${currentPath} 已是文件。`)
    let group = library.groups.find((item) => item.parentId === parentId && safeSegment(item.name) === name)
    if (!group) {
      const timestamp = new Date().toISOString()
      group = { id: randomUUID(), name, parentId, order: library.groups.length + 1, treeViewOrder: library.groups.length + library.entries.length + 1, createdAt: timestamp, updatedAt: timestamp }
      library.groups.push(group)
    }
    parentId = group.id
  }
  return parentId
}

function groupIdAt(library, path) {
  let parentId = ''
  for (const name of path.split('/').filter(Boolean)) {
    const group = library.groups.find((item) => item.parentId === parentId && safeSegment(item.name) === name)
    if (!group) return ''
    parentId = group.id
  }
  return parentId
}

function requireEntry(library, path) {
  const entry = catalogOf(library).byPath.get(path)?.raw
  if (!entry) throw new Error(`找不到设定文件：${path}`)
  return entry
}

function readBridge() {
  const bridge = JSON.parse(readFileSync(process.env.ELECKOI_SETTING_LIBRARY_STATE_FILE, 'utf8'))
  if (!bridge?.enabled || !bridge.library) throw new Error('设定库运行时尚未准备好。')
  return bridge
}
function writeBridge(value) { writeFileSync(process.env.ELECKOI_SETTING_LIBRARY_STATE_FILE, JSON.stringify(value, null, 2), 'utf8') }
function output() { return { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] } }
function requiredFiles(catalog) { return catalog.entries.filter((entry) => entry.readStrategy === 'required' || entry.promotedToRequiredThisTurn === true).map(summary) }
function summary(entry) { return { path: entry.path, title: entry.raw.title, read_strategy: entry.readStrategy, selection_hint: entry.selectionHint } }
function directoryExists(catalog, path) { return !path || catalog.groups.some((group) => catalog.groupPath(group.id) === path) }
function inScope(path, scope) { return !scope || path.startsWith(`${scope}/`) }
function relative(path, scope) { return scope ? path.slice(scope.length + 1) : path }
function splitPath(path) { const parts = path.split('/'); return { parent: parts.slice(0, -1).join('/'), leaf: parts.at(-1) } }
function requiredPath(value) { const path = normalizePath(value, false); if (!path) throw new Error('path 必须是非空的安全虚拟路径。'); return path }
function normalizePath(value, allowRoot) {
  const segments = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  if (!segments.length) return allowRoot ? '' : null
  if (segments.some((part) => part === '.' || part === '..' || safeSegment(part) !== part)) return null
  return segments.join('/')
}
function safeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 72) || '未命名'
}
function normalizeSelectionHint(value) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 200) }
function globRegex(pattern) {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === '*' && pattern[index + 1] === '*') { source += '.*'; index += 1 }
    else if (character === '*') source += '[^/]*'
    else if (character === '?') source += '[^/]'
    else source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  }
  return new RegExp(`${source}$`)
}
function fail(status, detail) { return { status, message: detail } }
function message(error) { return error instanceof Error ? error.message : String(error) }
