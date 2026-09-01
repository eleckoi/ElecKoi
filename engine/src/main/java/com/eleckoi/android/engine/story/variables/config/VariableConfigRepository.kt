package com.eleckoi.android.engine.story.variables.config

import com.eleckoi.android.engine.story.variables.model.VariableConfig
import com.eleckoi.android.engine.story.variables.model.VariableConfigVersion
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import com.eleckoi.android.foundation.storage.newId
import com.eleckoi.android.foundation.storage.nowIso
import com.eleckoi.android.foundation.storage.room.ElecKoiDatabase
import com.eleckoi.android.foundation.storage.room.VariableConfigEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

fun interface VariableConfigCharacterLookup {
    fun exists(characterId: String): Boolean
}

class VariableConfigRepository(
    database: ElecKoiDatabase,
    private val characters: VariableConfigCharacterLookup,
) {
    private val dao = database.variableConfigDao()

    fun configFlow(characterId: String): Flow<VariableConfig> {
        return dao.configFlow(characterId).map { entity -> configFromEntity(characterId, entity) }
    }

    fun load(characterId: String): VariableConfig {
        return configFromEntity(characterId, dao.config(characterId))
    }

    fun save(characterId: String, config: VariableConfig): VariableConfig {
        val ownerId = requireCharacterId(characterId)
        val now = nowIso()
        val activeVersionId = config.activeVersionId.ifBlank {
            config.versions.firstOrNull()?.id ?: "variable-config-${newId(8)}"
        }
        val previousActive = config.versions.firstOrNull { it.id == activeVersionId }
        val activeVersion = VariableConfigNormalizer.normalizeVersion(
            VariableConfigVersion(
                id = activeVersionId,
                name = config.name,
                initialStateJson = config.initialStateJson,
                schemaCode = config.schemaCode,
                objects = config.objects,
                variables = config.variables,
                expandedObjectIds = config.expandedObjectIds,
                createdAt = previousActive?.createdAt.orEmpty(),
                updatedAt = now,
            ),
            now = now,
            fallbackId = "variable-config-active",
        )
        val versions = (config.versions.filterNot { it.id == activeVersionId } + activeVersion)
            .mapIndexed { index, version ->
                VariableConfigNormalizer.normalizeVersion(
                    version = version,
                    now = now,
                    fallbackId = "variable-config-migrated-$index",
                )
            }
        val saved = activeConfig(ownerId, activeVersion, versions)
        dao.upsert(VariableConfigJsonCodec.toEntity(saved, now))
        return saved
    }

    fun exportJson(characterId: String): String {
        return VariableConfigJsonCodec.encode(load(characterId), nowIso())
    }

    fun restoreExportJson(characterId: String, json: String): VariableConfig {
        val ownerId = requireCharacterId(characterId)
        val document = VariableConfigJsonCodec.decodeRestore(json)
        val active = document.versions
            .firstOrNull { it.id == document.requestedActiveVersionId }
            ?: document.versions.first()
        return save(
            ownerId,
            activeConfig(
                characterId = ownerId,
                active = active,
                versions = document.versions,
                resolveInitialState = false,
            ),
        )
    }

    fun importJson(characterId: String, json: String): VariableConfig {
        val ownerId = requireCharacterId(characterId)
        val current = load(ownerId)
        val importedId = "variable-config-${newId(8)}"
        val imported = VariableConfigJsonCodec.decodeImport(json).copy(id = importedId)
        return save(
            ownerId,
            activeConfig(
                characterId = ownerId,
                active = imported,
                versions = current.versions + imported,
                resolveInitialState = false,
            ),
        )
    }

    fun deleteForCharacters(characterIds: List<String>) {
        val ids = characterIds.filter { it.isNotBlank() }.distinct()
        if (ids.isNotEmpty()) dao.deleteForCharacters(ids)
    }

    fun deleteExceptCharacters(characterIds: List<String>) {
        val ids = characterIds.filter { it.isNotBlank() }.distinct()
        if (ids.isEmpty()) {
            dao.deleteAll()
        } else {
            dao.deleteExceptCharacters(ids)
        }
    }

    private fun configFromEntity(
        characterId: String,
        entity: VariableConfigEntity?,
    ): VariableConfig {
        val ownerId = requireCharacterId(characterId)
        // Loading is a read. Reuse the persisted timestamp so unchanged data has a stable revision.
        val persistedTimestamp = entity?.updatedAt.orEmpty()
        val versions = entity?.versionsJson
            ?.let { json ->
                runCatching {
                    VariableConfigJsonCodec.decodeVersions(json)
                        .mapIndexed { index, version ->
                            VariableConfigNormalizer.normalizeVersion(
                                version = version,
                                now = persistedTimestamp,
                                fallbackId = "variable-config-migrated-$index",
                            )
                        }
                }.getOrDefault(emptyList())
            }
            ?.takeIf { it.isNotEmpty() }
            ?: listOf(VariableConfigNormalizer.emptyVersion())
        val activeVersionId = entity?.activeVersionId.orEmpty().ifBlank { versions.first().id }
        val activeVersion = versions.firstOrNull { it.id == activeVersionId } ?: versions.first()
        return activeConfig(ownerId, activeVersion, versions)
    }

    private fun activeConfig(
        characterId: String,
        active: VariableConfigVersion,
        versions: List<VariableConfigVersion>,
        resolveInitialState: Boolean = true,
    ): VariableConfig {
        return VariableConfig(
            characterId = characterId,
            name = active.name,
            initialStateJson = if (resolveInitialState) {
                active.resolvedInitialStateJson()
            } else {
                active.initialStateJson
            },
            schemaCode = active.schemaCode,
            objects = active.objects,
            variables = active.variables,
            expandedObjectIds = active.expandedObjectIds,
            activeVersionId = active.id,
            versions = versions,
        )
    }

    private fun requireCharacterId(characterId: String): String {
        if (!characters.exists(characterId)) throw ElecKoiDataException("角色不存在")
        return characterId
    }
}
