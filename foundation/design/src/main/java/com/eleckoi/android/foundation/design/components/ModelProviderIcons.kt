package com.eleckoi.android.foundation.design.components

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.caverock.androidsvg.SVG
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.selectionPalette

private data class ModelIconSpec(
    val id: String,
    val assetName: String,
    val currentColor: Color? = null,
)

private object ModelIconRegistry {
    private val specs = listOf(
        ModelIconSpec("custom", "whale-maid-thinking.png"),
        ModelIconSpec("deepseek", "deepseek.svg"),
        ModelIconSpec("zhipu", "zhipu.svg"),
        ModelIconSpec("zai", "zai.svg", Color(0xFF14171F)),
        ModelIconSpec("moonshot", "moonshot.svg", Color(0xFF14171F)),
        ModelIconSpec("kimi", "kimi.svg", Color(0xFF14171F)),
        ModelIconSpec("openai", "openai.svg", Color(0xFF14171F)),
        ModelIconSpec("novelai_image", "novelai.svg", Color(0xFF14171F)),
    ).associateBy { it.id }

    fun spec(providerId: String): ModelIconSpec? {
        val id = providerId.trim().lowercase()
        return specs[if (id == "openai_image") "openai" else id]
    }
}

private object ModelIconBitmapCache {
    private val cache = LruCache<String, Bitmap>(16)

    @Synchronized
    fun getOrLoad(key: String, loader: () -> Bitmap?): Bitmap? {
        cache.get(key)?.let { return it }
        return loader()?.also { cache.put(key, it) }
    }
}

private data class KnownModelIcon(
    val providerId: String,
    val label: String,
    val patterns: List<String>,
)

private val knownModelIcons = listOf(
    KnownModelIcon("deepseek", "DeepSeek", listOf("deepseek")),
    KnownModelIcon("zhipu", "GLM", listOf("glm", "zhipu")),
    KnownModelIcon("kimi", "Kimi", listOf("kimi")),
    KnownModelIcon("moonshot", "Moonshot", listOf("moonshot")),
)

enum class ThinkingMascotSpriteFrame {
    Open,
    HalfClosed,
    Closed,
}

enum class ThinkingMascotSpriteStyle {
    HalfBody,
    BigHead,
}

private fun ThinkingMascotSpriteFrame.assetName(style: ThinkingMascotSpriteStyle): String =
    when (style) {
        ThinkingMascotSpriteStyle.HalfBody -> when (this) {
            ThinkingMascotSpriteFrame.Open -> "whale-maid-thinking.png"
            ThinkingMascotSpriteFrame.HalfClosed -> "whale-maid-thinking-half.png"
            ThinkingMascotSpriteFrame.Closed -> "whale-maid-thinking-closed.png"
        }
        ThinkingMascotSpriteStyle.BigHead -> when (this) {
            ThinkingMascotSpriteFrame.Open -> "whale-maid-thinking-head.png"
            ThinkingMascotSpriteFrame.HalfClosed -> "whale-maid-thinking-head-half.png"
            ThinkingMascotSpriteFrame.Closed -> "whale-maid-thinking-head-closed.png"
        }
    }

@Composable
fun ThinkingMascotSpriteIcon(
    frame: ThinkingMascotSpriteFrame,
    style: ThinkingMascotSpriteStyle = ThinkingMascotSpriteStyle.HalfBody,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val assetName = frame.assetName(style)
    val bitmap = remember(context, assetName) {
        ModelIconBitmapCache.getOrLoad("thinking-mascot:$assetName") {
            runCatching {
                context.assets.open("model-icons/$assetName").use { input ->
                    requireNotNull(BitmapFactory.decodeStream(input)) {
                        "Unable to decode thinking mascot sprite: $assetName"
                    }
                }
            }.getOrNull()
        }
    }

    if (bitmap != null) {
        Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = null,
            modifier = modifier,
            contentScale = ContentScale.Fit,
            filterQuality = FilterQuality.None,
        )
    }
}

@Composable
fun ModelProviderIcon(
    providerId: String,
    initials: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val selection = appearance.selectionPalette()
    val spec = ModelIconRegistry.spec(providerId)
    if (spec == null) {
        Box(
            modifier = modifier
                .background(selection.activeContainer, RoundedCornerShape(999.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                initials.take(3),
                color = selection.indicator,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        return
    }

    val context = LocalContext.current
    val bitmap = remember(context, spec) {
        ModelIconBitmapCache.getOrLoad("provider:${spec.id}:${spec.assetName}") {
            runCatching {
                val assetPath = "model-icons/${spec.assetName}"
                if (spec.assetName.endsWith(".svg", ignoreCase = true)) {
                    renderSvgAsset(
                        assetText = context.assets.open(assetPath).bufferedReader().use { it.readText() },
                        currentColor = spec.currentColor,
                        outputSizePx = 160,
                    )
                } else {
                    context.assets.open(assetPath).use { input ->
                        val source = requireNotNull(BitmapFactory.decodeStream(input)) {
                            "Unable to decode model icon: $assetPath"
                        }
                        Bitmap.createScaledBitmap(source, 160, 160, true).also { scaled ->
                            if (scaled !== source) source.recycle()
                        }
                    }
                }
            }.getOrNull()
        }
    }

    if (bitmap == null) {
        Text(
            initials.take(3),
            color = appearance.mobileBlue,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
        )
        return
    }

    Image(
        bitmap = bitmap.asImageBitmap(),
        contentDescription = null,
        modifier = modifier,
        contentScale = ContentScale.Fit,
    )
}

@Composable
fun ModelIdentityIcon(
    modelName: String,
    providerId: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val selection = appearance.selectionPalette()
    val detectedProvider = detectModelProviderId(modelName, providerId)
    if (detectedProvider.isNotBlank()) {
        ModelProviderIcon(
            providerId = detectedProvider,
            initials = providerInitials(detectedProvider),
            appearance = appearance,
            modifier = modifier,
        )
        return
    }
    Box(
        modifier = modifier.background(selection.activeContainer, RoundedCornerShape(999.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = modelInitials(modelName.ifBlank { providerId }),
            color = selection.indicator,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

internal fun detectModelProviderId(modelName: String, providerId: String): String {
    val normalizedProvider = normalizeProviderIdForIcon(providerId)
    if (normalizedProvider in setOf("zhipu", "zai")) return normalizedProvider
    detectKnownModelProviderId(modelName)?.let { return it }
    return normalizedProvider.takeIf { ModelIconRegistry.spec(it) != null }.orEmpty()
}

/**
 * Resolves only icons that are explicitly supported by the bundled, model-name-based registry.
 * Provider fallback intentionally lives in [detectModelProviderId] so compact model labels can
 * omit an icon for unknown model names instead of implying an identity from their API endpoint.
 */
fun detectKnownModelProviderId(modelName: String): String? {
    val model = modelName.trim().lowercase()
    return knownModelIcons
        .firstOrNull { known -> known.patterns.any { model.contains(it) } }
        ?.providerId
}

private fun normalizeProviderIdForIcon(providerId: String): String {
    return when (val id = providerId.trim().lowercase().replace("-", "_")) {
        "zhipuai", "bigmodel", "glm", "chatglm" -> "zhipu"
        "z_ai" -> "zai"
        "moonshotai", "kimi" -> "moonshot"
        "novelai", "nai" -> "novelai_image"
        "openai_images", "gpt_image" -> "openai_image"
        else -> id
    }
}

private fun providerInitials(providerId: String): String {
    return when (providerId) {
        "custom" -> "AI"
        "deepseek" -> "D"
        "zhipu" -> "GLM"
        "zai" -> "Z"
        "moonshot" -> "K"
        "kimi" -> "K"
        "novelai_image" -> "NAI"
        "openai", "openai_image" -> "OA"
        else -> modelInitials(providerId)
    }
}

private fun modelInitials(value: String): String {
    return value.trim().firstOrNull { it.isLetterOrDigit() }?.uppercaseChar()?.toString() ?: "AI"
}

private fun renderSvgAsset(
    assetText: String,
    currentColor: Color?,
    outputSizePx: Int,
): Bitmap {
    val color = currentColor?.toHexColor() ?: "#14171F"
    val svgText = assetText.replace("currentColor", color)
    val svg = SVG.getFromString(svgText)
    svg.setDocumentWidth(outputSizePx.toFloat())
    svg.setDocumentHeight(outputSizePx.toFloat())
    return Bitmap.createBitmap(outputSizePx, outputSizePx, Bitmap.Config.ARGB_8888).also { bitmap ->
        svg.renderToCanvas(Canvas(bitmap))
    }
}

private fun Color.toHexColor(): String {
    val argb = toArgb()
    val red = (argb shr 16) and 0xFF
    val green = (argb shr 8) and 0xFF
    val blue = argb and 0xFF
    return "#%02X%02X%02X".format(red, green, blue)
}
