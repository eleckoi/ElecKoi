import { and, asc, eq } from 'drizzle-orm'
import type { VariableConfig, VariableConfigVersion } from '@shared/contracts/variables/schemas'
import { variableConfigSchema } from '@shared/contracts/variables/schemas'
import { requireCharacter } from '@main/modules/personas'
import { type ElecKoiDatabase, SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import {
  variableConfigs,
  variableConfigObjects,
  variableConfigVariables,
  variableConfigVersionContents,
  variableConfigVersions
} from '@main/platform/sqlite/schema/common'
import {
  readVariable,
  readVariableObject,
  VARIABLE_INITIAL_STATE_CONTENT_KIND,
  VARIABLE_SCHEMA_CODE_CONTENT_KIND,
  writeVariable,
  writeVariableObject
} from './variableConfigCodec'
import {
  activeVariableConfig,
  emptyVariableConfigVersion,
  normalizeVariableConfig
} from './variableConfigNormalization'

function persistedContent(value: VariableConfig): string {
  const withoutTimes = {
    ...value,
    objects: value.objects.map((item) => ({ ...item, updatedAt: '' })),
    variables: value.variables.map((item) => ({ ...item, updatedAt: '' })),
    versions: value.versions.map((version) => ({
      ...version,
      updatedAt: '',
      objects: version.objects.map((item) => ({ ...item, updatedAt: '' })),
      variables: version.variables.map((item) => ({ ...item, updatedAt: '' }))
    }))
  }
  return JSON.stringify(withoutTimes)
}

function parseStringList(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error()
    return [...new Set(value)]
  } catch (error) {
    throw new Error('变量配置的展开状态已损坏。', { cause: error })
  }
}

export class VariableConfigRepository {
  constructor(private readonly store: SqliteDatabase) {}

  get(characterId: string, db: ElecKoiDatabase = this.store.db): VariableConfig {
    requireCharacter(db, characterId)
    const metadata = db.select().from(variableConfigs).where(eq(variableConfigs.characterId, characterId)).get()
    if (!metadata) {
      const version = emptyVariableConfigVersion()
      return activeVariableConfig(characterId, version, [version])
    }
    const contentRows = db.select().from(variableConfigVersionContents)
      .where(eq(variableConfigVersionContents.characterId, characterId)).all()
    const contents = new Map(contentRows.map((row) => [`${row.versionId}\u0000${row.kind}`, row.content]))
    const objectRows = db.select().from(variableConfigObjects)
      .where(eq(variableConfigObjects.characterId, characterId)).orderBy(asc(variableConfigObjects.sortIndex)).all()
    const variableRows = db.select().from(variableConfigVariables)
      .where(eq(variableConfigVariables.characterId, characterId)).orderBy(asc(variableConfigVariables.sortIndex)).all()
    const versions: VariableConfigVersion[] = db.select().from(variableConfigVersions)
      .where(eq(variableConfigVersions.characterId, characterId)).orderBy(asc(variableConfigVersions.sortIndex)).all()
      .map((row) => ({
        id: row.versionId,
        name: row.name,
        initialStateJson: contents.get(`${row.versionId}\u0000${VARIABLE_INITIAL_STATE_CONTENT_KIND}`) ?? '{}',
        schemaCode: contents.get(`${row.versionId}\u0000${VARIABLE_SCHEMA_CODE_CONTENT_KIND}`) ?? '',
        objects: objectRows.filter((item) => item.versionId === row.versionId).map((item) => readVariableObject(item.payloadJson)),
        variables: variableRows.filter((item) => item.versionId === row.versionId).map((item) => readVariable(item.payloadJson)),
        expandedObjectIds: parseStringList(row.expandedObjectIdsJson),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    const active = versions.find((item) => item.id === metadata.activeVersionId)
    if (!active) throw new Error('当前变量配置版本不存在。')
    return variableConfigSchema.parse(activeVariableConfig(characterId, active, versions))
  }

  initialState(characterId: string, db: ElecKoiDatabase = this.store.db): string {
    return this.get(characterId, db).initialStateJson
  }

  save(characterId: string, input: VariableConfig): VariableConfig {
    const previous = this.get(characterId)
    const saved = this.store.withWriteTx((db) => this.saveInTransaction(characterId, input, db))
    if (persistedContent(previous) === persistedContent(saved)) return previous
    return this.get(characterId)
  }

  saveInTransaction(characterId: string, input: VariableConfig, db: ElecKoiDatabase): VariableConfig {
    if (input.characterId !== characterId) throw new Error('变量配置与角色不匹配。')
    const previous = this.get(characterId, db)
    const normalized = normalizeVariableConfig(characterId, variableConfigSchema.parse(input), previous)
    if (persistedContent(previous) !== persistedContent(normalized)) this.persist(db, normalized)
    return normalized
  }

  saveViewState(characterId: string, expandedObjectIds: string[]): string[] {
    return this.store.withWriteTx((db) => {
      const current = this.get(characterId, db)
      const validObjectIds = new Set(current.objects.map((item) => item.id))
      const normalized = [...new Set(expandedObjectIds)].filter((id) => validObjectIds.has(id))
      db.update(variableConfigVersions).set({
        expandedObjectIdsJson: JSON.stringify(normalized)
      }).where(and(
        eq(variableConfigVersions.characterId, characterId),
        eq(variableConfigVersions.versionId, current.activeVersionId)
      )).run()
      return normalized
    })
  }

  private persist(db: ElecKoiDatabase, config: VariableConfig): void {
    requireCharacter(db, config.characterId)
    const timestamp = new Date().toISOString()
    const previous = db.select().from(variableConfigs).where(eq(variableConfigs.characterId, config.characterId)).get()
    db.insert(variableConfigs).values({
      characterId: config.characterId,
      activeVersionId: config.activeVersionId,
      updatedAt: timestamp,
      revision: (previous?.revision ?? 0) + 1
    }).onConflictDoUpdate({
      target: variableConfigs.characterId,
      set: {
        activeVersionId: config.activeVersionId,
        updatedAt: timestamp,
        revision: (previous?.revision ?? 0) + 1
      }
    }).run()

    const retained = new Set(config.versions.map((version) => version.id))
    for (const row of db.select().from(variableConfigVersions).where(eq(variableConfigVersions.characterId, config.characterId)).all()) {
      if (!retained.has(row.versionId)) {
        db.delete(variableConfigVersions).where(and(
          eq(variableConfigVersions.characterId, config.characterId),
          eq(variableConfigVersions.versionId, row.versionId)
        )).run()
      }
    }

    config.versions.forEach((version, sortIndex) => {
      db.insert(variableConfigVersions).values({
        characterId: config.characterId,
        versionId: version.id,
        sortIndex,
        name: version.name,
        expandedObjectIdsJson: JSON.stringify(version.expandedObjectIds),
        createdAt: version.createdAt || timestamp,
        updatedAt: version.updatedAt || timestamp
      }).onConflictDoUpdate({
        target: [variableConfigVersions.characterId, variableConfigVersions.versionId],
        set: {
          sortIndex,
          name: version.name,
          expandedObjectIdsJson: JSON.stringify(version.expandedObjectIds),
          createdAt: version.createdAt || timestamp,
          updatedAt: version.updatedAt || timestamp
        }
      }).run()
      this.replaceVersionContents(db, config.characterId, version)
    })
  }

  private replaceVersionContents(db: ElecKoiDatabase, characterId: string, version: VariableConfigVersion): void {
    db.delete(variableConfigVersionContents).where(and(
      eq(variableConfigVersionContents.characterId, characterId),
      eq(variableConfigVersionContents.versionId, version.id)
    )).run()
    db.delete(variableConfigObjects).where(and(
      eq(variableConfigObjects.characterId, characterId),
      eq(variableConfigObjects.versionId, version.id)
    )).run()
    db.delete(variableConfigVariables).where(and(
      eq(variableConfigVariables.characterId, characterId),
      eq(variableConfigVariables.versionId, version.id)
    )).run()
    db.insert(variableConfigVersionContents).values([
      { characterId, versionId: version.id, kind: VARIABLE_INITIAL_STATE_CONTENT_KIND, content: version.initialStateJson },
      { characterId, versionId: version.id, kind: VARIABLE_SCHEMA_CODE_CONTENT_KIND, content: version.schemaCode }
    ]).run()
    if (version.objects.length) {
      db.insert(variableConfigObjects).values(version.objects.map((item, sortIndex) => ({
        characterId,
        versionId: version.id,
        objectId: item.id,
        sortIndex,
        payloadJson: writeVariableObject(item)
      }))).run()
    }
    if (version.variables.length) {
      db.insert(variableConfigVariables).values(version.variables.map((item, sortIndex) => ({
        characterId,
        versionId: version.id,
        variableId: item.id,
        sortIndex,
        payloadJson: writeVariable(item)
      }))).run()
    }
  }
}
