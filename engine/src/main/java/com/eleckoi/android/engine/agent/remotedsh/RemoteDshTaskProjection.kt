package com.eleckoi.android.engine.agent.remotedsh

import com.eleckoi.android.engine.agent.api.AgentSessionEvent
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.engine.agent.api.AgentWorkStatus
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

internal data class RemoteDshRawEvent(
    val sequence: Long,
    val event: JsonObject,
)

internal sealed interface RemoteDshTaskProjection {
    data object Pending : RemoteDshTaskProjection
    data class Completed(val response: String) : RemoteDshTaskProjection
    data class Failed(val message: String) : RemoteDshTaskProjection
}

internal fun projectRemoteDshTask(
    events: List<RemoteDshRawEvent>,
    afterSequence: Long,
): RemoteDshTaskProjection {
    var started = false
    var response = ""
    events.asSequence()
        .filter { it.sequence > afterSequence }
        .sortedBy(RemoteDshRawEvent::sequence)
        .forEach { row ->
            val event = row.event
            when (event.string("type")) {
                "turn/start" -> started = true
                "assistant/message" -> if (started) {
                    event.assistantText().takeIf(String::isNotBlank)?.let { response = it }
                }
                "turn/end" -> if (started) {
                    val reason = (event["data"] as? JsonObject)?.get("reason") as? JsonObject
                    return when (reason?.string("kind")) {
                        null, "completed" -> RemoteDshTaskProjection.Completed(response)
                        else -> RemoteDshTaskProjection.Failed(
                            ((reason["error"] as? JsonObject)?.string("message"))
                                ?: reason.string("message")
                                ?: "电脑 DSH 未完成任务：${reason.string("kind")}",
                        )
                    }
                }
            }
        }
    return RemoteDshTaskProjection.Pending
}

private fun JsonObject.assistantText(): String {
    val data = this["data"] as? JsonObject ?: return ""
    val message = data["message"] as? JsonObject
    val content = (message?.get("content") ?: data["content"]) as? JsonArray ?: return ""
    return content.mapNotNull { block ->
        val value = block as? JsonObject ?: return@mapNotNull null
        value.string("text").takeIf { value.string("type") == "text" }
    }.joinToString("")
}

internal fun projectRemoteDshUserMessage(
    sessionId: String,
    turnId: String,
    sequence: Long?,
    event: JsonObject,
): AgentSessionEvent.WorkItemCompleted? {
    val data = event["data"] as? JsonObject ?: return null
    val sourceKind = (data["source"] as? JsonObject)?.string("kind")
    if (sourceKind != null && sourceKind != "user") return null
    val text = (data["content"] as? JsonArray).orEmpty()
        .mapNotNull { block ->
            val payload = block as? JsonObject ?: return@mapNotNull null
            payload.string("text").takeIf { payload.string("type") == "text" }
        }
        .joinToString("\n")
    if (text.isBlank()) return null
    val time = event["time"]?.jsonPrimitive?.longOrNull ?: 0L
    return AgentSessionEvent.WorkItemCompleted(
        threadId = sessionId,
        turnId = turnId,
        itemId = "user-${sequence ?: time}",
        type = AgentWorkItemType.UserMessage,
        status = AgentWorkStatus.Completed,
        summary = text,
        completedAtMillis = time,
    )
}

