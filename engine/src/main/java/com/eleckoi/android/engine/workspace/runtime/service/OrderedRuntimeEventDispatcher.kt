package com.eleckoi.android.engine.workspace.runtime.service

import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeCapabilities
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeEvent
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeState
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch

/** A service command failure does not prove that the installed runtime disappeared. */
internal fun runtimeStateAfterOperationFailure(
    capabilities: LocalRuntimeCapabilities?,
    message: String,
): LocalRuntimeState = capabilities
    ?.let(LocalRuntimeState::Ready)
    ?: LocalRuntimeState.Failed(message)

/**
 * Ordered, lossless handoff from Android's non-suspending Messenger callback to suspending Flow
 * delivery. It is intentionally unbounded: a fixed limit would force the callback to drop JSONL
 * protocol events or kill a healthy Harness process during provider bursts.
 */
internal class OrderedRuntimeEventDispatcher(
    scope: CoroutineScope,
    private val deliver: suspend (LocalRuntimeEvent) -> Unit,
) {
    private val queue = Channel<LocalRuntimeEvent>(Channel.UNLIMITED)
    private val closed = AtomicBoolean(false)
    private val worker = scope.launch(start = CoroutineStart.UNDISPATCHED) {
        for (event in queue) deliver(event)
    }

    fun dispatch(event: LocalRuntimeEvent): Boolean {
        if (closed.get()) return false
        return queue.trySend(event).isSuccess
    }

    fun close() {
        if (closed.compareAndSet(false, true)) queue.close()
        worker.cancel()
    }
}
