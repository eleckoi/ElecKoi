package com.eleckoi.android.engine.workspace.runtime.model

import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout

internal sealed interface LocalRuntimeReadiness {
    data object Waiting : LocalRuntimeReadiness
    data class Ready(val capabilities: LocalRuntimeCapabilities) : LocalRuntimeReadiness
    data class Unavailable(val message: String) : LocalRuntimeReadiness
}

internal fun localRuntimeReadiness(
    runtimeState: LocalRuntimeState,
    installationState: RuntimeInstallationState,
): LocalRuntimeReadiness {
    if (runtimeState is LocalRuntimeState.Failed) {
        return LocalRuntimeReadiness.Unavailable(runtimeState.message.ifBlank { RuntimeUnavailableMessage })
    }
    val capabilities = when (runtimeState) {
        is LocalRuntimeState.Ready -> runtimeState.capabilities
        is LocalRuntimeState.Running -> runtimeState.capabilities
        LocalRuntimeState.Connecting,
        LocalRuntimeState.Disconnected,
        is LocalRuntimeState.Failed,
        -> null
    } ?: return when (installationState) {
        is RuntimeInstallationState.Failed -> LocalRuntimeReadiness.Unavailable(
            installationState.message.ifBlank { RuntimeUnavailableMessage },
        )
        RuntimeInstallationState.Idle,
        is RuntimeInstallationState.Installing,
        -> LocalRuntimeReadiness.Waiting
    }

    // The installed APK and bundled runtime are one protocol version. A stale runtime must never
    // serve a turn because it may silently ignore fields introduced by the current APK.
    if (
        capabilities.health == LocalRuntimeHealth.UpdateAvailable ||
        installationState is RuntimeInstallationState.Installing
    ) {
        return LocalRuntimeReadiness.Waiting
    }
    if (capabilities.isUsable) return LocalRuntimeReadiness.Ready(capabilities)
    if (capabilities.health == LocalRuntimeHealth.Unsupported) {
        return LocalRuntimeReadiness.Unavailable("当前设备不支持本地 Agent 环境")
    }
    if (installationState is RuntimeInstallationState.Failed) {
        return LocalRuntimeReadiness.Unavailable(
            installationState.message.ifBlank { RuntimeUnavailableMessage },
        )
    }
    // Checking, installing, not-yet-installed and repair-in-progress are transient here. The role
    // turn remains cancellable until the service reports usable Harness capabilities.
    return LocalRuntimeReadiness.Waiting
}

/** Connects to the service and waits through its transient health/install states. */
suspend fun LocalRuntimeGateway.connectAndAwaitRuntimeReady(
    timeoutMillis: Long = RuntimeReadyTimeoutMillis,
): LocalRuntimeCapabilities = try {
    withTimeout(timeoutMillis) {
        connect()
        when (
            val readiness = combine(state, installationState, ::localRuntimeReadiness)
                .first { it !is LocalRuntimeReadiness.Waiting }
        ) {
            is LocalRuntimeReadiness.Ready -> readiness.capabilities
            is LocalRuntimeReadiness.Unavailable -> throw IllegalStateException(readiness.message)
            LocalRuntimeReadiness.Waiting -> error("运行时就绪状态判定异常")
        }
    }
} catch (_: TimeoutCancellationException) {
    throw IllegalStateException("本地 Agent 环境准备超时，请稍后重试")
}

private const val RuntimeReadyTimeoutMillis = 60_000L
private const val RuntimeUnavailableMessage = "本地 Agent 环境尚未就绪"
