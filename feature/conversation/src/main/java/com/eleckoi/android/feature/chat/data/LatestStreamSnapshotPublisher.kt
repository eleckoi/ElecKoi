package com.eleckoi.android.feature.chat.data

import java.util.ArrayDeque
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Publishes the newest immutable stream snapshot without replaying obsolete UI states.
 *
 * Protocol reducers still receive every source delta. Only presentation snapshots are conflated,
 * so text and control fields stay lossless while a slow renderer cannot backpressure the agent.
 */
internal class LatestStreamSnapshotPublisher<T>(
    scope: CoroutineScope,
    private val frameIntervalMillis: Long = DefaultFrameIntervalMillis,
    private val emit: (T) -> Unit,
) {
    private val pendingLock = Any()
    private val guaranteed = ArrayDeque<T>()
    private var latest: T? = null
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private val worker: Job = scope.launch {
        while (isActive) {
            wake.receive()
            while (isActive) {
                val snapshot = takeNext() ?: break
                val startedAt = System.nanoTime()
                emit(snapshot)
                val elapsedMillis = (System.nanoTime() - startedAt) / 1_000_000L
                val remainingMillis = frameIntervalMillis - elapsedMillis
                if (remainingMillis > 0L) delay(remainingMillis)
            }
        }
    }

    init {
        require(frameIntervalMillis > 0L) { "流式快照帧间隔必须大于 0" }
    }

    fun offer(snapshot: T) {
        synchronized(pendingLock) {
            latest = snapshot
        }
        wake.trySend(Unit)
    }

    /**
     * Queues a lifecycle boundary that must reach presentation at least once.
     *
     * Ordinary stream snapshots remain conflated, but dropping a work-item start means the UI can
     * jump directly from no operation to an already completed operation. A guaranteed snapshot is
     * therefore ordered ahead of later conflated state. It also supersedes any older conflated
     * snapshot because it already contains that accumulated state.
     */
    fun offerGuaranteed(snapshot: T) {
        synchronized(pendingLock) {
            guaranteed.addLast(snapshot)
            latest = null
        }
        wake.trySend(Unit)
    }

    suspend fun stopAndFlush(snapshot: T) {
        clearPending()
        worker.cancelAndJoin()
        emit(snapshot)
    }

    suspend fun stop() {
        clearPending()
        worker.cancelAndJoin()
    }

    private fun takeNext(): T? = synchronized(pendingLock) {
        if (guaranteed.isNotEmpty()) {
            guaranteed.removeFirst()
        } else {
            latest.also { latest = null }
        }
    }

    private fun clearPending() {
        synchronized(pendingLock) {
            guaranteed.clear()
            latest = null
        }
    }

    private companion object {
        const val DefaultFrameIntervalMillis = 33L
    }
}
