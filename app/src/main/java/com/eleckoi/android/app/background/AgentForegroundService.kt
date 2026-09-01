package com.eleckoi.android.app.background

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.eleckoi.android.app.ElecKoiApplication
import com.eleckoi.android.engine.agent.background.AgentForegroundController
import com.eleckoi.android.engine.agent.background.AgentRunDescriptor
import com.eleckoi.android.engine.agent.background.AgentRunPhase
import com.eleckoi.android.engine.agent.background.AgentRunSnapshot
import com.eleckoi.android.engine.agent.background.AgentRunSurface

/** OS-facing shell. Agent execution and persistence remain outside this Android component. */
class AgentForegroundService : Service() {
    private var runId: String? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ActionStop -> {
                val requestedRunId = intent.getStringExtra(ExtraRunId)
                (application as ElecKoiApplication).container.agentRuns.requestStop(requestedRunId)
            }
            ActionStart -> {
                val snapshot = intent.toSnapshot() ?: return START_NOT_STICKY
                runId = snapshot.descriptor.runId
                AgentNotificationCenter.ensureChannels(this)
                val notification = AgentNotificationCenter.buildOngoing(this, snapshot)
                if (Build.VERSION.SDK_INT >= 29) {
                    startForeground(
                        AgentNotificationCenter.OngoingNotificationId,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
                    )
                } else {
                    startForeground(AgentNotificationCenter.OngoingNotificationId, notification)
                }
            }
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        // A normal release clears the manager before stopping this service. If Android tears the
        // service down first, stop the matching run instead of continuing without FGS protection.
        val manager = (application as ElecKoiApplication).container.agentRuns
        if (manager.activeRun.value?.descriptor?.runId == runId) {
            manager.requestStop(runId)
        }
        super.onDestroy()
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        (application as ElecKoiApplication).container.agentRuns.requestStop(runId)
        stopSelf(startId)
    }

    internal companion object {
        const val ActionStart = "com.eleckoi.android.agent.START"
        const val ActionStop = "com.eleckoi.android.agent.STOP"
        const val ExtraRunId = "run_id"
        const val ExtraSurface = "surface"
        const val ExtraWorkspaceId = "workspace_id"
        const val ExtraConversationId = "conversation_id"
        const val ExtraTitle = "title"
        const val ExtraDetail = "detail"
        const val ExtraAvatarPath = "avatar_path"
        const val ExtraStartedAt = "started_at"
    }
}

class AndroidAgentForegroundController(
    context: Context,
    private val backgroundProtection: AgentBackgroundProtection,
) : AgentForegroundController {
    private val applicationContext = context.applicationContext

    override fun acquire(snapshot: AgentRunSnapshot) {
        val intent = Intent(applicationContext, AgentForegroundService::class.java)
            .setAction(AgentForegroundService.ActionStart)
            .putSnapshot(snapshot)
        applicationContext.startForegroundService(intent)
        backgroundProtection.onAgentRunStarted()
    }

    override fun update(snapshot: AgentRunSnapshot) {
        AgentNotificationCenter.ensureChannels(applicationContext)
        val manager = applicationContext.getSystemService(NotificationManager::class.java)
        manager.notify(
            AgentNotificationCenter.OngoingNotificationId,
            AgentNotificationCenter.buildOngoing(applicationContext, snapshot),
        )
    }

    override fun release(runId: String) {
        backgroundProtection.onAgentRunFinished()
        applicationContext.stopService(
            Intent(applicationContext, AgentForegroundService::class.java),
        )
    }
}

private fun Intent.putSnapshot(snapshot: AgentRunSnapshot): Intent = apply {
    putExtra(AgentForegroundService.ExtraRunId, snapshot.descriptor.runId)
    putExtra(AgentForegroundService.ExtraSurface, snapshot.descriptor.surface.name)
    putExtra(AgentForegroundService.ExtraWorkspaceId, snapshot.descriptor.workspaceId)
    putExtra(AgentForegroundService.ExtraConversationId, snapshot.descriptor.conversationId)
    putExtra(AgentForegroundService.ExtraTitle, snapshot.descriptor.title)
    putExtra(AgentForegroundService.ExtraDetail, snapshot.detail)
    putExtra(AgentForegroundService.ExtraAvatarPath, snapshot.descriptor.avatarPath)
    putExtra(AgentForegroundService.ExtraStartedAt, snapshot.startedAtMillis)
}

private fun Intent.toSnapshot(): AgentRunSnapshot? {
    val id = getStringExtra(AgentForegroundService.ExtraRunId).orEmpty()
    val surface = getStringExtra(AgentForegroundService.ExtraSurface)
        ?.let { value -> runCatching { AgentRunSurface.valueOf(value) }.getOrNull() }
    if (id.isBlank() || surface == null) return null
    val detail = getStringExtra(AgentForegroundService.ExtraDetail).orEmpty()
    return AgentRunSnapshot(
        descriptor = AgentRunDescriptor(
            runId = id,
            surface = surface,
            workspaceId = getStringExtra(AgentForegroundService.ExtraWorkspaceId).orEmpty(),
            conversationId = getStringExtra(AgentForegroundService.ExtraConversationId).orEmpty(),
            title = getStringExtra(AgentForegroundService.ExtraTitle).orEmpty(),
            detail = detail,
            avatarPath = getStringExtra(AgentForegroundService.ExtraAvatarPath).orEmpty(),
        ),
        phase = AgentRunPhase.Starting,
        detail = detail,
        startedAtMillis = getLongExtra(AgentForegroundService.ExtraStartedAt, 0L),
    )
}
