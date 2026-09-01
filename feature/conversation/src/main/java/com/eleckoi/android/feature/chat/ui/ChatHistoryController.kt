package com.eleckoi.android.feature.chat.ui

import androidx.paging.LoadState
import com.eleckoi.android.feature.chat.api.ChatService
import com.eleckoi.android.feature.chat.data.toChatMessage
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.foundation.paging.ConversationPagingWindow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * Binds role chat to the shared Room Paging source. It owns no cursor and no history cache; the
 * only local rows are the currently streaming tail, retained until the same Room rows arrive.
 */
internal class ChatHistoryController(
    private val scope: CoroutineScope,
    private val chatService: ChatService,
    private val updateState: ((ChatUiState) -> ChatUiState) -> Unit,
) {
    private var boundSessionId = ""
    private var window: ConversationPagingWindow<com.eleckoi.android.engine.agent.eleckoi.conversation.PagedConversationTurn>? = null
    private var itemsJob: Job? = null
    private var loadsJob: Job? = null
    private val transientTail = linkedMapOf<String, ChatMessage>()
    private var timelineMutationActive = false
    /**
     * Room invalidation after a local terminal commit may publish one stale page after the
     * generation flag flips back to idle. Keep the locally settled assistant tail for that one
     * handoff so the UI does not briefly remove it before the committed row arrives.
     */
    private var settledTailHandoffPending = false
    private var latestTurns: List<com.eleckoi.android.engine.agent.eleckoi.conversation.PagedConversationTurn>? = null

    fun bind(sessionId: String) {
        if (sessionId.isBlank() || boundSessionId == sessionId) return
        resetPaging()
        boundSessionId = sessionId
        val next = ConversationPagingWindow(scope, chatService.chatConversationPaging(sessionId))
        window = next
        next.start()
        itemsJob = scope.launch {
            next.items.collectLatest { turns ->
                if (turns == null) return@collectLatest
                latestTurns = turns
                if (!timelineMutationActive) publishTurns(sessionId, turns)
            }
        }
        loadsJob = scope.launch {
            next.loadStates.collectLatest { loads ->
                if (loads == null) return@collectLatest
                updateState { current ->
                    if (current.draft?.session?.id != sessionId) return@updateState current
                    val prepend = loads.prepend
                    val resolvedHasMore = resolveHistoryHasMore(
                        previous = current.historyHasMore,
                        prepend = prepend,
                        timelineMutationActive = current.isSending,
                    )
                    current.copy(
                        // Paging invalidates after regeneration commits to Room. During that
                        // refresh, prepend briefly becomes Loading; Loading means "unknown", not
                        // "older rows exist". Turning it into true removes the opening row from
                        // the LazyColumn and reinserts it a frame later, shifting the whole chat.
                        historyHasMore = resolvedHasMore,
                        historyPageLoading = prepend is LoadState.Loading ||
                            loads.refresh is LoadState.Loading,
                    )
                }
            }
        }
    }

    /** Crash checkpoints may invalidate Room every 750 ms; the live tail remains authoritative. */
    fun setTimelineMutationActive(active: Boolean) {
        if (timelineMutationActive == active) return
        if (active) {
            // A new generation owns the tail again; its normal pending-tail path will capture the
            // next projection. Do not carry a previous idle handoff into a new generation.
            settledTailHandoffPending = false
        } else if (timelineMutationActive) {
            // The terminal draft is already visible when this transition happens. Paging may
            // still expose the pre-commit checkpoint for one emission, so bridge that emission.
            settledTailHandoffPending = true
        }
        timelineMutationActive = active
        if (!active) {
            latestTurns?.let { turns ->
                boundSessionId.takeIf(String::isNotBlank)?.let { sessionId ->
                    publishTurns(sessionId, turns)
                }
            }
        }
    }

    fun resetPaging() {
        itemsJob?.cancel()
        loadsJob?.cancel()
        window?.stop()
        itemsJob = null
        loadsJob = null
        window = null
        boundSessionId = ""
        transientTail.clear()
        timelineMutationActive = false
        latestTurns = null
        settledTailHandoffPending = false
    }

    fun loadOlderMessages() {
        window?.requestOlder()
    }

    private fun publishTurns(
        sessionId: String,
        turns: List<com.eleckoi.android.engine.agent.eleckoi.conversation.PagedConversationTurn>,
    ) {
        val paged = turns.flatMap { turn -> turn.messages.map { it.toChatMessage() } }
        updateState { current ->
            val draft = current.draft
            if (draft?.session?.id != sessionId) return@updateState current
            val allowSettledTailHandoff = settledTailHandoffPending
            captureTransientTail(
                current = draft.session.messages,
                paged = paged,
                isSending = current.isSending,
                allowSettledTailHandoff = allowSettledTailHandoff,
            )
            if (allowSettledTailHandoff) settledTailHandoffPending = false
            val merged = mergePagedWithTransientTail(paged, current.isSending)
            current.copy(
                draft = draft.copy(session = draft.session.copy(messages = merged)),
                historyInitialPageReady = true,
            )
        }
    }

    private fun captureTransientTail(
        current: List<ChatMessage>,
        paged: List<ChatMessage>,
        isSending: Boolean,
        allowSettledTailHandoff: Boolean,
    ) {
        // 重新生成会先截断 Room，再把新时间线送到 ViewModel。两者到达顺序不固定。
        // 当前时间线已经删除的消息绝不能继续作为临时尾巴保存，否则下一次 Paging 更新
        // 会把 Room 中已经删除的旧回复重新追加到界面末尾。
        pruneTransientTailToCurrentTimeline(transientTail, current)
        retainLocallySettledReplies(
            transientTail = transientTail,
            current = current,
            paged = paged,
        )
        if (allowSettledTailHandoff) {
            settledTimelineHandoff(current = current, paged = paged).forEach { message ->
                transientTail[message.id] = message
            }
        }
        if (isSending) {
            val pagedById = paged.associateBy(ChatMessage::id)
            // Stable IDs deliberately survive regeneration. Identity alone therefore cannot prove
            // that Paging and the live UI contain the same revision: the old and regenerated
            // replies have the same ID. Start the transient suffix after the last fully equal row,
            // so a newly completed reply bridges Room without letting its old revision flash back.
            val lastSharedIndex = current.indexOfLast { message ->
                pagedById[message.id] == message
            }
            current.drop(lastSharedIndex + 1).forEach { transientTail[it.id] = it }
            current.filter(ChatMessage::pending).forEach { transientTail[it.id] = it }
        }
        val pagedById = paged.associateBy(ChatMessage::id)
        transientTail.entries.removeAll { (id, message) ->
            !message.pending && pagedById[id] == message
        }
    }

    private fun mergePagedWithTransientTail(
        paged: List<ChatMessage>,
        isSending: Boolean,
    ): List<ChatMessage> {
        val pagedIds = paged.mapTo(hashSetOf(), ChatMessage::id)
        return buildList(paged.size + transientTail.size) {
            paged.forEach { message ->
                val transient = transientTail[message.id]
                add(if (transient != null && (isSending || transient != message)) transient else message)
            }
            transientTail.values.forEach { message ->
                if (message.id !in pagedIds) add(message)
            }
        }
    }
}

/**
 * Stop updates the live state before its non-cancellable Room cleanup finishes. Keep that terminal
 * revision authoritative while Paging still exposes the older crash checkpoint; otherwise one
 * refresh flips `pending` back to true and disables regeneration after the request already ended.
 */
internal fun retainLocallySettledReplies(
    transientTail: MutableMap<String, ChatMessage>,
    current: List<ChatMessage>,
    paged: List<ChatMessage>,
) {
    val pagedById = paged.associateBy(ChatMessage::id)
    current.forEach { message ->
        val persisted = pagedById[message.id]
        if (
            message.role == MessageRole.Assistant &&
            !message.pending &&
            persisted?.pending == true
        ) {
            transientTail[message.id] = message
        }
    }
}

/**
 * Returns the newly settled conversation suffix that Paging has not exposed yet. User messages
 * and their completed assistant replies must cross this boundary together; retaining only the
 * assistant makes an already completed conversation briefly render as consecutive AI replies.
 *
 * The caller must gate this to the terminal generation-to-idle handoff. The current timeline has
 * already applied regeneration deletion semantics, so rows absent from it are never resurrected.
 */
internal fun settledTimelineHandoff(
    current: List<ChatMessage>,
    paged: List<ChatMessage>,
): List<ChatMessage> {
    val pagedById = paged.associateBy(ChatMessage::id)
    val lastSharedIndex = current.indexOfLast { message ->
        pagedById[message.id] == message
    }
    return current
        .drop(lastSharedIndex + 1)
        .filter { message ->
            message.id !in pagedById &&
                (
                    message.role == MessageRole.User ||
                        (message.role == MessageRole.Assistant && !message.pending)
                    )
        }
}

internal fun resolveHistoryHasMore(
    previous: Boolean,
    prepend: LoadState,
    timelineMutationActive: Boolean,
): Boolean = when {
    // Regeneration and sending only mutate the tail. Paging invalidation during that transaction
    // cannot possibly discover or remove older history, so its intermediate states have no
    // authority over the already known prepend boundary.
    timelineMutationActive -> previous
    else -> when (prepend) {
        is LoadState.NotLoading -> !prepend.endOfPaginationReached
        is LoadState.Loading,
        is LoadState.Error,
        -> previous
    }
}

internal fun pruneTransientTailToCurrentTimeline(
    transientTail: MutableMap<String, ChatMessage>,
    current: List<ChatMessage>,
) {
    val currentById = current.associateBy(ChatMessage::id)
    transientTail.entries.removeAll { (id, transient) ->
        // Regeneration reuses the response ID. Retaining a different revision under that ID makes
        // Paging briefly restore the deleted reply at completion, remounting Markdown/tool UI.
        currentById[id] != transient
    }
}
