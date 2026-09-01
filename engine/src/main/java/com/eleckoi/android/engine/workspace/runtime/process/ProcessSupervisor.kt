package com.eleckoi.android.engine.workspace.runtime.process

import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeStream
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeTarget
import java.io.BufferedWriter
import java.io.File
import java.io.OutputStreamWriter
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

internal sealed interface SupervisedProcessEvent {
    data class Started(val commandId: String, val target: LocalRuntimeTarget) : SupervisedProcessEvent
    data class Output(
        val commandId: String,
        val stream: LocalRuntimeStream,
        val line: String,
        val endOfLine: Boolean = true,
    ) : SupervisedProcessEvent
    data class Exited(val commandId: String, val exitCode: Int, val cancelled: Boolean) : SupervisedProcessEvent
    data class Failed(val commandId: String?, val message: String) : SupervisedProcessEvent
}

internal data class ProcessLaunchSpec(
    val commandId: String,
    val target: LocalRuntimeTarget,
    val arguments: List<String>,
    val workingDirectory: File? = null,
    val environment: Map<String, String> = emptyMap(),
    val resourceGuard: ProcessResourceGuard? = null,
    val resourceCheckIntervalMillis: Long = DefaultResourceCheckIntervalMillis,
    /** Combined stdout and stderr budget for the lifetime of the child process. */
    val maxTotalOutputBytes: Long = DefaultMaxTotalOutputBytes,
)

internal fun interface RuntimeProcessFactory {
    fun start(spec: ProcessLaunchSpec): Process
}

internal class ProcessSupervisor(
    private val scope: CoroutineScope,
    private val onEvent: (SupervisedProcessEvent) -> Unit,
    private val processFactory: RuntimeProcessFactory = RuntimeProcessFactory { spec ->
        require(spec.arguments.isNotEmpty()) { "运行命令不能为空" }
        ProcessBuilder(spec.arguments)
            .directory(spec.workingDirectory)
            .redirectErrorStream(false)
            .also { builder ->
                builder.environment().clear()
                builder.environment().putAll(spec.environment)
            }
            .start()
    },
) {
    /**
     * Serializes every operation that can replace or retire [active]. The monitor deliberately
     * clears the atomic reference only after publishing its terminal event, so a following start
     * can never overtake the previous process' ProcessExited notification.
     */
    private val operationMutex = Mutex()
    private val active = AtomicReference<ActiveProcess?>(null)

    val hasActiveProcess: Boolean
        get() = active.get() != null

    /** Allows a completed Harness surface a brief hand-off window to retire its process. */
    suspend fun awaitIdle(timeoutMillis: Long): Boolean {
        require(timeoutMillis >= 0L) { "等待时间不能为负数" }
        if (!hasActiveProcess) return true
        return withTimeoutOrNull(timeoutMillis) {
            while (hasActiveProcess) delay(10L)
            true
        } == true
    }

    suspend fun start(spec: ProcessLaunchSpec) = operationMutex.withLock {
        require(active.get() == null) { "本地运行时进程启动冲突" }
        require(spec.resourceCheckIntervalMillis in 100L..60_000L) { "运行时资源检查间隔无效" }
        require(spec.maxTotalOutputBytes in 1L..MaxAllowedTotalOutputBytes) { "运行时输出上限无效" }
        spec.resourceGuard?.violationOrNull()?.let { violation ->
            error("本地运行时资源限制：$violation")
        }
        val process = withContext(Dispatchers.IO) { processFactory.start(spec) }
        val writer = BufferedWriter(OutputStreamWriter(process.outputStream, Charsets.UTF_8))
        val running = ActiveProcess(spec, process, writer)
        check(active.compareAndSet(null, running)) { "本地运行时进程启动冲突" }
        try {
            onEvent(SupervisedProcessEvent.Started(spec.commandId, spec.target))
            if (spec.resourceGuard != null) {
                running.resourceGuardJob = scope.launch(Dispatchers.IO) { monitorResources(running) }
            }
            running.waitJob = scope.launch { monitor(running) }
        } catch (error: Throwable) {
            running.cancelled = true
            terminateAndAwait(running)
            active.compareAndSet(running, null)
            throw error
        }
    }

    suspend fun sendLine(commandId: String, line: String) {
        require(line.length <= MaxInputLineLength) { "输入内容过长" }
        val running = active.get()?.takeIf { it.spec.commandId == commandId }
            ?: error("运行任务不存在")
        running.stdinMutex.withLock {
            check(!running.stdinClosed) { "运行任务输入通道已关闭" }
            withContext(Dispatchers.IO) {
                running.stdinWriter.apply {
                    write(line)
                    newLine()
                    flush()
                }
            }
        }
    }

    suspend fun stop(commandId: String) = operationMutex.withLock {
        val running = active.get()?.takeIf { it.spec.commandId == commandId } ?: return@withLock
        running.cancelled = true
        terminateAndAwait(running)
        running.waitJob?.join()
    }

    suspend fun stopActive() = operationMutex.withLock {
        val running = active.get() ?: return@withLock
        running.cancelled = true
        terminateAndAwait(running)
        running.waitJob?.join()
    }

    /** Retires a stale process only when it belongs to the requested Harness surface. */
    suspend fun stopActive(target: LocalRuntimeTarget): Boolean = operationMutex.withLock {
        val running = active.get()?.takeIf { it.spec.target == target } ?: return@withLock false
        running.cancelled = true
        terminateAndAwait(running)
        running.waitJob?.join()
        true
    }

    /**
     * Android service lifecycle callbacks are synchronous. Keep this compatibility wrapper
     * blocking so callers may safely delete per-session scratch only after the child is gone.
     */
    fun shutdownNow() = runBlocking(Dispatchers.IO) {
        operationMutex.withLock {
            val running = active.get() ?: return@withLock
            running.cancelled = true
            terminateAndAwait(running)
            running.waitJob?.join()
        }
    }

    private suspend fun terminateAndAwait(running: ActiveProcess) {
        running.terminationMutex.withLock {
            withContext(Dispatchers.IO) {
                if (running.process.isAlive) {
                    running.process.destroy()
                    if (!running.process.waitFor(StopGraceMillis, TimeUnit.MILLISECONDS)) {
                        running.process.destroyForcibly()
                        check(running.process.waitFor(ForceKillGraceMillis, TimeUnit.MILLISECONDS)) {
                            "本地进程无法终止"
                        }
                    }
                }
            }
            closeStdin(running)
        }
    }

    private suspend fun monitor(running: ActiveProcess) {
        val stdout = scope.launch(Dispatchers.IO) {
            readOutput(running, LocalRuntimeStream.Stdout, running.process.inputStream)
        }
        val stderr = scope.launch(Dispatchers.IO) {
            readOutput(running, LocalRuntimeStream.Stderr, running.process.errorStream)
        }
        val exitCode = runCatching { withContext(Dispatchers.IO) { running.process.waitFor() } }
        running.resourceGuardJob?.cancelAndJoin()
        joinAll(stdout, stderr)
        closeStdin(running)
        try {
            exitCode.onSuccess { code ->
                onEvent(SupervisedProcessEvent.Exited(running.spec.commandId, code, running.cancelled))
            }.onFailure { error ->
                onEvent(SupervisedProcessEvent.Failed(running.spec.commandId, error.message ?: "本地进程异常退出"))
            }
        } finally {
            active.compareAndSet(running, null)
        }
    }

    private suspend fun closeStdin(running: ActiveProcess) = running.stdinMutex.withLock {
        if (running.stdinClosed) return@withLock
        running.stdinClosed = true
        withContext(Dispatchers.IO) { runCatching { running.stdinWriter.close() } }
    }

    private suspend fun monitorResources(running: ActiveProcess) {
        val guard = running.spec.resourceGuard ?: return
        while (currentCoroutineContext().isActive && running.process.isAlive) {
            delay(running.spec.resourceCheckIntervalMillis)
            if (!running.process.isAlive || running.cancelled) return
            val violation = runCatching { guard.violationOrNull() }
                .getOrElse { error -> "资源检查失败：${error.message.orEmpty()}" }
                ?: continue
            if (running.resourceLimitFailed.compareAndSet(false, true)) {
                onEvent(
                    SupervisedProcessEvent.Failed(
                        running.spec.commandId,
                        "本地运行时已停止：$violation",
                    ),
                )
                running.cancelled = true
                runCatching { running.process.destroyForcibly() }
            }
            return
        }
    }

    private fun readOutput(
        running: ActiveProcess,
        stream: LocalRuntimeStream,
        input: java.io.InputStream,
    ) {
        val maxLineChars = if (running.spec.target.isJsonRpcProtocol() && stream == LocalRuntimeStream.Stdout) {
            MaxHarnessProtocolLineLength
        } else {
            MaxRawOutputLineLength
        }
        runCatching {
            input.forEachBoundedUtf8Line(maxLineChars) { line -> emitOutput(running, stream, line) }
        }.onFailure { error ->
            if (!running.cancelled && running.outputLimitFailed.compareAndSet(false, true)) {
                onEvent(
                    SupervisedProcessEvent.Failed(
                        running.spec.commandId,
                        error.message ?: "读取本地进程输出失败",
                    ),
                )
                runCatching { running.process.destroyForcibly() }
            }
        }
    }

    private fun emitOutput(running: ActiveProcess, stream: LocalRuntimeStream, value: String) {
        val encodedBytes = value.toByteArray(Charsets.UTF_8).size.toLong() + 1L
        if (running.outputBytes.addAndGet(encodedBytes) > running.spec.maxTotalOutputBytes) {
            if (running.outputLimitFailed.compareAndSet(false, true)) {
                running.cancelled = true
                onEvent(
                    SupervisedProcessEvent.Failed(
                        running.spec.commandId,
                        "本地运行时累计输出超过安全上限",
                    ),
                )
                runCatching { running.process.destroyForcibly() }
            }
            return
        }
        if (running.spec.target.isJsonRpcProtocol() && stream == LocalRuntimeStream.Stdout) {
            if (value.length > MaxHarnessProtocolLineLength) {
                if (running.outputLimitFailed.compareAndSet(false, true)) {
                    onEvent(
                        SupervisedProcessEvent.Failed(
                            running.spec.commandId,
                            "Harness 单条协议消息超过安全上限",
                        ),
                    )
                    runCatching { running.process.destroyForcibly() }
                }
                return
            }
            if (value.isEmpty()) {
                onEvent(SupervisedProcessEvent.Output(running.spec.commandId, stream, "", endOfLine = true))
                return
            }
            var offset = 0
            while (offset < value.length) {
                val end = minOf(value.length, offset + MaxIpcOutputFragmentLength)
                onEvent(
                    SupervisedProcessEvent.Output(
                        commandId = running.spec.commandId,
                        stream = stream,
                        line = value.substring(offset, end),
                        endOfLine = end == value.length,
                    ),
                )
                offset = end
            }
            return
        }
        val line = if (value.length <= MaxDisplayOutputLineLength) {
            value
        } else {
            value.take(MaxDisplayOutputLineLength) + "…"
        }
        onEvent(SupervisedProcessEvent.Output(running.spec.commandId, stream, line, endOfLine = true))
    }

    private class ActiveProcess(
        val spec: ProcessLaunchSpec,
        val process: Process,
        val stdinWriter: BufferedWriter,
        @Volatile
        var cancelled: Boolean = false,
        @Volatile
        var stdinClosed: Boolean = false,
        var waitJob: Job? = null,
        var resourceGuardJob: Job? = null,
        val stdinMutex: Mutex = Mutex(),
        val terminationMutex: Mutex = Mutex(),
        val outputLimitFailed: AtomicBoolean = AtomicBoolean(false),
        val resourceLimitFailed: AtomicBoolean = AtomicBoolean(false),
        val outputBytes: AtomicLong = AtomicLong(0L),
    )

    private companion object {
        const val StopGraceMillis = 750L
        const val ForceKillGraceMillis = 2_000L
        // Multimodal JSON-RPC carries admitted image bytes as base64. The UI process spools large
        // lines to disk before crossing Binder, so this limit protects memory rather than IPC.
        const val MaxInputLineLength = 32 * 1024 * 1024
        const val MaxDisplayOutputLineLength = 8 * 1024
        const val MaxRawOutputLineLength = 64 * 1024
        const val MaxIpcOutputFragmentLength = 16 * 1024
        const val MaxHarnessProtocolLineLength = 4 * 1024 * 1024
        const val MaxAllowedTotalOutputBytes = 8L * 1024L * 1024L * 1024L
    }
}

private fun LocalRuntimeTarget.isJsonRpcProtocol(): Boolean =
    this == LocalRuntimeTarget.DeepSeekHarness

private const val DefaultResourceCheckIntervalMillis = 1_000L
private const val DefaultMaxTotalOutputBytes = 64L * 1024L * 1024L
