package com.eleckoi.android.feature.characters.ui.settings.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.paperCutPalette

private val KimiMotion = CubicBezierEasing(0.23f, 1f, 0.32f, 1f)

/** Shared Kimi-style tool surface used by every character mode. */
@Composable
internal fun CharacterToolTile(
    title: String,
    subtitle: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    layoutScale: Float = 1f,
    onClick: () -> Unit = {},
    iconContent: @Composable (Color) -> Unit,
) {
    val typeScale = layoutScale / LocalDensity.current.fontScale
    val paper = appearance.paperCutPalette()
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = tween(durationMillis = 120, easing = KimiMotion),
        label = "characterToolScale-$title",
    )
    val diffuseBlur by animateDpAsState(
        targetValue = if (pressed) (4f * layoutScale).dp else (9f * layoutScale).dp,
        animationSpec = tween(durationMillis = 120, easing = KimiMotion),
        label = "characterToolDiffuseBlur-$title",
    )
    val diffuseOffset by animateDpAsState(
        targetValue = if (pressed) (2f * layoutScale).dp else (5f * layoutScale).dp,
        animationSpec = tween(durationMillis = 120, easing = KimiMotion),
        label = "characterToolDiffuseOffset-$title",
    )
    val contactBlur by animateDpAsState(
        targetValue = if (pressed) (1f * layoutScale).dp else (3f * layoutScale).dp,
        animationSpec = tween(durationMillis = 120, easing = KimiMotion),
        label = "characterToolContactBlur-$title",
    )
    val contactOffset by animateDpAsState(
        targetValue = if (pressed) (1f * layoutScale).dp else (2f * layoutScale).dp,
        animationSpec = tween(durationMillis = 120, easing = KimiMotion),
        label = "characterToolContactOffset-$title",
    )
    val surface by animateColorAsState(
        targetValue = if (pressed) paper.pressedFace else paper.face,
        animationSpec = tween(durationMillis = 120, easing = KimiMotion),
        label = "characterToolSurface-$title",
    )
    val shape = RoundedCornerShape((16f * layoutScale).dp)

    Box(
        modifier = modifier
            .height((84f * layoutScale).dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            },
    ) {
        // Compose elevation is nearly invisible on some OEM renderers. These two
        // plates reproduce the reference's short contact shadow and soft drop.
        Box(
            modifier = Modifier
                .matchParentSize()
                .padding(horizontal = (3f * layoutScale).dp, vertical = (2f * layoutScale).dp)
                .offset(y = diffuseOffset)
                .blur(diffuseBlur, edgeTreatment = BlurredEdgeTreatment.Unbounded)
                .background(paper.shadow.copy(alpha = if (pressed) 0.08f else 0.16f), shape),
        )
        Box(
            modifier = Modifier
                .matchParentSize()
                .padding(horizontal = (1f * layoutScale).dp, vertical = (1f * layoutScale).dp)
                .offset(y = contactOffset)
                .blur(contactBlur, edgeTreatment = BlurredEdgeTreatment.Unbounded)
                .background(paper.shadow.copy(alpha = if (pressed) 0.07f else 0.11f), shape),
        )
        Row(
            modifier = Modifier
                .fillMaxSize()
                .clip(shape)
                .background(surface)
                .clickable(
                    interactionSource = interactionSource,
                    indication = null,
                    onClick = onClick,
                )
                .semantics(mergeDescendants = true) {
                    role = Role.Button
                    contentDescription = "$title，$subtitle"
                }
                .padding(horizontal = (14f * layoutScale).dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size((32f * layoutScale).dp),
                contentAlignment = Alignment.Center,
            ) {
                iconContent(if (pressed) paper.pressedText else paper.text.copy(alpha = 0.86f))
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = (8f * layoutScale).dp),
            ) {
                Text(
                    text = title,
                    color = if (pressed) paper.pressedText else paper.text,
                    fontSize = (15f * typeScale).sp,
                    lineHeight = (22f * typeScale).sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = subtitle,
                    modifier = Modifier.padding(top = (2f * layoutScale).dp),
                    color = paper.mutedText,
                    fontSize = (12f * typeScale).sp,
                    lineHeight = (18f * typeScale).sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
