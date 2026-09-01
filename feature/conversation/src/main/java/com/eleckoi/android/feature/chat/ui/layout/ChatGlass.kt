package com.eleckoi.android.feature.chat.ui.layout

import android.view.View
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.glass.LiquidGlassDefaults
import com.eleckoi.android.foundation.design.glass.liquidGlassLens
import com.eleckoi.android.foundation.design.glass.liquidGlassSheen
import kotlin.math.roundToInt

/**
 * The backdrop the chat's glass panels refract, plus where it sits on screen.
 *
 * Deliberately only the wallpaper — not the message list. A panel that sampled the live conversation
 * would have to re-run its lens pass on every streamed token, for the entire length of a reply; this
 * way the sampled content is static, so the pass runs when the panel moves or resizes and at no
 * other time. It also reads better: text sliding underneath a lens is distracting rather than
 * expensive-looking.
 *
 * Null when there is no wallpaper to refract. Glass over a flat colour is just a washed-out panel,
 * so the composer keeps its opaque surface in that case and skips the GPU work entirely.
 */
@Immutable
internal data class ChatBackdrop(
    val spec: ChatBackdropSpec,
    val originOnScreen: Offset,
    val sizePx: IntSize,
)

internal val LocalChatBackdrop = compositionLocalOf<ChatBackdrop?> { null }

/**
 * Screen coordinates, paired the only way that survives a Popup.
 *
 * The composer menu is a Popup, which is its own window, so its glass has to line up with a
 * wallpaper drawn in the window underneath. `positionInWindow` cannot be trusted to mean the same
 * thing on both sides of that boundary; `positionInRoot` and the hosting view's own screen location
 * always refer to the same root, whichever window that root belongs to, so they add up correctly in
 * either case.
 */
internal fun LayoutCoordinates.positionOnScreenOf(view: View): Offset {
    val rootOnScreen = IntArray(2)
    view.getLocationOnScreen(rootOnScreen)
    val inRoot = positionInRoot()
    return Offset(inRoot.x + rootOnScreen[0], inRoot.y + rootOnScreen[1])
}

/**
 * A pane of liquid glass over the chat wallpaper.
 *
 * The wallpaper is drawn a second time inside the lens layer, offset so that the slice showing
 * through the pane is exactly the slice it covers. Coil hands back the same decoded bitmap, so the
 * second draw costs a quad, not a decode.
 */
@Composable
fun ChatGlassPanel(
    cornerRadius: Dp,
    colors: ChatGlassColors,
    modifier: Modifier = Modifier,
    // Only for panes that overlap the conversation. The composer bar does not — the message list is
    // laid out to stop above it — so it stays honestly transparent, and anything it lets through is
    // the wallpaper it is already refracting. The menu does overlap, and without a floor the reply
    // underneath it comes through and collides with the menu's own labels.
    opaqueBase: Boolean = false,
    // Whether the pane redraws the wallpaper inside itself and bends it. Doing so is the only way to
    // blur or refract anything on Android — a RenderEffect can read its own layer and nothing else —
    // but it means the pane shows a still copy of the wallpaper rather than whatever is really
    // behind it. The bar wants the opposite: the conversation running underneath has to stay
    // visible through it, so it takes the tint and the rim and forgoes the lens.
    refractBackdrop: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val backdrop = LocalChatBackdrop.current
    val view = LocalView.current
    val density = LocalDensity.current
    val shape = remember(cornerRadius) { RoundedCornerShape(cornerRadius) }
    val lens = liquidGlassLens(cornerRadius = cornerRadius, inset = LiquidGlassDefaults.Inset)
    val insetPx = with(density) { LiquidGlassDefaults.Inset.roundToPx() }
    var originOnScreen by remember { mutableStateOf<Offset?>(null) }

    Box(
        modifier = modifier
            .onGloballyPositioned { coordinates ->
                originOnScreen = coordinates.positionOnScreenOf(view)
            }
            .clip(shape),
    ) {
        // The floor, for panes that need one. The bar does not: nothing but wallpaper is ever
        // behind it, so it stays see-through and an opaque floor would only turn it into a slab.
        if (opaqueBase) {
            Box(modifier = Modifier.matchParentSize().background(colors.base))
        }
        val origin = originOnScreen
        if (refractBackdrop && backdrop != null && origin != null) {
            // Measured from the incoming constraints rather than from a size reported back by
            // onGloballyPositioned. That callback hands over whichever layout pass ran last, and
            // holding it in state meant the lens layer could be built from a stale, shorter pane —
            // the bottom of the bar then had no glass over it at all, so it neither blurred nor
            // refracted while the top did. Constraints are exact and arrive in the same pass.
            Layout(
                content = { ChatBackground(spec = backdrop.spec) },
                modifier = Modifier
                    .matchParentSize()
                    .offset { IntOffset(-insetPx, -insetPx) }
                    .then(lens),
            ) { measurables, constraints ->
                val layerWidth = constraints.maxWidth + insetPx * 2
                val layerHeight = constraints.maxHeight + insetPx * 2
                val wallpaper = measurables.first().measure(
                    Constraints.fixed(backdrop.sizePx.width, backdrop.sizePx.height),
                )
                layout(layerWidth, layerHeight) {
                    // Clamped so the wallpaper always covers the layer. The copy is one screen tall
                    // and the bar sits at the bottom of that screen, so there is only a sliver of
                    // slack; in a Popup, which measures its position in its own window, the computed
                    // offset can exceed it. Sliding the slice a few pixels is invisible on a
                    // photograph, a hole in it is not.
                    val dx = ((backdrop.originOnScreen.x - origin.x).roundToInt() + insetPx)
                        .coerceIn(-(wallpaper.width - layerWidth).coerceAtLeast(0), 0)
                    val dy = ((backdrop.originOnScreen.y - origin.y).roundToInt() + insetPx)
                        .coerceIn(-(wallpaper.height - layerHeight).coerceAtLeast(0), 0)
                    wallpaper.place(dx, dy)
                }
            }
        } else if (refractBackdrop) {
            // No wallpaper to refract, so no glass: the pane falls back to the surface it always was.
            Box(modifier = Modifier.matchParentSize().background(colors.fallback))
        }
        if (refractBackdrop && backdrop != null && origin != null || !refractBackdrop) {
            Box(modifier = Modifier.matchParentSize().background(colors.tint))
        }
        Box(
            modifier = Modifier
                // A constant neutral keyline establishes the pane on a flat or very pale page.
                // The separate sheen then adds the directional highlight; asking one gradient
                // stroke to do both jobs is what made the light rim dark and dirty at its corners.
                .border(0.75.dp, colors.outline, shape)
                .liquidGlassSheen(
                    cornerRadius = cornerRadius,
                    sheen = colors.sheen,
                    thickness = 0.75.dp,
                ),
            content = content,
        )
    }
}

/**
 * Tint and rim for one appearance. Kept here rather than at each call site so the composer bar and
 * its menu cannot drift apart.
 */
@Immutable
data class ChatGlassColors(
    val tint: Color,
    val sheen: Color,
    val outline: Color,
    val fallback: Color,
    val base: Color,
)

fun chatGlassColors(appearance: AppearanceTheme): ChatGlassColors {
    val dark = appearance.isDark
    return ChatGlassColors(
        // Over a photo this is what keeps 16sp text readable, and it is the minimum that does. Past
        // roughly 0.5 the pane stops reading as glass and starts reading as a translucent panel.
        // White in both themes: it hazes a wallpaper without tinting it, and on a white page it is
        // simply invisible, which is correct — there the edge does all the work.
        tint = if (dark) {
            appearance.mobileSurface.copy(alpha = 0.40f)
        } else {
            // White already has maximum lightness. At 55% it did not look more transparent; it
            // simply erased the wallpaper into a chalky grey. Keep enough veil for text while
            // allowing the scene colour and depth to survive.
            Color.White.copy(alpha = 0.30f)
        },
        // A highlight is light in both themes. Light mode gets its definition from the neutral
        // outline below instead of using a black "highlight" that dirtied the corners.
        sheen = if (dark) Color.White.copy(alpha = 0.48f) else Color.White.copy(alpha = 0.62f),
        outline = if (dark) {
            Color.White.copy(alpha = 0.20f)
        } else {
            appearance.mobileText.copy(alpha = 0.14f)
        },
        fallback = appearance.mobileSurface.copy(alpha = 0.94f),
        // The same colour the wallpaper is composited onto, so the pane's opaque floor and the page
        // behind it are the same tone and the refracted slice lands where the eye expects it.
        base = appearance.mobileChatBg.copy(alpha = 1f),
    )
}

internal val ChatGlassCornerRadius: Dp = 20.dp
val ChatGlassMenuCornerRadius: Dp = 16.dp
