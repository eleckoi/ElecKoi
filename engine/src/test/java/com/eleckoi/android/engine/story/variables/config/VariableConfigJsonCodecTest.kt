package com.eleckoi.android.engine.story.variables.config

import com.eleckoi.android.engine.story.variables.model.VariableConfig
import com.eleckoi.android.engine.story.variables.model.VariableConfigVersion
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.VariableReadMode
import com.eleckoi.android.engine.story.variables.model.VariableValueType
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class VariableConfigJsonCodecTest {
    @Test
    fun exportedDocumentRetainsVersionedConfiguration() {
        val objectConfig = VariableObjectConfig(
            id = "status",
            name = "状态",
            dynamicKey = true,
            createdAt = "created",
            updatedAt = "updated",
        )
        val variable = VariableItemConfig(
            id = "energy",
            title = "精力",
            objectId = objectConfig.id,
            type = VariableValueType.Number.raw,
            defaultValue = "80",
            readMode = VariableReadMode.Required,
            createdAt = "created",
            updatedAt = "updated",
        )
        val version = VariableConfigVersion(
            id = "version-1",
            name = "默认变量",
            initialStateJson = "{\"status\":{\"energy\":80}}",
            schemaCode = "schema",
            objects = listOf(objectConfig),
            variables = listOf(variable),
            expandedObjectIds = listOf(objectConfig.id),
            createdAt = "created",
            updatedAt = "updated",
        )
        val config = VariableConfig(
            characterId = "character-1",
            name = version.name,
            initialStateJson = version.initialStateJson,
            schemaCode = version.schemaCode,
            objects = version.objects,
            variables = version.variables,
            expandedObjectIds = version.expandedObjectIds,
            activeVersionId = version.id,
            versions = listOf(version),
        )

        val restored = VariableConfigJsonCodec.decodeRestore(
            VariableConfigJsonCodec.encode(config, "exported"),
        )

        assertEquals(version.id, restored.requestedActiveVersionId)
        val restoredVersion = restored.versions.single()
        assertEquals(version.copy(initialStateJson = restoredVersion.initialStateJson), restoredVersion)
        assertEquals(
            JSONObject(version.initialStateJson).toString(),
            JSONObject(restoredVersion.initialStateJson).toString(),
        )
    }

    @Test
    fun restoreFallsBackToLegacyRootPayloadWithoutVersions() {
        val document = VariableConfigJsonCodec.decodeRestore(
            """
            {
              "format": "eleckoi.variable-config",
              "active_version_id": "legacy-active",
              "name": "旧版配置",
              "initial_state": {"mood": "calm"},
              "schema_code": "legacy-schema",
              "objects": [],
              "variables": [],
              "expanded_object_ids": []
            }
            """.trimIndent(),
        )

        assertEquals("legacy-active", document.requestedActiveVersionId)
        assertEquals("legacy-active", document.versions.single().id)
        assertEquals("旧版配置", document.versions.single().name)
        assertEquals("legacy-schema", document.versions.single().schemaCode)
    }

    @Test
    fun importAllowsLegacyPayloadButRejectsForeignFormat() {
        assertEquals("旧版配置", VariableConfigJsonCodec.decodeImport("{\"name\":\"旧版配置\"}").name)
        assertThrows(ElecKoiDataException::class.java) {
            VariableConfigJsonCodec.decodeImport("{\"format\":\"foreign\"}")
        }
    }

    @Test
    fun legacyNormalizationUsesStableIdsAcrossRepeatedReads() {
        val legacy = VariableConfigVersion(
            objects = listOf(VariableObjectConfig(name = "状态")),
            variables = listOf(VariableItemConfig(title = "精力")),
        )

        val first = VariableConfigNormalizer.normalizeVersion(legacy, "persisted", "fallback")
        val second = VariableConfigNormalizer.normalizeVersion(legacy, "persisted", "fallback")

        assertEquals(first, second)
        assertEquals("fallback", first.id)
        assertEquals("variable-migrated-0", first.variables.single().id)
    }
}
