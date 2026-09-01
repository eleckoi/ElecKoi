package com.eleckoi.android.app.background

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.eleckoi.android.R
import com.eleckoi.android.app.MainActivity
import com.eleckoi.android.engine.agent.background.AgentRunCompletion
import com.eleckoi.android.engine.agent.background.AgentRunCompletionNotifier
import com.eleckoi.android.engine.agent.background.AgentRunSnapshot

/**
 * The single Android notification boundary for Agent work.
 *
 * Running and completed work use separate channels and notification identities: stopping the
 * foreground service can therefore remove its required ongoing notification without racing the
 * completed message that replaces the UI state.
 */
internal object AgentNotificationCenter {
    const val OngoingChannelId = "agent_background_runs"
    const val CompletionChannelId = "agent_run_completed"
    const val OngoingNotificationId = 4_210
    private const val CompletionNotificationId = 4_211
    private const val CompletionTagPrefix = "agent-completion"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                OngoingChannelId,
                context.getString(R.string.agent_background_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = context.getString(R.string.agent_background_channel_description)
                setShowBadge(false)
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(
                CompletionChannelId,
                context.getString(R.string.agent_completion_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = context.getString(R.string.agent_completion_channel_description)
            },
        )
    }

    fun buildOngoing(context: Context, snapshot: AgentRunSnapshot): Notification {
        val stopIntent = PendingIntent.getService(
            context,
            snapshot.descriptor.runId.hashCode(),
            Intent(context, AgentForegroundService::class.java)
                .setAction(AgentForegroundService.ActionStop)
                .putExtra(AgentForegroundService.ExtraRunId, snapshot.descriptor.runId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = Notification.Builder(context, OngoingChannelId)
            .setSmallIcon(R.drawable.ic_notification_app_monochrome)
            .setContentTitle(snapshot.descriptor.title)
            .setContentText(snapshot.detail)
            .setContentIntent(openAppIntent(context, snapshot.descriptor.conversationId))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .addAction(
                Notification.Action.Builder(
                    null,
                    context.getString(R.string.agent_background_stop),
                    stopIntent,
                ).build(),
            )
            .setAgentConversation(
                context = context,
                descriptor = snapshot.descriptor,
                message = snapshot.detail,
                timestamp = snapshot.startedAtMillis,
            )
        if (Build.VERSION.SDK_INT >= 31) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        }
        return builder.build()
    }

    fun publishCompletion(context: Context, completion: AgentRunCompletion) {
        ensureChannels(context)
        val descriptor = completion.descriptor
        val summary = notificationPreview(
            text = completion.summary,
            fallback = context.getString(R.string.agent_completion_default_text),
        )
        val builder = Notification.Builder(context, CompletionChannelId)
            .setSmallIcon(R.drawable.ic_notification_app_monochrome)
            .setContentTitle(descriptor.title)
            .setContentText(summary)
            .setContentIntent(openAppIntent(context, descriptor.conversationId))
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setShowWhen(true)
            .setAgentConversation(
                context = context,
                descriptor = descriptor,
                message = summary,
                timestamp = System.currentTimeMillis(),
            )
        val notification = builder.build()
        val tag = "$CompletionTagPrefix:${descriptor.surface}:${descriptor.conversationId}"
        context.getSystemService(NotificationManager::class.java).notify(
            tag,
            CompletionNotificationId,
            notification,
        )
    }

    private fun openAppIntent(context: Context, conversationId: String): PendingIntent {
        val requestCode = conversationId.hashCode()
        return PendingIntent.getActivity(
            context,
            requestCode,
            Intent(context, MainActivity::class.java).addFlags(
                Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP,
            ),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

}

internal class AndroidAgentRunCompletionNotifier(context: Context) : AgentRunCompletionNotifier {
    private val applicationContext = context.applicationContext

    override fun notifyCompleted(completion: AgentRunCompletion) {
        AgentNotificationCenter.publishCompletion(applicationContext, completion)
    }
}

private val NotificationWhitespace = Regex("\\s+")

internal fun notificationPreview(
    text: String,
    fallback: String,
    maxCharacters: Int = 180,
): String {
    require(maxCharacters >= 2)
    val singleLine = text.replace(NotificationWhitespace, " ").trim().ifBlank { fallback.trim() }
    return if (singleLine.length <= maxCharacters) {
        singleLine
    } else {
        singleLine.take(maxCharacters - 1).trimEnd() + "…"
    }
}
