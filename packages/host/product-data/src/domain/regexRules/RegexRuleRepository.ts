import { createHash, randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type {
  RegexRule,
  RegexRuleCollection,
  RegexRuleImportDocument,
  RegexRuleScope,
  RegexRuleTarget,
  RegexRuleVersion
} from '@shared/contracts/regex/schemas'
import type { RegexEditorTarget, RegexRuleEditorCollection } from '@shared/contracts/regex/schemas'
import {
  regexRuleCollectionSchema,
  regexRuleSchema,
  regexRuleTargetSchema,
  regexEditorTargetSchema,
  regexRuleEditorCollectionSchema
} from '@shared/contracts/regex/schemas'
import { regexLibrarySchema, type RegexLibrary } from '@shared/contracts/regex/schemas'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import {
  includeImportedRulesInActiveVersion,
  transformCollectionSurface
} from '@shared/foundation/regex/RegexRuleProcessor'
import type { RegexRuleSurface } from '@shared/contracts/regex/schemas'
import { requireCharacter } from '@product-data/domain/personas'
import type { ElecKoiDatabase, ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import {
  characterRegexRules,
  globalRegexRules,
  regexEnablementVersions,
  regexState,
  regexLibraries
} from '@product-data/storage/sqlite/schema/common'
import { decodeRegexDocuments, encodeRegexExport, type ScopedRegexRule } from '@shared/foundation/regexRuleTransfer'

export interface AgentPresetRegexPort {
  readActiveRegexRules(db?: ElecKoiDatabase): {
    presetId: string
    presetName: string
    rules: RegexRule[]
    revision: string
  }
  replaceActiveRegexRules(rules: RegexRule[], db: ElecKoiDatabase): void
  readRegexRules(presetId: string, db: ElecKoiDatabase): { rules: RegexRule[]; revision: string }
  replaceRegexRules(presetId: string, rules: RegexRule[], db: ElecKoiDatabase): void
  enabledRegexRuleIds(db: ElecKoiDatabase): string[]
}

function parseStringList(raw: string, description: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `${description}的形状不对。`, { what: description })
    return [...new Set(parsed.filter((value): value is string => typeof value === 'string' && value.length > 0))]
  } catch (error) {
    if (error instanceof DesktopError) throw error
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, `${description}已损坏。`, { what: description })
  }
}

function parseTargets(raw: string): RegexRuleTarget[] {
  return regexRuleTargetSchema.array().parse(parseStringList(raw, '正则目标'))
}

function rowToRule(row: {
  id: string; name: string; pattern: string; replacement: string; targetsJson: string
  enabled: number; displayOnly: number; promptOnly: number; runOnEdit: number; sortIndex: number; optionsJson: string
}): RegexRule {
  return regexRuleSchema.parse({
    ...JSON.parse(row.optionsJson),
    id: row.id,
    name: row.name,
    pattern: row.pattern,
    replacement: row.replacement,
    targets: parseTargets(row.targetsJson),
    enabled: Boolean(row.enabled),
    displayOnly: Boolean(row.displayOnly),
    promptOnly: Boolean(row.promptOnly),
    runOnEdit: Boolean(row.runOnEdit),
    order: row.sortIndex
  })
}

function normalizedRule(rule: RegexRule, order: number): RegexRule {
  return regexRuleSchema.parse({
    ...rule,
    name: rule.name.trim(),
    pattern: rule.pattern,
    targets: [...new Set(rule.targets)],
    order
  })
}

function normalizedCollection(characterId: string, input: RegexRuleCollection): RegexRuleCollection {
  if (input.characterId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '正则配置与角色不匹配。', { what: '正则配置与角色' })
  const normalize = (rules: RegexRule[]) => rules.map(normalizedRule)
  const versions: RegexRuleVersion[] = input.versions.map((version) => ({
    ...version,
    name: version.name.trim() || '未命名预设',
    globalEnabledIds: [...new Set(version.globalEnabledIds)],
    agentPresetEnabledIds: [...new Set(version.agentPresetEnabledIds)],
    characterEnabledIds: [...new Set(version.characterEnabledIds)]
  }))
  const activeVersionId = versions.some((version) => version.id === input.activeVersionId) ? input.activeVersionId : ''
  const collection = regexRuleCollectionSchema.parse({
    ...input,
    characterId,
    globalRules: normalize(input.globalRules),
    agentPresetRules: normalize(input.agentPresetRules),
    characterRules: normalize(input.characterRules),
    versions,
    activeVersionId
  })
  const ids = collection.globalRules.concat(collection.agentPresetRules, collection.characterRules).map((rule) => rule.id)
  if (new Set(ids).size !== ids.length) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '正则规则编号不能重复。', { field: 'ids' })
  return collection
}

function ruleRow(rule: RegexRule, sortIndex: number) {
  return {
    id: rule.id,
    name: rule.name,
    pattern: rule.pattern,
    replacement: rule.replacement,
    targetsJson: JSON.stringify(rule.targets),
    enabled: Number(rule.enabled),
    displayOnly: Number(rule.displayOnly),
    promptOnly: Number(rule.promptOnly),
    runOnEdit: Number(rule.runOnEdit),
    sortIndex,
    optionsJson: JSON.stringify({ trimStrings: rule.trimStrings ?? [], minDepth: rule.minDepth ?? null,
      maxDepth: rule.maxDepth ?? null, substituteRegex: rule.substituteRegex ?? 0 })
  }
}

function ruleParameters() {
  return {
    id: sql.placeholder('id'), name: sql.placeholder('name'), pattern: sql.placeholder('pattern'),
    replacement: sql.placeholder('replacement'), targetsJson: sql.placeholder('targetsJson'),
    enabled: sql.placeholder('enabled'), displayOnly: sql.placeholder('displayOnly'),
    promptOnly: sql.placeholder('promptOnly'), runOnEdit: sql.placeholder('runOnEdit'),
    sortIndex: sql.placeholder('sortIndex'), optionsJson: sql.placeholder('optionsJson'),
  }
}

function insertCharacterRules(db: ElecKoiDatabase, characterId: string, rules: RegexRule[]): void {
  if (!rules.length) return
  const insert = db.insert(characterRegexRules).values({ characterId, ...ruleParameters() }).prepare()
  rules.forEach((rule, index) => insert.run(ruleRow(rule, index)))
}

export class RegexRuleRepository {
  constructor(
    private readonly store: ElecKoiSqliteStore,
    private readonly agentPresetRegexes: AgentPresetRegexPort
  ) {}

  scopeEnabled(scope: 'global' | 'character' | 'preset', ownerId: string, db: ElecKoiDatabase = this.store.db): boolean {
    return db.select({ enabled: regexLibraries.enabled }).from(regexLibraries)
      .where(and(eq(regexLibraries.scope, scope), eq(regexLibraries.ownerId, ownerId))).get()?.enabled !== 0
  }

  private saveScopeEnabled(db: ElecKoiDatabase, scope: 'global' | 'character' | 'preset', ownerId: string, enabled: boolean): void {
    db.insert(regexLibraries).values({ scope, ownerId, enabled: Number(enabled),
      characterId: scope === 'character' ? ownerId : null, presetId: scope === 'preset' ? ownerId : null })
      .onConflictDoUpdate({ target: [regexLibraries.scope, regexLibraries.ownerId], set: { enabled: Number(enabled) } }).run()
  }

  private readVersions(db: ElecKoiDatabase): RegexRuleVersion[] {
    return db.select().from(regexEnablementVersions).orderBy(asc(regexEnablementVersions.sortIndex)).all()
      .map(row => ({ id: row.id, name: row.name,
        globalEnabledIds: parseStringList(row.globalEnabledIdsJson, '正则预设'),
        agentPresetEnabledIds: parseStringList(row.agentPresetEnabledIdsJson, '正则预设'),
        characterEnabledIds: parseStringList(row.characterEnabledIdsJson, '正则预设') }))
  }

  readScope(scope: 'global' | 'character' | 'preset', ownerId: string): RegexRule[] {
    if (scope === 'global') {
      if (ownerId) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, '全局正则使用空归属编号。', { what: '全局正则的归属编号' })
      return this.store.db.select().from(globalRegexRules).orderBy(asc(globalRegexRules.sortIndex)).all().map(rowToRule)
    }
    const collection = this.readEditor({ scope, ownerId })
    return scope === 'preset' ? collection.agentPresetRules : collection.characterRules
  }

  readLibrary(scope: 'global' | 'character' | 'preset', ownerId: string) {
    const rules = this.readScope(scope, ownerId)
    const enabled = this.scopeEnabled(scope, ownerId)
    return regexLibrarySchema.parse({ scope, ownerId, enabled, rules,
      ownerRevision: createHash('sha256').update(JSON.stringify({ enabled, rules })).digest('hex'),
      revision: this.store.db.select().from(regexState).where(eq(regexState.singletonId, 1)).get()?.revision ?? 0 })
  }

  saveLibrary(input: RegexLibrary, enabledRuleIds: string[]): RegexLibrary {
    const library = regexLibrarySchema.parse(input), rules = library.rules.map(normalizedRule)
    return this.store.withWriteTx(db => {
      const current = this.readLibrary(library.scope, library.ownerId)
      if (current.revision !== library.revision || current.ownerRevision !== library.ownerRevision) throw new DesktopError(
        ELECKOI_FAILURE_CODES.conflictStaleRevision, '该范围的正则已被修改，请重新读取后合并。', { what: '正则库' })
      const previous = new Map(current.rules.map(rule => [rule.id, rule])), previousIds = new Set(previous.keys()), nextIds = new Set(rules.map(rule => rule.id))
      const changedEnablement = new Set(enabledRuleIds)
      if ([...changedEnablement].some(id => !nextIds.has(id))) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '启停修改中存在不属于该库的规则编号。', { what: '正则规则' })
      for (const rule of rules) if (!previous.has(rule.id) || previous.get(rule.id)!.enabled !== rule.enabled) changedEnablement.add(rule.id)
      const state = db.select().from(regexState).where(eq(regexState.singletonId, 1)).get()
      const key = library.scope === 'global' ? 'globalEnabledIds' : library.scope === 'preset' ? 'agentPresetEnabledIds' : 'characterEnabledIds'
      const versions = this.readVersions(db).map(version => ({ ...version, [key]: version.id === state?.activeVersionId
        ? [...version[key].filter(id => !previousIds.has(id) || nextIds.has(id) && !changedEnablement.has(id)), ...rules.filter(rule => changedEnablement.has(rule.id) && rule.enabled).map(rule => rule.id)]
        : version[key].filter(id => !previousIds.has(id) || nextIds.has(id)) }))
      if (library.scope === 'global') {
        this.persistShared(db, { globalRules: rules, versions })
      } else {
        // Preserve shared rules and other owners' enablement memberships.
        this.persistEnablementVersions(db, versions)
        if (library.scope === 'preset') this.agentPresetRegexes.replaceRegexRules(library.ownerId, rules, db)
        else {
          db.delete(characterRegexRules).where(eq(characterRegexRules.characterId, library.ownerId)).run()
          insertCharacterRules(db, library.ownerId, rules)
        }
      }
      this.saveScopeEnabled(db, library.scope, library.ownerId, library.enabled)
      db.insert(regexState).values({ singletonId: 1, activeVersionId: state?.activeVersionId ?? null, revision: current.revision + 1 })
        .onConflictDoUpdate({ target: regexState.singletonId, set: { activeVersionId: state?.activeVersionId ?? null, revision: current.revision + 1 } }).run()
      return this.readLibrary(library.scope, library.ownerId)
    })
  }

  copyCharacter(sourceId: string, targetId: string): Map<string, string> {
    const source = this.readEditor({ scope: 'character', ownerId: sourceId });
    const target = this.readEditor({ scope: 'character', ownerId: targetId });
    const ids = new Map(source.characterRules.map(rule => [rule.id, `regex-${randomUUID()}`]));
    this.saveEditor({ ...target, characterEnabled: source.characterEnabled,
      characterRules: source.characterRules.map(rule => ({ ...rule, id: ids.get(rule.id)! })),
      versions: target.versions.map(version => ({ ...version,
        characterEnabledIds: (source.versions.find(item => item.id === version.id)?.characterEnabledIds ?? []).map(id => ids.get(id)!),
      })),
    });
    return ids;
  }

  readEditor(targetInput: RegexEditorTarget, db: ElecKoiDatabase = this.store.db): RegexRuleEditorCollection {
    const target = regexEditorTargetSchema.parse(targetInput)
    if (target.scope === 'character') requireCharacter(db, target.ownerId)
    const ownerRules = target.scope === 'preset' ? this.agentPresetRegexes.readRegexRules(target.ownerId, db).rules
      : db.select().from(characterRegexRules).where(eq(characterRegexRules.characterId, target.ownerId))
        .orderBy(asc(characterRegexRules.sortIndex)).all().map(rowToRule)
    const ownerIds = new Set(ownerRules.map(rule => rule.id))
    const state = db.select().from(regexState).where(eq(regexState.singletonId, 1)).get()
    return regexRuleEditorCollectionSchema.parse({
      target, ownerRevision: createHash('sha256').update(JSON.stringify(ownerRules)).digest('hex'),
      globalEnabled: this.scopeEnabled('global', '', db),
      ...(target.scope === 'preset' ? { agentPresetEnabled: this.scopeEnabled('preset', target.ownerId, db) }
        : { characterEnabled: this.scopeEnabled('character', target.ownerId, db) }),
      globalRules: db.select().from(globalRegexRules).orderBy(asc(globalRegexRules.sortIndex)).all().map(rowToRule),
      agentPresetRules: target.scope === 'preset' ? ownerRules : [],
      characterRules: target.scope === 'character' ? ownerRules : [],
      versions: this.readVersions(db).map(version => ({ ...version,
        agentPresetEnabledIds: target.scope === 'preset' ? version.agentPresetEnabledIds.filter(id => ownerIds.has(id)) : [],
        characterEnabledIds: target.scope === 'character' ? version.characterEnabledIds.filter(id => ownerIds.has(id)) : [] })),
      activeVersionId: state?.activeVersionId ?? '', revision: state?.revision ?? 0
    })
  }

  saveEditor(input: RegexRuleEditorCollection): RegexRuleEditorCollection {
    const parsed = regexRuleEditorCollectionSchema.parse(input)
    const { target } = parsed
    const hiddenKey = target.scope === 'character' ? 'agentPresetRules' : 'characterRules'
    const hiddenVersionKey = target.scope === 'character' ? 'agentPresetEnabledIds' : 'characterEnabledIds'
    if (parsed[hiddenKey].length || parsed.versions.some(version => version[hiddenVersionKey].length)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '正则编辑器不能修改其他归属的配置。', { what: '其他归属的正则配置' })
    }
    const hiddenEnablement = target.scope === 'character' ? 'agentPresetEnabled' : 'characterEnabled'
    if (parsed[hiddenEnablement] !== undefined) throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '正则编辑器不能修改其他归属的整体启停。', { what: '其他归属的整体启停' })
    const normalized = { ...parsed, globalRules: parsed.globalRules.map(normalizedRule),
      agentPresetRules: parsed.agentPresetRules.map(normalizedRule), characterRules: parsed.characterRules.map(normalizedRule) }
    const ids = normalized.globalRules.concat(normalized.agentPresetRules, normalized.characterRules).map(rule => rule.id)
    if (new Set(ids).size !== ids.length) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '正则规则编号不能重复。', { field: 'ids' })
    if (new Set(normalized.versions.map(version => version.id)).size !== normalized.versions.length) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '正则预设编号不能重复。', { field: 'versions' })
    if (normalized.activeVersionId && !normalized.versions.some(version => version.id === normalized.activeVersionId)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '指定的正则启用版本不存在。', { what: '正则启用版本' })
    for (const version of normalized.versions) {
      for (const [ruleKey, memberKey] of [['globalRules', 'globalEnabledIds'], ['agentPresetRules', 'agentPresetEnabledIds'], ['characterRules', 'characterEnabledIds']] as const) {
        const allowed = new Set(normalized[ruleKey].map(rule => rule.id))
        if (version[memberKey].some(id => !allowed.has(id))) throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '正则预设包含不属于本编辑器的规则。', { what: '其他编辑器的规则' })
      }
    }
    this.store.withWriteTx(db => {
      const current = this.readEditor(target, db)
      if (current.revision !== parsed.revision || current.ownerRevision !== parsed.ownerRevision) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '正则配置已在其他窗口更新，请放弃本页修改后载入最新内容。', { what: '正则配置' })
      }
      const ownerKey = target.scope === 'preset' ? 'agentPresetRules' : 'characterRules'
      const memberKey = target.scope === 'preset' ? 'agentPresetEnabledIds' : 'characterEnabledIds'
      const ownerIds = new Set(current[ownerKey].map(rule => rule.id))
      const storedVersions = this.readVersions(db)
      const storedById = new Map(storedVersions.map(version => [version.id, version]))
      const active = storedById.get(current.activeVersionId)
      const baselineMembership = active ?? { agentPresetEnabledIds: this.agentPresetRegexes.enabledRegexRuleIds(db),
        characterEnabledIds: db.select().from(characterRegexRules).where(eq(characterRegexRules.enabled, 1)).all().map(rule => rule.id) }
      const versions = normalized.versions.map(version => {
        const previous = storedById.get(version.id) ?? baselineMembership
        return { ...version,
          [hiddenVersionKey]: [...previous[hiddenVersionKey]],
          [memberKey]: [...new Set([...previous[memberKey].filter(id => !ownerIds.has(id)), ...version[memberKey]])] }
      })
      this.persistShared(db, { ...normalized, versions })
      this.saveScopeEnabled(db, 'global', '', normalized.globalEnabled ?? current.globalEnabled ?? true)
      this.saveScopeEnabled(db, target.scope, target.ownerId,
        target.scope === 'preset' ? normalized.agentPresetEnabled ?? current.agentPresetEnabled ?? true
          : normalized.characterEnabled ?? current.characterEnabled ?? true)
      if (target.scope === 'preset') this.agentPresetRegexes.replaceRegexRules(target.ownerId, normalized.agentPresetRules, db)
      else {
        db.delete(characterRegexRules).where(eq(characterRegexRules.characterId, target.ownerId)).run()
        insertCharacterRules(db, target.ownerId, normalized.characterRules)
      }
      const activeVersionId = normalized.activeVersionId
      db.insert(regexState).values({ singletonId: 1, activeVersionId: activeVersionId || null, revision: current.revision + 1 })
        .onConflictDoUpdate({ target: regexState.singletonId, set: { activeVersionId: activeVersionId || null, revision: current.revision + 1 } }).run()
    })
    return this.readEditor(target)
  }

  importEditor(collection: RegexRuleEditorCollection, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[]) {
    const current = this.readEditor(collection.target)
    if (current.revision !== collection.revision || current.ownerRevision !== collection.ownerRevision) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '正则配置已更新，请载入最新内容后再导入。', { what: '正则配置' })
    }
    const ownerScope = collection.target.scope === 'preset' ? 'AgentPreset' : 'Character'
    if (fallbackScope !== 'Global' && fallbackScope !== ownerScope) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '导入归属不属于本编辑器。', { what: '导入归属' })
    const decoded = decodeRegexDocuments(documents, fallbackScope)
    if (decoded.rules.some(item => item.scope !== 'Global' && item.scope !== ownerScope)) throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '文件包含其他归属的正则，请在对应编辑器中导入。', { what: '其他归属的正则' })
    if (!decoded.rules.length) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '所选文件中没有可导入的正则规则。', { field: 'file' })
    const merged = includeImportedRulesInActiveVersion({ ...current,
      globalRules: current.globalRules.concat(decoded.rules.filter(item => item.scope === 'Global').map(item => item.rule)),
      agentPresetRules: current.agentPresetRules.concat(decoded.rules.filter(item => item.scope === 'AgentPreset').map(item => item.rule)),
      characterRules: current.characterRules.concat(decoded.rules.filter(item => item.scope === 'Character').map(item => item.rule)) }, decoded.rules)
    return { collection: this.saveEditor(merged), importedFileCount: decoded.importedFileCount,
      importedRuleCount: decoded.rules.length, failedFileNames: decoded.failedFileNames }
  }

  exportEditor(target: RegexEditorTarget, ruleIds: string[]): { fileName: string; json: string } {
    const collection = this.readEditor(target), ids = new Set(ruleIds)
    const selected: ScopedRegexRule[] = [
      ...collection.globalRules.filter(rule => ids.has(rule.id)).map(rule => ({ scope: 'Global' as const, rule })),
      ...collection.agentPresetRules.filter(rule => ids.has(rule.id)).map(rule => ({ scope: 'AgentPreset' as const, rule })),
      ...collection.characterRules.filter(rule => ids.has(rule.id)).map(rule => ({ scope: 'Character' as const, rule })) ]
    if (!selected.length || selected.length !== ids.size) throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '请选择本编辑器中可导出的规则。', { what: '选择要导出的规则' })
    return { fileName: 'eleckoi-regex-rules.json', json: encodeRegexExport(selected) }
  }

  get(characterId: string, db: ElecKoiDatabase = this.store.db): RegexRuleCollection {
    requireCharacter(db, characterId)
    const state = db.select().from(regexState).where(eq(regexState.singletonId, 1)).get()
    const preset = this.agentPresetRegexes.readActiveRegexRules(db)
    const versions = db.select().from(regexEnablementVersions).orderBy(asc(regexEnablementVersions.sortIndex)).all()
      .map((row): RegexRuleVersion => ({
        id: row.id,
        name: row.name,
        globalEnabledIds: parseStringList(row.globalEnabledIdsJson, '正则预设'),
        agentPresetEnabledIds: parseStringList(row.agentPresetEnabledIdsJson, '正则预设'),
        characterEnabledIds: parseStringList(row.characterEnabledIdsJson, '正则预设')
      }))
    return regexRuleCollectionSchema.parse({
      characterId,
      agentPresetId: preset.presetId,
      agentPresetName: preset.presetName,
      agentPresetRegexRevision: preset.revision,
      globalEnabled: this.scopeEnabled('global', '', db),
      agentPresetEnabled: this.scopeEnabled('preset', preset.presetId, db),
      characterEnabled: this.scopeEnabled('character', characterId, db),
      globalRules: db.select().from(globalRegexRules).orderBy(asc(globalRegexRules.sortIndex)).all().map(rowToRule),
      agentPresetRules: preset.rules,
      characterRules: db.select().from(characterRegexRules).where(eq(characterRegexRules.characterId, characterId))
        .orderBy(asc(characterRegexRules.sortIndex)).all().map(rowToRule),
      versions,
      activeVersionId: state?.activeVersionId ?? '',
      revision: state?.revision ?? 0
    })
  }

  save(characterId: string, input: RegexRuleCollection, expectedRevision: number): RegexRuleCollection {
    this.store.withWriteTx((db) => this.saveInTransaction(characterId, input, expectedRevision, db))
    return this.get(characterId)
  }

  saveInTransaction(
    characterId: string,
    input: RegexRuleCollection,
    expectedRevision: number,
    db: ElecKoiDatabase
  ): RegexRuleCollection {
    const normalized = normalizedCollection(characterId, input)
    requireCharacter(db, characterId)
    const current = db.select().from(regexState).where(eq(regexState.singletonId, 1)).get()
    const revision = current?.revision ?? 0
    if (revision !== expectedRevision) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '正则配置已在其他窗口更新，请重新打开后再保存。', { what: '正则配置' })
    }
    const activePreset = this.agentPresetRegexes.readActiveRegexRules(db)
    if (
      activePreset.presetId !== normalized.agentPresetId
      || activePreset.revision !== normalized.agentPresetRegexRevision
    ) {
      throw new DesktopError(
        ELECKOI_FAILURE_CODES.conflictStaleRevision,
        '当前 Agent 预设或其正则已在其他窗口更新，请重新打开后再保存。',
        { what: 'Agent 预设正则' }
      )
    }
    this.persistShared(db, normalized)
    this.saveScopeEnabled(db, 'global', '', normalized.globalEnabled ?? this.scopeEnabled('global', '', db))
    this.saveScopeEnabled(db, 'character', characterId, normalized.characterEnabled ?? this.scopeEnabled('character', characterId, db))
    if (normalized.agentPresetId) this.saveScopeEnabled(db, 'preset', normalized.agentPresetId,
      normalized.agentPresetEnabled ?? this.scopeEnabled('preset', normalized.agentPresetId, db))
    this.agentPresetRegexes.replaceActiveRegexRules(normalized.agentPresetRules, db)
    db.delete(characterRegexRules).where(eq(characterRegexRules.characterId, characterId)).run()
    insertCharacterRules(db, characterId, normalized.characterRules)
    db.insert(regexState).values({
      singletonId: 1,
      activeVersionId: normalized.activeVersionId || null,
      revision: revision + 1
    }).onConflictDoUpdate({
      target: regexState.singletonId,
      set: { activeVersionId: normalized.activeVersionId || null, revision: revision + 1 }
    }).run()
    return this.get(characterId, db)
  }

  import(
    characterId: string,
    fallbackScope: RegexRuleScope,
    documents: RegexRuleImportDocument[],
    expectedRevision: number
  ) {
    const current = this.get(characterId)
    if (current.revision !== expectedRevision) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '正则配置已在其他窗口更新，请重新打开后再导入。', { what: '正则配置' })
    }
    const decoded = decodeRegexDocuments(documents, fallbackScope)
    if (decoded.rules.length === 0) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '所选文件中没有可导入的正则规则。', { field: 'file' })
    }
    const grouped = new Map<RegexRuleScope, RegexRule[]>([
      ['Global', [...current.globalRules]],
      ['AgentPreset', [...current.agentPresetRules]],
      ['Character', [...current.characterRules]]
    ])
    decoded.rules.forEach(({ scope, rule }) => grouped.get(scope)?.push(rule))
    const merged = includeImportedRulesInActiveVersion({
      ...current,
      globalRules: grouped.get('Global') ?? [],
      agentPresetRules: grouped.get('AgentPreset') ?? [],
      characterRules: grouped.get('Character') ?? []
    }, decoded.rules)
    const saved = this.save(characterId, merged, expectedRevision)
    return {
      collection: saved,
      importedFileCount: decoded.importedFileCount,
      importedRuleCount: decoded.rules.length,
      failedFileNames: decoded.failedFileNames
    }
  }

  export(characterId: string, ruleIds: string[]): { fileName: string; json: string } {
    const selectedIds = new Set(ruleIds)
    const collection = this.get(characterId)
    const selected: ScopedRegexRule[] = [
      ...collection.globalRules.filter((rule) => selectedIds.has(rule.id)).map((rule) => ({ scope: 'Global' as const, rule })),
      ...collection.agentPresetRules.filter((rule) => selectedIds.has(rule.id)).map((rule) => ({ scope: 'AgentPreset' as const, rule })),
      ...collection.characterRules.filter((rule) => selectedIds.has(rule.id)).map((rule) => ({ scope: 'Character' as const, rule }))
    ]
    if (selected.length === 0) throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '请先选择要导出的规则。', { what: '选择要导出的规则' })
    return { fileName: 'eleckoi-regex-rules.json', json: encodeRegexExport(selected) }
  }

  transform(characterId: string, text: string, target: RegexRuleTarget, surface: RegexRuleSurface): string {
    return transformCollectionSurface(text, this.get(characterId), target, surface)
  }

  private persistShared(db: ElecKoiDatabase, collection: Pick<RegexRuleCollection, 'globalRules' | 'versions'>): void {
    db.delete(globalRegexRules).run()
    if (collection.globalRules.length > 0) {
      const insert = db.insert(globalRegexRules).values(ruleParameters()).prepare()
      collection.globalRules.forEach((rule, index) => insert.run(ruleRow(rule, index)))
    }
    this.persistEnablementVersions(db, collection.versions)
  }

  private persistEnablementVersions(db: ElecKoiDatabase, versions: RegexRuleVersion[]): void {
    db.delete(regexEnablementVersions).run()
    if (versions.length > 0) {
      const insert = db.insert(regexEnablementVersions).values({ id: sql.placeholder('id'), name: sql.placeholder('name'),
        sortIndex: sql.placeholder('sortIndex'), globalEnabledIdsJson: sql.placeholder('globalEnabledIdsJson'),
        agentPresetEnabledIdsJson: sql.placeholder('agentPresetEnabledIdsJson'), characterEnabledIdsJson: sql.placeholder('characterEnabledIdsJson') }).prepare()
      versions.forEach((version, sortIndex) => insert.run({ id: version.id, name: version.name, sortIndex,
        globalEnabledIdsJson: JSON.stringify(version.globalEnabledIds), agentPresetEnabledIdsJson: JSON.stringify(version.agentPresetEnabledIds),
        characterEnabledIdsJson: JSON.stringify(version.characterEnabledIds) }))
    }
  }

}
