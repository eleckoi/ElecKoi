package com.eleckoi.android.feature.chat.ui.blocks.markdown

import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Whether the scroll container hosting a markdown document is currently moving.
 *
 * A nested code viewport uses this to avoid catching a history-browse gesture while the host is
 * dragging, flinging, or auto-scrolling.
 */
val LocalMarkdownHostScrollInProgress = staticCompositionLocalOf { false }
