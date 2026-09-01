package com.eleckoi.android.engine.agent.remotedsh

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

internal fun JsonElement.toHostDescription(): RemoteDshHostDescription {
    val value = jsonObject
    return RemoteDshHostDescription(
        version = value.string("version").orEmpty(),
        cwd = value.string("cwd").orEmpty(),
        provider = value.string("provider").orEmpty(),
        model = value.string("model").orEmpty(),
    )
}

internal fun JsonObject.toSessionSummary(workspaceId: String): RemoteDshSessionSummary {
    val id = string("sessionId") ?: error("DSH 会话缺少 sessionId")
    val cwd = string("cwd").orEmpty()
    val projectedTitle = titleProjection().orEmpty()
    val blank = this["blank"]?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull() == true
    return RemoteDshSessionSummary(
        sessionId = id,
        title = projectedTitle.ifBlank {
            if (blank) "新对话" else cwd.pathBaseName().ifBlank { id }
        },
        cwd = cwd,
        running = this["running"]?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull() == true,
        updatedAtMillis = this["updatedAt"]?.jsonPrimitive?.longOrNull ?: 0L,
        agentPreset = string("agentPreset").orEmpty(),
        workspaceId = workspaceId,
        blank = blank,
        origin = string("origin").orEmpty(),
    )
}

internal fun JsonObject.titleProjection(): String? =
    ((this["projections"] as? JsonObject)?.get("values") as? JsonObject)
        ?.string("title")

internal fun JsonObject.toWorkspaceSummary(): RemoteDshWorkspaceSummary {
    val workspaceId = string("workspaceId") ?: error("DSH 工作区缺少 workspaceId")
    val path = string("path").orEmpty()
    return RemoteDshWorkspaceSummary(
        workspaceId = workspaceId,
        title = string("title").orEmpty().ifBlank { path.pathBaseName().ifBlank { workspaceId } },
        path = path,
        sessionIds = (this["sessionIds"] as? JsonArray).orEmpty()
            .mapNotNull { it.jsonPrimitive.contentOrNull },
    )
}

private fun String.pathBaseName(): String = trimEnd('/', '\\')
    .substringAfterLast('/')
    .substringAfterLast('\\')

internal fun JsonObject.string(name: String): String? = this[name]?.jsonPrimitive?.contentOrNull

