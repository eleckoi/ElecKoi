package com.eleckoi.android.app.background

import android.content.Context
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Optional compatibility protection for ROMs that freeze an app UID despite an active foreground
 * service. The overlay belongs to the Android process, while the protected Agent may execute in
 * ElecKoi's local-runtime process; Android assigns both processes to the same UID.
 */
class AgentBackgroundProtection(
    context: Context,
) : AutoCloseable {
    private val applicationContext = context.applicationContext
    private val preferences = applicationContext.getSharedPreferences(
        PreferencesName,
        Context.MODE_PRIVATE,
    )
    private val overlay = AgentKeepAliveOverlay(applicationContext)
    private val _enabled = MutableStateFlow(preferences.getBoolean(KeyEnabled, false))

    val enabled: StateFlow<Boolean> = _enabled.asStateFlow()

    @Volatile
    private var agentRunActive = false

    fun setEnabled(enabled: Boolean) {
        if (_enabled.value != enabled) {
            preferences.edit().putBoolean(KeyEnabled, enabled).apply()
            _enabled.value = enabled
        }
        syncOverlay()
    }

    fun hasOverlayPermission(): Boolean = Settings.canDrawOverlays(applicationContext)

    /** Re-evaluates protection after returning from the system overlay-permission screen. */
    fun refreshPermission() {
        syncOverlay()
    }

    internal fun onAgentRunStarted() {
        agentRunActive = true
        syncOverlay()
    }

    internal fun onAgentRunFinished() {
        agentRunActive = false
        overlay.hide()
    }

    override fun close() {
        agentRunActive = false
        overlay.close()
    }

    private fun syncOverlay() {
        if (agentRunActive && _enabled.value && hasOverlayPermission()) {
            overlay.show()
        } else {
            overlay.hide()
        }
    }

    private companion object {
        const val PreferencesName = "agent_background_protection"
        const val KeyEnabled = "enhanced_background_run_enabled"
    }
}

/** Owns only the invisible compatibility window; it never owns Agent execution. */
private class AgentKeepAliveOverlay(
    context: Context,
) : AutoCloseable {
    private val applicationContext = context.applicationContext
    private val windowManager = applicationContext.getSystemService(WindowManager::class.java)
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var requestedVisible = false

    private var overlayView: View? = null

    fun show() {
        requestedVisible = true
        mainHandler.post(::syncOnMainThread)
    }

    fun hide() {
        requestedVisible = false
        mainHandler.post(::syncOnMainThread)
    }

    override fun close() {
        requestedVisible = false
        mainHandler.post(::syncOnMainThread)
    }

    private fun syncOnMainThread() {
        if (requestedVisible) {
            addIfNeeded()
        } else {
            removeIfNeeded()
        }
    }

    private fun addIfNeeded() {
        if (overlayView != null || !Settings.canDrawOverlays(applicationContext)) return
        val view = View(applicationContext).apply {
            alpha = 0f
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        val params = WindowManager.LayoutParams(
            1,
            1,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            alpha = 0f
            title = WindowTitle
        }
        runCatching {
            windowManager.addView(view, params)
            overlayView = view
            Log.i(LogTag, "Invisible Agent compatibility window attached")
        }.onFailure { error ->
            Log.w(LogTag, "Unable to attach Agent compatibility window", error)
        }
    }

    private fun removeIfNeeded() {
        val view = overlayView ?: return
        overlayView = null
        runCatching {
            windowManager.removeViewImmediate(view)
            Log.i(LogTag, "Invisible Agent compatibility window removed")
        }.onFailure { error ->
            Log.w(LogTag, "Unable to remove Agent compatibility window", error)
        }
    }

    private companion object {
        const val LogTag = "AgentBgProtection"
        const val WindowTitle = "ElecKoi Agent background protection"
    }
}
