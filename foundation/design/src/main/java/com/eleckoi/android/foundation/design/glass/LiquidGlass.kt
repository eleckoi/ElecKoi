package com.eleckoi.android.foundation.design.glass

import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import android.graphics.RenderEffect as PlatformRenderEffect
import androidx.compose.ui.graphics.RenderEffect as ComposeRenderEffect

/**
 * The "liquid glass" material: a pane that bends what sits behind it near its own edges, rather than
 * a frosted sheet that hides it. Frosted glass is one blur; this is four layers, and dropping any of
 * them collapses it back into the 2013 look:
 *
 *  1. refraction — inside a narrow band along the border the backdrop is sampled from further in,
 *     so the rim reads as a lens with thickness. This is the only part that is actually new.
 *  2. a very small blur — one or two pixels. Anything more and the pane stops being transparent,
 *     which is the whole point of the material.
 *  3. a tint — the minimum needed to keep foreground text readable over an arbitrary photo.
 *  4. a specular rim — bright at the top, faint at the bottom. The perceived thickness of the glass
 *     lives almost entirely in this one hairline.
 *
 * The caller supplies the backdrop: whatever composable is drawn inside the lens layer is what gets
 * refracted. Nothing else on screen is sampled, which is what keeps the cost bounded — see
 * [liquidGlassLens].
 */
object LiquidGlassDefaults {
    /** Width of the refracting band measured inwards from the pane's edge. */
    val Band: Dp = 22.dp

    /**
     * How far the lens layer reaches past the pane, so the rim has real content to bend. Keep it
     * above [Strength] and at or below the pane's own margin, or the ring reaches past the backdrop.
     */
    val Inset: Dp = 12.dp

    /**
     * How far, at most, a pixel inside the band is pulled towards the centre.
     *
     * This has a hard ceiling that is easy to walk into. The sampling position is
     * `x - strength * f(x)`, so it stops advancing once `strength * f'(x)` reaches 1 — and since the
     * smoothstep falloff peaks at `1.5 / band`, that happens at `strength = band / 1.5`. At the
     * ceiling the entire band samples one single column of pixels, which does not read as a lens: it
     * reads as a strip of flat colour along the edge, identical on both sides because a smear of one
     * column looks the same wherever it came from. Keep this at roughly a third of [Band] and the
     * band stays a real, monotonic magnification.
     */
    val Strength: Dp = 8.dp

    /** Deliberately tiny. This material is transparent glass, not frosted glass. */
    val Blur: Dp = 3.dp

    /** Glass concentrates colour slightly. Above ~1.5 it starts to look like a filter. */
    const val Saturation: Float = 1.32f
}

/**
 * What the device can actually render.
 *
 * The tiers line up with the hardware in a useful way: the phones that would struggle with a
 * per-pixel refraction pass are largely the same phones that never reach [Refraction] to begin
 * with, so the fallbacks are protecting the low end rather than punishing it.
 */
enum class LiquidGlassSupport {
    /** API 33+: AGSL runtime shaders, so the full material. */
    Refraction,

    /** API 31-32: RenderEffect exists but RuntimeShader does not. Blur and rim only. */
    BlurOnly,

    /** Below API 31: no GPU effect at all. Tint and rim only, which costs nothing. */
    Flat,
}

val liquidGlassSupport: LiquidGlassSupport
    get() = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> LiquidGlassSupport.Refraction
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> LiquidGlassSupport.BlurOnly
        else -> LiquidGlassSupport.Flat
    }

/**
 * Turns the layer it is applied to into the lens. Everything drawn inside that layer is the
 * backdrop; everything outside it is untouched, so a streaming message list sitting next to the
 * glass never enters this pass and never re-runs it.
 *
 * The rounded-rect distance field is evaluated per pixel instead of being baked into a displacement
 * texture. On a GPU the arithmetic is cheaper than the texture fetch it would replace, and it keeps
 * the effect correct through resizes without any invalidation bookkeeping.
 */
@Composable
fun liquidGlassLens(
    cornerRadius: Dp,
    // How far the layer extends past the pane on every side. CSS `backdrop-filter` can read the page
    // outside the element it is attached to; an Android RenderEffect only ever sees the layer it is
    // attached to. Without an overscan the rim has nothing beyond the border to bend, so it stretches
    // the border column instead and the edge reads as a tear rather than as glass. Must be at least
    // [strength], and the caller has to make sure the backdrop actually reaches that far.
    inset: Dp = LiquidGlassDefaults.Inset,
    band: Dp = LiquidGlassDefaults.Band,
    strength: Dp = LiquidGlassDefaults.Strength,
    blur: Dp = LiquidGlassDefaults.Blur,
    saturation: Float = LiquidGlassDefaults.Saturation,
): Modifier {
    val density = LocalDensity.current
    val insetPx = with(density) { inset.toPx() }
    // One shader instance for the life of the composable; the draw path only rewrites its uniforms.
    val shader = remember {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            RuntimeShader(RefractionShaderSource)
        } else {
            null
        }
    }
    val radiusPx = with(density) { cornerRadius.toPx() }
    val bandPx = with(density) { band.toPx() }
    val strengthPx = with(density) { strength.toPx() }
    val blurPx = with(density) { blur.toPx() }
    return Modifier.graphicsLayer {
        // A plain rectangle: this layer is the pane plus its overscan ring, and the pane's own
        // rounded shape is cut by whoever owns it, after the ring has done its job.
        clip = true
        if (size.width <= 0f || size.height <= 0f) return@graphicsLayer
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@graphicsLayer
        renderEffect = glassRenderEffect(
            shader = shader,
            size = size,
            insetPx = insetPx,
            radiusPx = radiusPx,
            bandPx = bandPx,
            strengthPx = strengthPx,
            blurPx = blurPx,
            saturation = saturation,
        )
    }
}

@RequiresApi(Build.VERSION_CODES.S)
private fun glassRenderEffect(
    shader: RuntimeShader?,
    size: Size,
    insetPx: Float,
    radiusPx: Float,
    bandPx: Float,
    strengthPx: Float,
    blurPx: Float,
    saturation: Float,
): ComposeRenderEffect {
    val blurEffect = if (blurPx > 0f) {
        PlatformRenderEffect.createBlurEffect(blurPx, blurPx, Shader.TileMode.CLAMP)
    } else {
        null
    }
    if (shader == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        // API 31-32. A blur of this radius alone is nearly invisible, so widen it: without
        // refraction the pane needs the blur to say "glass" on its own.
        val fallback = PlatformRenderEffect.createBlurEffect(
            blurPx * 2.5f + 1f,
            blurPx * 2.5f + 1f,
            Shader.TileMode.CLAMP,
        )
        return fallback.asComposeRenderEffect()
    }
    shader.setFloatUniform("uSize", size.width, size.height)
    shader.setFloatUniform("uInset", insetPx)
    val paneHalf = minOf(size.width, size.height) / 2f - insetPx
    shader.setFloatUniform("uRadius", radiusPx.coerceAtMost(paneHalf.coerceAtLeast(1f)))
    val band = bandPx.coerceAtLeast(1f)
    shader.setFloatUniform("uBand", band)
    // Guard the ceiling described on LiquidGlassDefaults.Strength even if a caller overrides it.
    shader.setFloatUniform("uStrength", strengthPx.coerceAtMost(band * 0.45f))
    shader.setFloatUniform("uSat", saturation)
    val lens = PlatformRenderEffect.createRuntimeShaderEffect(shader, "content")
    // Chain order is (outer, inner): the blur runs first and the lens samples the blurred backdrop,
    // so the refracted rim is smooth instead of stepping over hard pixels.
    val chained = if (blurEffect != null) {
        PlatformRenderEffect.createChainEffect(lens, blurEffect)
    } else {
        lens
    }
    return chained.asComposeRenderEffect()
}

/**
 * The specular rim: two corner-anchored highlights that fall off *along the edges*.
 *
 * The falloff has to be measured the way you would walk it — from the top-left corner rightwards
 * along the top edge and downwards along the left edge, and the mirror of that from the bottom-right
 * corner. Two things get in the way of expressing that as a brush, and both have to be handled:
 *
 * A radial brush measures straight-line distance instead, which on a wide bar puts the top-right
 * corner only one height away from the bottom-right lamp. That corner then lights up while the
 * middles of the long edges, out of reach of either lamp, go dark — brightness ends up highest at
 * the corners and lowest between them, which is the opposite of a fade.
 *
 * A linear brush measures along one axis, so the axis has to be normalised per edge: `x / width +
 * y / height`. Without that, travelling the full 290px of a short edge barely moves along an axis
 * scaled for a 1180px long one, and the short edges never fade at all.
 *
 * Two opposing ramps on that axis would also cancel — `t` plus `1 - t` is flat everywhere — so each
 * falls off faster than linearly. The result reads as light entering at the top-left, leaving at the
 * bottom-right, and thinning steadily along every edge in between.
 */
fun Modifier.liquidGlassSheen(
    cornerRadius: Dp,
    sheen: Color,
    thickness: Dp = 1.dp,
): Modifier = drawWithContent {
    drawContent()
    val stroke = thickness.toPx()
    val inset = stroke / 2f
    val edgeTopLeft = Offset(inset, inset)
    val edgeSize = Size(size.width - stroke, size.height - stroke)
    val edgeRadius = CornerRadius((cornerRadius.toPx() - inset).coerceAtLeast(0f))

    // The axis along which `x / width + y / height` runs from 0 at the top-left to 1 at the
    // bottom-right, so both edges meeting at a corner fade over their own full length.
    val ax = 1f / size.width
    val ay = 1f / size.height
    val k = 2f / (ax * ax + ay * ay)
    val axis = Offset(ax * k, ay * k)
    val stops = arrayOf(
        0f to sheen,
        0.5f to sheen.copy(alpha = sheen.alpha * 0.25f),
        1f to Color.Transparent,
    )
    fun rim(from: Offset, to: Offset) {
        drawRoundRect(
            brush = Brush.linearGradient(colorStops = stops, start = from, end = to),
            topLeft = edgeTopLeft,
            size = edgeSize,
            cornerRadius = edgeRadius,
            style = Stroke(stroke),
        )
    }
    rim(Offset.Zero, axis)
    rim(Offset(size.width, size.height), Offset(size.width - axis.x, size.height - axis.y))
}

// `content` is the layer this effect is attached to: the pane plus `uInset` of overscan on each
// side. The distance field is measured against the pane, not the layer, so the rim can sample
// outwards past the pane's border and compress what surrounds it — which is what the edge of a real
// lens does, and what a CSS backdrop-filter gets for free by reading the page behind the element.
private const val RefractionShaderSource = """
uniform shader content;
uniform float2 uSize;
uniform float uInset;
uniform float uRadius;
uniform float uBand;
uniform float uStrength;
uniform float uSat;

float sdRoundRect(float2 p, float2 half_size, float r) {
    float2 q = abs(p) - half_size + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, float2(0.0))) - r;
}

half4 main(float2 coord) {
    float2 half_size = uSize * 0.5 - float2(uInset, uInset);
    float2 p = coord - uSize * 0.5;
    float distance = sdRoundRect(p, half_size, uRadius);
    float depth = clamp(1.0 + distance / uBand, 0.0, 1.0);
    float amount = depth * depth * (3.0 - 2.0 * depth);

    float2 gradient = float2(
        sdRoundRect(p + float2(1.0, 0.0), half_size, uRadius) -
            sdRoundRect(p - float2(1.0, 0.0), half_size, uRadius),
        sdRoundRect(p + float2(0.0, 1.0), half_size, uRadius) -
            sdRoundRect(p - float2(0.0, 1.0), half_size, uRadius)
    );
    float len = length(gradient);
    float2 direction = len > 0.0001 ? gradient / len : float2(0.0);

    float2 source = coord + direction * amount * uStrength;
    source = clamp(source, float2(0.5), uSize - float2(0.5));

    half4 sampled = content.eval(source);
    half luma = dot(sampled.rgb, half3(0.2126, 0.7152, 0.0722));
    sampled.rgb = mix(half3(luma), sampled.rgb, half(uSat));
    return sampled;
}
"""
