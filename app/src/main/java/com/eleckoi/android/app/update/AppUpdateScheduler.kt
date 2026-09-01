package com.eleckoi.android.app.update

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

internal class AppUpdateScheduler(context: Context) {
    private val applicationContext = context.applicationContext

    fun setEnabled(enabled: Boolean) {
        val workManager = WorkManager.getInstance(applicationContext)
        if (!enabled) {
            workManager.cancelUniqueWork(UniqueWorkName)
            AppUpdateNotificationCenter.cancel(applicationContext)
            return
        }
        val request = PeriodicWorkRequestBuilder<AppUpdateWorker>(1, TimeUnit.DAYS)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .build()
        workManager.enqueueUniquePeriodicWork(
            UniqueWorkName,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    private companion object {
        const val UniqueWorkName = "eleckoi-app-update-check"
    }
}
