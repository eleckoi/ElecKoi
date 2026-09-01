package com.eleckoi.android.feature.chat.ui.message

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.eleckoi.android.feature.chat.data.markdown.CompletedMarkdownDocumentLoader
import com.eleckoi.android.feature.chat.data.markdown.shouldSplitCompletedMarkdown
import com.eleckoi.android.feature.chat.data.rich.detectRichMessageDocument
import com.eleckoi.android.feature.chat.data.stream.StreamingMarkupAssembler
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ChatImageAttachment
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.chat.model.OpeningMessageId
import com.eleckoi.android.feature.chat.model.content.ChatContentBlock
import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext

/** A top-level LazyColumn item. Long assistant documents are split at Markdown block boundaries. */
internal data class ChatTimelineItem(
    val key: String,
    val message: ChatMessage,
    val messageIndex: Int,
    val fragment: ChatMessageFragment? = null,
    val isFirstInMessage: Boolean = true,
    val isLastInMessage: Boolean = true,
) {
    val contentType: String
        get() = buildString {
            append(message.role.name)
            append(':')
            append(fragment?.contentType ?: "message")
        }
}

/** The rendered list plus whether its stable top-level structure is ready for first display. */
internal data class ChatTimelinePresentation(
    val items: List<ChatTimelineItem>,
    val preparationComplete: Boolean,
)

private data class ChatTimelineSourceIndex(
    val revisions: List<LongMessageRevision>,
    val visibleMessageIds: Set<String>,
)

internal sealed interface ChatMessageFragment {
    val stableId: String
    val contentType: String

    data class Markdown(
        override val stableId: String,
        val node: MarkdownNode,
        val cacheOwnerKey: String,
        val sourceHash: Int,
        val sourceLength: Int,
    ) : ChatMessageFragment {
        override val contentType: String = "markdown-${node.type.name}"
    }

    data class Operation(
        val block: ChatContentBlock.Operation,
    ) : ChatMessageFragment {
        override val stableId: String = block.id
        override val contentType: String = "operation"
    }

    data class ImagePlacement(
        val attachments: List<ChatImageAttachment>,
    ) : ChatMessageFragment {
        override val stableId: String = "images-${attachments.joinToString("-") { it.frameIndex.toString() }}"
        override val contentType: String = "generated-image-gallery"
    }
}

private data class LongMessageRevision(
    val id: String,
    val contentHash: Int,
    val contentLength: Int,
    val reasoningHash: Int,
    val toolCallsHash: Int,
    val imageAttachmentsHash: Int,
    val turnStartedAtMillis: Long,
    val turnCompletedAtMillis: Long?,
)

private data class PreparedMessage(
    val revision: LongMessageRevision,
    val fragments: List<ChatMessageFragment>,
)

/**
 * Keeps the expensive stable-block index across route disposal.
 *
 * A conversation page is removed from composition when the user returns to the message list.
 * Keeping this data only in `remember` made every revisit parse and republish the same large
 * answer. The cache is process-local, revision checked, and bounded; renderer memory-pressure
 * cleanup clears it together with the document/layout caches.
 */
private object ChatTimelinePreparationCache {
    // Two prepared replies for each of the most recently active roles can coexist, while the
    // character budget below keeps the worst-case retained source size unchanged.
    private const val MaxEntries = 48
    private const val MaxCharacters = 512_000
    private const val MinRetainedEntries = 2

    private data class Key(val scopeKey: String, val messageId: String)
    private data class Entry(val prepared: PreparedMessage, val weight: Int)

    private val entries = object : LinkedHashMap<Key, Entry>(16, 0.75f, true) {}
    private var characters = 0

    @Synchronized
    fun matching(
        scopeKey: String,
        revisions: List<LongMessageRevision>,
    ): Map<String, PreparedMessage> = buildMap {
        revisions.forEach { revision ->
            val entry = ChatTimelinePreparationCache.entries[Key(scopeKey, revision.id)]
                ?: return@forEach
            if (entry.prepared.revision == revision) put(revision.id, entry.prepared)
        }
    }

    @Synchronized
    fun get(scopeKey: String, revision: LongMessageRevision): PreparedMessage? =
        entries[Key(scopeKey, revision.id)]
            ?.prepared
            ?.takeIf { it.revision == revision }

    @Synchronized
    fun put(scopeKey: String, prepared: PreparedMessage) {
        val key = Key(scopeKey, prepared.revision.id)
        entries.remove(key)?.let { characters -= it.weight }
        val entry = Entry(
            prepared = prepared,
            weight = prepared.revision.contentLength.coerceAtLeast(1),
        )
        entries[key] = entry
        characters += entry.weight
        val iterator = entries.entries.iterator()
        while (
            (entries.size > MaxEntries || characters > MaxCharacters) &&
                entries.size > MinRetainedEntries &&
                iterator.hasNext()
        ) {
            characters -= iterator.next().value.weight
            iterator.remove()
        }
    }

    @Synchronized
    fun clear() {
        entries.clear()
        characters = 0
    }

    @Synchronized
    fun removeScopes(scopeKeys: Set<String>) {
        if (scopeKeys.isEmpty()) return
        val iterator = entries.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (entry.key.scopeKey !in scopeKeys) continue
            characters -= entry.value.weight
            iterator.remove()
        }
    }
}

internal fun clearChatTimelinePreparationCache() {
    ChatTimelinePreparationCache.clear()
}

internal fun clearChatTimelinePreparationCacheScopes(scopeKeys: Set<String>) {
    ChatTimelinePreparationCache.removeScopes(scopeKeys)
}

internal suspend fun prewarmChatTimelineItems(
    messages: List<ChatMessage>,
    cacheScopeKey: String,
    maxItems: Int = 2,
) {
    if (maxItems <= 0) return
    messages.asReversed()
        .asSequence()
        .filter(::shouldSplitIntoTimelineBlocks)
        .take(maxItems)
        .forEach { message ->
            val revision = message.toLongMessageRevision()
            if (ChatTimelinePreparationCache.get(cacheScopeKey, revision) != null) {
                return@forEach
            }
            val prepared = PreparedMessage(
                revision = revision,
                fragments = prepareMessageFragments(
                    message = message,
                    cacheOwnerKey = "$cacheScopeKey:${message.id}",
                ),
            )
            ChatTimelinePreparationCache.put(cacheScopeKey, prepared)
        }
}

@Composable
internal fun rememberChatTimelineItems(
    messages: List<ChatMessage>,
    preparationMessages: List<ChatMessage> = messages,
    cacheScopeKey: String,
    messageIndexOffset: Int = 0,
    preparedFragmentsEnabled: Boolean = true,
    allowPreparedSplitsToPublish: Boolean = true,
    pinnedWholeMessageRevision: Int = 0,
    isWholeMessagePinned: (String) -> Boolean = NeverPinWholeMessage,
): ChatTimelinePresentation {
    val sourceIndex = remember(messages, preparationMessages, preparedFragmentsEnabled) {
        val visibleMessageIds = HashSet<String>(messages.size)
        val revisions = ArrayList<LongMessageRevision>()
        if (messages === preparationMessages) {
            messages.forEach { message ->
                visibleMessageIds += message.id
                if (preparedFragmentsEnabled && shouldSplitIntoTimelineBlocks(message)) {
                    revisions += message.toLongMessageRevision()
                }
            }
        } else {
            messages.forEach { message -> visibleMessageIds += message.id }
            if (preparedFragmentsEnabled) {
                preparationMessages.forEach { message ->
                    if (shouldSplitIntoTimelineBlocks(message)) {
                        revisions += message.toLongMessageRevision()
                    }
                }
            }
        }
        ChatTimelineSourceIndex(revisions, visibleMessageIds)
    }
    val revisions = sourceIndex.revisions
    val visibleMessageIds = sourceIndex.visibleMessageIds
    var prepared by remember(cacheScopeKey) {
        mutableStateOf(ChatTimelinePreparationCache.matching(cacheScopeKey, revisions))
    }
    var published by remember(cacheScopeKey) {
        mutableStateOf(ChatTimelinePreparationCache.matching(cacheScopeKey, revisions))
    }

    LaunchedEffect(cacheScopeKey, revisions) {
        val requestedById = revisions.associateBy(LongMessageRevision::id)
        val reusable = prepared.filter { (messageId, value) ->
            requestedById[messageId] == value.revision
        }
        val missing = preparationMessages.filter { message ->
            val revision = requestedById[message.id]
            revision != null && reusable[message.id]?.revision != revision
        }
        prepared = reusable
        // 底部是用户第一眼看到的区域，因此从最新消息向前准备，并在每条完成后立即发布。
        // 不再等待所有超长历史都解析完后一次性替换整张列表。
        missing.asReversed().forEach { message ->
            val built = try {
                withContext(Dispatchers.Default) {
                    val revision = requireNotNull(requestedById[message.id])
                    PreparedMessage(
                        revision = revision,
                        fragments = prepareMessageFragments(
                            message = message,
                            cacheOwnerKey = "$cacheScopeKey:${message.id}",
                        ),
                    )
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Throwable) {
                // A renderer failure keeps the whole message as one valid row. Remember the
                // attempted revision so first-display ownership can still settle instead of
                // waiting forever for a split that cannot be built.
                PreparedMessage(
                    revision = requireNotNull(requestedById[message.id]),
                    fragments = emptyList(),
                )
            }
            ChatTimelinePreparationCache.put(cacheScopeKey, built)
            prepared = prepared + (message.id to built)
        }
    }

    LaunchedEffect(
        cacheScopeKey,
        revisions,
        prepared,
        visibleMessageIds,
        allowPreparedSplitsToPublish,
        pinnedWholeMessageRevision,
    ) {
        val requestedById = revisions.associateBy(LongMessageRevision::id)
        val reusable = published.filter { (messageId, value) ->
            requestedById[messageId] == value.revision &&
                shouldUsePreparedTimelineFragments(
                    messageId = messageId,
                    preparedFragmentsEnabled = preparedFragmentsEnabled,
                    isWholeMessagePinned = isWholeMessagePinned,
                )
        }
        val next = reusable + prepared.filter { (messageId, value) ->
            requestedById[messageId] == value.revision &&
                shouldUsePreparedTimelineFragments(
                    messageId = messageId,
                    preparedFragmentsEnabled = preparedFragmentsEnabled,
                    isWholeMessagePinned = isWholeMessagePinned,
                ) &&
                (
                    allowPreparedSplitsToPublish ||
                        // 上一页尚未进入 LazyColumn，可以安全发布其稳定分块。真正接入时
                        // 从第一帧就是最终 key/几何，不会在手指下面由整条消息换成碎片。
                        messageId !in visibleMessageIds
                    )
        }
        if (next != published) published = next
    }

    val items = remember(
        messages,
        published,
        cacheScopeKey,
        messageIndexOffset,
        preparedFragmentsEnabled,
        pinnedWholeMessageRevision,
    ) {
        buildList {
            messages.forEachIndexed { messageIndex, message ->
                // 后台解析可以继续，但用户正在翻阅历史时不把“整条消息”换成多个列表项。
                // 否则 LazyColumn 的锚点会在手指下面改变，表现为突然跳到同一消息的另一段。
                val fragments = published[message.id]
                    ?.takeIf { it.revision == message.toLongMessageRevision() }
                    ?.takeIf {
                        shouldUsePreparedTimelineFragments(
                            messageId = message.id,
                            preparedFragmentsEnabled = preparedFragmentsEnabled,
                            isWholeMessagePinned = isWholeMessagePinned,
                        )
                    }
                    ?.fragments
                    .orEmpty()
                if (fragments.isEmpty()) {
                    add(
                        ChatTimelineItem(
                            key = message.id,
                            message = message,
                            messageIndex = messageIndexOffset + messageIndex,
                        ),
                    )
                } else {
                    fragments.forEachIndexed { fragmentIndex, fragment ->
                        val last = fragmentIndex == fragments.lastIndex
                        add(
                            ChatTimelineItem(
                                // Preserve the old message key on the tail. Opening a long history
                                // starts at the bottom, so LazyColumn can retain that exact anchor
                                // when the background block index becomes available.
                                key = if (last) message.id else "${message.id}:${fragment.stableId}",
                                message = message,
                                messageIndex = messageIndexOffset + messageIndex,
                                fragment = fragment,
                                isFirstInMessage = fragmentIndex == 0,
                                isLastInMessage = last,
                            ),
                        )
                    }
                }
            }
        }
    }
    val preparationComplete = revisions.all { revision ->
        isWholeMessagePinned(revision.id) || published[revision.id]?.revision == revision
    }
    return ChatTimelinePresentation(
        items = items,
        preparationComplete = preparationComplete,
    )
}

/** 亲眼看着生成的回复在本次会话页面生命周期内保持为同一个列表项。 */
internal fun shouldUsePreparedTimelineFragments(
    messageId: String,
    preparedFragmentsEnabled: Boolean = true,
    isWholeMessagePinned: (String) -> Boolean,
): Boolean = preparedFragmentsEnabled && !isWholeMessagePinned(messageId)

private val NeverPinWholeMessage: (String) -> Boolean = { false }

private fun shouldSplitIntoTimelineBlocks(message: ChatMessage): Boolean =
    message.role == MessageRole.Assistant &&
        !message.pending &&
        detectRichMessageDocument(message.content) == null &&
        (
            shouldSplitCompletedMarkdown(message.content) ||
                message.imageAttachments.isNotEmpty()
            )

private fun ChatMessage.toLongMessageRevision(): LongMessageRevision = LongMessageRevision(
    id = id,
    contentHash = content.hashCode(),
    contentLength = content.length,
    reasoningHash = reasoningContent.hashCode(),
    toolCallsHash = toolCalls.hashCode(),
    imageAttachmentsHash = imageAttachments.hashCode(),
    turnStartedAtMillis = turnStartedAtMillis,
    turnCompletedAtMillis = turnCompletedAtMillis,
)

private suspend fun prepareMessageFragments(
    message: ChatMessage,
    cacheOwnerKey: String,
): List<ChatMessageFragment> {
    val markupAssembler = StreamingMarkupAssembler(cacheOwnerKey)
    val blocks = assembleChatContentBlocks(
        message = message,
        displayedText = message.content,
        markupAssembler = markupAssembler,
    )
    return buildList {
        val attachmentsByFrame = message.imageAttachments.associateBy { it.frameIndex }
        var index = 0
        while (index < blocks.size) {
            when (val block = blocks[index]) {
                is ChatContentBlock.Text -> {
                    // 与整条临时视图使用同一个 ownerKey；Loader 会把并发请求合并为一次解析。
                    val nodes = CompletedMarkdownDocumentLoader.load(
                        ownerKey = cacheOwnerKey,
                        markdown = block.markdown,
                    )
                    nodes.forEach { node ->
                        add(
                            ChatMessageFragment.Markdown(
                                stableId = "${block.id}:${node.id}",
                                node = node,
                                cacheOwnerKey = "$cacheOwnerKey:${block.id}:${node.id}",
                                sourceHash = block.markdown.hashCode(),
                                sourceLength = block.markdown.length,
                            ),
                        )
                    }
                }

                is ChatContentBlock.ImagePlacement -> {
                    val attachments = block.frameIndexes
                        .distinct()
                        .mapNotNull(attachmentsByFrame::get)
                    if (attachments.isNotEmpty()) {
                        add(ChatMessageFragment.ImagePlacement(attachments = attachments))
                    }
                }

                is ChatContentBlock.Reasoning -> Unit

                is ChatContentBlock.ToolCall -> Unit

                is ChatContentBlock.Operation -> add(ChatMessageFragment.Operation(block))
            }
            index++
        }
    }
}

internal fun ChatMessage.shouldShowProcessedTimeline(): Boolean =
    role == MessageRole.Assistant && id != OpeningMessageId
