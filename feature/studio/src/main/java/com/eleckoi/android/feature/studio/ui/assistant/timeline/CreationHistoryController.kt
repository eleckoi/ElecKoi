package com.eleckoi.android.feature.studio.ui.assistant.timeline

import androidx.paging.LoadState
import com.eleckoi.android.feature.studio.api.CreatorAssistantService
import com.eleckoi.android.engine.agent.eleckoi.conversation.PagedConversationTurn
import com.eleckoi.android.engine.agent.eleckoi.conversation.creatorTimelineFromLedger
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantUiState
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.CreationActiveTimeline
import com.eleckoi.android.feature.conversation.timeline.activeCreationTurn
import com.eleckoi.android.foundation.paging.ConversationPagingWindow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

/** AI assistant binding for the same Room Paging source used by role chat. */
internal class CreationHistoryController(
    private val scope: CoroutineScope,
    private val creatorService: CreatorAssistantService,
    private val updateState: ((AiCreationAssistantUiState) -> AiCreationAssistantUiState) -> Unit,
    private val prewarm: (String, List<CreationTimelineItem>) -> Unit,
) {
    private var boundWorkspaceId = ""
    private var boundConversationId = ""
    private var window: ConversationPagingWindow<PagedConversationTurn>? = null
    private var itemsJob: Job? = null
    private var loadsJob: Job? = null
    private val timelineMutationActive = AtomicBoolean(false)
    private val transientTail = CreationTransientTimelineTail()

    fun rememberCurrentTimeline() = Unit

    fun removeConversation(conversationId: String) {
        if (boundConversationId == conversationId) reset()
    }

    fun loadInitial(
        workspaceId: String,
        conversationId: String,
    ) {
        if (conversationId.isBlank() || boundConversationId == conversationId) return
        reset()
        boundWorkspaceId = workspaceId
        boundConversationId = conversationId
        val next = ConversationPagingWindow(
            scope = scope,
            source = creatorService.creatorConversationPaging(conversationId),
        )
        window = next
        next.start()
        itemsJob = scope.launch {
            next.items.collectLatest { turns ->
                if (turns == null) return@collectLatest
                if (!timelineMutationActive.get()) {
                    publishTurns(workspaceId, conversationId, turns)
                }
            }
        }
        loadsJob = scope.launch {
            next.loadStates.collectLatest { loads ->
                if (loads == null) return@collectLatest
                updateState { current ->
                    if (current.conversation?.id != conversationId) return@updateState current
                    val prepend = loads.prepend
                    current.copy(
                        historyHasMore = prepend !is LoadState.NotLoading ||
                            !prepend.endOfPaginationReached,
                        historyPageLoading = prepend is LoadState.Loading ||
                            loads.refresh is LoadState.Loading,
                    )
                }
            }
        }
    }

    fun loadOlder() {
        window?.requestOlder()
    }

    /** Pending creation state owns the timeline until its terminal Room commit completes. */
    fun setTimelineMutationActive(active: Boolean) {
        if (active) {
            // A new mutation owns a new branch. A transient suffix from the previous completed
            // branch must never be eligible for merging into a regenerated response.
            transientTail.clear()
            timelineMutationActive.set(true)
            return
        }
        if (!timelineMutationActive.get()) return

        if (boundWorkspaceId.isNotBlank() && boundConversationId.isNotBlank()) {
            // Freeze the terminal UI while the mutation gate is still closed. Flipping the gate
            // first lets Paging's invalidation emit an empty/stale page in this gap, producing a
            // white flash or reattaching the answer that regeneration just deleted.
            publishTurns(
                workspaceId = boundWorkspaceId,
                conversationId = boundConversationId,
                turns = window?.items?.value.orEmpty(),
                preserveCurrentTail = true,
            )
        }
        timelineMutationActive.set(false)
    }

    private fun publishTurns(
        workspaceId: String,
        conversationId: String,
        turns: List<PagedConversationTurn>,
        preserveCurrentTail: Boolean = false,
    ) {
        val paged = turns.flatMap { turn ->
            creatorTimelineFromLedger(turn.messages).toUiTimeline()
        }
        updateState { current ->
            if (
                current.workspace?.id != workspaceId ||
                current.conversation?.id != conversationId
            ) return@updateState current
            val merged = transientTail.merge(
                current = current.timeline,
                paged = paged,
                preserveCurrent = current.isRunning || preserveCurrentTail,
            )
            current.copy(timeline = merged)
        }
        prewarm(conversationId, paged)
    }

    private fun reset() {
        itemsJob?.cancel()
        loadsJob?.cancel()
        window?.stop()
        itemsJob = null
        loadsJob = null
        window = null
        boundWorkspaceId = ""
        boundConversationId = ""
        timelineMutationActive.set(false)
        transientTail.clear()
    }
}

/** Keeps a just-finished UI tail alive until Paging catches up with the terminal Room commit. */
internal class CreationTransientTimelineTail {
    private var heldTurn: List<CreationTimelineItem>? = null
    private var heldTurnIds: List<String> = emptyList()
    private var heldTurnSourceId: String? = null

    fun merge(
        current: List<CreationTimelineItem>,
        paged: List<CreationTimelineItem>,
        preserveCurrent: Boolean,
    ): List<CreationTimelineItem> {
        if (preserveCurrent) {
            val activeTurn = if (current is CreationActiveTimeline) {
                current.activeTurn
            } else {
                current.activeCreationTurn()
            }
            heldTurn = activeTurn
            heldTurnIds = activeTurn.map(CreationTimelineItem::id)
            heldTurnSourceId = activeTurn.firstOrNull()?.id
        }

        val held = heldTurn ?: return paged
        if (pagedContainsHeldTerminalTurn(paged)) {
            clear()
            return paged
        }
        val sourceId = heldTurnSourceId
        val sourceIndex = sourceId?.let { id -> paged.indexOfLast { item -> item.id == id } } ?: -1
        val stablePagedHistory = if (sourceIndex >= 0) paged.subList(0, sourceIndex) else paged
        val heldIds = heldTurnIds.toHashSet()
        return buildList(stablePagedHistory.size + held.size) {
            stablePagedHistory.forEach { item -> if (item.id !in heldIds) add(item) }
            addAll(held)
        }
    }

    fun clear() {
        heldTurn = null
        heldTurnIds = emptyList()
        heldTurnSourceId = null
    }

    private fun pagedContainsHeldTerminalTurn(paged: List<CreationTimelineItem>): Boolean {
        val sourceId = heldTurnSourceId ?: return heldTurnIds.isEmpty()
        val sourceIndex = paged.indexOfLast { item -> item.id == sourceId }
        if (sourceIndex < 0) return false
        // The generated turn is the ledger tail. Exact suffix identity means Room contains this
        // completed branch; a stale regenerated page instead has different old event ids here.
        return paged.drop(sourceIndex).map(CreationTimelineItem::id) == heldTurnIds
    }
}
