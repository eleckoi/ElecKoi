package com.eleckoi.android.feature.studio.ui.assistant.screen

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Pure layout policy shared by the screen and its regression tests. */
internal fun creationConversationViewportBottomInset(
    measuredComposerHeight: Dp,
    imeLift: Dp,
    fallbackComposerHeight: Dp = 152.dp,
): Dp = (measuredComposerHeight.takeIf { it > 0.dp } ?: fallbackComposerHeight) + imeLift

internal fun shouldKeepCreationWindowUnresized(
    conversationComposerVisible: Boolean,
    editingUserMessageOpen: Boolean,
): Boolean = conversationComposerVisible || editingUserMessageOpen

internal fun shouldApplyCreationRootImePadding(
    conversationComposerVisible: Boolean,
    editingUserMessageOpen: Boolean,
): Boolean = !conversationComposerVisible && !editingUserMessageOpen

internal fun shouldSuppressCreationConversationImeLift(
    wasSuppressed: Boolean,
    editorOpen: Boolean,
    imeBottomPx: Int,
): Boolean = editorOpen || (wasSuppressed && imeBottomPx > 0)
