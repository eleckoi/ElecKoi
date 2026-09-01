package com.eleckoi.android.engine.agent.eleckoi.conversation

import com.eleckoi.android.engine.agent.api.AgentHistoryItem
import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.workspace.model.CreatorConversationTimelineItem
import com.eleckoi.android.engine.workspace.model.CreatorConversationInputImage
import com.eleckoi.android.engine.workspace.model.CreatorConversationTimelineKind
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import java.time.Instant
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Converts the assistant's detailed surface timeline into the same Room ledger used by role chat.
 * The visible timeline and the provider-native replay history are separate parts of one turn.
 */
fun creatorTimelineLedgerMessages(
    timeline: List<CreatorConversationTimelineItem>,
): List<LedgerMessage> = creatorTurnGroups(timeline).flatMap { group ->
    val firstUser = group.items.firstOrNull {
        it.kind == CreatorConversationTimelineKind.User
    }
    val finalAssistant = group.items.lastOrNull {
        it.kind == CreatorConversationTimelineKind.Assistant &&
            it.messagePhase == AgentMessagePhase.FinalAnswer
    } ?: group.items.lastOrNull { it.kind == CreatorConversationTimelineKind.Assistant }
    val createdAt = firstUser?.createdAtMillis
        ?.takeIf { it > 0L }
        ?.let { Instant.ofEpochMilli(it).toString() }
        .orEmpty()
    val turnStartedAtMillis = firstUser?.turnStartedAtMillis
        ?.takeIf { it > 0L }
        ?: group.items.asSequence()
            .map(CreatorConversationTimelineItem::turnStartedAtMillis)
            .firstOrNull { it > 0L }
        ?: firstUser?.createdAtMillis
        ?: 0L
    val completedAt = group.items.mapNotNull(CreatorConversationTimelineItem::completedAtMillis)
        .maxOrNull()
    val nativeItems = group.items.flatMap(CreatorConversationTimelineItem::modelHistoryItems)
    val runtimeThreadId = group.items
        .firstNotNullOfOrNull { it.runtimeThreadId.takeIf(String::isNotBlank) }
        .orEmpty()
    val userId = firstUser?.id ?: "assistant-user-${group.turnId}"
    val responseId = finalAssistant?.id ?: "assistant-response-${group.turnId}"
    listOf(
        LedgerMessage(
            id = userId,
            role = "user",
            content = firstUser?.text.orEmpty(),
            createdAt = createdAt,
            runtimeTurnId = group.turnId,
            runtimeThreadId = runtimeThreadId,
            turnStartedAtMillis = turnStartedAtMillis,
            inputImageAttachmentsJson = ElecKoiJson.encodeToString(firstUser?.inputImages.orEmpty()),
        ),
        LedgerMessage(
            id = responseId,
            role = "assistant",
            content = finalAssistant?.text.orEmpty(),
            createdAt = createdAt,
            pending = group.items.any { it.completedAtMillis == null && !it.failed },
            runtimeTurnId = group.turnId,
            runtimeThreadId = runtimeThreadId,
            turnStartedAtMillis = turnStartedAtMillis,
            turnCompletedAtMillis = completedAt,
            surfaceTimelineJson = ElecKoiJson.encodeToString(group.items),
            modelHistoryItems = nativeItems,
        ),
    )
}

/** Restores every user-visible reasoning/tool/message row for a paged history window. */
fun creatorTimelineFromLedger(
    messages: List<LedgerMessage>,
): List<CreatorConversationTimelineItem> = buildList {
    var index = 0
    while (index < messages.size) {
        val message = messages[index]
        val paired = messages.getOrNull(index + 1)
            ?.takeIf { message.role == "user" && it.role == "assistant" }
        val stored = paired?.surfaceTimelineJson
            ?.takeIf(String::isNotBlank)
            ?.let { payload ->
                runCatching {
                    ElecKoiJson.decodeFromString<List<CreatorConversationTimelineItem>>(payload)
                }.getOrNull()
            }
        if (stored != null) {
            addAll(stored)
        } else {
            add(message.fallbackCreatorTimelineItem())
            paired?.takeIf { it.content.isNotBlank() }?.let { add(it.fallbackCreatorTimelineItem()) }
        }
        index += if (paired == null) 1 else 2
    }
}

/**
 * Full assistant projection: exact Room-owned native items are replayed without deleting tool
 * calls, tool results, reasoning, or compaction markers. Text synthesis is only a compatibility
 * fallback for a ledger turn written before native capture was available.
 */
fun assistantFullHistory(
    messages: List<LedgerMessage>,
): List<AgentHistoryItem> = buildList {
    var index = 0
    while (index < messages.size) {
        val message = messages[index]
        val paired = messages.getOrNull(index + 1)
            ?.takeIf { message.role == "user" && it.role == "assistant" }
        val nativeItems = paired?.modelHistoryItems.orEmpty()
        if (nativeItems.isNotEmpty()) {
            val turnStartIndex = size
            val restoredImageUser = message
                .takeIf { it.inputImageAttachmentsJson != "[]" }
                ?.let { roomConversationHistory(listOf(it), currentUserMessageId = "") }
                ?.singleOrNull()
            var replacedUser = false
            nativeItems.filter(String::isNotBlank).forEach { native ->
                if (!replacedUser && restoredImageUser != null && native.isNativeUserMessage()) {
                    add(restoredImageUser)
                    replacedUser = true
                } else {
                    add(AgentHistoryItem(native))
                }
            }
            if (restoredImageUser != null && !replacedUser) {
                add(turnStartIndex, restoredImageUser)
            }
        } else {
            if (message.inputImageAttachmentsJson != "[]") {
                addAll(roomConversationHistory(listOf(message), currentUserMessageId = ""))
            } else {
                message.toFallbackHistoryItem()?.let(::add)
            }
            paired?.toFallbackHistoryItem()?.let(::add)
        }
        index += if (paired == null) 1 else 2
    }
}

private fun String.isNativeUserMessage(): Boolean = runCatching {
    val item = ElecKoiJson.parseToJsonElement(this).jsonObject
    item["type"]?.jsonPrimitive?.content == "message" &&
        item["role"]?.jsonPrimitive?.content == "user"
}.getOrDefault(false)

private data class CreatorTurnGroup(
    val turnId: String,
    val items: List<CreatorConversationTimelineItem>,
)

private fun creatorTurnGroups(
    timeline: List<CreatorConversationTimelineItem>,
): List<CreatorTurnGroup> {
    val groups = mutableListOf<CreatorTurnGroup>()
    var currentId = ""
    var current = mutableListOf<CreatorConversationTimelineItem>()
    fun flush() {
        if (current.isEmpty()) return
        val id = currentId.ifBlank {
            stableLedgerId("assistant-turn", current.first().id)
        }
        groups += CreatorTurnGroup(id, current.toList())
        current = mutableListOf()
    }
    timeline.forEach { item ->
        val itemTurnId = item.turnId.orEmpty()
        val beginsAnotherTurn = item.kind == CreatorConversationTimelineKind.User &&
            current.isNotEmpty() &&
            itemTurnId.ifBlank { item.id } != currentId.ifBlank {
                current.first().turnId.orEmpty().ifBlank { current.first().id }
            }
        if (beginsAnotherTurn) flush()
        if (current.isEmpty()) currentId = itemTurnId.ifBlank { item.id }
        current += item
    }
    flush()
    return groups
}

private fun LedgerMessage.fallbackCreatorTimelineItem(): CreatorConversationTimelineItem =
    CreatorConversationTimelineItem(
        id = id,
        kind = if (role == "user") {
            CreatorConversationTimelineKind.User
        } else {
            CreatorConversationTimelineKind.Assistant
        },
        text = content,
        runtimeThreadId = runtimeThreadId,
        turnId = runtimeTurnId.takeIf(String::isNotBlank),
        createdAtMillis = runCatching { Instant.parse(createdAt).toEpochMilli() }.getOrDefault(0L),
        turnStartedAtMillis = turnStartedAtMillis,
        completedAtMillis = turnCompletedAtMillis,
        inputImages = if (role == "user") inputImagesFromLedger() else emptyList(),
    )

private fun LedgerMessage.inputImagesFromLedger(): List<CreatorConversationInputImage> =
    runCatching {
        ElecKoiJson.decodeFromString<List<CreatorConversationInputImage>>(inputImageAttachmentsJson)
    }.getOrDefault(emptyList())

private fun LedgerMessage.toFallbackHistoryItem(): AgentHistoryItem? {
    if (content.isBlank()) return null
    val assistant = role == "assistant"
    val item = buildJsonObject {
        put("type", "message")
        put("role", if (assistant) "assistant" else "user")
        put("content", buildJsonArray {
            add(buildJsonObject {
                put("type", if (assistant) "output_text" else "input_text")
                put("text", content)
            })
        })
    }
    return AgentHistoryItem(item.toString())
}
