package com.eleckoi.android.feature.studio.authoring

import com.eleckoi.android.engine.agent.api.AgentPermissionMode
import com.eleckoi.android.engine.creator.capability.CreatorCapabilityException
import com.eleckoi.android.engine.workspace.model.CreatorWorkspace
import com.eleckoi.android.engine.workspace.model.CreatorWorkspaceRootAccess
import com.eleckoi.android.feature.studio.api.CreatorAssistantService
import com.eleckoi.android.feature.studio.authoring.capability.CharacterMediaCreatorChangeStore
import com.eleckoi.android.feature.studio.authoring.capability.RegexRuleCreatorChangeStore
import com.eleckoi.android.feature.studio.authoring.capability.SettingLibraryCreatorChangeStore
import com.eleckoi.android.feature.studio.authoring.capability.VariableCreatorChangeStore
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

internal class CreatorAuthoringContext(
    val workspaceId: String,
    private val permissionModeProvider: () -> AgentPermissionMode,
    val service: CreatorAssistantService,
    val settingLibraryChanges: SettingLibraryCreatorChangeStore = SettingLibraryCreatorChangeStore(),
    val characterMediaChanges: CharacterMediaCreatorChangeStore = CharacterMediaCreatorChangeStore(),
    val variableChanges: VariableCreatorChangeStore = VariableCreatorChangeStore(),
    val regexRuleChanges: RegexRuleCreatorChangeStore = RegexRuleCreatorChangeStore(),
) {
    fun currentPermissionMode(): AgentPermissionMode = permissionModeProvider()

    suspend fun workspace(): CreatorWorkspace = service.creatorWorkspace(workspaceId)
        ?: throw CreatorAuthoringException("WORKSPACE_NOT_FOUND", "创作工作区不存在")

    fun requireWritePermission() {
        if (currentPermissionMode() == AgentPermissionMode.AskForApproval) {
            throw CreatorAuthoringException(
                "READ_ONLY",
                "当前是 Read Only。可以读取和预览修改；要提交角色或设定库变更，请切换到 Workspace Write。",
            )
        }
    }

    suspend fun resolveCreatorRootId(requested: String): String {
        val workspace = workspace()
        val rootId = requested.ifBlank { workspace.primaryCharacterRootId.orEmpty() }
        if (rootId.isBlank()) {
            throw CreatorAuthoringException(
                "PRIMARY_ROOT_REQUIRED",
                "当前没有主角色，请指定已挂载 root_id 或先设置主角色",
            )
        }
        if (workspace.characterRoots.none { it.id == rootId }) {
            throw CreatorAuthoringException("ROOT_NOT_FOUND", "角色根没有挂载到当前工作区：$rootId")
        }
        return rootId
    }

    suspend fun requireCreatorWritableRoot(rootId: String) {
        val root = workspace().characterRoots.firstOrNull { it.id == rootId }
            ?: throw CreatorAuthoringException("ROOT_NOT_FOUND", "角色根没有挂载到当前工作区：$rootId")
        if (root.access != CreatorWorkspaceRootAccess.ReadWrite) {
            throw CreatorAuthoringException("ROOT_READ_ONLY", "这个参考角色当前是只读的，请先显式提升为可写")
        }
    }

    /** Human-readable target so the assistant can naturally refer to the character by name. */
    suspend fun creatorRootDisplayName(rootId: String): String {
        val root = workspace().characterRoots.firstOrNull { it.id == rootId }
            ?: throw CreatorAuthoringException("ROOT_NOT_FOUND", "角色根没有挂载到当前工作区：$rootId")
        return runCatching { service.creatorCharacter(root.characterId) }.getOrNull()
            ?.name
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: root.alias.trim().takeIf { alias ->
                alias.isNotBlank() && alias != root.characterId && !alias.startsWith("character-")
            }
            ?: "当前角色"
    }
}

internal class CreatorAuthoringException(code: String, message: String) :
    CreatorCapabilityException(code, message)

internal fun creatorObjectSchema(
    required: List<String> = emptyList(),
    properties: JsonObjectBuilder.() -> Unit,
): JsonObject = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    put("properties", buildJsonObject(properties))
    if (required.isNotEmpty()) {
        put("required", buildJsonArray { required.forEach { add(JsonPrimitive(it)) } })
    }
}

internal fun creatorStringSchema(
    description: String,
    enum: List<String> = emptyList(),
): JsonObject = buildJsonObject {
    put("type", "string")
    put("description", description)
    if (enum.isNotEmpty()) put("enum", buildJsonArray { enum.forEach { add(JsonPrimitive(it)) } })
}

internal fun creatorBooleanSchema(description: String): JsonObject = buildJsonObject {
    put("type", "boolean")
    put("description", description)
}

internal fun creatorArraySchema(
    description: String,
    items: JsonObject,
    maxItems: Int = 100,
): JsonObject = buildJsonObject {
    put("type", "array")
    put("description", description)
    put("items", items)
    put("maxItems", maxItems)
}

internal fun JsonObject.creatorString(name: String): String =
    (get(name) as? JsonPrimitive)?.contentOrNull.orEmpty().trim()

internal fun JsonObject.creatorRawString(name: String): String =
    (get(name) as? JsonPrimitive)?.contentOrNull.orEmpty()

internal fun JsonObject.creatorBoolean(name: String, default: Boolean = false): Boolean =
    (get(name) as? JsonPrimitive)?.booleanOrNull ?: default

internal fun JsonObject.creatorInt(name: String, default: Int): Int =
    (get(name) as? JsonPrimitive)?.intOrNull ?: default

internal fun JsonObject.creatorObject(name: String): JsonObject? = get(name) as? JsonObject

internal fun JsonObject.creatorArray(name: String): JsonArray? = get(name) as? JsonArray
