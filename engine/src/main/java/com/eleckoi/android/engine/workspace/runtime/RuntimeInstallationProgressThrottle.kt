package com.eleckoi.android.engine.workspace.runtime

import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationProgress

/** Prevents per-buffer/per-file progress callbacks from flooding Messenger and the UI thread. */
internal class RuntimeInstallationProgressThrottle(
    private val minimumIntervalNanos: Long = 100_000_000L,
    private val nanoTime: () -> Long = System::nanoTime,
) {
    private var lastStage: RuntimeInstallationStageMarker = RuntimeInstallationStageMarker.None
    private var lastEmissionNanos = Long.MIN_VALUE

    @Synchronized
    fun shouldEmit(progress: RuntimeInstallationProgress): Boolean {
        val stage = RuntimeInstallationStageMarker.Value(progress.stage)
        val now = nanoTime()
        val stageChanged = stage != lastStage
        val downloadCompleted = progress.totalBytes?.let { total ->
            total > 0 && progress.completedBytes >= total
        } == true
        val intervalElapsed = lastEmissionNanos == Long.MIN_VALUE ||
            now - lastEmissionNanos >= minimumIntervalNanos
        if (!stageChanged && !downloadCompleted && !intervalElapsed) return false
        lastStage = stage
        lastEmissionNanos = now
        return true
    }

    private sealed interface RuntimeInstallationStageMarker {
        data object None : RuntimeInstallationStageMarker
        data class Value(
            val stage: com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationStage,
        ) : RuntimeInstallationStageMarker
    }
}
