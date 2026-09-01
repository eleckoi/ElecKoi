package com.eleckoi.android.app.shell

import com.eleckoi.android.foundation.design.components.*
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavKey
import com.eleckoi.android.app.navigation.MobileRoute

internal fun mobileShellRouteEntry(
    currentRoute: MobileRoute?,
    context: MobileShellRouteContext,
): NavEntry<NavKey> {
    if (currentRoute == null) {
        return NavEntry(MobileRoute.Root) {
            Box(modifier = Modifier.fillMaxSize())
        }
    }
    return mobileCoreRouteEntry(currentRoute, context)
        ?: mobileStoryRouteEntry(currentRoute, context)
        ?: mobileSettingsRouteEntry(currentRoute, context)
        ?: mobileSystemRouteEntry(currentRoute, context)
        ?: NavEntry(MobileRoute.Root) {
            Box(modifier = Modifier.fillMaxSize())
        }
}
