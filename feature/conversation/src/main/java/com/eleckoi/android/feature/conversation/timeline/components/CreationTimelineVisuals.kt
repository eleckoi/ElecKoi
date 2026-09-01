package com.eleckoi.android.feature.conversation.timeline.components

import com.eleckoi.android.feature.conversation.timeline.*

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.foundation.design.AppearanceTheme

/**
 * Renders the two role-setting book glyphs at their real timeline size.
 *
 * SearchSetting is already one integrated transparent vector, so it renders as a normal glyph.
 * The read glyph mirrors AutoStories so its visible turned-page stack sits on the left, matching
 * ElecKoi's requested reading direction.
 */
@Composable
fun TimelineOperationGlyph(
    imageVector: ImageVector,
    size: Dp,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.size(size),
        contentAlignment = Alignment.Center,
    ) {
        when (imageVector) {
            Icons.Outlined.AutoStories -> Icon(
                imageVector = Icons.Outlined.AutoStories,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer(scaleX = -1f),
                tint = tint,
            )
            else -> Icon(
                imageVector = imageVector,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                tint = tint,
            )
        }
    }
}

/** A real Harness request boundary, intentionally quieter than actionable operation rows. */
@Composable
fun CreationRequestBoundary(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(9.dp),
    ) {
        Text(
            text = item.text,
            color = appearance.mobileMuted,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium,
        )
        HorizontalDivider(
            modifier = Modifier.weight(1f),
            thickness = 0.7.dp,
            color = appearance.mobileMuted.copy(alpha = 0.18f),
        )
    }
}
