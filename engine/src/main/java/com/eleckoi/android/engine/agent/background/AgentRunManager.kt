package com.eleckoi.android.engine.agent.background

import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class AgentRunSurface {
    CharacterChat,
    CreationAssistant,
}

enum class AgentRunPhase {
    Starting,
    Running,
    WaitingForApproval,
    Stopping,
}

data class AgentRunDescriptor(
    val runId: String,
    val surface: AgentRunSurface,
    val workspaceId: String,
    val conversationId: String,
    val title: String,
    val detail: String,
    val avatarPath: String = "",
)

data class AgentRunCompletion(
    val descriptor: AgentRunDescriptor,
    val summary: String,
)

data class AgentRunSnapshot(
    val descriptor: AgentRunDescriptor,
    val phase: AgentRunPhase,
    val detail: String,
    val startedAtMillis: Long,
)

/** Android-specific foreground-service operations stay behind this narrow process-lifetime port. */
interface AgentForegroundController {
    fun acquire(snapshot: AgentRunSnapshot)
    fun update(snapshot: AgentRunSnapshot)
    fun release(runId: String)
}

/** Publishes the durable, non-foreground notification after a successful Agent run. */
fun interface AgentRunCompletionNotifier {
    fun notifyCompleted(completion: AgentRunCompletion)
}

/**
 * Application-scoped owner of the one user-visible Agent run allowed by the local runtime.
 *
 * A caller may stop awaiting [run] without cancelling the underlying work. This is intentional:
 * Activity/ViewModel lifetimes observe Agent work; they never own it.
 */
class AgentRunManager(
    private val foreground: AgentForegroundController,
    private val completionNotifier: AgentRunCompletionNotifier = AgentRunCompletionNotifier {},
) : AutoCloseable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutationLock = Any()
    private val _activeRun = MutableStateFlow<AgentRunSnapshot?>(null)
    val activeRun: StateFlow<AgentRunSnapshot?> = _activeRun.asStateFlow()

    private var active: ActiveRun? = null

    suspend fun <T> run(
        descriptor: AgentRunDescriptor,
        onStop: suspend () -> Unit,
        block: suspend AgentRunReporter.() -> T,
    ): T {
        require(descriptor.runId.isNotBlank()) { "Agent run id cannot be blank" }
        val completion = CompletableDeferred<Result<T>>()
        lateinit var entry: ActiveRun
        val job = scope.launch(start = CoroutineStart.LAZY) {
            var outcome: Result<T>? = null
            try {
                report(descriptor.runId, AgentRunPhase.Running, descriptor.detail)
                outcome = Result.success(AgentRunReporter(descriptor.runId).block())
            } catch (error: Throwable) {
                outcome = Result.failure(error)
            } finally {
                // Release the single runtime slot before waking the caller. A queued creator turn
                // may start immediately after await returns and must not race the old owner.
                releaseIfOwned(descriptor.runId)
                if (outcome?.isSuccess == true) {
                    entry.completionSummary.get()?.let { summary ->
                        // A notification failure must never turn a completed model response into a
                        // failed run. Android owns notification permission and channel state.
                        runCatching {
                            completionNotifier.notifyCompleted(
                                AgentRunCompletion(descriptor, summary),
                            )
                        }
                    }
                }
                completion.complete(requireNotNull(outcome))
            }
        }
        entry = ActiveRun(
            descriptor = descriptor,
            job = job,
            onStop = onStop,
        )
        val starting = AgentRunSnapshot(
            descriptor = descriptor,
            phase = AgentRunPhase.Starting,
            detail = descriptor.detail,
            startedAtMillis = System.currentTimeMillis(),
        )
        synchronized(mutationLock) {
            val running = active
            if (running != null) {
                job.cancel()
                throw AgentRunBusyException(running.descriptor.surface)
            }
            active = entry
            _activeRun.value = starting
        }
        try {
            foreground.acquire(starting)
        } catch (error: Throwable) {
            synchronized(mutationLock) {
                if (active === entry) {
                    active = null
                    _activeRun.value = null
                }
            }
            job.cancel()
            throw error
        }
        job.start()
        return completion.await().getOrThrow()
    }

    fun requestStop(runId: String? = null): Boolean {
        val entry = synchronized(mutationLock) {
            val current = active ?: return false
            if (runId != null && current.descriptor.runId != runId) return false
            if (!current.stopRequested.compareAndSet(false, true)) return true
            val snapshot = requireNotNull(_activeRun.value).copy(
                phase = AgentRunPhase.Stopping,
                detail = "正在停止 Agent",
            )
            _activeRun.value = snapshot
            foreground.update(snapshot)
            current
        }
        scope.launch {
            val stopFailure = runCatching { entry.onStop() }.exceptionOrNull()
            val cancellation = CancellationException(
                stopFailure?.message ?: "Agent stop requested",
            )
            stopFailure?.let(cancellation::initCause)
            // The explicit user stop owns the terminal transition. Some Harnesses settle every
            // child work item without emitting a final root-turn event, so waiting for that event
            // can leave the process-wide Agent slot stuck in Stopping forever. Cancelling the
            // application-owned job runs the owner's existing cancellation persistence/finally
            // path and releases the slot; a naturally completed job simply ignores this call.
            entry.job.cancel(cancellation)
        }
        return true
    }

    fun isActive(runId: String): Boolean = synchronized(mutationLock) {
        active?.descriptor?.runId == runId
    }

    override fun close() {
        val runId = synchronized(mutationLock) {
            active?.descriptor?.runId.also {
                active = null
                _activeRun.value = null
            }
        }
        scope.cancel()
        runId?.let(foreground::release)
    }

    private fun report(runId: String, phase: AgentRunPhase, detail: String) {
        val snapshot = synchronized(mutationLock) {
            val entry = active?.takeIf { it.descriptor.runId == runId } ?: return
            requireNotNull(_activeRun.value).copy(
                phase = phase,
                detail = detail.ifBlank { entry.descriptor.detail },
            ).also { _activeRun.value = it }
        }
        foreground.update(snapshot)
    }

    private fun releaseIfOwned(runId: String) {
        val owned = synchronized(mutationLock) {
            if (active?.descriptor?.runId != runId) return@synchronized false
            active = null
            _activeRun.value = null
            true
        }
        if (owned) foreground.release(runId)
    }

    inner class AgentRunReporter internal constructor(
        private val runId: String,
    ) {
        fun running(detail: String) = report(runId, AgentRunPhase.Running, detail)

        fun waitingForApproval(detail: String) =
            report(runId, AgentRunPhase.WaitingForApproval, detail)

        /** Marks a successful user-visible result for notification after FGS release. */
        fun completed(summary: String) {
            synchronized(mutationLock) {
                active
                    ?.takeIf { it.descriptor.runId == runId }
                    ?.completionSummary
                    ?.set(summary)
            }
        }
    }

    private data class ActiveRun(
        val descriptor: AgentRunDescriptor,
        val job: Job,
        val onStop: suspend () -> Unit,
        val stopRequested: AtomicBoolean = AtomicBoolean(false),
        val completionSummary: AtomicReference<String?> = AtomicReference(null),
    )
}

class AgentRunBusyException(surface: AgentRunSurface) : IllegalStateException(
    when (surface) {
        AgentRunSurface.CharacterChat -> "角色回复仍在生成，请先停止后再开始其他 Agent 任务"
        AgentRunSurface.CreationAssistant -> "AI 助手仍在运行，请先停止后再开始其他 Agent 任务"
    },
)
