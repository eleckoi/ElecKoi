package com.eleckoi.android.feature.studio.ui.assistant.session

import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

internal data class CreationTimelineCheckpoint(
    val workspaceId: String,
    val conversationId: String,
    val timeline: List<CreationTimelineItem>,
)

/** Persists the latest creation timeline at a bounded cadence without gating visible events. */
internal class CreationTimelineCheckpointWriter(
    scope: CoroutineScope,
    private val intervalMillis: Long = 750L,
    private val persist: suspend (CreationTimelineCheckpoint) -> Unit,
) {
    private val checkpoints = Channel<CreationTimelineCheckpoint>(Channel.CONFLATED)
    private val writerJob: Job = scope.launch(Dispatchers.IO) {
        for (first in checkpoints) {
            delay(intervalMillis)
            var latest = first
            while (true) {
                latest = checkpoints.tryReceive().getOrNull() ?: break
            }
            runCatching { persist(latest) }
        }
    }

    fun offer(checkpoint: CreationTimelineCheckpoint) {
        checkpoints.trySend(checkpoint)
    }

    suspend fun stop() {
        checkpoints.close()
        writerJob.cancelAndJoin()
    }
}
