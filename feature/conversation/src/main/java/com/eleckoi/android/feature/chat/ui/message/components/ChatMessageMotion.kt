package com.eleckoi.android.feature.chat.ui.message

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntSize

internal val AssistantFooterHeight = 26.dp

internal val ChatStreamingBodySizeAnimationSpec = spring<IntSize>(
    dampingRatio = Spring.DampingRatioNoBouncy,
    stiffness = Spring.StiffnessMediumLow,
)

/**
 * Streaming geometry belongs to the assistant body, not to an optional bubble/card decoration.
 * Completed Markdown fragments already have stable geometry and must not each start their own
 * spring.
 */
internal fun shouldAnimateChatStreamingBody(
    isUser: Boolean,
    fragmented: Boolean,
): Boolean = !isUser && !fragmented

// `text-shadow: 0 0 calc(var(--shadowWidth) * 1px) var(--SmartThemeShadowColor)` with the shipped
// defaults of 2 and rgba(0,0,0,0.5). Over a photo this is what keeps a light glyph from dissolving
// into a light patch of the image; it costs nothing where the surface behind is already flat.
internal val RoleplayTextShadow = Shadow(
    color = Color.Black.copy(alpha = 0.5f),
    offset = Offset.Zero,
    blurRadius = 2f,
)

