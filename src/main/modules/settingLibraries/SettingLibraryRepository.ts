import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import type { SettingLibrary, SettingLibraryEntry, SettingLibraryGroup } from '@shared/contracts/settingLibrary/schemas'
import { settingLibraryEntrySchema, settingLibraryGroupSchema, settingLibrarySchema } from '@shared/contracts/settingLibrary/schemas'
import type { AgentSettingLibraryRuntimeContext } from '@shared/contracts/agent/runtime'
import { requireCharacter } from '@main/modules/personas'
import { type ElecKoiDatabase, SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import {
  settingEntryContents,
  settingLibraries,
  settingLibraryEntryLinks,
  settingLibraryGroups,
  settingLibraryVersionEntryLinks,
  settingLibraryVersionGroups,
  settingLibraryVersions
} from '@main/platform/sqlite/schema/common'
import { conversationSettingChanges } from '@main/platform/sqlite/schema/common'
import { readEntry, readGroup, readPromptPositions, writeEntry, writeGroup, writePromptPositions } from './settingLibraryCodec'
import { OPENING_ENTRY_ID, isLegacyRoleplayPlanEntry, normalizeSettingLibrary } from './settingLibraryNormalization'

type EntryRevision = { entry: SettingLibraryEntry; revisionId: string }
type RuntimeBaseline = {
  source: AgentSettingLibraryRuntimeContext
  projected: AgentSettingLibraryRuntimeContext
}

const AGENT_PRESET_RUNTIME_PREFIX = 'agent-preset:'

export class SettingLibraryRepository {
  constructor(private readonly store: SqliteDatabase) {}

  primaryOpening(characterId: string, db: ElecKoiDatabase = this.store.db): string {
    const link = db.select({ revisionId: settingLibraryEntryLinks.revisionId })
      .from(settingLibraryEntryLinks)
      .where(and(
        eq(settingLibraryEntryLinks.characterId, characterId),
        eq(settingLibraryEntryLinks.entryId, OPENING_ENTRY_ID)
      )).get()
    if (!link) return ''
    const content = db.select({ payloadJson: settingEntryContents.payloadJson })
      .from(settingEntryContents)
      .where(and(
        eq(settingEntryContents.characterId, characterId),
        eq(settingEntryContents.entryId, OPENING_ENTRY_ID),
        eq(settingEntryContents.revisionId, link.revisionId)
      )).get()
    if (!content) throw new Error(`设定“${OPENING_ENTRY_ID}”缺少内容版本。`)
    return readEntry(content.payloadJson).content.trim()
  }

  get(characterId: string, db: ElecKoiDatabase = this.store.db): SettingLibrary {
    requireCharacter(db, characterId)
    const metadata = db.select().from(settingLibraries).where(eq(settingLibraries.characterId, characterId)).get()
    if (!metadata) return normalizeSettingLibrary(characterId)
    const contents = db.select().from(settingEntryContents).where(eq(settingEntryContents.characterId, characterId)).all()
    const byRevision = new Map(contents.map((row) => [`${row.entryId}\u0000${row.revisionId}`, row.payloadJson]))
    const resolveEntry = (entryId: string, revisionId: string): SettingLibraryEntry => {
      const payload = byRevision.get(`${entryId}\u0000${revisionId}`)
      if (!payload) throw new Error(`设定“${entryId}”缺少内容版本。`)
      return readEntry(payload)
    }
    const entries = db.select().from(settingLibraryEntryLinks)
      .where(eq(settingLibraryEntryLinks.characterId, characterId))
      .orderBy(asc(settingLibraryEntryLinks.sortIndex)).all()
      .map((row) => resolveEntry(row.entryId, row.revisionId))
      .filter((entry) => !isLegacyRoleplayPlanEntry(entry))
    const groups = db.select().from(settingLibraryGroups)
      .where(eq(settingLibraryGroups.characterId, characterId))
      .orderBy(asc(settingLibraryGroups.sortIndex)).all().map((row) => readGroup(row.payloadJson))
    const versionLinks = db.select().from(settingLibraryVersionEntryLinks)
      .where(eq(settingLibraryVersionEntryLinks.characterId, characterId)).all()
    const versionGroups = db.select().from(settingLibraryVersionGroups)
      .where(eq(settingLibraryVersionGroups.characterId, characterId)).all()
    const versions = db.select().from(settingLibraryVersions)
      .where(eq(settingLibraryVersions.characterId, characterId))
      .orderBy(asc(settingLibraryVersions.sortIndex)).all().map((version) => ({
        id: version.versionId,
        name: version.name,
        entries: versionLinks.filter((row) => row.versionId === version.versionId)
          .sort((a, b) => a.sortIndex - b.sortIndex).map((row) => resolveEntry(row.entryId, row.revisionId))
          .filter((entry) => !isLegacyRoleplayPlanEntry(entry)),
        groups: versionGroups.filter((row) => row.versionId === version.versionId)
          .sort((a, b) => a.sortIndex - b.sortIndex).map((row) => readGroup(row.payloadJson)),
        promptPositions: readPromptPositions(version.promptPositionsJson),
        listAllExpanded: !!version.listAllExpanded,
        expandedGroupIds: JSON.parse(version.expandedGroupIdsJson) as string[],
        createdAt: version.createdAt,
        updatedAt: version.updatedAt
      }))
    return settingLibrarySchema.parse({
      characterId, name: metadata.name, entries, groups,
      promptPositions: readPromptPositions(metadata.promptPositionsJson),
      activeVersionId: metadata.activeVersionId, versions,
      listAllExpanded: !!metadata.listAllExpanded,
      expandedGroupIds: JSON.parse(metadata.expandedGroupIdsJson)
    })
  }

  /** Resolves the effective story library for one conversation without changing the author library. */
  runtimeContext(
    conversationId: string,
    context: { characterId: string; characterMode: string },
    db: ElecKoiDatabase = this.store.db
  ): AgentSettingLibraryRuntimeContext | undefined {
    if (context.characterMode !== 'story' || !context.characterId) return undefined
    const base = this.get(context.characterId, db)
    const rows = db.select().from(conversationSettingChanges)
      .where(eq(conversationSettingChanges.sessionId, conversationId)).all()
    const entries = new Map(base.entries.map((entry) => [entry.id, entry]))
    const groups = new Map(base.groups.map((group) => [group.id, group]))
    for (const row of rows) {
      if (row.operation === 'delete') {
        if (row.targetType === 'entry' && entries.get(row.targetId)?.kind !== 'opening') entries.delete(row.targetId)
        if (row.targetType === 'group') groups.delete(row.targetId)
        continue
      }
      try {
        if (row.targetType === 'entry') {
          const entry = settingLibraryEntrySchema.parse(JSON.parse(row.payloadJson))
          if (entry.kind !== 'opening' && !isLegacyRoleplayPlanEntry(entry)) entries.set(row.targetId, { ...entry, id: row.targetId })
        } else if (row.targetType === 'group') {
          const group = settingLibraryGroupSchema.parse(JSON.parse(row.payloadJson))
          groups.set(row.targetId, { ...group, id: row.targetId })
        }
      } catch {
        throw new Error(`当前对话的设定库差异已损坏：${row.targetType}/${row.targetId}`)
      }
    }
    const groupIds = new Set(groups.keys())
    const removedGroups = new Set<string>()
    let changed = true
    while (changed) {
      changed = false
      for (const group of groups.values()) {
        if (group.parentId && !groupIds.has(group.parentId)) {
          removedGroups.add(group.id)
          changed = true
        }
        if (removedGroups.has(group.parentId)) {
          removedGroups.add(group.id)
          changed = true
        }
      }
    }
    for (const id of removedGroups) groups.delete(id)
    const effectiveGroups = [...groups.values()]
    const effectiveEntries = [...entries.values()].filter((entry) => !entry.groupId || groups.has(entry.groupId))
    return {
      characterId: context.characterId,
      name: base.name,
      entries: effectiveEntries,
      groups: effectiveGroups,
      promptPositions: base.promptPositions
    }
  }

  /** Returns the effective library only when this conversation owns persisted overrides. */
  conversationLibrary(
    characterId: string,
    conversationId: string,
    db: ElecKoiDatabase = this.store.db
  ): SettingLibrary | undefined {
    requireCharacter(db, characterId)
    const changes = db.select({ targetId: conversationSettingChanges.targetId })
      .from(conversationSettingChanges)
      .where(eq(conversationSettingChanges.sessionId, conversationId)).all()
    if (!changes.length) return undefined
    return this.effectiveConversationLibrary(characterId, conversationId, db)
  }

  /** Replaces one conversation overlay while preserving the author's active library. */
  replaceConversationLibrary(
    characterId: string,
    conversationId: string,
    input: SettingLibrary
  ): SettingLibrary {
    return this.store.withWriteTx((db) => {
      const desired = settingLibrarySchema.parse(input)
      if (desired.characterId !== characterId) throw new Error('动态设定与当前角色不匹配。')
      const base = this.get(characterId, db)
      validateConversationLibrary(base, desired)

      db.delete(conversationSettingChanges)
        .where(eq(conversationSettingChanges.sessionId, conversationId)).run()
      const timestamp = new Date().toISOString()
      const desiredEntries = new Map(desired.entries.map((entry) => [entry.id, entry]))
      const baseEntries = new Map(base.entries.map((entry) => [entry.id, entry]))
      for (const id of unionKeys(baseEntries, desiredEntries)) {
        const baseline = baseEntries.get(id)
        const next = desiredEntries.get(id)
        if (sameValue(baseline, next)) continue
        if (!next) this.writeConversationChange(conversationId, 'entry', id, 'delete', null, timestamp, db)
        else this.writeConversationChange(conversationId, 'entry', id, 'upsert', next, timestamp, db)
      }

      const desiredGroups = new Map(desired.groups.map((group) => [group.id, group]))
      const baseGroups = new Map(base.groups.map((group) => [group.id, group]))
      for (const id of unionKeys(baseGroups, desiredGroups)) {
        const baseline = baseGroups.get(id)
        const next = desiredGroups.get(id)
        if (sameValue(baseline, next)) continue
        if (!next) this.writeConversationChange(conversationId, 'group', id, 'delete', null, timestamp, db)
        else this.writeConversationChange(conversationId, 'group', id, 'upsert', next, timestamp, db)
      }
      return this.effectiveConversationLibrary(characterId, conversationId, db)
    })
  }

  deleteConversationChanges(characterId: string, conversationId: string): void {
    this.store.withWriteTx((db) => {
      requireCharacter(db, characterId)
      const existing = db.select({ targetId: conversationSettingChanges.targetId })
        .from(conversationSettingChanges)
        .where(eq(conversationSettingChanges.sessionId, conversationId)).get()
      if (!existing) throw new Error('找不到这段对话的动态设定。')
      db.delete(conversationSettingChanges)
        .where(eq(conversationSettingChanges.sessionId, conversationId)).run()
    })
  }

  saveConversationAsVersion(characterId: string, conversationId: string, name: string): SettingLibrary {
    return this.store.withWriteTx((db) => {
      const normalizedName = name.trim().slice(0, 60)
      if (!normalizedName) throw new Error('请输入版本名称。')
      const effective = this.conversationLibrary(characterId, conversationId, db)
      if (!effective) throw new Error('找不到这段对话的动态设定。')
      const base = this.get(characterId, db)
      if (base.versions.some((version) => version.name.trim() === normalizedName)) {
        throw new Error('版本名称已存在，请换一个名称。')
      }
      const timestamp = new Date().toISOString()
      const version = {
        id: `library-${randomUUID()}`,
        name: normalizedName,
        entries: effective.entries,
        groups: effective.groups,
        promptPositions: effective.promptPositions,
        listAllExpanded: effective.listAllExpanded,
        expandedGroupIds: effective.expandedGroupIds,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      db.insert(settingLibraryVersions).values({
        characterId,
        versionId: version.id,
        sortIndex: base.versions.length,
        name: version.name,
        listAllExpanded: version.listAllExpanded ? 1 : 0,
        expandedGroupIdsJson: JSON.stringify(version.expandedGroupIds),
        promptPositionsJson: writePromptPositions(version.promptPositions),
        createdAt: version.createdAt,
        updatedAt: version.updatedAt
      }).run()
      this.persistVersionEntries(db, characterId, version.id, version.entries)
      this.persistVersionGroups(db, characterId, version.id, version.groups)
      return this.get(characterId, db)
    })
  }

  private effectiveConversationLibrary(
    characterId: string,
    conversationId: string,
    db: ElecKoiDatabase
  ): SettingLibrary {
    const base = this.get(characterId, db)
    const effective = this.runtimeContext(conversationId, { characterId, characterMode: 'story' }, db)
    if (!effective) throw new Error('无法读取这段对话的动态设定。')
    return settingLibrarySchema.parse({
      ...base,
      entries: effective.entries,
      groups: effective.groups,
      versions: []
    })
  }

  /** Commits a successful Agent turn as a conversation overlay, never into the author library. */
  replaceConversationRuntimeState(
    conversationId: string,
    raw: string,
    context: { characterId: string; characterMode: string },
    baseline: RuntimeBaseline,
    db: ElecKoiDatabase = this.store.db
  ): string {
    let value: unknown
    try { value = JSON.parse(raw) } catch (error) { throw new Error('设定库运行时返回了无效 JSON。', { cause: error }) }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设定库运行时返回值必须是 object。')
    const record = value as Record<string, unknown>
    const entries = settingLibraryEntrySchema.array().parse(record.entries)
    const groups = settingLibraryGroupSchema.array().parse(record.groups)
    if (!context.characterId || record.characterId !== context.characterId) throw new Error('设定库运行时结果与当前角色不匹配。')
    if (baseline.source.characterId !== context.characterId || baseline.projected.characterId !== context.characterId) {
      throw new Error('设定库运行时基线与当前角色不匹配。')
    }

    const base = this.get(context.characterId, db)
    const baseEntries = new Map(base.entries.filter((entry) => entry.kind === 'normal').map((entry) => [entry.id, entry]))
    const baseGroups = new Map(base.groups.map((group) => [group.id, group]))
    const timestamp = new Date().toISOString()

    const sourceEntries = new Map(baseline.source.entries.map((entry) => [entry.id, entry]))
    const projectedEntries = new Map(baseline.projected.entries.map((entry) => [entry.id, entry]))
    const finalEntries = new Map(entries.map((entry) => [entry.id, entry]))
    for (const id of unionKeys(projectedEntries, finalEntries)) {
      const projected = projectedEntries.get(id)
      const final = finalEntries.get(id)
      if (sameValue(projected, final) || isAgentPresetRuntimeId(id)) continue
      const source = sourceEntries.get(id)
      if (!final) {
        if (source?.kind !== 'normal') continue
        if (baseEntries.has(id)) this.writeConversationChange(conversationId, 'entry', id, 'delete', null, timestamp, db)
        else this.deleteConversationChange(conversationId, 'entry', id, db)
        continue
      }
      const rebased = source && projected
        ? rebaseSettingEntry(source, projected, final)
        : final
      if (rebased.kind !== 'normal' || isAgentPresetRuntimeId(rebased.groupId)) continue
      if (sameValue(baseEntries.get(id), rebased)) this.deleteConversationChange(conversationId, 'entry', id, db)
      else this.writeConversationChange(conversationId, 'entry', id, 'upsert', rebased, timestamp, db)
    }

    const sourceGroups = new Map(baseline.source.groups.map((group) => [group.id, group]))
    const projectedGroups = new Map(baseline.projected.groups.map((group) => [group.id, group]))
    const finalGroups = new Map(groups.map((group) => [group.id, group]))
    for (const id of unionKeys(projectedGroups, finalGroups)) {
      const projected = projectedGroups.get(id)
      const final = finalGroups.get(id)
      if (sameValue(projected, final) || isAgentPresetRuntimeId(id)) continue
      if (!final) {
        if (!sourceGroups.has(id)) continue
        if (baseGroups.has(id)) this.writeConversationChange(conversationId, 'group', id, 'delete', null, timestamp, db)
        else this.deleteConversationChange(conversationId, 'group', id, db)
        continue
      }
      const source = sourceGroups.get(id)
      const rebased = source && projected
        ? rebaseSettingGroup(source, projected, final)
        : final
      if (isAgentPresetRuntimeId(rebased.parentId)) continue
      if (sameValue(baseGroups.get(id), rebased)) this.deleteConversationChange(conversationId, 'group', id, db)
      else this.writeConversationChange(conversationId, 'group', id, 'upsert', rebased, timestamp, db)
    }
    return JSON.stringify({ ...record, entries, groups }, null, 2)
  }

  private writeConversationChange(
    sessionId: string,
    targetType: string,
    targetId: string,
    operation: 'upsert' | 'delete',
    value: SettingLibraryEntry | SettingLibraryGroup | null,
    updatedAt: string,
    db: ElecKoiDatabase
  ): void {
    const payloadJson = JSON.stringify(value)
    db.insert(conversationSettingChanges).values({ sessionId, targetType, targetId, operation, payloadJson, updatedAt })
      .onConflictDoUpdate({
        target: [conversationSettingChanges.sessionId, conversationSettingChanges.targetType, conversationSettingChanges.targetId],
        set: { operation, payloadJson, updatedAt }
      }).run()
  }

  private deleteConversationChange(sessionId: string, targetType: string, targetId: string, db: ElecKoiDatabase): void {
    db.delete(conversationSettingChanges).where(and(
      eq(conversationSettingChanges.sessionId, sessionId),
      eq(conversationSettingChanges.targetType, targetType),
      eq(conversationSettingChanges.targetId, targetId)
    )).run()
  }

  save(characterId: string, input: SettingLibrary): SettingLibrary {
    this.store.withWriteTx((db) => this.saveInTransaction(characterId, input, db))
    return this.get(characterId)
  }

  saveInTransaction(characterId: string, input: SettingLibrary, db: ElecKoiDatabase): SettingLibrary {
    if (input.characterId !== characterId) throw new Error('设定库与角色不匹配。')
    const normalized = normalizeSettingLibrary(characterId, input)
    this.persist(db, normalized)
    return normalized
  }

  saveViewState(characterId: string, expandedGroupIds: string[]): string[] {
    return this.store.withWriteTx((db) => {
      const current = this.get(characterId, db)
      const validGroupIds = new Set(current.groups.map((group) => group.id))
      const normalized = [...new Set(expandedGroupIds)].filter((id) => validGroupIds.has(id))
      const values = { listAllExpanded: 0, expandedGroupIdsJson: JSON.stringify(normalized) }
      db.update(settingLibraries).set(values).where(eq(settingLibraries.characterId, characterId)).run()
      db.update(settingLibraryVersions).set(values).where(and(
        eq(settingLibraryVersions.characterId, characterId),
        eq(settingLibraryVersions.versionId, current.activeVersionId)
      )).run()
      return normalized
    })
  }

  private persist(db: ElecKoiDatabase, library: SettingLibrary): void {
    requireCharacter(db, library.characterId)
    const timestamp = new Date().toISOString()
    db.insert(settingLibraries).values({
      characterId: library.characterId, name: library.name, activeVersionId: library.activeVersionId,
      listAllExpanded: library.listAllExpanded ? 1 : 0,
      expandedGroupIdsJson: JSON.stringify(library.expandedGroupIds),
      promptPositionsJson: writePromptPositions(library.promptPositions), updatedAt: timestamp
    }).onConflictDoUpdate({ target: settingLibraries.characterId, set: {
      name: library.name, activeVersionId: library.activeVersionId,
      listAllExpanded: library.listAllExpanded ? 1 : 0,
      expandedGroupIdsJson: JSON.stringify(library.expandedGroupIds),
      promptPositionsJson: writePromptPositions(library.promptPositions), updatedAt: timestamp
    } }).run()

    const currentRevisions = this.persistCurrentEntries(db, library.characterId, library.entries)
    this.persistGroups(db, library.characterId, library.groups)
    const retainedVersions = new Set(library.versions.map((version) => version.id))
    for (const row of db.select().from(settingLibraryVersions).where(eq(settingLibraryVersions.characterId, library.characterId)).all()) {
      if (!retainedVersions.has(row.versionId)) db.delete(settingLibraryVersions).where(and(eq(settingLibraryVersions.characterId, library.characterId), eq(settingLibraryVersions.versionId, row.versionId))).run()
    }
    library.versions.forEach((version, versionIndex) => {
      db.insert(settingLibraryVersions).values({
        characterId: library.characterId, versionId: version.id, sortIndex: versionIndex, name: version.name,
        listAllExpanded: version.listAllExpanded ? 1 : 0, expandedGroupIdsJson: JSON.stringify(version.expandedGroupIds),
        promptPositionsJson: writePromptPositions(version.promptPositions), createdAt: version.createdAt, updatedAt: version.updatedAt
      }).onConflictDoUpdate({ target: [settingLibraryVersions.characterId, settingLibraryVersions.versionId], set: {
        sortIndex: versionIndex, name: version.name, listAllExpanded: version.listAllExpanded ? 1 : 0,
        expandedGroupIdsJson: JSON.stringify(version.expandedGroupIds), promptPositionsJson: writePromptPositions(version.promptPositions),
        createdAt: version.createdAt, updatedAt: version.updatedAt
      } }).run()
      this.persistVersionEntries(db, library.characterId, version.id, version.entries, version.id === library.activeVersionId ? currentRevisions : undefined)
      this.persistVersionGroups(db, library.characterId, version.id, version.groups)
    })
    this.store.native.prepare(`DELETE FROM setting_entry_contents AS content
      WHERE content.characterId = ?
        AND NOT EXISTS (SELECT 1 FROM setting_library_entry_links current_link WHERE current_link.characterId = content.characterId AND current_link.entryId = content.entryId AND current_link.revisionId = content.revisionId)
        AND NOT EXISTS (SELECT 1 FROM setting_library_version_entry_links version_link WHERE version_link.characterId = content.characterId AND version_link.entryId = content.entryId AND version_link.revisionId = content.revisionId)`).run(library.characterId)
  }

  private ensureRevision(db: ElecKoiDatabase, characterId: string, entry: SettingLibraryEntry, preferred?: string): string {
    const payloadJson = writeEntry(entry)
    if (preferred) {
      const row = db.select().from(settingEntryContents).where(and(
        eq(settingEntryContents.characterId, characterId), eq(settingEntryContents.entryId, entry.id), eq(settingEntryContents.revisionId, preferred)
      )).get()
      if (row?.payloadJson === payloadJson) return preferred
    }
    const existing = db.select().from(settingEntryContents).where(and(
      eq(settingEntryContents.characterId, characterId), eq(settingEntryContents.entryId, entry.id)
    )).all().find((row) => row.payloadJson === payloadJson)
    if (existing) return existing.revisionId
    const revisionId = randomUUID()
    db.insert(settingEntryContents).values({ characterId, entryId: entry.id, revisionId, payloadJson }).run()
    return revisionId
  }

  private persistCurrentEntries(db: ElecKoiDatabase, characterId: string, entries: SettingLibraryEntry[]): Map<string, EntryRevision> {
    const previous = db.select().from(settingLibraryEntryLinks).where(eq(settingLibraryEntryLinks.characterId, characterId)).all()
    const retained = new Set(entries.map((entry) => entry.id))
    for (const row of previous) if (!retained.has(row.entryId)) db.delete(settingLibraryEntryLinks).where(and(eq(settingLibraryEntryLinks.characterId, characterId), eq(settingLibraryEntryLinks.entryId, row.entryId))).run()
    const revisions = new Map<string, EntryRevision>()
    entries.forEach((entry, sortIndex) => {
      const revisionId = this.ensureRevision(db, characterId, entry, previous.find((row) => row.entryId === entry.id)?.revisionId)
      revisions.set(entry.id, { entry, revisionId })
      db.insert(settingLibraryEntryLinks).values({ characterId, entryId: entry.id, sortIndex, revisionId })
        .onConflictDoUpdate({ target: [settingLibraryEntryLinks.characterId, settingLibraryEntryLinks.entryId], set: { sortIndex, revisionId } }).run()
    })
    return revisions
  }

  private persistGroups(db: ElecKoiDatabase, characterId: string, groups: SettingLibraryGroup[]): void {
    const retained = new Set(groups.map((group) => group.id))
    for (const row of db.select().from(settingLibraryGroups).where(eq(settingLibraryGroups.characterId, characterId)).all()) if (!retained.has(row.groupId)) db.delete(settingLibraryGroups).where(and(eq(settingLibraryGroups.characterId, characterId), eq(settingLibraryGroups.groupId, row.groupId))).run()
    groups.forEach((group, sortIndex) => db.insert(settingLibraryGroups).values({ characterId, groupId: group.id, sortIndex, payloadJson: writeGroup(group) })
      .onConflictDoUpdate({ target: [settingLibraryGroups.characterId, settingLibraryGroups.groupId], set: { sortIndex, payloadJson: writeGroup(group) } }).run())
  }

  private persistVersionEntries(db: ElecKoiDatabase, characterId: string, versionId: string, entries: SettingLibraryEntry[], active?: Map<string, EntryRevision>): void {
    const previous = db.select().from(settingLibraryVersionEntryLinks).where(and(eq(settingLibraryVersionEntryLinks.characterId, characterId), eq(settingLibraryVersionEntryLinks.versionId, versionId))).all()
    const retained = new Set(entries.map((entry) => entry.id))
    for (const row of previous) if (!retained.has(row.entryId)) db.delete(settingLibraryVersionEntryLinks).where(and(eq(settingLibraryVersionEntryLinks.characterId, characterId), eq(settingLibraryVersionEntryLinks.versionId, versionId), eq(settingLibraryVersionEntryLinks.entryId, row.entryId))).run()
    entries.forEach((entry, sortIndex) => {
      const activeRevision = active?.get(entry.id)
      const revisionId = activeRevision && writeEntry(activeRevision.entry) === writeEntry(entry)
        ? activeRevision.revisionId
        : this.ensureRevision(db, characterId, entry, previous.find((row) => row.entryId === entry.id)?.revisionId)
      db.insert(settingLibraryVersionEntryLinks).values({ characterId, versionId, entryId: entry.id, sortIndex, revisionId })
        .onConflictDoUpdate({ target: [settingLibraryVersionEntryLinks.characterId, settingLibraryVersionEntryLinks.versionId, settingLibraryVersionEntryLinks.entryId], set: { sortIndex, revisionId } }).run()
    })
  }

  private persistVersionGroups(db: ElecKoiDatabase, characterId: string, versionId: string, groups: SettingLibraryGroup[]): void {
    const previous = db.select().from(settingLibraryVersionGroups).where(and(eq(settingLibraryVersionGroups.characterId, characterId), eq(settingLibraryVersionGroups.versionId, versionId))).all()
    const retained = new Set(groups.map((group) => group.id))
    for (const row of previous) if (!retained.has(row.groupId)) db.delete(settingLibraryVersionGroups).where(and(eq(settingLibraryVersionGroups.characterId, characterId), eq(settingLibraryVersionGroups.versionId, versionId), eq(settingLibraryVersionGroups.groupId, row.groupId))).run()
    groups.forEach((group, sortIndex) => db.insert(settingLibraryVersionGroups).values({ characterId, versionId, groupId: group.id, sortIndex, payloadJson: writeGroup(group) })
      .onConflictDoUpdate({ target: [settingLibraryVersionGroups.characterId, settingLibraryVersionGroups.versionId, settingLibraryVersionGroups.groupId], set: { sortIndex, payloadJson: writeGroup(group) } }).run())
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function unionKeys<Key, Value>(left: Map<Key, Value>, right: Map<Key, Value>): Key[] {
  return [...new Set([...left.keys(), ...right.keys()])]
}

function isAgentPresetRuntimeId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(AGENT_PRESET_RUNTIME_PREFIX)
}

function rebaseSettingEntry(
  source: SettingLibraryEntry,
  projected: SettingLibraryEntry,
  final: SettingLibraryEntry
): SettingLibraryEntry {
  return settingLibraryEntrySchema.parse(rebaseProjectedRecord(source, projected, final))
}

function rebaseSettingGroup(
  source: SettingLibraryGroup,
  projected: SettingLibraryGroup,
  final: SettingLibraryGroup
): SettingLibraryGroup {
  return settingLibraryGroupSchema.parse(rebaseProjectedRecord(source, projected, final))
}

function rebaseProjectedRecord(
  source: object,
  projected: object,
  final: object
): Record<string, unknown> {
  const sourceRecord = source as Record<string, unknown>
  const projectedRecord = projected as Record<string, unknown>
  const finalRecord = final as Record<string, unknown>
  const result: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(sourceRecord), ...Object.keys(projectedRecord), ...Object.keys(finalRecord)])
  for (const key of keys) {
    result[key] = sameValue(finalRecord[key], projectedRecord[key])
      ? sourceRecord[key]
      : finalRecord[key]
  }
  return result
}

function validateConversationLibrary(base: SettingLibrary, desired: SettingLibrary): void {
  const groups = new Map(desired.groups.map((group) => [group.id, group]))
  if (groups.size !== desired.groups.length) throw new Error('动态设定的文件夹编号不能重复。')
  if (new Set(desired.entries.map((entry) => entry.id)).size !== desired.entries.length) {
    throw new Error('动态设定的条目编号不能重复。')
  }
  for (const group of desired.groups) {
    if (!group.name.trim()) throw new Error('动态设定的文件夹名称不能为空。')
    if (group.parentId && !groups.has(group.parentId)) throw new Error(`文件夹“${group.name}”的上级不存在。`)
    const visited = new Set([group.id])
    let parentId = group.parentId
    while (parentId) {
      if (visited.has(parentId)) throw new Error('动态设定的文件夹不能形成循环。')
      visited.add(parentId)
      parentId = groups.get(parentId)?.parentId ?? ''
    }
  }
  const groupNames = new Set<string>()
  for (const group of desired.groups) {
    const key = `${group.parentId}\u0000${group.name.trim().toLocaleLowerCase()}`
    if (groupNames.has(key)) throw new Error(`同一位置已存在文件夹“${group.name}”。`)
    groupNames.add(key)
  }
  const removedBaseGroupIds = new Set(base.groups.filter((group) => !groups.has(group.id)).map((group) => group.id))
  let expandedRemovedGroups = true
  while (expandedRemovedGroups) {
    expandedRemovedGroups = false
    for (const group of base.groups) {
      if (removedBaseGroupIds.has(group.parentId) && !removedBaseGroupIds.has(group.id)) {
        removedBaseGroupIds.add(group.id)
        expandedRemovedGroups = true
      }
    }
  }
  const entryNames = new Set<string>()
  for (const entry of desired.entries) {
    if (entry.groupId && !groups.has(entry.groupId)) throw new Error(`设定“${entry.title}”所在的文件夹不存在。`)
    if (entry.kind === 'normal') {
      const key = `${entry.groupId}\u0000${entry.title.trim().toLocaleLowerCase()}`
      if (entryNames.has(key)) throw new Error(`同一位置已存在设定“${entry.title}”。`)
      entryNames.add(key)
    }
    const baseline = base.entries.find((item) => item.id === entry.id)
    if (!baseline) {
      if (!isConversationMutableEntry(entry)) throw new Error('动态设定只能新增供 Agent 读取的普通设定。')
      if (!entry.title.trim() || !entry.content.trim()) throw new Error('动态设定的标题和正文不能为空。')
      continue
    }
    if (!isConversationMutableEntry(baseline)) {
      if (!sameValue(baseline, entry)) throw new Error(`设定“${baseline.title}”只允许查看，不能在动态设定中修改。`)
      continue
    }
    if (!isConversationMutableEntry(entry)) throw new Error(`设定“${baseline.title}”不能更改类型。`)
    if (!entry.title.trim() || !entry.content.trim()) throw new Error('动态设定的标题和正文不能为空。')
    if (!sameValue(conversationImmutableEntryFields(baseline), conversationImmutableEntryFields(entry))) {
      throw new Error(`设定“${baseline.title}”只能修改目录、标题、正文和读取提示。`)
    }
  }
  for (const entry of base.entries) {
    if (
      !desired.entries.some((item) => item.id === entry.id) &&
      !isConversationMutableEntry(entry) &&
      !removedBaseGroupIds.has(entry.groupId)
    ) {
      throw new Error(`设定“${entry.title}”只允许查看，不能从动态设定中删除。`)
    }
  }
}

function isConversationMutableEntry(entry: SettingLibraryEntry): boolean {
  return entry.kind === 'normal' && entry.triggerMode === 'agent_tool'
}

function conversationImmutableEntryFields(entry: SettingLibraryEntry): Record<string, unknown> {
  const record = { ...entry } as Record<string, unknown>
  delete record.groupId
  delete record.title
  delete record.content
  delete record.agentSelectionHint
  delete record.updatedAt
  return record
}
