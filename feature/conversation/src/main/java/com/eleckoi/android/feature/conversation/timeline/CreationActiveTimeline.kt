package com.eleckoi.android.feature.conversation.timeline

import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import java.util.RandomAccess

/** Stable paged history plus the only turn allowed to change during an Agent run. */
class CreationActiveTimeline private constructor(
    val stableHistory: List<CreationTimelineItem>,
    val activeTurn: List<CreationTimelineItem>,
) : AbstractList<CreationTimelineItem>(), RandomAccess {
    override val size: Int = stableHistory.size + activeTurn.size

    override fun get(index: Int): CreationTimelineItem = when {
        index < 0 || index >= size -> throw IndexOutOfBoundsException("index=$index, size=$size")
        index < stableHistory.size -> stableHistory[index]
        else -> activeTurn[index - stableHistory.size]
    }

    /** StateFlow equality must not rescan thousands of stable history items on every delta. */
    override fun equals(other: Any?): Boolean = when {
        this === other -> true
        other is CreationActiveTimeline && stableHistory === other.stableHistory ->
            activeTurn == other.activeTurn
        else -> super.equals(other)
    }

    fun withActiveTurn(updated: List<CreationTimelineItem>): CreationActiveTimeline =
        if (updated === activeTurn) this else CreationActiveTimeline(stableHistory, updated)

    companion object {
        fun start(
            current: List<CreationTimelineItem>,
            user: CreationTimelineItem,
        ): CreationActiveTimeline {
            // A second turn can start before the terminal Paging refresh is observed. Flatten only
            // at that turn boundary; the high-frequency delta path never copies completed history.
            val completedHistory = if (current is CreationActiveTimeline) current.toList() else current
            return CreationActiveTimeline(completedHistory, listOf(user))
        }
    }
}

fun List<CreationTimelineItem>.activeCreationTurn(): List<CreationTimelineItem> =
    if (this is CreationActiveTimeline) {
        activeTurn
    } else {
        val start = indexOfLast { item -> item.kind == com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind.User }
        if (start >= 0) subList(start, size) else this
    }

/** Reuses completed-turn presentation while only rebuilding the running tail. */
class CreationTurnListProjector {
    private var stableSource: List<CreationTimelineItem>? = null
    private var stableTurns: List<CreationTurnUi> = emptyList()

    fun project(
        timeline: List<CreationTimelineItem>,
        isRunning: Boolean,
    ): List<CreationTurnUi> {
        if (timeline !is CreationActiveTimeline) {
            stableSource = null
            stableTurns = emptyList()
            return timeline.toCreationTurns(isRunning)
        }
        if (stableSource !== timeline.stableHistory) {
            stableSource = timeline.stableHistory
            stableTurns = timeline.stableHistory.toCreationTurns(isRunning = false)
        }
        val currentTurn = timeline.activeTurn.toCreationTurns(
            isRunning = isRunning,
            // DSH gives an explicit FinalAnswer phase before streaming that answer. Publish that
            // stable phase immediately so the prose grows in its final slot instead of living in
            // the process surface and jumping to a different container when the turn completes.
            exposeStreamingFinalAnswer = true,
        )
        return when {
            stableTurns.isEmpty() -> currentTurn
            currentTurn.isEmpty() -> stableTurns
            else -> stableTurns + currentTurn
        }
    }
}
