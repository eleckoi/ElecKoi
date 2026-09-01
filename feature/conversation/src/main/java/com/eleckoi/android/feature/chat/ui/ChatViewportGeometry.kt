package com.eleckoi.android.feature.chat.ui

import com.eleckoi.android.feature.preferences.ChatAvatarShape
import com.eleckoi.android.feature.preferences.ChatLayoutMode

/**
 * Values that can change the measured conversation or its footer clearance while a route stays
 * mounted. Colour-only controls and floating overlays are deliberately absent: they repaint but
 * do not own scrolling.
 */
internal data class ChatViewportGeometrySignature(
    val layoutMode: ChatLayoutMode,
    val roleplayCardPanel: Boolean,
    val avatarSize: Float,
    val avatarShape: ChatAvatarShape,
    val nameFontSize: Float,
    val nameAvatarSpacing: Float,
    val horizontalPadding: Float,
    val replySpacing: Float,
    val turnSpacing: Float,
    val messageFontSize: Float,
    val lineHeightMultiplier: Float,
    val letterSpacing: Float,
    val paragraphSpacing: Float,
)

internal fun ChatUiState.chatViewportGeometrySignature() = ChatViewportGeometrySignature(
    layoutMode = chatLayoutMode,
    roleplayCardPanel = chatRoleplayCardPanel,
    avatarSize = chatAvatarSize,
    avatarShape = chatAvatarShape,
    nameFontSize = chatNameFontSize,
    nameAvatarSpacing = chatNameAvatarSpacing,
    horizontalPadding = chatAreaHorizontalPadding,
    replySpacing = chatReplySpacing,
    turnSpacing = chatTurnSpacing,
    messageFontSize = chatMessageFontSize,
    lineHeightMultiplier = chatLineHeightMultiplier,
    letterSpacing = chatLetterSpacing,
    paragraphSpacing = chatParagraphSpacing,
)

internal fun shouldChatViewportGeometryMutationOwnBottom(
    geometryChanged: Boolean,
    userBrowsedAwayFromBottom: Boolean,
): Boolean = geometryChanged && !userBrowsedAwayFromBottom
