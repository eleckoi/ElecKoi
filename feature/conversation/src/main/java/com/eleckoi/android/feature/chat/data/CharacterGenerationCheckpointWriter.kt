package com.eleckoi.android.feature.chat.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Conflates fast UI deltas into bounded Room writes without changing the visible stream cadence. */
internal class CharacterGenerationCheckpointWriter<T>(
    scope: CoroutineScope,
    private val persist: (T) -> Unit,
    private val intervalMillis: Long = 750L,
) {
    private val checkpoints = Channel<T>(Channel.CONFLATED)
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

    fun offer(snapshot: T) {
        checkpoints.trySend(snapshot)
    }

    suspend fun stop() {
        checkpoints.close()
        writerJob.cancelAndJoin()
    }
}
