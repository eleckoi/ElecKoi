import { catalogOf, directoryExists, inScope, relative, normalizePath, safeSegment, globRegex, settingReferenceIndex } from './virtual-setting-directory.mjs'
import { randomUUID } from 'node:crypto'
import ejs from 'ejs/ejs.min.js'
import lodash from 'lodash'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { requiredSettingCache } from './required-setting-cache.mjs'
import { readToolResult, resultReadParameter } from '@eleckoi/dsh-client-roleplay/host/tool-result-access.mjs'
import {
  ELECKOI_FAILURE_CODES,
  isCodedFailure,
  recordRuntimePluginFailure,
  runRuntimePluginApply,
  runtimePluginFailure,
  withRuntimePluginExit
} from './runtime-plugin-failure.mjs'

export const name = 'eleckoi-setting-library-tools'
export const inject = ['tools', 'eleckoiProductData', 'eleckoiCharacterConfigurationChanges', 'eleckoiRuntimeContexts']

const requiredEntriesReadInstruction = 'required_entries 是独立于本次搜索范围的完整必读清单，包含常驻必读和关键词命中条目。有未读或正文已变化的条目时，须把其中每一条本轮尚未读取或正文已变化的完整 path 原样放进同一次 eleckoi_read_setting_files 的 paths 数组，cached_reference 也包含在内。AI 选读条目按当前对话需要读取。搜索用于定位，读取以工具回执为准。本轮已读且正文未变化的条目无需重复读取。'
const selectedTemplatesByTurn = new WeakMap()

export function apply(ctx) {
  return runRuntimePluginApply(ctx, name, () => {
    const register = (definition) => ctx.tools.register(withRuntimePluginExit(ctx, name, definition))
    return [
      register(globTool(ctx)),
      register(grepTool(ctx)),
      register(readTool(ctx)),
      register(patchTool(ctx))
    ]
  })
}

function globTool(ctx) {
  return defineTool({
    name: 'eleckoi_glob_setting_files',
    description: `按 Glob 查找当前对话可读取的虚拟设定文件。需要本轮必读清单时，省略 pattern 和 path，以 ** 一次列出全部当前可读路径及 required_entries。已有完整路径就直接读取；仅需筛选已知目录时传 path，它会递归搜索子目录。同一轮目录和条件未变化时不要重复相同搜索，变化后可重新搜索。返回完整路径、标题和作者注释，不返回正文。路径使用 / 分隔且不带 .md 后缀。${requiredEntriesReadInstruction}`,
    parameters: {
      pattern: { type: 'string', description: '路径 Glob，例如 **、世界/**、**/*角色*。' },
      path: { type: 'string', description: '可选的精确目录路径；留空表示整个设定库，指定后递归搜索该目录下的条目。' }
    },
    output: output(),
    async execute(args, exec) {
      const bridge = readSettings(ctx, exec)
      if (!bridge.enabled) return { status: 'ok', path: '', required_entries: [], files: [] }
      const catalog = await currentCatalog(ctx, exec)
      const scope = normalizePath(args.path || '', true)
      if (scope === null || !directoryExists(catalog, scope)) return fail('invalid_path', 'path 必须是当前虚拟设定库中真实存在的目录。')
      let matcher
      try { matcher = globRegex(String(args.pattern || '**').trim() || '**') } catch (error) { return fail('glob_error', message(error)) }
      const entries = catalog.entries.filter((entry) => inScope(entry.path, scope) && matcher.test(relative(entry.path, scope)))
      return {
        status: entries.length ? 'ok' : 'no_matches',
        path: scope,
        required_entries: requiredFiles(catalog),
        files: entries.map((entry) => summary(entry, catalog))
      }
    }
  })
}

function grepTool(ctx) {
  return defineTool({
    name: 'eleckoi_grep_setting_files',
    description: `用正则搜索当前对话虚拟设定文件的路径、读取提示和正文。AI 选读的 EJS 条目可按路径和读取提示查找，点名读取时才处理模板正文。${requiredEntriesReadInstruction}`,
    parameters: {
      pattern: { type: 'string', required: true, description: 'JavaScript 正则表达式。' },
      path: { type: 'string', description: '可选目录路径。' },
      glob: { type: 'string', description: '可选路径 Glob。' },
      output_mode: { type: 'string', enum: ['files_with_matches', 'content', 'count'] },
      ignore_case: { type: 'boolean' }
    },
    output: output(),
    async execute(args, exec) {
      if (!String(args.pattern || '')) return fail('invalid_arguments', 'pattern 不能为空。')
      const bridge = readSettings(ctx, exec)
      if (!bridge.enabled) return { status: 'no_matches', required_entries: [], matches: [] }
      const catalog = await currentCatalog(ctx, exec)
      const scope = normalizePath(args.path || '', true)
      if (scope === null || !directoryExists(catalog, scope)) return fail('invalid_path', 'path 必须是当前虚拟设定库中真实存在的目录。')
      let expression, pathMatcher
      try {
        expression = new RegExp(String(args.pattern), args.ignore_case ? 'i' : '')
        pathMatcher = args.glob ? globRegex(String(args.glob)) : null
      } catch (error) { return fail('grep_error', message(error)) }
      const mode = args.output_mode || 'files_with_matches'
      const matches = []
      for (const entry of catalog.entries) {
        if (!inScope(entry.path, scope) || (pathMatcher && !pathMatcher.test(relative(entry.path, scope)))) continue
        const content = isOnDemandTemplate(entry) ? '' : entry.content
        const lines = (`${entry.path}\n${entry.selectionHint}\n${content}`).split('\n')
        const hit = lines.flatMap((text, index) => expression.test(text) ? [{ line: index + 1, text }] : [])
        if (!hit.length) continue
        if (mode === 'content') matches.push(...hit.map((line) => ({ ...summary(entry, catalog), ...line })))
        else if (mode === 'count') matches.push({ ...summary(entry, catalog), count: hit.length })
        else matches.push(summary(entry, catalog))
      }
      return {
        status: matches.length ? 'ok' : 'no_matches',
        required_entries: requiredFiles(catalog),
        matches
      }
    }
  })
}

function readTool(ctx) {
  return defineTool({
    name: 'eleckoi_read_setting_files',
    description: '按完整路径读取当前可用的虚拟设定文件。已知准确路径时无需重新搜索。路径没有 .md 后缀，须使用目录给出的真实路径。缓存中的常驻必读返回编号与标题，其余条目返回正文。结果溢出时，只传 result 按提示续读。',
    parameters: { paths: { type: 'array', items: { type: 'string' }, description: '普通读取必填，与 result 二选一。读取必读清单时，一次传入 required_entries 中本轮未读或正文已变化的全部 path，含 cached_reference。' }, result: resultReadParameter },
    output: output(),
    async execute(args, exec) {
      if (Object.hasOwn(args, 'result')) return readToolResult(ctx, args, exec, 'settings')
      const paths = [...new Set((args.paths || []).map((path) => normalizePath(path, false)).filter(Boolean))]
      if (!paths.length) return fail('invalid_arguments', '至少需要读取一个文件。')
      const bridge = readSettings(ctx, exec)
      if (!bridge.enabled) return { status: 'ok', files: [] }
      return currentCatalog(ctx, exec, async (catalog, state) => {
        const missing = paths.filter(path => !catalog.byPath.has(path))
        if (missing.length) return { ...fail('not_found', '存在当前虚拟设定库没有的路径，请重新使用 Glob 或 Grep。'), paths: missing }
        const files = await Promise.all(paths.map(async path => {
          const source = catalog.byPath.get(path)
          const entry = isOnDemandTemplate(source) ? await readSelectedTemplate(source, state, catalog) : source
          const cached = cachedReference(entry, catalog)
          const file = {
            ...summary(entry, catalog),
            group_path: entry.groupPath,
            content_mode: entry.raw.contentMode === 'ejs' ? 'ejs' : 'plain_text'
          }
          if (entry.renderError) return file
          return { ...file,
            resolved_references: (entry.resolvedReferences || []).map((reference) => ({ title: reference.title })),
            content: cached ? cached.receipt : entry.content }
        }))
        const errors = files.filter(file => file.content_delivery === 'error')
        return { status: errors.length ? 'partial' : 'ok', files, ...(errors.length ? { errors } : {}) }
      })
    }
  })
}

const writeFileArguments = 'write_file 必须传 path 和 content。content 是要保存的完整设定正文。selection_hint 可以省略，仅提示何时读取该设定。'

function patchTool(ctx) {
  return defineTool({
    name: 'eleckoi_apply_setting_patch',
    description: `对当前对话的角色虚拟设定执行一个文件操作，修改只保存为当前对话差异。${writeFileArguments} edit_file 需传 old_string 和 new_string，move_file 和 move_directory 需传 destination。还支持 make_directory、delete_file 和 delete_directory。路径使用 / 分隔且不带 .md 后缀，先用 Glob 或 Read 核对路径或新文件的父目录。全局设定库是共享只读资源，须在全局设定库编辑器修改。`,
    parameters: {
      operation: { type: 'string', required: true, enum: ['write_file', 'edit_file', 'make_directory', 'move_file', 'move_directory', 'delete_file', 'delete_directory'], description: '要执行的单个文件操作。' },
      path: { type: 'string', required: true, description: '源文件或目录的完整逻辑路径。' },
      destination: { type: 'string', description: 'move_file 或 move_directory 的目标完整逻辑路径。' },
      content: { type: 'string', description: '选择 write_file 时必填。这里填写要实际保存的完整设定正文。' },
      selection_hint: { type: 'string', description: 'write_file 可选。这里仅填写何时读取该条设定的简短提示，完整正文填入 content。' },
      old_string: { type: 'string', description: 'edit_file 要精确匹配的原文片段。' },
      new_string: { type: 'string', description: 'edit_file 的替换文本，可以为空字符串。' },
      replace_all: { type: 'boolean', description: 'edit_file 是否替换全部匹配；默认 false。' },
      overwrite: { type: 'boolean', description: 'move_file 遇到同名目标文件时是否覆盖；默认 true。' }
    },
    output: output(),
    async execute(args, exec) {
      const state = ctx.eleckoiRuntimeContexts.get(exec.agent?.session?.id)
      const bridge = readSettings(ctx, exec)
      if (!bridge.enabled) return { status: 'ok', scope: 'current_conversation', changed: false }
      try {
        exec.signal?.throwIfAborted()
        const library = structuredClone(bridge.library)
        const result = applyOperation(library, args)
        if (!result.changed) return { status: 'ok', scope: 'current_conversation', ...result }
        const snapshot = state
        if (!snapshot.conversationId || !snapshot.settingLibraryBaseline) {
          throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '当前对话缺少设定持久化上下文。', { what: '设定持久化上下文' })
        }
        ctx.eleckoiProductData.commitConversationRuntime(
          snapshot.conversationId,
          undefined,
          JSON.stringify(library),
          snapshot.settingLibraryBaseline
        )
        state.settings = { ...bridge, library, runtimeResolution: undefined }
        // Notification failure must not turn a committed change into a failed tool result.
        try {
          ctx.eleckoiCharacterConfigurationChanges.publish({
            kind: 'configuration', domain: 'settingLibraries',
            characterId: snapshot.settingLibraryBaseline.source.characterId
          })
        } catch (error) {
          ctx.logger?.warn(`分支设定刷新通知失败：${message(error)}`)
        }
        return { status: 'ok', scope: 'current_conversation', ...result }
      } catch (error) {
        // 边界④：被拒的修改也走统一出口落一行诊断（码 + 开发者文案 + 详情 + 操作名），再按工具结果返回。
        const failure = recordRuntimePluginFailure(ctx, name, String(args.operation || 'apply_setting_patch'), error)
        const rejected = { ...fail('change_rejected', failure.message), state_unchanged: true }
        if (args.operation === 'write_file' && failure.code === ELECKOI_FAILURE_CODES.inputInvalid && failure.details?.field === 'content') {
          return {
            ...rejected,
            code: failure.code,
            recovery: {
              arguments_to_keep: { operation: 'write_file', path: args.path },
              missing_fields: ['content'],
              instruction: `${writeFileArguments} 请先补齐 content，再对同一路径重新调用；如需保留原读取提示，可继续传 selection_hint。`
            }
          }
        }
        return rejected
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
  throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputUnsupported, `不支持 operation：${operation}`, {
    what: '这个文件操作',
    expected: 'write_file、edit_file、make_directory、move_file、move_directory、delete_file、delete_directory'
  })
}

function writeFile(library, path, args) {
  if (typeof args.content !== 'string') throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'write_file 缺少 content。', { field: 'content' })
  const catalog = catalogOf(library)
  const current = catalog.byPath.get(path)
  if (current) assertMutableEntry(current.raw)
  if (groupIdAt(library, path)) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupDuplicate, `无法写入文件：${path} 已是目录。`, { what: '文件路径', path })
  const { parent, leaf } = splitPath(path)
  const groupId = ensureDirectory(library, parent)
  const timestamp = new Date().toISOString()
  if (current) {
    const selectionHint = args.selection_hint === undefined
      ? current.raw.agentSelectionHint : normalizeSelectionHint(args.selection_hint)
    if (current.raw.content === args.content && current.raw.agentSelectionHint === selectionHint) {
      return { operation: 'write_file', path, created: false, changed: false }
    }
    Object.assign(current.raw, {
      content: args.content,
      agentSelectionHint: selectionHint,
      updatedAt: timestamp
    })
    return { operation: 'write_file', path, created: false, changed: true }
  }
  library.entries.push({
    id: randomUUID(), title: leaf, iconId: 'setting', kind: 'normal', groupId, content: args.content,
    openingMessages: [], defaultOpeningMessageId: '', agentSelectionHint: normalizeSelectionHint(args.selection_hint),
    agentReadStrategy: 'normal', contentMode: 'plain_text', keywords: [], keywordScanDepth: 1,
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
  if (typeof args.old_string !== 'string') throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'edit_file 缺少 old_string。', { field: 'old_string' })
  if (typeof args.new_string !== 'string') throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'edit_file 缺少 new_string。', { field: 'new_string' })
  const oldText = args.old_string
  const newText = args.new_string
  if (!oldText) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'edit_file 的 old_string 不能为空。', { field: 'old_string' })
  if (oldText === newText) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'edit_file 的 old_string 和 new_string 不能相同。', { field: 'new_string' })
  const count = entry.content.split(oldText).length - 1
  if (!count) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '正文中找不到 old_string。', { what: '要替换的原文片段' })
  if (count > 1 && args.replace_all !== true) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupDuplicate, 'old_string 出现多次，请提供更精确的文本或启用 replace_all。', { what: '要替换的原文片段', path })
  entry.content = args.replace_all === true ? entry.content.split(oldText).join(newText) : entry.content.replace(oldText, newText)
  entry.updatedAt = new Date().toISOString()
  return { operation: 'edit_file', path, replacements: args.replace_all === true ? count : 1, changed: true }
}

function moveFile(library, source, destination, overwrite) {
  const entry = requireEntry(library, source)
  if (source === destination) return { operation: 'move_file', path: source, destination, changed: false }
  if (groupIdAt(library, destination)) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupDuplicate, `无法移动文件：目标 ${destination} 是目录。`, { what: '目录', path: destination })
  const target = catalogOf(library).byPath.get(destination)
  if (target) assertMutableEntry(target.raw)
  if (target && target.raw.id !== entry.id && !overwrite) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupDuplicate, '目标文件已存在。', { what: '目标文件', path: destination })
  if (target && target.raw.id !== entry.id) library.entries = library.entries.filter((item) => item.id !== target.raw.id)
  const { parent, leaf } = splitPath(destination)
  entry.groupId = ensureDirectory(library, parent); entry.title = leaf; entry.updatedAt = new Date().toISOString()
  return { operation: 'move_file', path: source, destination, changed: source !== destination }
}

function moveDirectory(library, source, destination) {
  if (!source) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.securityDenied, '不能移动根目录。', { what: '根目录', guard: '虚拟设定库根路径' })
  const sourceId = groupIdAt(library, source)
  if (!sourceId) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到源目录。', { what: '源目录' })
  assertMutableGroup(sourceId)
  if (destination === source) return { operation: 'move_directory', path: source, destination, changed: false }
  if (destination.startsWith(`${source}/`)) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid, '目录不能移动到自己的子目录。', { field: 'destination' })
  if (catalogOf(library).byPath.has(destination) || groupIdAt(library, destination)) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupDuplicate, '目标路径已存在。', { what: '目标路径', path: destination })
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
  if (!path) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.securityDenied, '不能删除根目录。', { what: '根目录', guard: '虚拟设定库根路径' })
  const groupId = groupIdAt(library, path)
  if (!groupId) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到目录。', { what: '目录' })
  assertMutableGroup(groupId)
  const ids = new Set([groupId])
  let changed = true
  while (changed) { changed = false; for (const group of library.groups) if (ids.has(group.parentId) && !ids.has(group.id)) { ids.add(group.id); changed = true } }
  for (const id of ids) assertMutableGroup(id)
  for (const entry of library.entries) if (ids.has(entry.groupId)) assertMutableEntry(entry)
  library.groups = library.groups.filter((group) => !ids.has(group.id))
  library.entries = library.entries.filter((entry) => !ids.has(entry.groupId))
  return { operation: 'delete_directory', path, changed: true }
}


async function currentCatalog(ctx, exec, read) {
  while (true) {
    const state = readSettings(ctx, exec)
    const catalog = await runtimeCatalogOf(state)
    if (readSettings(ctx, exec) !== state) continue
    if (!read) return catalog
    const result = await read(catalog, state)
    if (readSettings(ctx, exec) === state) return result
  }
}

function isOnDemandTemplate(entry) {
  return entry.readStrategy === 'normal' && entry.raw.contentMode === 'ejs'
}

async function renderToolTemplate(entry, references, variables, messages) {
  try {
    const rendered = await renderEjsController(entry, references, variables, messages)
    return { ...entry, content: rendered.content, resolvedReferences: rendered.references }
  } catch (error) {
    return { ...entry, content: '', renderError: { code: 'ejs_render_failed', message: message(error) } }
  }
}

function readSelectedTemplate(entry, bridge, catalog) {
  let turn = selectedTemplatesByTurn.get(bridge)
  if (!turn) {
    turn = {
      references: settingReferenceIndex(bridge.library, catalog),
      variables: objectValue(bridge.variableState),
      messages: runtimeMessages(bridge.history),
      results: new Map()
    }
    selectedTemplatesByTurn.set(bridge, turn)
  }
  let result = turn.results.get(entry.raw.id)
  if (!result) {
    result = renderToolTemplate(entry, turn.references, turn.variables, turn.messages)
    turn.results.set(entry.raw.id, result)
  }
  return result
}

async function runtimeCatalogOf(bridge) {
  const catalog = catalogOf(bridge.library)
  const original = catalogOf(bridge.frozenLibrary || bridge.library)
  catalog.requiredCache = requiredSettingCache(bridge.frozenLibrary || bridge.library)
    .map((item) => ({ ...item, path: original.entries.find((entry) => entry.raw.id === item.id)?.path }))
  if (bridge.runtimeResolution?.version === 2) return applyRuntimeResolution(catalog, bridge.runtimeResolution)
  const keywordEntries = catalog.entries.filter((entry) => entry.readStrategy === 'keyword')
  const keywordMatches = matchingKeywordEntryIds(keywordEntries, bridge.history)
  const variableState = objectValue(bridge.variableState)

  let entries = catalog.entries
    .filter((entry) => entry.readStrategy !== 'keyword' || keywordMatches.has(entry.raw.id))
    .map((entry) => keywordMatches.has(entry.raw.id) ? { ...entry, promotedToRequiredThisTurn: true } : entry)
  const messages = runtimeMessages(bridge.history)
  const shouldRender = entry => entry.raw.contentMode === 'ejs' && !isOnDemandTemplate(entry)
  const references = entries.some(shouldRender) ? settingReferenceIndex(bridge.library, catalog) : null
  entries = (await Promise.all(entries.map(entry => shouldRender(entry)
    ? renderToolTemplate(entry, references, variableState, messages)
    : entry))).filter(entry => entry.content.trim() || entry.renderError)

  const resolution = {
    version: 2,
    visibleEntryIds: entries.map((entry) => entry.raw.id),
    promotedEntryIds: entries.filter((entry) => entry.promotedToRequiredThisTurn === true).map((entry) => entry.raw.id),
    renderedContents: Object.fromEntries(entries
      .filter(shouldRender)
      .map((entry) => [entry.raw.id, entry.content])),
    renderErrors: Object.fromEntries(entries
      .filter((entry) => entry.renderError)
      .map((entry) => [entry.raw.id, entry.renderError])),
    resolvedReferences: Object.fromEntries(entries
      .filter((entry) => entry.resolvedReferences?.length)
      .map((entry) => [entry.raw.id, entry.resolvedReferences]))
  }
  bridge.runtimeResolution = resolution
  return applyRuntimeResolution(catalog, resolution)
}

function applyRuntimeResolution(catalog, resolution) {
  const visible = new Set(resolution.visibleEntryIds)
  const promoted = new Set(resolution.promotedEntryIds)
  const rendered = objectValue(resolution.renderedContents)
  const renderErrors = objectValue(resolution.renderErrors)
  const references = objectValue(resolution.resolvedReferences)
  const entries = catalog.entries
    .filter((entry) => visible.has(entry.raw.id))
    .map((entry) => {
      const renderError = renderErrors[entry.raw.id]
      return {
        ...entry,
        content: renderError ? '' : Object.hasOwn(rendered, entry.raw.id) ? String(rendered[entry.raw.id]) : entry.content,
        ...(renderError ? { renderError } : {}),
        promotedToRequiredThisTurn: promoted.has(entry.raw.id),
        resolvedReferences: Array.isArray(references[entry.raw.id]) ? references[entry.raw.id] : []
      }
    })
    .filter((entry) => entry.content.trim() || entry.renderError)
  return { ...catalog, entries, byPath: new Map(entries.map((entry) => [entry.path, entry])) }
}

function matchingKeywordEntryIds(entries, rawHistory) {
  const history = runtimeMessages(rawHistory)
  const directMatches = entries.filter((entry) => matchesKeywordText(entry.raw, keywordHaystack(history, entry.raw.keywordScanDepth)))
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

function keywordHaystack(history, scanDepth) {
  const messages = history
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => message.content)
    .filter((content) => content.trim())
    .slice(-Math.max(1, positiveInteger(scanDepth, 1)))
  if (!messages.length) return ''
  return `\x01${messages.join('\n\x01')}`
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

async function renderEjsController(target, sourceByName, state, messages) {
  const references = []
  const getvar = createGetvar(state)
  const getLocalVar = (key, options = {}) => getvar(key, options)
  const getMessageVar = createMessageVarReader(messages, state)
  const { getChatMessage, getChatMessages } = createChatReaders(messages)
  const lastMessageId = messages.length ? messages.at(-1).id : 0
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || ''
  const context = {
    getvar,
    getLocalVar,
    getMessageVar,
    getChatMessage,
    getChatMessages,
    variables: state,
    stat_data: state,
    matchChatMessages: createMessageMatcher(messages),
    _: lodash,
    lastMessageId,
    lastUserMessage
  }

  const render = async (source, ancestors) => {
    const chain = [...ancestors, source]
    if (ancestors.some(ancestor => ancestor.raw.id === source.raw.id)) {
      throw runtimePluginFailure(ELECKOI_FAILURE_CODES.statePrecondition,
        `EJS 引用形成循环：${chain.map(item => item.path).join(' → ')}`, { what: '不循环的 EJS 引用链' })
    }
    const getwi = async (referenceOrLibrary, referenceName) => {
      const requested = referenceName === undefined ? referenceOrLibrary : referenceName
      if (typeof requested !== 'string' || !requested.trim()) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'getwi 必须指定设定的标题或完整路径。', { field: 'getwi' })
      const matches = sourceByName.get(requested)
      if (!matches) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `getwi 找不到设定：${requested}`, { what: '设定' })
      if (matches.length !== 1) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupDuplicate, `getwi 引用标题不唯一，请使用完整路径：${requested}`, { what: '设定标题' })
      const nested = matches[0]
      references.push({ id: nested.raw.id, title: nested.raw.title || '', path: nested.path })
      if (nested.raw.contentMode === 'plain_text') return nested.content
      if (nested.raw.contentMode === 'ejs') return render(nested, chain)
      throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputUnsupported, `EJS 引用设定的正文模式不受支持：${requested}`, { what: 'EJS 引用设定的正文模式', expected: 'plain_text 或 ejs' })
    }
    return compileEjs(source.content, source.path)({ ...context, getwi })
  }

  return {
    content: await render(target, []),
    references: [...new Map(references.map((reference) => [reference.id, reference])).values()]
  }
}

function compileEjs(template, filename = 'setting-controller.ejs') {
  // Extend the output helper; template parsing and code generation remain owned by EJS.
  const printBinding = '<% print = ((append) => (...values) => values.forEach(append))(print); %>'
  const render = ejs.compile(printBinding + template, { client: true, async: true, outputFunctionName: 'print', filename })
  return context => render.call(context, context, toText)
}

/** Render enabled templates that have an explicit insertion position. */
export function resolvePlacedSettingTemplates(context, history, variables, host) {
  const library = context?.settingLibrary
  const templates = library?.entries?.filter(entry => entry.kind === 'normal' && entry.contentMode === 'ejs'
    && entry.enabled && entry.triggerMode === 'always' && entry.position)
  if (!templates?.length) return context
  const catalog = catalogOf(library)
  const references = settingReferenceIndex(library, catalog)
  const messages = runtimeMessages(history)
  const state = objectValue(variables)
  return Promise.all(templates.map(async raw => {
    const path = [catalog.groupPath(raw.groupId), safeSegment(raw.title || '未命名设定')].filter(Boolean).join('/')
    try {
      const result = await renderEjsController({ raw, path, content: raw.content }, references, state, messages)
      return [raw.id, { ...raw, content: result.content }]
    } catch (error) {
      const failure = isCodedFailure(error) ? error : runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid,
        `设定 ${path} 的 EJS 渲染失败：${message(error)}`, { field: 'content', path })
      recordRuntimePluginFailure(host, name, 'render_placed_setting', failure)
      return [raw.id, null]
    }
  })).then(results => {
    const rendered = new Map(results)
    const entries = library.entries.map(entry => rendered.has(entry.id) ? rendered.get(entry.id) : entry).filter(Boolean)
    return { ...context, settingLibrary: { ...library, entries } }
  })
}

function createChatReaders(messages) {
  const select = role => role ? messages.filter(message => message.role === role) : messages
  return {
    getChatMessage: (index, role) => select(role).at(index)?.content ?? '',
    getChatMessages: (startOrCount = messages.length, endOrRole, role) => {
      const selected = select(typeof endOrRole === 'string' ? endOrRole : role)
      const result = typeof endOrRole === 'number'
        ? selected.slice(startOrCount, endOrRole)
        : startOrCount < 0 ? selected.slice(startOrCount) : selected.slice(0, startOrCount)
      return result.map(message => message.content)
    }
  }
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

function createGetvar(state) {
  return (key, options = {}) => {
    const segments = pathSegments(key)
    if (segments[0] === 'stat_data') segments.shift()
    const value = key == null || !String(key).trim() ? state : readPath(state, segments)
    const result = value === undefined && Object.hasOwn(options ?? {}, 'defaults') ? options.defaults : value
    return options?.clone ? lodash.cloneDeep(result) : result
  }
}

function createMessageVarReader(messages, fallbackState) {
  return (key, options = {}) => {
    const requested = options?.withMsg ?? options?.message ?? options?.messageId ?? options?.message_id
    const message = requested === undefined
      ? messages.at(-1)
      : selectRuntimeMessage(messages, requested)
    const state = message?.variableState || fallbackState
    return createGetvar(state)(key, options)
  }
}

function selectRuntimeMessage(messages, requested) {
  if (requested && typeof requested === 'object') {
    if (requested.id !== undefined) return selectRuntimeMessage(messages, requested.id)
    if (requested.message_id !== undefined) return selectRuntimeMessage(messages, requested.message_id)
  }
  if (requested === 'latest' || requested === undefined) return messages.at(-1)
  const text = String(requested)
  const byId = messages.find((message) => String(message.id) === text)
  if (byId) return byId
  const index = Number(requested)
  return Number.isInteger(index) ? messages.at(index < 0 ? index : index - 1) : undefined
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
    .map((item, index) => ({
      id: item.id ?? index + 1,
      role: item.role,
      content: String(item.content || ''),
      variableState: objectValue(item.variableState)
    }))
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
    if (catalogOf(library).byPath.has(currentPath)) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupDuplicate, `无法创建目录：${currentPath} 已是文件。`, { what: '文件路径', path: currentPath })
    let group = library.groups.find((item) => item.parentId === parentId && safeSegment(item.name) === name)
    if (group) assertMutableGroup(group.id)
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
  if (!entry) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `找不到设定文件：${path}`, { what: '设定文件' })
  assertMutableEntry(entry)
  return entry
}

function assertMutableGroup(id) {
  if (id.startsWith('agent-preset:')) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.securityDenied, 'Agent 预设只能读取，不能写入聊天分支。', { what: '只读的 Agent 预设', guard: 'Agent 预设只读' })
}

function assertMutableEntry(entry) {
  if (entry.kind !== 'normal' || entry.id.startsWith('agent-preset:') || entry.groupId?.startsWith('agent-preset:')) {
    throw runtimePluginFailure(ELECKOI_FAILURE_CODES.securityDenied, '固定设定和 Agent 预设只能读取，不能写入聊天分支。', { what: '只读的固定设定与 Agent 预设', guard: '固定设定与 Agent 预设只读' })
  }
}

function readSettings(ctx, exec) {
  const state = ctx.eleckoiRuntimeContexts.get(exec?.agent?.session?.id)
  let bridge = state.settings
  if (!bridge || typeof bridge !== 'object' || Array.isArray(bridge)) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '设定库运行时尚未准备好。', { what: '设定库运行时' })
  if (!bridge.enabled) return bridge
  if (!bridge.library) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '设定库运行时配置不正确。', { what: '设定库运行时配置' })
  const currentState = state.variables.state
  if (bridge.variableState !== currentState) {
    bridge = state.settings = { ...bridge, variableState: currentState, runtimeResolution: undefined }
  }
  return bridge
}
function output() { return { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] } }
function requiredFiles(catalog) { return catalog.entries.filter((entry) => entry.readStrategy === 'required' || entry.promotedToRequiredThisTurn === true).map((entry) => summary(entry, catalog)) }
function cachedReference(entry, catalog) { return catalog.requiredCache?.find((item) => item.id === entry.raw.id && item.path === entry.path && item.title === (String(entry.raw.title || '').trim() || '未命名设定') && item.content === entry.content && entry.readStrategy === 'required') }
function summary(entry, catalog) {
  const cached = cachedReference(entry, catalog)
  return {
    path: entry.path,
    title: entry.raw.title,
    read_strategy: entry.readStrategy,
    selection_hint: entry.selectionHint,
    content_delivery: entry.renderError ? 'error' : cached ? 'cached_reference' : 'tool_result',
    ...(entry.renderError ? { error: entry.renderError } : {}),
    ...(cached && !entry.renderError ? { cached_reference: cached.reference } : {})
  }
}



function splitPath(path) { const parts = path.split('/'); return { parent: parts.slice(0, -1).join('/'), leaf: parts.at(-1) } }
function requiredPath(value) { const path = normalizePath(value, false); if (!path) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'path 必须是非空的安全虚拟路径。', { field: 'path' }); return path }


function normalizeSelectionHint(value) { return String(value || '') }

function fail(status, detail) { return { status, message: detail } }
function message(error) {
  if (error instanceof Error) return error.message
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}
