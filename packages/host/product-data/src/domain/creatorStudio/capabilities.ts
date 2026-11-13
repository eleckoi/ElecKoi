import { characterOpeningsSchema } from '@shared/contracts/characterOpenings/schemas'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { parse } from '@babel/parser'
import type { Context } from '@deepseek-ai/cordis'
import { emptyEntry } from '../settingLibraries/index'
import { settingLibraryAgentReadStrategySchema, settingLibraryEntryChangesSchema, settingLibraryGroupSchema, settingLibrarySchema, type SettingLibraryEntry } from '@shared/contracts/settingLibrary/schemas'
import { applySettingLibraryEntryUpdates } from '@shared/contracts/settingLibrary/entryUpdates'
import { variableItemConfigSchema, variableObjectConfigSchema, VARIABLE_INITIALIZATION_OBJECT_ID } from '@shared/contracts/variables/schemas'
import { regexRuleEditorCollectionSchema, regexRuleSchema, regexRuleSurfaceSchema, regexRuleTargetSchema } from '@shared/contracts/regex/schemas'
import { scriptLibrarySchema, scriptSchema, scriptFolderSchema, type ScriptLibrary, type ScriptTree } from '@shared/contracts/scripts/schemas'
import { editorLibraryKindSchema, editorLibraryVersionsSchema } from '@shared/contracts/editorVersions/schemas'
import { ruleAppliesToSurface, validateRegexRule } from '@shared/foundation/regex/RegexRuleProcessor'
import { loadVariableSchema } from '../variables/index'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { creatorMediaCapabilities } from './mediaCapabilities'
export { creatorToolsets, creatorAuthoringInstructions } from './guides'

const id = z.string().min(1)
const empty = z.object({}).strict()
const entity = z.object({ id }).strict()
const configurationTarget = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('character') }).strict(),
  z.object({ scope: z.literal('global') }).strict(),
]).describe('character=当前编辑角色；global=共享全局。读写使用同一 target，省略时为当前角色；角色由工作室选择确定，不接受其他角色编号。创作工具不修改预设。')
const settingListTarget = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('character') }).strict(),
  z.object({ scope: z.literal('global'), libraryId: id.optional() }).strict(),
]).describe('省略 target 或 scope=character 时列出当前角色设定；scope=global 时列出全部全局库，提供 libraryId 可只列一个库。')
const settingReadTarget = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('character') }).strict(),
  z.object({ scope: z.literal('global'), libraryId: id }).strict(),
]).describe('省略 target 时操作当前角色；全局设定条目和文件夹读写必须提供 scope=global 和 settings.list 返回的准确 libraryId。')
const summarizeSettings = (entries: SettingLibraryEntry[]) => entries.map(
  ({ id, title, groupId, kind, agentReadStrategy, dynamicMode, contentMode, enabled, triggerMode }) => ({ id, title, groupId, kind,
    readStrategy: agentReadStrategy === 'required' ? '必读' : '选读', keywordMatch: agentReadStrategy === 'keyword', dynamicMode, contentMode, enabled, triggerMode }))
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
const scriptFields = z.object({ name: z.string(), content: z.string(), info: z.string(), enabled: z.boolean(), data: z.record(z.string(), z.json()),
  button: scriptSchema.shape.button.unwrap(), export_with: scriptSchema.shape.export_with.unwrap() })
const revision = z.number().int().nonnegative().describe('上次 list/read 返回的脚本库或正则修改版本。冲突后重新读取。')
const configurationWriteFields = { target: configurationTarget.optional(), expectedRevision: revision }
const regexWriteFields = { ...configurationWriteFields, expectedOwnerRevision: z.string().regex(/^[a-f0-9]{64}$/).optional()
  .describe('可使用最近同一范围 regex.list/read 或成功写入返回的 ownerRevision 作为额外冲突检查。') }
const versionLibraries = z.array(editorLibraryVersionsSchema.safeExtend({ scope: z.enum(['global', 'character']) }))
const versionSaveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scripts'), documents: z.array(scriptLibrarySchema.safeExtend({ scope: z.enum(['global', 'character']) })), versions: versionLibraries }).strict(),
  z.object({ kind: z.literal('regex'), documents: z.array(regexRuleEditorCollectionSchema.safeExtend({
    target: z.object({ scope: z.literal('character'), ownerId: id }).strict(),
  })).length(1), versions: versionLibraries }).strict(),
])
const roleSettingDocument = settingLibrarySchema.omit({ characterId: true }).strict()
const settingWriteFields = { target: settingReadTarget.optional(), expectedRevision: z.number().int().nonnegative().optional()
  .describe('写全局设定时必填，使用最近 settings.list/read 或成功写入返回的 revision；角色设定不传。') }
type SettingWriteOptions = { target?: z.output<typeof settingReadTarget> | undefined; expectedRevision?: number | undefined }
type SettingDocument = Pick<ReturnType<Context['eleckoiProductData']['readSettingLibrary']>, 'entries' | 'groups' | 'promptPositions' | 'expandedGroupIds'>
type SettingEntryUpdate = Parameters<Context['eleckoiProductData']['updateSettingLibraryEntries']>[1][number]
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
const assertSettingPosition = (entry: Pick<SettingLibraryEntry, 'promptPositionId' | 'position'>, positions: SettingDocument['promptPositions']) => {
  if (entry.promptPositionId && !positions.some(position => position.id === entry.promptPositionId && position.anchor === entry.position)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '自定义位置必须属于当前设定库，且 position 与该位置的 anchor 一致。', { field: 'promptPositionId' })
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
  const resolveConfigurationTarget = (characterId: string, target: z.output<typeof configurationTarget> = { scope: 'character' }) => ({
    scope: target.scope, ownerId: target.scope === 'global' ? '' : requireCharacterTarget(characterId),
  })
  const checkRevision = (expected: number | undefined, actual: number) => {
    if (expected === undefined) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '写入全局设定必须提供最近读取返回的 expectedRevision。', { field: 'expectedRevision' })
    if (expected !== actual) throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '全局设定已被修改，请重新读取后合并。', { what: '全局设定库' })
  }
  const settingsStore = (characterId: string, input: SettingWriteOptions) => {
    const collection = input.target?.scope === 'global' ? data.readGlobalSettingLibraries() : undefined
    let globalLibrary = collection && input.target?.scope === 'global' ? find(collection.libraries, input.target.libraryId) : undefined
    if (collection) checkRevision(input.expectedRevision, collection.revision)
    else if (input.expectedRevision !== undefined) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '角色设定不使用 expectedRevision；请核对本次 target。', { field: 'expectedRevision' })
    const ownerId = collection ? '' : requireCharacterTarget(characterId)
    let library = globalLibrary ?? data.readSettingLibrary(ownerId)
    const save = (next: SettingDocument) => {
      if (collection && globalLibrary) {
        const saved = data.saveGlobalSettingLibraries({ ...collection, libraries: collection.libraries.map(item => item.id === globalLibrary!.id
          ? { ...globalLibrary!, ...next, updatedAt: stamp() } : item) })
        collection.revision = saved.revision
        globalLibrary = find(saved.libraries, globalLibrary.id); library = globalLibrary
      } else library = data.saveSettingLibrary(ownerId, { ...data.readSettingLibrary(ownerId), ...next })
      return library
    }
    const update = (updates: SettingEntryUpdate[]) => {
      if (!collection) return data.updateSettingLibraryEntries(ownerId, updates)
      const next = applySettingLibraryEntryUpdates(library.entries, updates, stamp())
      if (next.changed.length) save({ ...library, entries: next.entries.map(entry => ({ ...entry, openingMessages: entry.openingMessages.map(defined) })) })
      return next.changed
    }
    const receipt = <T extends object>(value: T) => collection && globalLibrary ? { ...value, revision: collection.revision,
      source: { scope: 'global', libraryId: globalLibrary.id, libraryName: globalLibrary.name, libraryEnabled: globalLibrary.enabled } } : value
    return { library, save, update, receipt }
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
  operation('settings', 'list', '列出当前角色或全局设定库的条目和文件夹', 'read', z.object({ target: settingListTarget.optional() }).strict(), (characterId, input) => {
    if (input.target?.scope === 'global') {
      const collection = data.readGlobalSettingLibraries()
      const libraries = input.target.libraryId ? [find(collection.libraries, input.target.libraryId)] : collection.libraries
      return { scope: 'global', revision: collection.revision, libraries: libraries.map(library => ({
        id: library.id, name: library.name, enabled: library.enabled, entries: summarizeSettings(library.entries), groups: library.groups, promptPositions: library.promptPositions,
      })) }
    }
    const library = data.readSettingLibrary(requireCharacterTarget(characterId))
    return { entries: summarizeSettings(library.entries), groups: library.groups, promptPositions: library.promptPositions,
      activeVersionId: library.activeVersionId, versions: library.versions.map(({ id, name }) => ({ id, name })), source: { scope: 'character', characterId: library.characterId } }
  }, 'explicit-scope')
  const readRoleLibrary = (characterId: string) => {
    const snapshot = data.readSettingLibrarySnapshot(requireCharacterTarget(characterId))
    const { characterId: ownerId, ...library } = snapshot.library
    return { library, libraryRevision: snapshot.revision, source: { scope: 'character', characterId: ownerId } }
  }
  operation('settings', 'read_library', '读取当前角色完整设定配置、自定义位置及全部命名版本', 'read', empty, readRoleLibrary)
  operation('settings', 'save_library', '按读取修订保存当前角色完整设定配置、位置和版本', 'write', z.object({
    expectedLibraryRevision: z.string().regex(/^[a-f0-9]{64}$/).describe('最近 settings.read_library 返回的 libraryRevision；普通条目修改仍优先用 update/edit。'),
    library: roleSettingDocument,
  }).strict(), (characterId, input) => {
    const current = readRoleLibrary(characterId)
    if (current.libraryRevision !== input.expectedLibraryRevision) throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '角色设定配置已变化，请重新读取后合并。', { what: '角色设定库' })
    if (new Set(input.library.versions.map(version => version.id)).size !== input.library.versions.length || !input.library.versions.some(version => version.id === input.library.activeVersionId)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '设定版本编号必须唯一，且当前版本必须存在。', { field: 'versions' })
    }
    for (const document of [input.library, ...input.library.versions]) {
      const positions = new Map(document.promptPositions.map(position => [position.id, position]))
      if (positions.size !== document.promptPositions.length || document.entries.some(entry => entry.promptPositionId
        && (!positions.has(entry.promptPositionId) || positions.get(entry.promptPositionId)!.anchor !== entry.position))) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '自定义位置编号重复、引用不存在或插入锚点不一致。', { field: 'promptPositions' })
      }
    }
    for (const version of input.library.versions) for (const entry of version.entries) if (entry.kind === 'normal') assertSettingFormat(entry)
    for (const entry of input.library.entries) if (entry.kind === 'normal') assertSettingFormat(entry)
    const normalizeEntries = (entries: z.output<typeof settingLibrarySchema>['entries']) => entries.map(entry => ({ ...entry, openingMessages: entry.openingMessages.map(defined) }))
    data.saveSettingLibrary(characterId, { ...input.library, characterId, entries: normalizeEntries(input.library.entries),
      versions: input.library.versions.map(version => ({ ...version, entries: normalizeEntries(version.entries) })) })
    return readRoleLibrary(characterId)
  })
  operation('settings', 'read', '读取当前角色或指定全局库的一条完整设定原稿', 'read', z.object({ id, target: settingReadTarget.optional() }).strict(), (characterId, input) => {
    if (input.target?.scope === 'global') {
      const collection = data.readGlobalSettingLibraries(), library = find(collection.libraries, input.target.libraryId)
      return { ...find(library.entries, input.id), revision: collection.revision, source: { scope: 'global', libraryId: library.id, libraryName: library.name, libraryEnabled: library.enabled } }
    }
    return find(data.readSettingLibrary(requireCharacterTarget(characterId)).entries, input.id)
  }, 'explicit-scope')
  operation('settings', 'create', '在当前角色或指定全局库新增设定条目', 'write', settingChanges.safeExtend(settingWriteFields), (characterId, { target, expectedRevision, ...input }) => {
    const store = settingsStore(characterId, { target, expectedRevision }), { library } = store
    const base = emptyEntry()
    const entry = { ...base, openingMessages: base.openingMessages.map(defined), ...defined(input), order: input.order ?? library.entries.length + 1 }
    assertSettingFormat(entry)
    assertSettingPosition(entry, library.promptPositions)
    return store.receipt(find(store.save({ ...library, entries: [...library.entries, entry] }).entries, entry.id))
  }, 'explicit-scope')
  const settingUpdate = z.object({ id, changes: settingChanges }).strict()
  const updateSettings = (characterId: string, updates: z.output<typeof settingUpdate>[], options: SettingWriteOptions) => {
    const store = settingsStore(characterId, options), { library } = store
    for (const input of updates) {
      const entry = { ...find(library.entries, input.id), ...defined(input.changes) }
      assertSettingFormat(entry)
      assertSettingPosition(entry, library.promptPositions)
    }
    const entries = store.update(updates.map(input => ({ id: input.id, changes: defined(input.changes) })))
    return options.target?.scope === 'global' ? store.receipt({ entries }) : entries
  }
  operation('settings', 'update', '修改当前角色或指定全局库的设定条目', 'write', settingUpdate.extend(settingWriteFields), (characterId, input) => updateSettings(characterId, [input], input), 'explicit-scope')
  operation('settings', 'update_many', '在同一事务批量修改设定、启停或关键词匹配', 'write',
    z.object({ updates: z.array(settingUpdate).min(1), ...settingWriteFields }).strict(), (characterId, input) => updateSettings(characterId, input.updates, input), 'explicit-scope')
  operation('settings', 'edit', '精确替换设定正文片段，保留其余内容', 'write', z.object({
    id, ...settingWriteFields,
    old_string: z.string().min(1).describe('要替换的准确原文；包含必要上下文以唯一定位，不做正则或模板展开。'),
    new_string: z.string().describe('替换文本，按字面量写入；空字符串表示删除该片段。'),
    replace_all: z.boolean().optional().describe('默认 false，仅允许原文唯一匹配；明确要替换全部匹配时设为 true。'),
  }).strict(), (characterId, input) => {
    if (input.old_string === input.new_string) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '原文和替换文本不能相同。', { field: 'new_string' })
    const store = settingsStore(characterId, input), entry = find(store.library.entries, input.id)
    const parts = entry.content.split(input.old_string), replacements = parts.length - 1
    if (!replacements) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '正文中找不到 old_string，请重新读取并提供准确原文。', { what: '要替换的原文片段' })
    if (replacements > 1 && input.replace_all !== true) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, 'old_string 出现多次，请补充上下文使原文唯一；明确替换全部时才使用 replace_all。', { what: '要替换的原文片段' })
    store.update([{ id: entry.id, changes: { content: parts.join(input.new_string) } }])
    return store.receipt({ id: entry.id, changed: true, replacements })
  }, 'explicit-scope')
  operation('settings', 'remove', '删除当前角色或指定全局库的设定条目', 'write', entity.extend(settingWriteFields), (characterId, input) => {
    const store = settingsStore(characterId, input), { library } = store
    find(library.entries, input.id)
    store.save({ ...library, entries: library.entries.filter(item => item.id !== input.id) })
    return store.receipt({ removedId: input.id })
  }, 'explicit-scope')
  operation('settings', 'create_group', '在当前角色或指定全局库新增设定文件夹', 'write', mutableGroup.extend(settingWriteFields).strict(), (characterId, { target, expectedRevision, ...input }) => {
    const store = settingsStore(characterId, { target, expectedRevision }), { library } = store, timestamp = stamp()
    const group = { ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp }
    store.save({ ...library, groups: [...library.groups, group] })
    return store.receipt(group)
  }, 'explicit-scope')
  operation('settings', 'update_group', '修改设定文件夹名称、上级或排序', 'write', z.object({ id, changes: changes(mutableGroup), ...settingWriteFields }).strict(), (characterId, input) => {
    const store = settingsStore(characterId, input), { library } = store, group = find(library.groups, input.id)
    const saved = store.save({ ...library, groups: library.groups.map(item => item.id === group.id ? { ...group, ...defined(input.changes) } : item) })
    return store.receipt(find(saved.groups, group.id))
  }, 'explicit-scope')
  operation('settings', 'remove_group', '删除设定文件夹及其中的子文件夹和条目', 'write', entity.extend(settingWriteFields), (characterId, input) => {
    const store = settingsStore(characterId, input), { library } = store
    find(library.groups, input.id)
    const removed = new Set([input.id])
    for (let size = 0; size !== removed.size;) { size = removed.size; for (const group of library.groups) if (removed.has(group.parentId)) removed.add(group.id) }
    const entries = library.entries.filter(item => removed.has(item.groupId))
    store.save({ ...library, groups: library.groups.filter(item => !removed.has(item.id)),
      entries: library.entries.filter(item => !removed.has(item.groupId)), expandedGroupIds: library.expandedGroupIds.filter(id => !removed.has(id)) })
    return store.receipt({ removedGroupIds: [...removed], removedEntryIds: entries.map(item => item.id) })
  }, 'explicit-scope')
  const globalLibraryTarget = z.object({ scope: z.literal('global') }).strict()
  operation('settings', 'create_library', '新建全局设定库（默认停用）', 'write', z.object({ target: globalLibraryTarget, expectedRevision: revision, name: z.string().trim().min(1) }).strict(), (_characterId, input) => {
    const current = data.readGlobalSettingLibraries(); checkRevision(input.expectedRevision, current.revision)
    const timestamp = stamp(), library = { id: randomUUID(), name: input.name, enabled: false, entries: [], groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: false, createdAt: timestamp, updatedAt: timestamp }
    const saved = data.saveGlobalSettingLibraries({ ...current, libraries: [...current.libraries, library] })
    return { revision: saved.revision, library }
  }, 'explicit-scope')
  const globalLibraryAddress = globalLibraryTarget.extend({ libraryId: id }).strict()
  operation('settings', 'update_library', '修改全局设定库名称或整体启停', 'write', z.object({ target: globalLibraryAddress, expectedRevision: revision,
    changes: changes(z.object({ name: z.string().trim().min(1), enabled: z.boolean() })) }).strict(), (_characterId, input) => {
    const current = data.readGlobalSettingLibraries(); checkRevision(input.expectedRevision, current.revision)
    const library = { ...find(current.libraries, input.target.libraryId), ...defined(input.changes), updatedAt: stamp() }
    const saved = data.saveGlobalSettingLibraries({ ...current, libraries: current.libraries.map(item => item.id === library.id ? library : item) })
    return { revision: saved.revision, library: { id: library.id, name: library.name, enabled: library.enabled } }
  }, 'explicit-scope')
  operation('settings', 'remove_library', '删除指定全局设定库及其全部条目和文件夹', 'write', z.object({ target: globalLibraryAddress, expectedRevision: revision }).strict(), (_characterId, input) => {
    const current = data.readGlobalSettingLibraries(); checkRevision(input.expectedRevision, current.revision); find(current.libraries, input.target.libraryId)
    const saved = data.saveGlobalSettingLibraries({ ...current, libraries: current.libraries.filter(item => item.id !== input.target.libraryId) })
    return { revision: saved.revision, removedLibraryId: input.target.libraryId }
  }, 'explicit-scope')
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
  const readScripts = (characterId: string, input: { target?: z.output<typeof configurationTarget> | undefined; expectedRevision: number }) => {
    const target = resolveConfigurationTarget(characterId, input.target), library = data.readScriptLibrary(target.scope, target.ownerId)
    if (input.expectedRevision !== library.revision) throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '脚本库已被修改，请重新读取后再保存。', { what: '脚本库' })
    return library
  }
  operation('scripts', 'list', '列出全局或当前角色的脚本目录和设置', 'read', z.object({ target: configurationTarget.optional() }).strict(), (characterId, input) => {
    const target = resolveConfigurationTarget(characterId, input.target), library = data.readScriptLibrary(target.scope, target.ownerId)
    return { ...target, enabled: library.enabled, revision: library.revision, items: library.trees.map(tree => tree.type === 'folder'
      ? { id: tree.id, type: tree.type, name: tree.name, enabled: tree.enabled, scripts: tree.scripts.map(({ id, name, enabled, runtime }) => ({ id, name, enabled, runtime })) }
      : { id: tree.id, type: tree.type, name: tree.name, enabled: tree.enabled, runtime: tree.runtime }), variables: library.variables }
  }, 'explicit-scope')
  operation('scripts', 'read', '读取全局或当前角色的完整脚本源码或文件夹', 'read', z.object({ id, target: configurationTarget.optional() }).strict(), (characterId, input) => {
    const target = resolveConfigurationTarget(characterId, input.target), library = data.readScriptLibrary(target.scope, target.ownerId)
    return { ...target, enabled: library.enabled, revision: library.revision, item: find(scriptItems(library), input.id) }
  }, 'explicit-scope')
  operation('scripts', 'create', '新增 ElecKoi 原生脚本（默认停用）', 'write', z.object({
    ...configurationWriteFields, folderId: z.string().optional(), name: z.string().min(1), content: z.string(), info: z.string().optional(), data: z.record(z.string(), z.json()).optional(),
  }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input)
    requireNativeSource(input.content, false)
    const script = scriptSchema.parse({ type: 'script', id: randomUUID(), name: input.name, content: input.content, info: input.info ?? '', data: input.data ?? {}, runtime: nativeRuntime.parse({ kind: 'eleckoi-module', apiVersion: 1 }) })
    if (input.folderId) {
      const folder = find(library.trees, input.folderId)
      if (folder.type !== 'folder') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '所选目标不是脚本文件夹。', { field: 'folderId' })
      library.trees = library.trees.map(tree => tree.id === folder.id ? { ...folder, scripts: [...folder.scripts, script] } : tree)
    } else library.trees = [...library.trees, script]
    const saved = data.saveScriptLibrary(library)
    return { revision: saved.revision, item: find(scriptItems(saved), script.id) }
  }, 'explicit-scope')
  operation('scripts', 'update', '修改指定范围的脚本源码、设置、按钮或导出选项', 'write', z.object({ id, ...configurationWriteFields, changes: changes(scriptFields) }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input), item = find(scriptItems(library), input.id)
    if (item.type !== 'script') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '所选项目不是脚本。', { field: 'itemId' })
    const runtime = item.runtime
    if (runtime && typeof runtime === 'object' && !Array.isArray(runtime) && runtime.kind === 'eleckoi-module' && runtime.apiVersion === 1) {
      if (input.changes.content !== undefined || input.changes.enabled === true) requireNativeSource(input.changes.content ?? item.content, input.changes.enabled ?? item.enabled)
    }
    const saved = data.saveScriptLibrary(mapScript(library, item.id, script => ({ ...script, ...defined(input.changes) })))
    return { revision: saved.revision, item: find(scriptItems(saved), item.id) }
  }, 'explicit-scope')
  operation('scripts', 'remove', '删除指定范围的单个脚本', 'write', z.object({ id, ...configurationWriteFields }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input), item = find(scriptItems(library), input.id)
    if (item.type !== 'script') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '删除文件夹前请逐个处理其中脚本。', { field: 'id' })
    const saved = data.saveScriptLibrary({ ...library, trees: library.trees.filter(tree => tree.id !== item.id).map(tree => tree.type === 'folder' ? { ...tree, scripts: tree.scripts.filter(script => script.id !== item.id) } : tree) })
    return { removedId: item.id, revision: saved.revision }
  }, 'explicit-scope')
  operation('scripts', 'create_folder', '在指定范围新增脚本文件夹', 'write', z.object({ name: z.string().min(1), ...configurationWriteFields }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input), folder = scriptFolderSchema.parse({ type: 'folder', id: randomUUID(), name: input.name, enabled: true, scripts: [] })
    const saved = data.saveScriptLibrary({ ...library, trees: [...library.trees, folder] })
    return { revision: saved.revision, item: find(saved.trees, folder.id) }
  }, 'explicit-scope')
  operation('scripts', 'update_folder', '修改指定范围的脚本文件夹名称或开关', 'write', z.object({ id, ...configurationWriteFields,
    changes: changes(z.object({ name: z.string().min(1), enabled: z.boolean(), icon: z.string(), color: z.string() })),
  }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input), folder = find(library.trees, input.id)
    if (folder.type !== 'folder') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '所选项目不是脚本文件夹。', { field: 'folderId' })
    const saved = data.saveScriptLibrary({ ...library, trees: library.trees.map(tree => tree.id === folder.id ? { ...folder, ...defined(input.changes) } : tree) })
    return { revision: saved.revision, item: find(saved.trees, folder.id) }
  }, 'explicit-scope')
  operation('scripts', 'remove_folder', '删除指定范围的空脚本文件夹', 'write', z.object({ id, ...configurationWriteFields }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input), folder = find(library.trees, input.id)
    if (folder.type !== 'folder' || folder.scripts.length) throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '只能删除空脚本文件夹，请先移动或删除其中脚本。', { what: '移动或删除文件夹里的脚本' })
    const saved = data.saveScriptLibrary({ ...library, trees: library.trees.filter(tree => tree.id !== folder.id) })
    return { removedId: folder.id, revision: saved.revision }
  }, 'explicit-scope')
  operation('scripts', 'move', '在同一库内把脚本移入指定文件夹或根目录', 'write', z.object({ id, ...configurationWriteFields, folderId: z.string().describe('同一库中的目标文件夹编号；空字符串表示库根目录，不跨库移动。') }).strict(), (characterId, input) => {
    const library = readScripts(characterId, input), item = find(scriptItems(library), input.id)
    if (item.type !== 'script') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '只能移动脚本到库根目录或文件夹。', { field: 'itemId' })
    if (input.folderId && find(library.trees, input.folderId).type !== 'folder') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '所选目标不是脚本文件夹。', { field: 'folderId' })
    const trees = library.trees.filter(tree => tree.id !== item.id).map(tree => tree.type === 'folder'
      ? { ...tree, scripts: [...tree.scripts.filter(script => script.id !== item.id), ...(tree.id === input.folderId ? [item] : [])] } : tree)
    if (!input.folderId) trees.push(item)
    const saved = data.saveScriptLibrary({ ...library, trees })
    return { revision: saved.revision, item: find(scriptItems(saved), item.id) }
  }, 'explicit-scope')
  operation('scripts', 'configure', '设置指定范围脚本库的整体启停和库设置', 'write', z.object({ ...configurationWriteFields,
    changes: changes(z.object({ enabled: z.boolean(), variables: z.record(z.string(), z.json()) })),
  }).strict(), (characterId, input) => {
    const saved = data.saveScriptLibrary({ ...readScripts(characterId, input), ...defined(input.changes) })
    return { revision: saved.revision, enabled: saved.enabled, variables: saved.variables }
  }, 'explicit-scope')
  operation('regex', 'list', '读取全局或当前角色的完整正则规则', 'read', z.object({ target: configurationTarget.optional() }).strict(), (characterId, input) => {
    const target = resolveConfigurationTarget(characterId, input.target)
    return data.readRegexLibrary(target.scope, target.ownerId)
  }, 'explicit-scope')
  operation('regex', 'read', '按编号读取指定范围的一条完整正则规则', 'read', z.object({ id, target: configurationTarget.optional() }).strict(), (characterId, input) => {
    const target = resolveConfigurationTarget(characterId, input.target), { rules, ...library } = data.readRegexLibrary(target.scope, target.ownerId)
    return { ...library, rule: find(rules, input.id) }
  }, 'explicit-scope')
  const assertRegex = (rule: z.output<typeof regexRuleSchema>) => {
    const failure = validateRegexRule(rule)
    if (failure) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, failure, { field: 'rule' })
  }
  const readRegexForWrite = (characterId: string, input: { target?: z.output<typeof configurationTarget> | undefined; expectedRevision: number; expectedOwnerRevision?: string | undefined }) => {
    const target = resolveConfigurationTarget(characterId, input.target), library = data.readRegexLibrary(target.scope, target.ownerId)
    if (library.revision !== input.expectedRevision || input.expectedOwnerRevision !== undefined && library.ownerRevision !== input.expectedOwnerRevision) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '该范围的正则已被修改，请重新读取后合并。', { what: '正则库' })
    }
    return library
  }
  operation('regex', 'create', '在指定范围新增正则规则', 'write', z.object({ ...regexWriteFields, rule: regexRuleSchema.omit({ id: true }).strict() }).strict(), (characterId, input) => {
    const library = readRegexForWrite(characterId, input), rule = { ...defined(input.rule), id: randomUUID() }
    assertRegex(rule)
    const saved = data.saveRegexLibrary({ ...library, rules: [...library.rules, rule] }, [rule.id])
    return { revision: saved.revision, ownerRevision: saved.ownerRevision, rule: find(saved.rules, rule.id) }
  }, 'explicit-scope')
  operation('regex', 'update', '部分修改指定范围的一条正则规则', 'write', z.object({ id, ...regexWriteFields, changes: changes(regexRuleSchema.omit({ id: true })) }).strict(), (characterId, input) => {
    const library = readRegexForWrite(characterId, input)
    const rule = { ...find(library.rules, input.id), ...defined(input.changes) }
    assertRegex(rule)
    const rules = library.rules.map(item => item.id === rule.id ? rule : item)
    const saved = data.saveRegexLibrary({ ...library, rules }, input.changes.enabled === undefined ? [] : [rule.id])
    return { revision: saved.revision, ownerRevision: saved.ownerRevision, rule: find(saved.rules, rule.id) }
  }, 'explicit-scope')
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
  }, 'explicit-scope')
  operation('regex', 'remove', '删除指定范围的一条正则规则', 'write', z.object({ id, ...regexWriteFields }).strict(), (characterId, input) => {
    const library = readRegexForWrite(characterId, input)
    find(library.rules, input.id)
    const saved = data.saveRegexLibrary({ ...library, rules: library.rules.filter(item => item.id !== input.id) }, [])
    return { removedId: input.id, revision: saved.revision, ownerRevision: saved.ownerRevision }
  }, 'explicit-scope')
  operation('regex', 'configure', '设置指定范围正则库的整体启停', 'write', z.object({ ...regexWriteFields, enabled: z.boolean() }).strict(), (characterId, input) => {
    const saved = data.saveRegexLibrary({ ...readRegexForWrite(characterId, input), enabled: input.enabled }, [])
    return { revision: saved.revision, ownerRevision: saved.ownerRevision, enabled: saved.enabled }
  }, 'explicit-scope')
  operation('editorVersions', 'read', '读取共享全局或当前角色的完整命名配置版本', 'read',
    z.object({ kind: editorLibraryKindSchema, target: configurationTarget }).strict(), (characterId, input) => {
      const target = resolveConfigurationTarget(characterId, input.target)
      return { library: data.readEditorLibraryVersions({ kind: input.kind, ...target }),
        document: input.kind === 'scripts' ? data.readScriptLibrary(target.scope, target.ownerId)
          : characterId ? data.readRegexEditor({ scope: 'character', ownerId: requireCharacterTarget(characterId) }) : null }
    }, 'explicit-scope')
  operation('editorVersions', 'save', '原子保存角色卡或共享全局正则／脚本及命名版本', 'write', versionSaveSchema,
    (characterId, input) => {
      const targets = input.kind === 'regex' ? input.documents.map(document => document.target) : input.documents
      if (targets.some(target => target.scope === 'character') || input.versions.some(version => version.scope === 'character')) requireCharacterTarget(characterId)
      for (const version of input.versions) if (version.scope === 'character' && version.ownerId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '配置版本不属于当前编辑角色。', { what: '其它角色的配置版本' })
      for (const target of targets) if (target.scope === 'character' && target.ownerId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '配置不属于当前编辑角色。', { what: '其它角色的配置' })
      const saved = data.saveEditorLibraries({ ...input, documents: input.documents.map(document => JSON.stringify(document)) })
      return { ...saved, documents: saved.documents.map(document => JSON.parse(document) as unknown) }
    }, 'explicit-scope')
  return [...catalog, ...creatorMediaCapabilities(data)]
}
