package com.eleckoi.android.engine.agent.eleckoi.conversation

import com.eleckoi.android.engine.generation.image.ReplyImageGenerator
import com.eleckoi.android.foundation.storage.room.ElecKoiDatabase
import com.eleckoi.android.foundation.storage.room.agent.entity.AgentContentPartEntity
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Shared by role chats and creator conversations; never reads or renders message bodies. */
class ConversationAttachmentCleanup internal constructor(
    private val transaction: (() -> Unit) -> Unit,
    private val readParts: () -> Sequence<AgentContentPartEntity>,
    private val deleteInputFile: (String) -> Unit,
    private val generatedImages: ReplyImageGenerator?,
) {
    constructor(
        database: ElecKoiDatabase,
        deleteInputFile: (String) -> Unit,
        generatedImages: ReplyImageGenerator?,
    ) : this(
        { work -> database.runInTransaction(work) },
        { attachmentParts(database) },
        deleteInputFile,
        generatedImages,
    )

    fun deleteConversations(conversationIds: Collection<String>, deleteRecords: () -> Unit) {
        val deleted = conversationIds.filter(String::isNotBlank).toSet()
        if (deleted.isEmpty()) return
        transaction {
            val plan = planAttachmentDeletion(deleted, readParts)
            // Keep ownership rows until file deletion succeeds, so a failed operation can be retried.
            plan.inputPaths.forEach(deleteInputFile)
            generatedImages?.deleteGeneratedFiles(plan.generatedPaths)
            deleted.forEach { generatedImages?.deleteSessionImages(it, plan.retainedGeneratedPaths) }
            deleteRecords()
        }
    }

    /** A regeneration may discard turns while other branches still own their attachments. */
    fun discardMessages(conversationId: String, mutateRecords: () -> Unit) {
        transaction {
            val inputs = mutableSetOf<String>()
            val generated = mutableSetOf<String>()
            forEachAttachment(readParts().filter { it.conversationId == conversationId }) { kind, path ->
                if (kind == "input_images") inputs += path else generated += path
            }
            mutateRecords()
            forEachAttachment(readParts()) { _, path ->
                inputs -= path
                generated -= path
            }
            inputs.forEach(deleteInputFile)
            generatedImages?.deleteGeneratedFiles(generated)
        }
    }

    private companion object {
        fun attachmentParts(database: ElecKoiDatabase): Sequence<AgentContentPartEntity> = sequence {
            var last: AgentContentPartEntity? = null
            while (true) {
                val page = database.agentLedgerDao().attachmentPartsPage(
                    last?.ownerType.orEmpty(), last?.ownerId.orEmpty(),
                    last?.partIndex ?: -1, last?.chunkIndex ?: -1, AttachmentPageSize,
                )
                if (page.isEmpty()) break
                yieldAll(page)
                last = page.last()
            }
        }
        const val AttachmentPageSize = 16
    }
}

internal data class AttachmentDeletionPlan(
    val inputPaths: Set<String>,
    val generatedPaths: Set<String>,
    val retainedGeneratedPaths: Set<String>,
)

internal fun planAttachmentDeletion(
    deleted: Set<String>,
    readParts: () -> Sequence<AgentContentPartEntity>,
): AttachmentDeletionPlan {
    val inputs = mutableSetOf<String>()
    val generated = mutableSetOf<String>()
    forEachAttachment(readParts().filter { it.conversationId in deleted }) { kind, path ->
        if (kind == "input_images") inputs += path else generated += path
    }
    val retainedGenerated = mutableSetOf<String>()
    forEachAttachment(readParts().filter { it.conversationId !in deleted }) { _, path ->
        // A file may be referenced by a supported history import in another conversation.
        inputs -= path
        generated -= path
        retainedGenerated += path
    }
    return AttachmentDeletionPlan(inputs, generated, retainedGenerated)
}

private fun forEachAttachment(
    parts: Sequence<AgentContentPartEntity>,
    visit: (kind: String, path: String) -> Unit,
) {
    var first: AgentContentPartEntity? = null
    var nextChunk = 0
    val payload = StringBuilder()
    fun flush() {
        val part = first ?: return
        // Invalid metadata aborts before any deletion; it must not become an empty attachment list.
        Json.parseToJsonElement(payload.toString()).jsonArray.forEach { item ->
            val path = item.jsonObject["local_path"]?.jsonPrimitive?.content.orEmpty()
            if (path.isNotBlank()) visit(part.kind, File(path).canonicalPath)
        }
    }
    parts.forEach { part ->
        val previous = first
        if (previous == null || previous.ownerType != part.ownerType ||
            previous.ownerId != part.ownerId || previous.partIndex != part.partIndex ||
            previous.conversationId != part.conversationId
        ) {
            flush()
            first = part
            nextChunk = 0
            payload.setLength(0)
        }
        check(part.chunkIndex == nextChunk++) { "附件记录分块不完整：${part.ownerId}" }
        payload.append(part.payloadJson)
    }
    flush()
}
