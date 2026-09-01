package com.eleckoi.android.app.update

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import com.eleckoi.android.R

internal object AppUpdateNotificationCenter {
    private const val ChannelId = "app_updates"
    private const val NotificationId = 4_230

    fun publish(context: Context, release: AppRelease): Boolean {
        if (
            Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        ensureChannel(context)
        val openRelease = PendingIntent.getActivity(
            context,
            NotificationId,
            Intent(Intent.ACTION_VIEW, Uri.parse(release.pageUrl)),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val version = AppVersion.display(release.tagName)
        val notification = Notification.Builder(context, ChannelId)
            .setSmallIcon(R.drawable.ic_notification_app_monochrome)
            .setContentTitle("ElecKoi $version 可以更新")
            .setContentText("点击前往 GitHub Release 查看并下载")
            .setContentIntent(openRelease)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_STATUS)
            .setShowWhen(true)
            .build()
        context.getSystemService(NotificationManager::class.java)
            .notify(NotificationId, notification)
        return true
    }

    fun cancel(context: Context) {
        context.getSystemService(NotificationManager::class.java).cancel(NotificationId)
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(
                ChannelId,
                "应用更新",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "ElecKoi 新版本发布提醒"
            },
        )
    }
}
