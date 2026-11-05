import { and, asc, eq, sql } from 'drizzle-orm'
import type { VariableConfig, VariableConfigVersion } from '@shared/contracts/variables/schemas'
import { variableConfigSchema } from '@shared/contracts/variables/schemas'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { errorMessage } from '@shared/foundation/errorMessage'
import { requireCharacter } from '@product-data/domain/personas'
import type { ElecKoiDatabase, ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import {
  variableConfigs,
  variableConfigObjects,
  variableConfigVariables,
  variableConfigVersionContents,
  variableConfigVersions
} from '@product-data/storage/sqlite/schema/common'
import { conversationVariableVersionIds, readConversationVariableBinding } from '@product-data/domain/conversations'
import { openingVariableVersionIds } from '@product-data/domain/characterOpenings'
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

function expansionStateCorrupt(): DesktopError {
  return new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, '变量配置的展开状态已损坏。', { what: '变量配置的展开状态' })
}

function parseStringList(raw: string): string[] {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw expansionStateCorrupt()
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw expansionStateCorrupt()
  return [...new Set(value)]
}

export class VariableConfigRepository {
  constructor(private readonly store: ElecKoiSqliteStore) {}

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
    if (!active) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '当前变量配置版本不存在。', { what: '当前变量配置版本' })
    return variableConfigSchema.parse(activeVariableConfig(characterId, active, versions))
  }

  forConversation(conversationId: string, characterId: string): VariableConfig | null {
    const binding = readConversationVariableBinding(conversationId, this.store.db)
    if (binding.characterId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '变量配置与聊天所属角色不匹配。', { what: '变量配置与聊天所属角色' })
    if (!binding.versionId) return null
    const config = this.get(characterId)
    const version = config.versions.find((item) => item.id === binding.versionId)
    if (!version) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '聊天绑定的变量版本不存在，请恢复对应变量版本。', { what: '聊天绑定的变量版本' })
    return activeVariableConfig(characterId, version, config.versions)
  }

  save(characterId: string, input: VariableConfig): VariableConfig {
    const previous = this.get(characterId)
    const saved = this.store.withWriteTx((db) => this.saveInTransaction(characterId, input, db))
    if (persistedContent(previous) === persistedContent(saved)) return previous
    return this.get(characterId)
  }

  saveInTransaction(characterId: string, input: VariableConfig, db: ElecKoiDatabase): VariableConfig {
    if (input.characterId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '变量配置与角色不匹配。', { what: '变量配置与角色' })
    const previous = this.get(characterId, db)
    const normalized = normalizeVariableConfig(characterId, variableConfigSchema.parse(input), previous)
    const retained = new Set(normalized.versions.map((version) => version.id))
    if (conversationVariableVersionIds(characterId, db).some((id) => id && !retained.has(id))) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '这个变量版本正在被聊天使用，不能删除。', { what: '解除聊天对该变量版本的使用' })
    }
    if (openingVariableVersionIds(characterId, db).some((id) => !retained.has(id))) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '这个变量版本已绑定开场白，请先解除绑定再删除。', { what: '解除开场白对该变量版本的绑定' })
    }
    if (persistedContent(previous) !== persistedContent(normalized)) this.persist(db, normalized)
    return normalized
  }

  /** Imported snapshots contain the evaluated state, including populated dynamic dictionaries. */
  restoreInTransaction(characterId: string, input: VariableConfig, db: ElecKoiDatabase): VariableConfig {
    const config = variableConfigSchema.parse(input)
    if (config.characterId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '变量备份与角色不匹配。', { what: '变量备份与角色' })
    requireCharacter(db, characterId)
    const active = config.versions.find(version => version.id === config.activeVersionId)
    if (!active) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '变量备份的当前版本不存在。', { what: '变量备份的当前版本' })
    for (const version of config.versions) {
      let state: unknown
      try { state = JSON.parse(version.initialStateJson) }
      catch (error) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid,
          `变量备份“${version.id}”的初始状态不是合法 JSON：${errorMessage(error)}`,
          { what: '变量备份的初始状态', path: 'initialStateJson' })
      }
      if (!state || typeof state !== 'object' || Array.isArray(state)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `变量备份“${version.id}”的初始状态不是对象。`, { what: '变量备份的初始状态', path: 'initialStateJson' })
    }
    this.persist(db, config)
    return this.get(characterId, db)
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
    // Reuse one statement inside the existing transaction so the library size
    // does not become the number of parameters in a single SQLite statement.
    if (version.objects.length) {
      const insertObject = db.insert(variableConfigObjects).values({
        characterId,
        versionId: version.id,
        objectId: sql.placeholder('objectId'),
        sortIndex: sql.placeholder('sortIndex'),
        payloadJson: sql.placeholder('payloadJson')
      }).prepare()
      version.objects.forEach((item, sortIndex) => insertObject.run({ objectId: item.id, sortIndex, payloadJson: writeVariableObject(item) }))
    }
    if (version.variables.length) {
      const insertVariable = db.insert(variableConfigVariables).values({
        characterId,
        versionId: version.id,
        variableId: sql.placeholder('variableId'),
        sortIndex: sql.placeholder('sortIndex'),
        payloadJson: sql.placeholder('payloadJson')
      }).prepare()
      version.variables.forEach((item, sortIndex) => insertVariable.run({ variableId: item.id, sortIndex, payloadJson: writeVariable(item) }))
    }
  }
}
