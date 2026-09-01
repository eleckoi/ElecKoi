package com.eleckoi.android.engine.workspace.runtime.service

import android.os.Bundle
import android.os.Message
import android.os.Messenger
import android.os.RemoteException
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeCapabilities
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeStream
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeTarget
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationProgress
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeMaintenanceOperation
import com.eleckoi.android.engine.workspace.runtime.process.SupervisedProcessEvent
import com.eleckoi.android.engine.workspace.runtime.wireName
import java.util.concurrent.CopyOnWriteArraySet

/** Encodes local-runtime state into the Messenger wire format and fans it out to app clients. */
internal class LocalRuntimeIpcBridge(
    private val clients: CopyOnWriteArraySet<Messenger>,
    private val cleanupSessionScratch: (String) -> Unit,
) {
    fun sendReady(
        client: Messenger,
        detected: LocalRuntimeCapabilities,
        latestProgress: RuntimeInstallationProgress?,
        operation: RuntimeMaintenanceOperation,
    ) {
        sendTo(client, RuntimeIpc.Ready, capabilitiesBundle(detected))
        latestProgress?.let { progress ->
            sendTo(client, RuntimeIpc.RuntimeInstallationProgress, installationProgressBundle(progress, operation))
        }
    }

    fun broadcastInstallationProgress(
        progress: RuntimeInstallationProgress,
        operation: RuntimeMaintenanceOperation,
    ) {
        broadcast(RuntimeIpc.RuntimeInstallationProgress, installationProgressBundle(progress, operation))
    }

    fun broadcastInstallationCompleted(
        detected: LocalRuntimeCapabilities,
        operation: RuntimeMaintenanceOperation,
    ) {
        broadcast(
            RuntimeIpc.RuntimeInstallationCompleted,
            capabilitiesBundle(detected).apply {
                putString(RuntimeIpc.KeyMaintenanceOperation, operation.wireName)
            },
        )
    }

    fun broadcastInstallationFailed(message: String, operation: RuntimeMaintenanceOperation) {
        broadcast(
            RuntimeIpc.RuntimeInstallationFailed,
            Bundle().apply {
                putString(RuntimeIpc.KeyMessage, message)
                putString(RuntimeIpc.KeyMaintenanceOperation, operation.wireName)
            },
        )
    }

    fun broadcastCapabilitiesChanged(detected: LocalRuntimeCapabilities) {
        broadcast(RuntimeIpc.RuntimeCapabilitiesChanged, capabilitiesBundle(detected))
    }

    fun broadcastProcessEvent(event: SupervisedProcessEvent) {
        if (event is SupervisedProcessEvent.Exited) cleanupSessionScratch(event.commandId)
        when (event) {
            is SupervisedProcessEvent.Started -> broadcast(
                RuntimeIpc.ProcessStarted,
                Bundle().apply {
                    putString(RuntimeIpc.KeyCommandId, event.commandId)
                    putString(
                        RuntimeIpc.KeyTarget,
                        when (event.target) {
                            LocalRuntimeTarget.DeepSeekHarness -> RuntimeIpc.TargetDeepSeek
                            LocalRuntimeTarget.SystemProbe -> RuntimeIpc.TargetProbe
                        },
                    )
                },
            )
            is SupervisedProcessEvent.Output -> broadcast(
                RuntimeIpc.ProcessOutput,
                Bundle().apply {
                    putString(RuntimeIpc.KeyCommandId, event.commandId)
                    putString(
                        RuntimeIpc.KeyStream,
                        if (event.stream == LocalRuntimeStream.Stderr) RuntimeIpc.StreamStderr else RuntimeIpc.StreamStdout,
                    )
                    putString(RuntimeIpc.KeyLine, event.line)
                    putBoolean(RuntimeIpc.KeyEndOfLine, event.endOfLine)
                },
            )
            is SupervisedProcessEvent.Exited -> broadcast(
                RuntimeIpc.ProcessExited,
                Bundle().apply {
                    putString(RuntimeIpc.KeyCommandId, event.commandId)
                    putInt(RuntimeIpc.KeyExitCode, event.exitCode)
                    putBoolean(RuntimeIpc.KeyCancelled, event.cancelled)
                },
            )
            is SupervisedProcessEvent.Failed -> broadcastFailure(event.commandId, event.message)
        }
    }

    fun broadcastFailure(commandId: String?, message: String) {
        broadcast(
            RuntimeIpc.Failure,
            Bundle().apply {
                commandId?.let { putString(RuntimeIpc.KeyCommandId, it) }
                putString(RuntimeIpc.KeyMessage, message)
            },
        )
    }

    fun broadcast(what: Int, data: Bundle) {
        clients.toList().forEach { client -> sendTo(client, what, Bundle(data)) }
    }

    private fun sendTo(client: Messenger, what: Int, data: Bundle) {
        try {
            client.send(Message.obtain(null, what).apply { this.data = data })
        } catch (_: RemoteException) {
            clients.remove(client)
        }
    }

    private fun installationProgressBundle(
        progress: RuntimeInstallationProgress,
        operation: RuntimeMaintenanceOperation,
    ): Bundle = Bundle().apply {
        putString(RuntimeIpc.KeyInstallStage, progress.stage.wireName)
        putString(RuntimeIpc.KeyMaintenanceOperation, operation.wireName)
        putLong(RuntimeIpc.KeyCompletedBytes, progress.completedBytes)
        putBoolean(RuntimeIpc.KeyHasTotalBytes, progress.totalBytes != null)
        progress.totalBytes?.let { putLong(RuntimeIpc.KeyTotalBytes, it) }
        putInt(RuntimeIpc.KeyProcessedEntries, progress.processedEntries)
        progress.componentId?.let { putString(RuntimeIpc.KeyComponentId, it) }
    }

    private fun capabilitiesBundle(detected: LocalRuntimeCapabilities): Bundle = Bundle().apply {
        putString(RuntimeIpc.KeyAbi, detected.abi)
        putBoolean(RuntimeIpc.KeySupportsArm64, detected.supportsArm64Runtime)
        putBoolean(RuntimeIpc.KeyRuntimeInstalled, detected.runtimeInstalled)
        putString(RuntimeIpc.KeyRuntimeHealth, detected.health.wireName)
        detected.installedRuntimeVersion?.let { putString(RuntimeIpc.KeyInstalledRuntimeVersion, it) }
        detected.availableRuntimeVersion?.let { putString(RuntimeIpc.KeyAvailableRuntimeVersion, it) }
        detected.healthMessage?.let { putString(RuntimeIpc.KeyHealthMessage, it) }
    }
}
