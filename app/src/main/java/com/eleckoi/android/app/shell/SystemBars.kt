package com.eleckoi.android.app.shell

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.tappableElement
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalDensity
import androidx.core.view.WindowCompat
import com.eleckoi.android.foundation.design.isVisuallyDark

@Composable
internal fun SyncSystemBars(
    navigationBarColor: Color,
    darkStatusBarIcons: Boolean = true,
) {
    val view = LocalView.current
    val lightNavigationBar = !navigationBarColor.isVisuallyDark()
    DisposableEffect(
        view,
        lightNavigationBar,
        darkStatusBarIcons,
    ) {
        val activity = view.context.findActivity()
        if (activity != null) {
            val window = activity.window
            // Edge-to-edge setup is owned by MainActivity. Activity 1.12's API 35
            // implementation adds a ProtectionLayout on every setup call, so invoking it from
            // this route-driven effect would grow the DecorView throughout the session.
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = darkStatusBarIcons
                isAppearanceLightNavigationBars = lightNavigationBar
            }
        }
        onDispose {}
    }
}

/** Draws only for three-button navigation; gesture navigation remains truly edge-to-edge. */
@Composable
internal fun ThreeButtonNavigationBarProtection(
    color: Color,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    if (WindowInsets.tappableElement.getBottom(density) > 0) {
        Spacer(
            modifier = modifier
                .fillMaxWidth()
                .windowInsetsBottomHeight(WindowInsets.tappableElement)
                .background(color),
        )
    }
}

private tailrec fun Context.findActivity(): Activity? {
    return when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }
}
