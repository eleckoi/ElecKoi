package com.eleckoi.android.engine.agent.deepseek.protocol

import com.eleckoi.android.engine.workspace.runtime.model.DeepSeekRuntimeLaunchSpec
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeEvent
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeGateway
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeStream
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull

internal interface DeepSeekHarnessTransport {
    val incomingLines: Flow<String>
    suspend fun start()
    suspend fun sendLine(line: String)
    suspend fun stop()
}

/** Keeps process ownership in the isolated Android service while exposing a line protocol. */
internal class LocalRuntimeDeepSeekTransport(
    private val runtime: LocalRuntimeGateway,
    private val launchSpec: DeepSeekRuntimeLaunchSpec,
    private val scope: CoroutineScope,
    private val stopTimeoutMillis: Long = StopTimeoutMillis,
) : DeepSeekHarnessTransport {
    private val lines = Channel<String>(Channel.BUFFERED)
    private var commandId: String? = null
    private var eventJob: Job? = null
    private var processExited: CompletableDeferred<Unit>? = null
    override val incomingLines: Flow<String> = lines.receiveAsFlow()

    override suspend fun start() {
        check(commandId == null) { "DeepSeek Harness transport 已启动" }
        val id = "deepseek-${UUID.randomUUID()}"
        val started = CompletableDeferred<Unit>()
        val exited = CompletableDeferred<Unit>()
        commandId = id
        processExited = exited
        eventJob = scope.launch(start = CoroutineStart.UNDISPATCHED) {
            runtime.events.collect { event ->
                when (event) {
                    is LocalRuntimeEvent.ProcessStarted -> if (event.commandId == id) started.complete(Unit)
                    is LocalRuntimeEvent.Output -> if (
                        event.commandId == id && event.stream == LocalRuntimeStream.Stdout
                    ) {
                        lines.send(event.line)
                    }
                    is LocalRuntimeEvent.ProcessExited -> if (event.commandId == id) {
                        exited.complete(Unit)
                        lines.close(
                            DeepSeekProtocolException(
                                "DeepSeek Harness 已退出，exitCode=${event.exitCode}, cancelled=${event.cancelled}",
                            ),
                        )
                    }
                    is LocalRuntimeEvent.Failure -> if (event.commandId == id || event.commandId == null) {
                        val error = DeepSeekProtocolException(event.message)
                        started.completeExceptionally(error)
                        lines.close(error)
                    }
                }
            }
        }
        try {
            runtime.connect()
            runtime.startDeepSeekHarness(id, launchSpec)
            withDeepSeekProtocolTimeout(
                timeoutMillis = StartupTimeoutMillis,
                operation = "启动本地 DeepSeek Harness",
            ) { started.await() }
        } catch (error: Throwable) {
            withContext(NonCancellable) {
                withTimeoutOrNull(StopAfterFailedStartTimeoutMillis) { runCatching { runtime.stop(id) } }
            }
            eventJob?.cancel()
            eventJob = null
            processExited = null
            commandId = null
            throw error
        }
    }

    override suspend fun sendLine(line: String) {
        val id = commandId ?: error("DeepSeek Harness transport 尚未启动")
        runtime.sendLine(id, line)
    }

    override suspend fun stop() {
        val id = commandId
        val exited = processExited
        commandId = null
        try {
            if (id != null) {
                runtime.stop(id)
                // Messenger stop is fire-and-forget. Do not release the session lease until the
                // isolated service confirms that this exact child has exited; otherwise the next
                // DSH session can overtake teardown and hit the single-process admission guard.
                if (exited != null) withTimeout(stopTimeoutMillis) { exited.await() }
            }
        } finally {
            eventJob?.cancel()
            eventJob = null
            processExited = null
            lines.close()
        }
    }

    private companion object {
        // Cold Android/PRoot startup includes plugin composition and can exceed 20 seconds on a
        // busy phone. This guards only local process startup; model turns have their own budget.
        const val StartupTimeoutMillis = 45_000L
        const val StopAfterFailedStartTimeoutMillis = 5_000L
        const val StopTimeoutMillis = 10_000L
    }
}

internal class DeepSeekProtocolException(message: String, cause: Throwable? = null) :
    IllegalStateException(message, cause)

internal suspend fun <T> withDeepSeekProtocolTimeout(
    timeoutMillis: Long,
    operation: String,
    block: suspend () -> T,
): T = try {
    withTimeout(timeoutMillis) { block() }
} catch (error: TimeoutCancellationException) {
    throw DeepSeekProtocolException(
        "${operation}超时（${timeoutMillis / 1_000} 秒）",
        error,
    )
}
