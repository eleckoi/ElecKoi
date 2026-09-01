package com.eleckoi.android.foundation.design.components.common

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme

private val PanelCorner = 18.dp
private val PanelShape = RoundedCornerShape(topStart = PanelCorner, topEnd = PanelCorner)
private val PanelLift = 26.dp
private val PanelScrim = Color.Black.copy(alpha = 0.04f)

/**
 * The control panel shared by the theme palette and the character background editors. Both pages
 * are a full-screen preview with these controls docked at the bottom, so both had the same panel
 * written out twice.
 *
 * The panel is translucent white over whatever image the preview is showing, which works until the
 * image is pale — then its edge disappears and the sliders look like they are floating loose on the
 * background. Modifier.shadow models an overhead light and only ever casts downwards, so the top
 * edge gets nothing from elevation at any value.
 *
 * The edge is drawn by darkening what sits above it: a short band, transparent where it meets the
 * preview and tinted where it meets the panel. Two things it deliberately is not. Not a hairline
 * along the top — over a pale image that reads as a hard rule drawn across the screen, and every
 * other boundary in this app is a tone step rather than a stroke. Not a blurred copy of the panel
 * behind it either — the panel is 94% opaque, so anything underneath bleeds through and greys out
 * its edges and corners while the middle stays white.
 */
@Composable
fun BackgroundTunerPanel(
    appearance: AppearanceTheme,
    expanded: Boolean,
    summary: List<String>,
    modifier: Modifier = Modifier,
    onSetExpanded: (Boolean) -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(modifier = modifier.fillMaxWidth()) {
        // Runs past the panel's top edge by exactly the corner radius, so the notches outside the
        // 18dp arcs are tinted instead of showing the preview through. Without that the corners are
        // white sitting on white and the panel reads as square-topped however round it actually is.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(PanelLift + PanelCorner)
                .background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        (PanelLift / (PanelLift + PanelCorner)) to PanelScrim,
                        1f to PanelScrim,
                    ),
                ),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = PanelLift)
                .clip(PanelShape)
                .background(appearance.mobileSurface.copy(alpha = 0.94f))
                // One height animation on the panel itself. Animating the two content states
                // separately makes them play at the same time and shred each other mid-frame.
                .animateContentSize(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(start = 16.dp, end = 16.dp, bottom = 14.dp),
            ) {
                PanelDragHandle(appearance, expanded, onSetExpanded)
                if (expanded) {
                    Column(modifier = Modifier.fillMaxWidth(), content = content)
                } else {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 2.dp, bottom = 2.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        summary.forEach { entry ->
                            Text(entry, color = appearance.mobileMuted, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PanelDragHandle(
    appearance: AppearanceTheme,
    expanded: Boolean,
    onSetExpanded: (Boolean) -> Unit,
) {
    var dragTotal by remember { mutableStateOf(0f) }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(24.dp)
            // Tap and drag as separate detectors: detectVerticalDragGestures never fires for a
            // tap, so the handle would only respond to a deliberate swipe without this.
            .pointerInput(expanded) {
                detectTapGestures { onSetExpanded(!expanded) }
            }
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragStart = { dragTotal = 0f },
                    onDragEnd = {
                        if (dragTotal > 24f) onSetExpanded(false)
                        if (dragTotal < -24f) onSetExpanded(true)
                    },
                ) { _, delta ->
                    dragTotal += delta
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .width(32.dp)
                .height(4.dp)
                .clip(CircleShape)
                .background(appearance.mobileSoft),
        )
    }
}
