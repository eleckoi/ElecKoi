import { asc, eq } from 'drizzle-orm'
import type {
  RegexRule,
  RegexRuleCollection,
  RegexRuleImportDocument,
  RegexRuleScope,
  RegexRuleTarget,
  RegexRuleVersion
} from '@shared/contracts/regex/schemas'
import {
  regexRuleCollectionSchema,
  regexRuleSchema,
  regexRuleTargetSchema
} from '@shared/contracts/regex/schemas'
import { DesktopError, DESKTOP_ERROR_CODES } from '@shared/contracts/gateway/DesktopError'
import {
  includeImportedRulesInActiveVersion,
  transformCollectionSurface
} from '@shared/foundation/regex/RegexRuleProcessor'
import type { RegexRuleSurface } from '@shared/contracts/regex/schemas'
import { requireCharacter } from '@main/modules/personas'
import { type ElecKoiDatabase, SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import {
  characterRegexRules,
  globalRegexRules,
  regexEnablementVersions,
  regexState
} from '@main/platform/sqlite/schema/common'
import { decodeRegexDocuments, encodeRegexExport, type ScopedRegexRule } from '@shared/foundation/regexRuleTransfer'

export interface AgentPresetRegexPort {
  readActiveRegexRules(db?: ElecKoiDatabase): { presetId: string; presetName: string; rules: RegexRule[] }
  replaceActiveRegexRules(rules: RegexRule[], db: ElecKoiDatabase): void
}

function parseStringList(raw: string, description: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error()
    return [...new Set(parsed.filter((value): value is string => typeof value === 'string' && value.length > 0))]
  } catch (error) {
    throw new Error(`${description}已损坏。`, { cause: error })
  }
}

function parseTargets(raw: string): RegexRuleTarget[] {
  return regexRuleTargetSchema.array().parse(parseStringList(raw, '正则目标'))
}

function rowToRule(row: {
  id: string; name: string; pattern: string; replacement: string; targetsJson: string
  enabled: number; displayOnly: number; promptOnly: number; runOnEdit: number; sortIndex: number
}): RegexRule {
  return regexRuleSchema.parse({
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
    name: rule.name.trim().slice(0, 60),
    pattern: rule.pattern.slice(0, 4_000),
    targets: rule.targets.length > 0 ? [...new Set(rule.targets)] : ['AiOutput'],
    order
  })
}

function normalizedCollection(characterId: string, input: RegexRuleCollection): RegexRuleCollection {
  if (input.characterId !== characterId) throw new Error('正则配置与角色不匹配。')
  const normalize = (rules: RegexRule[]) => rules.map(normalizedRule)
  const versions: RegexRuleVersion[] = input.versions.map((version) => ({
    ...version,
    name: version.name.trim().slice(0, 60) || '未命名预设',
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
  if (new Set(ids).size !== ids.length) throw new Error('正则规则编号不能重复。')
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
    sortIndex
  }
}

export class RegexRuleRepository {
  constructor(
    private readonly store: SqliteDatabase,
    private readonly agentPresetRegexes: AgentPresetRegexPort
  ) {}

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
      throw new DesktopError(DESKTOP_ERROR_CODES.CONFLICT, '正则配置已在其他窗口更新，请重新打开后再保存。')
    }
    this.persistShared(db, normalized)
    this.agentPresetRegexes.replaceActiveRegexRules(normalized.agentPresetRules, db)
    db.delete(characterRegexRules).where(eq(characterRegexRules.characterId, characterId)).run()
    if (normalized.characterRules.length > 0) {
      db.insert(characterRegexRules).values(normalized.characterRules.map((rule, sortIndex) => ({
        characterId,
        ...ruleRow(rule, sortIndex)
      }))).run()
    }
    db.insert(regexState).values({
      singletonId: 1,
      activeVersionId: normalized.activeVersionId || null,
      revision: revision + 1
    }).onConflictDoUpdate({
      target: regexState.singletonId,
      set: { activeVersionId: normalized.activeVersionId || null, revision: revision + 1 }
    }).run()
    return { ...normalized, revision: revision + 1 }
  }

  import(
    characterId: string,
    fallbackScope: RegexRuleScope,
    documents: RegexRuleImportDocument[],
    expectedRevision: number
  ) {
    const current = this.get(characterId)
    if (current.revision !== expectedRevision) {
      throw new DesktopError(DESKTOP_ERROR_CODES.CONFLICT, '正则配置已在其他窗口更新，请重新打开后再导入。')
    }
    const decoded = decodeRegexDocuments(documents, fallbackScope)
    if (decoded.rules.length === 0) {
      throw new Error('所选文件中没有可导入的正则规则。')
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
    if (selected.length === 0) throw new Error('请先选择要导出的规则。')
    return { fileName: 'eleckoi-regex-rules.json', json: encodeRegexExport(selected) }
  }

  transform(characterId: string, text: string, target: RegexRuleTarget, surface: RegexRuleSurface): string {
    return transformCollectionSurface(text, this.get(characterId), target, surface)
  }

  private persistShared(db: ElecKoiDatabase, collection: RegexRuleCollection): void {
    db.delete(globalRegexRules).run()
    if (collection.globalRules.length > 0) {
      db.insert(globalRegexRules).values(collection.globalRules.map(ruleRow)).run()
    }
    db.delete(regexEnablementVersions).run()
    if (collection.versions.length > 0) {
      db.insert(regexEnablementVersions).values(collection.versions.map((version, sortIndex) => ({
        id: version.id,
        name: version.name,
        sortIndex,
        globalEnabledIdsJson: JSON.stringify(version.globalEnabledIds),
        agentPresetEnabledIdsJson: JSON.stringify(version.agentPresetEnabledIds),
        characterEnabledIdsJson: JSON.stringify(version.characterEnabledIds)
      }))).run()
    }
  }

}
