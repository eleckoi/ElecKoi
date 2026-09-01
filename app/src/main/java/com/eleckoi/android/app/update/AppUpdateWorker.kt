package com.eleckoi.android.app.update

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.eleckoi.android.app.ElecKoiApplication

internal class AppUpdateWorker(
    appContext: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(appContext, parameters) {
    override suspend fun doWork(): Result {
        val application = applicationContext as? ElecKoiApplication ?: return Result.failure()
        val repository = application.appUpdateRepository
        return runCatching {
            val before = repository.current()
            if (!before.remindersEnabled) return Result.success()
            val after = repository.checkForUpdate()
            val release = after.latestRelease ?: return Result.success()
            val installedVersion = application.installedVersionName()
            if (
                AppVersion.isNewer(release.tagName, installedVersion) &&
                after.notifiedTag != release.tagName
            ) {
                if (AppUpdateNotificationCenter.publish(applicationContext, release)) {
                    repository.markNotified(release.tagName)
                }
            }
            Result.success()
        }.getOrElse {
            if (runAttemptCount < MaxRetries) Result.retry() else Result.failure()
        }
    }

    private companion object {
        const val MaxRetries = 3
    }
}
