import { characterOpeningsSchema } from '@shared/contracts/characterOpenings/schemas'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { parse } from '@babel/parser'
import type { Context } from '@deepseek-ai/cordis'
import { emptyEntry } from '../settingLibraries/index'
import { settingLibraryAgentReadStrategySchema, settingLibraryEntryChangesSchema, settingLibraryGroupSchema } from '@shared/contracts/settingLibrary/schemas'
import { variableItemConfigSchema, variableObjectConfigSchema, VARIABLE_INITIALIZATION_OBJECT_ID } from '@shared/contracts/variables/schemas'
import { regexRuleEditorCollectionSchema, regexRuleSchema, regexRuleSurfaceSchema, regexRuleTargetSchema } from '@shared/contracts/regex/schemas'
import { scriptLibrarySchema, scriptSchema, scriptFolderSchema, type ScriptLibrary, type ScriptTree } from '@shared/contracts/scripts/schemas'
import { editorLibraryKindSchema, editorLibrarySaveRequestSchema } from '@shared/contracts/editorVersions/schemas'
import { ruleAppliesToSurface, validateRegexRule } from '@shared/foundation/regex/RegexRuleProcessor'
import { loadVariableSchema } from '../variables/index'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
export { creatorToolsets, creatorAuthoringInstructions } from './guides'

const id = z.string().min(1)
const empty = z.object({}).strict()
const entity = z.object({ id }).strict()
const mutableVariable = variableItemConfigSchema.omit({ id: true, createdAt: true, updatedAt: true })
const mutableObject = variableObjectConfigSchema.omit({ id: true, createdAt: true, updatedAt: true })
const mutableGroup = settingLibraryGroupSchema.omit({ id: true, createdAt: true, updatedAt: true })
const settingChanges = settingLibraryEntryChangesSchema.safeExtend({
  agentReadStrategy: settingLibraryAgentReadStrategySchema.describe('required=必读；normal=选读且关闭关键词匹配；keyword=选读且开启关键词匹配，与界面中的关键词命中开关对应，不是第三个读取档位。').optional(),
  dynamicMode: z.enum(['standard', 'ejs_reference']).describe('standard=普通设定或 EJS 控制器；ejs_reference=仅供 getwi 读取的文字。').optional(),
  contentMode: z.enum(['plain_text', 'ejs']).describe('plain_text=文字；ejs=执行模板，只允许 agent_tool 的选读普通设定。').optional(),
  content: z.string().describe('完整文字正文或 EJS 模板源码，由 contentMode 决定；只替换其中一段时使用 settings.edit，无需重传全文。').optional(),
})
const nativeRuntime = z.object({ kind: z.literal('eleckoi-module'), apiVersion: z.literal(1) }).strict()
const scriptFields = z.object({ name: z.string(), content: z.string(), info: z.string(), enabled: z.boolean(), data: z.record(z.string(), z.json()), button: scriptSchema.shape.button })
const revision = z.number().int().nonnegative().describe('上次 list/read 返回的脚本库或正则修改版本。冲突后重新读取。')
const changes = <T extends z.ZodObject>(schema: T) => schema.partial().strict().refine(value => Object.keys(value).length > 0, '修改不能为空。')
const stamp = () => new Date().toISOString()
type Defined<T> = { [K in keyof T]: Exclude<T[K], undefined> }
const defined = <T extends object>(value: T): Defined<T> => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Defined<T>
const find = <T extends { id: string }>(items: T[], key: string): T => {
  const matches = items.filter(item => item.id === key)
  if (matches.length !== 1) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `找不到唯一的条目：${key}`, { what: '唯一匹配的条目' })
  return matches[0]!
}
const assertSettingFormat = (entry: { dynamicMode: string; contentMode: string; agentReadStrategy: string; triggerMode: string | null }) => {
  if (entry.dynamicMode === 'ejs_reference' && (entry.contentMode !== 'plain_text' || entry.agentReadStrategy !== 'normal' || entry.triggerMode !== 'agent_tool')) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'EJS 引用设定必须是选读、agent_tool 的纯文字条目；模板代码写在普通选读设定的 EJS 正文中。', { field: 'kind' })
  }
  if (entry.contentMode === 'ejs' && (entry.dynamicMode !== 'standard' || entry.agentReadStrategy === 'required' || entry.triggerMode !== 'agent_tool')) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '只有 agent_tool 下的选读普通设定可以使用 EJS 正文；必读和自动注入使用文字正文。', { field: 'content' })
  }
}
const requireNativeSource = (content: string, enabled: boolean) => {
  if (!content.trim()) {
    if (enabled) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '脚本源码为空，请填写启动函数后再启用。', { field: 'source' })
    return
  }
  const ast = parse(content, { sourceType: 'module' })
  if (!ast.program.body.some(node => node.type === 'ExportDefaultDeclaration')) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '原生脚本必须通过 export default 导出启动函数。', { field: 'source' })
}
const scriptItems = (library: ScriptLibrary): ScriptTree[] => library.trees.flatMap(tree => tree.type === 'folder' ? [tree, ...tree.scripts] : [tree])
const mapScript = (library: ScriptLibrary, scriptId: string, change: (item: z.output<typeof scriptSchema>) => z.output<typeof scriptSchema>): ScriptLibrary => ({
  ...library, trees: library.trees.map(tree => tree.type === 'script' ? tree.id === scriptId ? change(tree) : tree
    : { ...tree, scripts: tree.scripts.map(item => item.id === scriptId ? change(item) : item) }),
})

export interface CreatorCapability {
  id: string; toolsetId: string; title: string; effect: 'read' | 'write'
  target: 'selected-character' | 'new-character' | 'explicit-scope'
  inputSchema: Record<string, unknown>
  execute(characterId: string, input: unknown, signal?: AbortSignal): unknown
}

/** Permanent character authoring operations. The target identity comes from the Session. */
export function creatorCapabilities(data: Context['eleckoiProductData']): CreatorCapability[] {
  const catalog: CreatorCapability[] = []
  const requireCharacterTarget = (characterId: string) => {
    if (!characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '请先在 AI 创作工作室菜单中选择角色，或通过 character.create 新建空角色。', { what: '在 AI 创作工作室选择角色' })
    if (!data.readCharacters().items.some(item => item.id === characterId)) throw new DesktopError(ELECKOI_FAILURE_CODES.characterNotFound, '所选角色已不存在，请重新选择角色。', { what: '所选角色' })
    return characterId
  }
  function operation<T extends z.ZodType>(toolsetId: string, name: string, title: string, effect: 'read' | 'write', schema: T, execute: (characterId: string, input: z.output<T>, signal?: AbortSignal) => unknown, target: CreatorCapability['target'] = 'selected-character') {
    catalog.push({ id: `${toolsetId}.${name}`, toolsetId, title, effect, target,
      inputSchema: z.toJSONSchema(schema, { unrepresentable: 'throw' }) as Record<string, unknown>,
      execute(characterId, input, signal) {
        signal?.throwIfAborted()
        if (target === 'selected-character' && !data.readCharacters().items.some(item => item.id === characterId)) throw new DesktopError(ELECKOI_FAILURE_CODES.characterNotFound, '所选角色已不存在，请重新选择角色。', { what: '所选角色' })
        return execute(characterId, schema.parse(input), signal)
      } })
  }
  operation('character', 'create', '新建空角色并设为当前工作室编辑目标', 'write', z.object({
    name: z.string().trim().min(1).describe('新角色名称；只创建空白资料，后续通过创作能力补充内容。'),
    group: z.string().optional().describe('可选的角色分组。'),
  }).strict(), (_characterId, input) => {
    const characterId = `character-${randomUUID()}`
    return find(data.createCharacter({ id: characterId, name: input.name, group: input.group ?? '' }).items, characterId)
  }, 'new-character')
  operation('character', 'read', '读取角色资料', 'read', empty, characterId => find(data.readCharacters().items, characterId))
  operation('character', 'update', '修改角色名称、所属分组和基础资料', 'write', changes(z.object({ name: z.string().min(1), group: z.string().describe('角色所属分组名称；空字符串表示未分组。'), assistantName: z.string().min(1), profileAge: z.string(), profileSex: z.string(), profileHeight: z.string(), profileBirthday: z.string(), profileLike: z.string() })), (characterId, { assistantName, ...patch }) => {
    const current = find(data.readCharacters().items, characterId)
    if (!current.persona) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '角色资料缺少正式身份配置。', { what: '角色资料的身份配置' })
    data.updateCharacter({ ...current, ...defined(patch), persona: { ...current.persona, ...(assistantName === undefined ? {} : { assistant_name: assistantName }) } })
    return find(data.readCharacters().items, characterId)
  })
  operation('character', 'read_openings', '读取角色的全部开场白及默认选择', 'read', empty, characterId => data.readCharacterOpenings(characterId))
  operation('character', 'save_openings', '保存角色独立开场白、备用开场白和变量关联', 'write',
    z.object(characterOpeningsSchema.shape).omit({ characterId: true }).strict(), (characterId, input) => data.saveCharacterOpenings(characterId, { ...input, characterId }))
  operation('settings', 'list', '列出设定条目和文件夹', 'read', empty, characterId => {
    const library = data.readSettingLibrary(characterId)
    return { entries: library.entries.map(({ id, title, groupId, kind, agentReadStrategy, dynamicMode, contentMode, enabled, triggerMode }) => ({ id, title, groupId, kind,
      readStrategy: agentReadStrategy === 'required' ? '必读' : '选读', keywordMatch: agentReadStrategy === 'keyword', dynamicMode, contentMode, enabled, triggerMode })), groups: library.groups }
  })
  operation('settings', 'read', '读取一条完整设定', 'read', entity, (characterId, input) => find(data.readSettingLibrary(characterId).entries, input.id))
  operation('settings', 'create', '新增设定条目', 'write', settingChanges, (characterId, input) => {
    const library = data.readSettingLibrary(characterId)
    const base = emptyEntry()
    const entry = { ...base, openingMessages: base.openingMessages.map(defined), ...defined(input), order: library.entries.length + 1 }
    assertSettingFormat(entry)
    return find(data.saveSettingLibrary(characterId, { ...library, entries: [...library.entries, entry] }).entries, entry.id)
  })
  const settingUpdate = z.object({ id, changes: settingChanges }).strict()
  const updateSettings = (characterId: string, updates: z.output<typeof settingUpdate>[]) => {
    const library = data.readSettingLibrary(characterId)
    for (const input of updates) assertSettingFormat({ ...find(library.entries, input.id), ...defined(input.changes) })
    return data.updateSettingLibraryEntries(characterId, updates.map(input => ({ id: input.id, changes: defined(input.changes) })))
  }
  operation('settings', 'update', '修改设定条目', 'write', settingUpdate, (characterId, input) => updateSettings(characterId, [input]))
  operation('settings', 'update_many', '在同一事务批量修改设定、启停或关键词匹配', 'write',
    z.object({ updates: z.array(settingUpdate).min(1) }).strict(), (characterId, input) => updateSettings(characterId, input.updates))
  operation('settings', 'edit', '精确替换设定正文片段，保留其余内容', 'write', z.object({
    id,
    old_string: z.string().min(1).describe('要替换的准确原文；包含必要上下文以唯一定位，不做正则或模板展开。'),
    new_string: z.string().describe('替换文本，按字面量写入；空字符串表示删除该片段。'),
    replace_all: z.boolean().optional().describe('默认 false，仅允许原文唯一匹配；明确要替换全部匹配时设为 true。'),
  }).strict(), (characterId, input) => {
    if (input.old_string === input.new_string) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '原文和替换文本不能相同。', { field: 'new_string' })
    const entry = find(data.readSettingLibrary(characterId).entries, input.id)
    const parts = entry.content.split(input.old_string), replacements = parts.length - 1
    if (!replacements) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '正文中找不到 old_string，请重新读取并提供准确原文。', { what: '要替换的原文片段' })
    if (replacements > 1 && input.replace_all !== true) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, 'old_string 出现多次，请补充上下文使原文唯一；明确替换全部时才使用 replace_all。', { what: '要替换的原文片段' })
    data.updateSettingLibraryEntries(characterId, [{ id: entry.id, changes: { content: parts.join(input.new_string) } }])
    return { id: entry.id, changed: true, replacements }
  })
  operation('settings', 'remove', '删除设定条目', 'write', entity, (characterId, input) => {
    const library = data.readSettingLibrary(characterId)
    find(library.entries, input.id)
    data.saveSettingLibrary(characterId, { ...library, entries: library.entries.filter(item => item.id !== input.id) })
    return { removedId: input.id }
  })
  operation('settings', 'create_group', '新增设定文件夹', 'write', mutableGroup.strict(), (characterId, input) => {
    const library = data.readSettingLibrary(characterId), timestamp = stamp()
    const group = { ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp }
    data.saveSettingLibrary(characterId, { ...library, groups: [...library.groups, group] })
    return group
  })
  operation('settings', 'update_group', '修改设定文件夹名称、上级或排序', 'write', z.object({ id, changes: changes(mutableGroup) }).strict(), (characterId, input) => {
    const library = data.readSettingLibrary(characterId), group = find(library.groups, input.id)
    const saved = data.saveSettingLibrary(characterId, { ...library, groups: library.groups.map(item => item.id === group.id ? { ...group, ...defined(input.changes) } : item) })
    return find(saved.groups, group.id)
  })
  operation('settings', 'remove_group', '删除设定文件夹及其中的子文件夹和条目', 'write', entity, (characterId, input) => {
    const library = data.readSettingLibrary(characterId)
    find(library.groups, input.id)
    const removed = new Set([input.id])
    for (let size = 0; size !== removed.size;) { size = removed.size; for (const group of library.groups) if (removed.has(group.parentId)) removed.add(group.id) }
    const entries = library.entries.filter(item => removed.has(item.groupId))
    data.saveSettingLibrary(characterId, { ...library, groups: library.groups.filter(item => !removed.has(item.id)),
      entries: library.entries.filter(item => !removed.has(item.groupId)), expandedGroupIds: library.expandedGroupIds.filter(id => !removed.has(id)) })
    return { removedGroupIds: [...removed], removedEntryIds: entries.map(item => item.id) }
  })
  const assertVariableParent = (objects: z.output<typeof variableObjectConfigSchema>[], objectId: string, parentId: string) => {
    const visited = new Set([objectId])
    while (parentId) {
      if (parentId === VARIABLE_INITIALIZATION_OBJECT_ID) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '运行配置不能作为变量组的父级。', { field: 'parentId' })
      if (visited.has(parentId)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '变量组不能形成循环。', { field: 'parentId' })
      visited.add(parentId); parentId = find(objects, parentId).parentId
    }
  }
  operation('variables', 'list', '列出变量和变量组', 'read', empty, characterId => {
    const config = data.readVariableConfig(characterId)
    return { objects: config.objects, variables: config.variables.map(({ id, title, objectId, type, enabled, readMode, defaultValue }) => ({ id, title, objectId, type, enabled, readMode, defaultValue })), schemaCode: config.schemaCode, initialStateJson: config.initialStateJson,
      activeVersionId: config.activeVersionId, versions: config.versions.map(({ id, name }) => ({ id, name })) }
  })
  operation('variables', 'read', '读取变量配置', 'read', entity, (characterId, input) => find(data.readVariableConfig(characterId).variables, input.id))
  operation('variables', 'create', '新增变量', 'write', mutableVariable.strict(), (characterId, input) => {
    const config = data.readVariableConfig(characterId), timestamp = stamp()
    if (input.objectId) find(config.objects, input.objectId)
    const variable = { ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp }
    return find(data.saveVariableConfig(characterId, { ...config, variables: [...config.variables, variable] }).variables, variable.id)
  })
  operation('variables', 'update', '修改变量', 'write', z.object({ id, changes: changes(mutableVariable) }).strict(), (characterId, input) => {
    const config = data.readVariableConfig(characterId)
    const current = find(config.variables, input.id)
    if (input.changes.objectId) find(config.objects, input.changes.objectId)
    return find(data.saveVariableConfig(characterId, { ...config, variables: config.variables.map(item => item.id === current.id ? { ...item, ...defined(input.changes) } : item) }).variables, current.id)
  })
  operation('variables', 'remove', '删除变量', 'write', entity, (characterId, input) => {
    const config = data.readVariableConfig(characterId)
    find(config.variables, input.id)
    data.saveVariableConfig(characterId, { ...config, variables: config.variables.filter(item => item.id !== input.id) })
    return { removedId: input.id }
  })
  operation('variables', 'create_object', '新增变量组', 'write', mutableObject.strict(), (characterId, input) => {
    const config = data.readVariableConfig(characterId), timestamp = stamp()
    const object = { ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp }
    assertVariableParent(config.objects, object.id, input.parentId)
    return find(data.saveVariableConfig(characterId, { ...config, objects: [...config.objects, object] }).objects, object.id)
  })
  operation('variables', 'update_object', '修改变量组名称、上级、启停或配置', 'write', z.object({ id, changes: changes(mutableObject) }).strict(), (characterId, input) => {
    const config = data.readVariableConfig(characterId), object = find(config.objects, input.id)
    if (object.id === VARIABLE_INITIALIZATION_OBJECT_ID) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '变量运行配置请通过 update_schema 修改。', { field: 'id' })
    const updated = { ...object, ...defined(input.changes) }
    assertVariableParent(config.objects, object.id, updated.parentId)
    return find(data.saveVariableConfig(characterId, { ...config, objects: config.objects.map(item => item.id === object.id ? updated : item) }).objects, object.id)
  })
  operation('variables', 'remove_object', '删除变量组及其子组和变量', 'write', entity, (characterId, input) => {
    const config = data.readVariableConfig(characterId), object = find(config.objects, input.id)
    if (object.id === VARIABLE_INITIALIZATION_OBJECT_ID) throw new DesktopError(ELECKOI_FAILURE_CODES.safetyRefused, '不能删除固定变量运行配置。', { guard: '变量运行配置' })
    const removed = new Set([object.id])
    for (let size = 0; size !== removed.size;) { size = removed.size; for (const group of config.objects) if (removed.has(group.parentId)) removed.add(group.id) }
    const variables = config.variables.filter(item => removed.has(item.objectId))
    data.saveVariableConfig(characterId, { ...config, objects: config.objects.filter(item => !removed.has(item.id)),
      variables: config.variables.filter(item => !removed.has(item.objectId)), expandedObjectIds: config.expandedObjectIds.filter(id => !removed.has(id)) })
    return { removedObjectIds: [...removed], removedVariableIds: variables.map(item => item.id) }
  })
  operation('variables', 'update_schema', '修改变量校验代码', 'write', z.object({ schemaCode: z.string() }).strict(), (characterId, input) => {
    const config = data.readVariableConfig(characterId)
    if (input.schemaCode.trim()) loadVariableSchema(input.schemaCode).parse(JSON.parse(config.initialStateJson))
    return data.saveVariableConfig(characterId, { ...config, ...input })
  })
  operation('variables', 'validate_schema', '检查 Zod 校验代码和解析结果（不保存）', 'read', z.object({
    schemaCode: z.string().min(1), state: z.record(z.string(), z.json()).optional(),
  }).strict(), (characterId, input) => ({ state: loadVariableSchema(input.schemaCode).parse(input.state ?? JSON.parse(data.readVariableConfig(characterId).initialStateJson)) }))
  const readScripts = (characterId: string, expectedRevision?: number) => {
    const library = data.readScriptLibrary('character', characterId)
    if (expectedRevision !== undefined && expectedRevision !== library.revision) throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '脚本库已被修改，请重新读取后再保存。', { what: '脚本库' })
    return library
  }
  operation('scripts', 'list', '列出当前角色脚本库、文件夹和原生脚本', 'read', empty, characterId => {
    const library = readScripts(characterId)
    return { enabled: library.enabled, revision: library.revision, items: library.trees.map(tree => tree.type === 'folder'
      ? { id: tree.id, type: tree.type, name: tree.name, enabled: tree.enabled, scripts: tree.scripts.map(({ id, name, enabled, runtime }) => ({ id, name, enabled, runtime })) }
      : { id: tree.id, type: tree.type, name: tree.name, enabled: tree.enabled, runtime: tree.runtime }), variables: library.variables }
  })
  operation('scripts', 'read', '读取脚本源码或文件夹', 'read', entity, (characterId, input) => {
    const library = readScripts(characterId)
    return { revision: library.revision, item: find(scriptItems(library), input.id) }
  })
  operation('scripts', 'create', '新增 ElecKoi 原生脚本（默认停用）', 'write', z.object({
    expectedRevision: revision, folderId: z.string().optional(), name: z.string().min(1), content: z.string(), info: z.string().optional(), data: z.record(z.string(), z.json()).optional(),
  }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision)
    requireNativeSource(input.content, false)
    const script = scriptSchema.parse({ type: 'script', id: randomUUID(), name: input.name, content: input.content, info: input.info ?? '', data: input.data ?? {}, runtime: nativeRuntime.parse({ kind: 'eleckoi-module', apiVersion: 1 }) })
    if (input.folderId) {
      const folder = find(library.trees, input.folderId)
      if (folder.type !== 'folder') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '所选目标不是脚本文件夹。', { field: 'folderId' })
      library.trees = library.trees.map(tree => tree.id === folder.id ? { ...folder, scripts: [...folder.scripts, script] } : tree)
    } else library.trees = [...library.trees, script]
    const saved = data.saveScriptLibrary(library)
    return { revision: saved.revision, item: find(scriptItems(saved), script.id) }
  })
  operation('scripts', 'update', '修改原生脚本源码、设置或开关', 'write', z.object({ id, expectedRevision: revision, changes: changes(scriptFields) }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision), item = find(scriptItems(library), input.id)
    if (item.type !== 'script') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '所选项目不是脚本。', { field: 'itemId' })
    nativeRuntime.parse(item.runtime)
    if (input.changes.content !== undefined || input.changes.enabled === true) requireNativeSource(input.changes.content ?? item.content, input.changes.enabled ?? item.enabled)
    const saved = data.saveScriptLibrary(mapScript(library, item.id, script => ({ ...script, ...defined(input.changes) })))
    return { revision: saved.revision, item: find(scriptItems(saved), item.id) }
  })
  operation('scripts', 'remove', '删除当前角色的单个脚本', 'write', z.object({ id, expectedRevision: revision }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision), item = find(scriptItems(library), input.id)
    if (item.type !== 'script') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '删除文件夹前请逐个处理其中脚本。', { field: 'id' })
    const saved = data.saveScriptLibrary({ ...library, trees: library.trees.filter(tree => tree.id !== item.id).map(tree => tree.type === 'folder' ? { ...tree, scripts: tree.scripts.filter(script => script.id !== item.id) } : tree) })
    return { removedId: item.id, revision: saved.revision }
  })
  operation('scripts', 'create_folder', '新增脚本文件夹', 'write', z.object({ name: z.string().min(1), expectedRevision: revision }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision), folder = scriptFolderSchema.parse({ type: 'folder', id: randomUUID(), name: input.name, enabled: true, scripts: [] })
    const saved = data.saveScriptLibrary({ ...library, trees: [...library.trees, folder] })
    return { revision: saved.revision, item: find(saved.trees, folder.id) }
  })
  operation('scripts', 'update_folder', '修改脚本文件夹名称或开关', 'write', z.object({ id, expectedRevision: revision,
    changes: changes(z.object({ name: z.string().min(1), enabled: z.boolean() })),
  }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision), folder = find(library.trees, input.id)
    if (folder.type !== 'folder') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '所选项目不是脚本文件夹。', { field: 'folderId' })
    const saved = data.saveScriptLibrary({ ...library, trees: library.trees.map(tree => tree.id === folder.id ? { ...folder, ...defined(input.changes) } : tree) })
    return { revision: saved.revision, item: find(saved.trees, folder.id) }
  })
  operation('scripts', 'remove_folder', '删除空脚本文件夹', 'write', z.object({ id, expectedRevision: revision }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision), folder = find(library.trees, input.id)
    if (folder.type !== 'folder' || folder.scripts.length) throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '只能删除空脚本文件夹，请先移动或删除其中脚本。', { what: '移动或删除文件夹里的脚本' })
    const saved = data.saveScriptLibrary({ ...library, trees: library.trees.filter(tree => tree.id !== folder.id) })
    return { removedId: folder.id, revision: saved.revision }
  })
  operation('scripts', 'move', '把脚本移到指定文件夹或库根目录', 'write', z.object({ id, expectedRevision: revision, folderId: z.string().describe('目标文件夹编号；空字符串表示库根目录。') }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision), item = find(scriptItems(library), input.id)
    if (item.type !== 'script') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '只能移动脚本到库根目录或文件夹。', { field: 'itemId' })
    if (input.folderId && find(library.trees, input.folderId).type !== 'folder') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '所选目标不是脚本文件夹。', { field: 'folderId' })
    const trees = library.trees.filter(tree => tree.id !== item.id).map(tree => tree.type === 'folder'
      ? { ...tree, scripts: [...tree.scripts.filter(script => script.id !== item.id), ...(tree.id === input.folderId ? [item] : [])] } : tree)
    if (!input.folderId) trees.push(item)
    const saved = data.saveScriptLibrary({ ...library, trees })
    return { revision: saved.revision, item: find(scriptItems(saved), item.id) }
  })
  operation('scripts', 'configure', '设置当前角色脚本库的启停和库设置', 'write', z.object({ expectedRevision: revision,
    changes: changes(z.object({ enabled: z.boolean(), variables: z.record(z.string(), z.json()) })),
  }).strict(), (characterId, input) => {
    const saved = data.saveScriptLibrary({ ...readScripts(characterId, input.expectedRevision), ...defined(input.changes) })
    return { revision: saved.revision, enabled: saved.enabled, variables: saved.variables }
  })
  operation('regex', 'list', '读取角色正则规则', 'read', empty, characterId => {
    const collection = data.readRegexRules(characterId)
    return { rules: collection.characterRules, revision: collection.revision }
  })
  operation('regex', 'read', '按编号读取一条角色正则规则', 'read', entity, (characterId, input) => {
    const collection = data.readRegexRules(characterId)
    return { revision: collection.revision, rule: find(collection.characterRules, input.id) }
  })
  const assertRegex = (rule: z.output<typeof regexRuleSchema>) => {
    const failure = validateRegexRule(rule)
    if (failure) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, failure, { field: 'rule' })
  }
  operation('regex', 'create', '新增角色正则规则', 'write', z.object({ expectedRevision: revision, rule: regexRuleSchema.omit({ id: true }).strict() }).strict(), (characterId, input) => {
    const collection = data.readRegexRules(characterId), rule = { ...defined(input.rule), id: randomUUID() }
    assertRegex(rule)
    const saved = data.saveRegexRules(characterId, { ...collection, characterRules: [...collection.characterRules, rule] }, input.expectedRevision)
    return { revision: saved.revision, rule: find(saved.characterRules, rule.id) }
  })
  operation('regex', 'update', '部分修改角色正则规则', 'write', z.object({ id, expectedRevision: revision, changes: changes(regexRuleSchema.omit({ id: true })) }).strict(), (characterId, input) => {
    const collection = data.readRegexRules(characterId)
    const rule = { ...find(collection.characterRules, input.id), ...defined(input.changes) }
    assertRegex(rule)
    const saved = data.saveRegexRules(characterId, { ...collection, characterRules: collection.characterRules.map(item => item.id === rule.id ? rule : item) }, input.expectedRevision)
    return { revision: saved.revision, rule: find(saved.characterRules, rule.id) }
  })
  operation('regex', 'test', '预览正则在指定范围的替换（不保存）', 'read', z.object({ text: z.string(), rule: regexRuleSchema.strict(), target: regexRuleTargetSchema,
    variables: z.record(z.string(), z.json()).nullable().optional(), surface: regexRuleSurfaceSchema, depth: z.number().int().nonnegative().optional(), isEdit: z.boolean().optional(),
  }).strict(), (_characterId, input, signal) => {
    assertRegex(input.rule)
    const appliesToSurface = ruleAppliesToSurface(input.rule, input.surface, input.target)
    const { trimStrings, minDepth, maxDepth, substituteRegex, ...required } = input.rule
    const rule = { ...required, ...(trimStrings === undefined ? {} : { trimStrings }),
      ...(minDepth === undefined ? {} : { minDepth }), ...(maxDepth === undefined ? {} : { maxDepth }),
      ...(substituteRegex === undefined ? {} : { substituteRegex }) }
    return data.testRegexRule(input.text, rule, input.target, { surface: input.surface,
      ...(input.variables === undefined ? {} : { variablesJson: JSON.stringify(input.variables) }),
      ...(input.depth === undefined ? {} : { depth: input.depth }), ...(input.isEdit === undefined ? {} : { isEdit: input.isEdit }),
    }, signal).then(result => {
      if (result.validationMessage) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, result.validationMessage, { field: '正则规则' })
      return { output: result.output, changed: result.output !== input.text, appliesToSurface }
    })
  })
  operation('regex', 'remove', '删除角色正则规则', 'write', z.object({ id, expectedRevision: revision }).strict(), (characterId, input) => {
    const collection = data.readRegexRules(characterId)
    find(collection.characterRules, input.id)
    const saved = data.saveRegexRules(characterId, { ...collection, characterRules: collection.characterRules.filter(item => item.id !== input.id) }, input.expectedRevision)
    return { removedId: input.id, revision: saved.revision }
  })
  const templateTarget = z.object({ scope: z.enum(['global', 'character', 'preset']), presetId: id.optional() }).strict().superRefine((input, context) => {
    if (input.scope === 'preset' && !input.presetId || input.scope !== 'preset' && input.presetId !== undefined) {
      context.addIssue({ code: 'custom', message: '预设配置必须提供明确 presetId，角色及全局配置不得提供 presetId。' })
    }
  })
  operation('editorVersions', 'read', '读取共享全局、当前角色或明确预设的完整命名配置版本', 'read',
    z.object({ kind: editorLibraryKindSchema, target: templateTarget }).strict(), (characterId, input) => data.readEditorLibraryVersions({
      kind: input.kind, scope: input.target.scope, ownerId: input.target.scope === 'global' ? '' : input.target.scope === 'preset' ? input.target.presetId! : requireCharacterTarget(characterId),
    }), 'explicit-scope')
  operation('editorVersions', 'save', '原子保存正则或脚本及命名版本', 'write', editorLibrarySaveRequestSchema,
    (characterId, input) => {
      const targets = input.documents.map(document => {
        const parsed: unknown = JSON.parse(document)
        return input.kind === 'regex' ? regexRuleEditorCollectionSchema.parse(parsed).target
          : scriptLibrarySchema.parse(parsed)
      })
      if (targets.some(target => target.scope === 'character') || input.versions.some(version => version.scope === 'character')) requireCharacterTarget(characterId)
      for (const version of input.versions) if (version.scope === 'character' && version.ownerId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '配置版本不属于当前编辑角色。', { what: '其它角色的配置版本' })
      for (const target of targets) if (target.scope === 'character' && target.ownerId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '配置不属于当前编辑角色。', { what: '其它角色的配置' })
      return data.saveEditorLibraries(input)
    }, 'explicit-scope')
  operation('presetScripts', 'read', '读取明确预设的原生脚本库', 'read', z.object({ presetId: id }).strict(), (_characterId, input) => data.readScriptLibrary('preset', input.presetId), 'explicit-scope')
  operation('presetScripts', 'save', '按读取版本保存明确预设的原生脚本和设置', 'write', z.object({ presetId: id, expectedRevision: revision,
    enabled: z.boolean(), variables: z.record(z.string(), z.json()), trees: z.array(z.union([scriptSchema, scriptFolderSchema])) }).strict(), (_characterId, input) => {
    const library = data.readScriptLibrary('preset', input.presetId)
    if (library.revision !== input.expectedRevision) throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '预设脚本库已被修改，请重新读取后合并。', { what: '预设脚本库' })
    for (const item of input.trees.flatMap(tree => tree.type === 'folder' ? tree.scripts : [tree])) {
      nativeRuntime.parse(item.runtime)
      requireNativeSource(item.content, item.enabled)
    }
    return data.saveScriptLibrary({ ...library, enabled: input.enabled, variables: input.variables, trees: input.trees })
  }, 'explicit-scope')
  return catalog
}
