import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { parse } from '@babel/parser'
import type { CharacterCollection, CharacterRecord } from '@shared/contracts/entities/persona'
import type { SettingLibrary, SettingLibraryEntry, SettingLibraryEntryUpdate } from '@shared/contracts/settingLibrary/schemas'
import type { VariableConfig } from '@shared/contracts/variables/schemas'
import type { RegexRuleCollection } from '@shared/contracts/regex/schemas'
import type { ScriptLibraryScope } from '@shared/contracts/scripts/schemas'
import { emptyEntry, OPENING_ENTRY_ID } from '../settingLibraries/index'
import { settingLibraryEntryChangesSchema, settingLibraryGroupSchema } from '@shared/contracts/settingLibrary/schemas'
import { variableItemConfigSchema, variableObjectConfigSchema, VARIABLE_INITIALIZATION_OBJECT_ID } from '@shared/contracts/variables/schemas'
import { regexRuleSchema, regexRuleSurfaceSchema, regexRuleTargetSchema } from '@shared/contracts/regex/schemas'
import { scriptSchema, scriptFolderSchema, type ScriptLibrary, type ScriptTree } from '@shared/contracts/scripts/schemas'
import { ruleAppliesToSurface, transformWithRegexRules, validateRegexRule } from '@shared/foundation/regex/RegexRuleProcessor'
import { loadVariableSchema } from '../variables/index'
export { creatorToolsets, creatorAuthoringInstructions } from './guides'

const id = z.string().min(1)
const empty = z.object({}).strict()
const entity = z.object({ id }).strict()
const mutableVariable = variableItemConfigSchema.omit({ id: true, createdAt: true, updatedAt: true })
const mutableObject = variableObjectConfigSchema.omit({ id: true, createdAt: true, updatedAt: true })
const mutableGroup = settingLibraryGroupSchema.omit({ id: true, createdAt: true, updatedAt: true })
const settingChanges = settingLibraryEntryChangesSchema.safeExtend({
  agentReadStrategy: z.enum(['required', 'normal']).describe('required=必读；normal=选读。只有这两个读取档位。').optional(),
  dynamicMode: z.enum(['standard', 'ejs_reference']).describe('standard=普通设定或 EJS 控制器；ejs_reference=仅供 getwi 读取的文字。').optional(),
  contentMode: z.enum(['plain_text', 'ejs']).describe('plain_text=文字；ejs=执行模板，只允许 agent_tool 的选读普通设定。').optional(),
  content: z.string().describe('文字正文或 EJS 模板源码，由 contentMode 决定。').optional(),
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
  if (matches.length !== 1) throw new Error(`找不到唯一的条目：${key}`)
  return matches[0]!
}
const assertSettingFormat = (entry: { dynamicMode: string; contentMode: string; agentReadStrategy: string; triggerMode: string | null }) => {
  if (entry.dynamicMode === 'ejs_reference' && (entry.contentMode !== 'plain_text' || entry.agentReadStrategy !== 'normal' || entry.triggerMode !== 'agent_tool')) {
    throw new Error('EJS 引用设定必须是选读、agent_tool 的纯文字条目；模板代码写在普通选读设定的 EJS 正文中。')
  }
  if (entry.contentMode === 'ejs' && (entry.dynamicMode !== 'standard' || entry.agentReadStrategy === 'required' || entry.triggerMode !== 'agent_tool')) {
    throw new Error('只有 agent_tool 下的选读普通设定可以使用 EJS 正文；必读和自动注入使用文字正文。')
  }
}
const requireNativeSource = (content: string) => {
  const ast = parse(content, { sourceType: 'module' })
  if (!ast.program.body.some(node => node.type === 'ExportDefaultDeclaration')) throw new Error('原生脚本必须通过 export default 导出启动函数。')
}
const scriptItems = (library: ScriptLibrary): ScriptTree[] => library.trees.flatMap(tree => tree.type === 'folder' ? [tree, ...tree.scripts] : [tree])
const mapScript = (library: ScriptLibrary, scriptId: string, change: (item: z.output<typeof scriptSchema>) => z.output<typeof scriptSchema>): ScriptLibrary => ({
  ...library, trees: library.trees.map(tree => tree.type === 'script' ? tree.id === scriptId ? change(tree) : tree
    : { ...tree, scripts: tree.scripts.map(item => item.id === scriptId ? change(item) : item) }),
})

export interface CreatorCapability {
  id: string; toolsetId: string; title: string; effect: 'read' | 'write'
  target: 'selected-character' | 'new-character'
  inputSchema: Record<string, unknown>
  execute(characterId: string, input: unknown): unknown
}

/** Native authoring uses repository operations, independent of API Context registration. */
export interface CreatorProductData {
  readCharacters(): CharacterCollection
  createCharacter(character: CharacterRecord): CharacterCollection
  updateCharacter(character: CharacterRecord): CharacterCollection
  readSettingLibrary(characterId: string): SettingLibrary
  saveSettingLibrary(characterId: string, library: SettingLibrary): SettingLibrary
  updateSettingLibraryEntries(characterId: string, updates: SettingLibraryEntryUpdate[]): SettingLibraryEntry[]
  readVariableConfig(characterId: string): VariableConfig
  saveVariableConfig(characterId: string, config: VariableConfig): VariableConfig
  readScriptLibrary(scope: ScriptLibraryScope, ownerId: string): ScriptLibrary
  saveScriptLibrary(library: ScriptLibrary): ScriptLibrary
  readRegexRules(characterId: string): RegexRuleCollection
  saveRegexRules(characterId: string, collection: RegexRuleCollection, expectedRevision: number): RegexRuleCollection
}

/** Permanent character authoring operations. The target identity comes from the Session. */
export function creatorCapabilities(data: CreatorProductData): CreatorCapability[] {
  const catalog: CreatorCapability[] = []
  function operation<T extends z.ZodType>(toolsetId: string, name: string, title: string, effect: 'read' | 'write', schema: T, execute: (characterId: string, input: z.output<T>) => unknown, target: CreatorCapability['target'] = 'selected-character') {
    catalog.push({ id: `${toolsetId}.${name}`, toolsetId, title, effect, target,
      inputSchema: z.toJSONSchema(schema, { unrepresentable: 'throw' }) as Record<string, unknown>,
      execute(characterId, input) {
        if (target === 'selected-character' && !data.readCharacters().items.some(item => item.id === characterId)) throw new Error('所选角色已不存在，请重新选择角色。')
        return execute(characterId, schema.parse(input))
      } })
  }
  operation('character', 'create', '新建空角色并设为当前工作室编辑目标', 'write', z.object({
    name: z.string().trim().min(1).max(120).describe('新角色名称；只创建空白资料，后续通过创作能力补充内容。'),
    group: z.string().max(120).optional().describe('可选的角色分组。'),
  }).strict(), (_characterId, input) => {
    const characterId = `character-${randomUUID()}`
    return find(data.createCharacter({ id: characterId, name: input.name, group: input.group ?? '' }).items, characterId)
  }, 'new-character')
  operation('character', 'read', '读取角色资料', 'read', empty, characterId => find(data.readCharacters().items, characterId))
  operation('character', 'update', '修改角色名称和基础资料', 'write', changes(z.object({ name: z.string().min(1).max(120), assistantName: z.string().min(1).max(120), profileAge: z.string(), profileSex: z.string(), profileHeight: z.string(), profileBirthday: z.string(), profileLike: z.string() })), (characterId, { assistantName, ...patch }) => {
    const current = find(data.readCharacters().items, characterId)
    if (!current.persona) throw new Error('角色资料缺少正式身份配置。')
    data.updateCharacter({ ...current, ...defined(patch), persona: { ...current.persona, ...(assistantName === undefined ? {} : { assistant_name: assistantName }) } })
    return find(data.readCharacters().items, characterId)
  })
  operation('settings', 'list', '列出设定条目和文件夹', 'read', empty, characterId => {
    const library = data.readSettingLibrary(characterId)
    return { entries: library.entries.map(({ id, title, groupId, kind, agentReadStrategy, dynamicMode, contentMode, enabled, triggerMode }) => ({ id, title, groupId, kind,
      readStrategy: agentReadStrategy === 'required' ? '必读' : '选读', keywordMatch: agentReadStrategy === 'keyword', dynamicMode, contentMode, enabled, triggerMode })), groups: library.groups }
  })
  operation('settings', 'read', '读取一条完整设定', 'read', entity, (characterId, input) => find(data.readSettingLibrary(characterId).entries, input.id))
  operation('settings', 'create', '新增设定条目', 'write', settingChanges, (characterId, input) => {
    const library = data.readSettingLibrary(characterId)
    const base = emptyEntry()
    const entry = { ...defined(base), openingMessages: base.openingMessages.map(defined), ...defined(input), order: library.entries.length + 1 }
    assertSettingFormat(entry)
    return find(data.saveSettingLibrary(characterId, { ...library, entries: [...library.entries, entry] }).entries, entry.id)
  })
  operation('settings', 'update', '修改设定条目', 'write', z.object({ id, changes: settingChanges }).strict(), (characterId, input) => {
    const library = data.readSettingLibrary(characterId)
    const entry = find(library.entries, input.id)
    if (entry.kind === 'opening') throw new Error('开场白请在角色编辑页修改。')
    assertSettingFormat({ ...entry, ...defined(input.changes) })
    return data.updateSettingLibraryEntries(characterId, [{ id: input.id, changes: defined(input.changes) }])
  })
  operation('settings', 'remove', '删除设定条目', 'write', entity, (characterId, input) => {
    const library = data.readSettingLibrary(characterId)
    const entry = find(library.entries, input.id)
    if (entry.id === OPENING_ENTRY_ID || entry.kind === 'opening') throw new Error('不能删除固定开场白。')
    data.saveSettingLibrary(characterId, { ...library, entries: library.entries.filter(item => item.id !== input.id) })
    return { removedId: input.id }
  })
  operation('settings', 'create_group', '新增设定文件夹', 'write', mutableGroup.strict(), (characterId, input) => {
    const library = data.readSettingLibrary(characterId), timestamp = stamp()
    const group = { ...defined(input), id: randomUUID(), createdAt: timestamp, updatedAt: timestamp }
    data.saveSettingLibrary(characterId, { ...library, groups: [...library.groups, group] })
    return group
  })
  operation('variables', 'list', '列出变量和变量组', 'read', empty, characterId => {
    const config = data.readVariableConfig(characterId)
    return { objects: config.objects, variables: config.variables.map(({ id, title, objectId, type, enabled, readMode, defaultValue }) => ({ id, title, objectId, type, enabled, readMode, defaultValue })), schemaCode: config.schemaCode, initialStateJson: config.initialStateJson }
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
    if (input.parentId) find(config.objects, input.parentId)
    if (input.parentId === VARIABLE_INITIALIZATION_OBJECT_ID) throw new Error('运行配置不能作为变量组的父级。')
    const object = { ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp }
    return find(data.saveVariableConfig(characterId, { ...config, objects: [...config.objects, object] }).objects, object.id)
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
    if (expectedRevision !== undefined && expectedRevision !== library.revision) throw new Error('脚本库已被修改，请重新读取后再保存。')
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
    requireNativeSource(input.content)
    const script = scriptSchema.parse({ type: 'script', id: randomUUID(), name: input.name, content: input.content, info: input.info ?? '', data: input.data ?? {}, runtime: nativeRuntime.parse({ kind: 'eleckoi-module', apiVersion: 1 }) })
    if (input.folderId) {
      const folder = find(library.trees, input.folderId)
      if (folder.type !== 'folder') throw new Error('所选目标不是脚本文件夹。')
      library.trees = library.trees.map(tree => tree.id === folder.id ? { ...folder, scripts: [...folder.scripts, script] } : tree)
    } else library.trees = [...library.trees, script]
    const saved = data.saveScriptLibrary(library)
    return { revision: saved.revision, item: find(scriptItems(saved), script.id) }
  })
  operation('scripts', 'update', '修改原生脚本源码、设置或开关', 'write', z.object({ id, expectedRevision: revision, changes: changes(scriptFields) }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision), item = find(scriptItems(library), input.id)
    if (item.type !== 'script') throw new Error('所选项目不是脚本。')
    nativeRuntime.parse(item.runtime)
    if (input.changes.content !== undefined) requireNativeSource(input.changes.content)
    const saved = data.saveScriptLibrary(mapScript(library, item.id, script => ({ ...script, ...defined(input.changes) })))
    return { revision: saved.revision, item: find(scriptItems(saved), item.id) }
  })
  operation('scripts', 'remove', '删除当前角色的单个脚本', 'write', z.object({ id, expectedRevision: revision }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision), item = find(scriptItems(library), input.id)
    if (item.type !== 'script') throw new Error('删除文件夹前请逐个处理其中脚本。')
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
    if (folder.type !== 'folder') throw new Error('所选项目不是脚本文件夹。')
    const saved = data.saveScriptLibrary({ ...library, trees: library.trees.map(tree => tree.id === folder.id ? { ...folder, ...defined(input.changes) } : tree) })
    return { revision: saved.revision, item: find(saved.trees, folder.id) }
  })
  operation('scripts', 'remove_folder', '删除空脚本文件夹', 'write', z.object({ id, expectedRevision: revision }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision), folder = find(library.trees, input.id)
    if (folder.type !== 'folder' || folder.scripts.length) throw new Error('只能删除空脚本文件夹，请先移动或删除其中脚本。')
    const saved = data.saveScriptLibrary({ ...library, trees: library.trees.filter(tree => tree.id !== folder.id) })
    return { removedId: folder.id, revision: saved.revision }
  })
  operation('scripts', 'move', '把脚本移到指定文件夹或库根目录', 'write', z.object({ id, expectedRevision: revision, folderId: z.string().describe('目标文件夹编号；空字符串表示库根目录。') }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input.expectedRevision), item = find(scriptItems(library), input.id)
    if (item.type !== 'script') throw new Error('只能移动脚本到库根目录或文件夹。')
    if (input.folderId && find(library.trees, input.folderId).type !== 'folder') throw new Error('所选目标不是脚本文件夹。')
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
    if (failure) throw new Error(failure)
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
    surface: regexRuleSurfaceSchema, depth: z.number().int().nonnegative().optional(), isEdit: z.boolean().optional(),
  }).strict(), (_characterId, input) => {
    assertRegex(input.rule)
    const appliesToSurface = ruleAppliesToSurface(input.rule, input.surface, input.target)
    const output = appliesToSurface ? transformWithRegexRules(input.text, [input.rule], input.target, defined({ depth: input.depth, isEdit: input.isEdit })) : input.text
    return { output, changed: output !== input.text, appliesToSurface }
  })
  operation('regex', 'remove', '删除角色正则规则', 'write', z.object({ id, expectedRevision: revision }).strict(), (characterId, input) => {
    const collection = data.readRegexRules(characterId)
    find(collection.characterRules, input.id)
    const saved = data.saveRegexRules(characterId, { ...collection, characterRules: collection.characterRules.filter(item => item.id !== input.id) }, input.expectedRevision)
    return { removedId: input.id, revision: saved.revision }
  })
  return catalog
}
