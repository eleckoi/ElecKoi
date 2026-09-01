package com.eleckoi.android.feature.chat.ui.blocks.markdown.render.mermaid

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Process
import android.util.LruCache
import androidx.compose.runtime.mutableIntStateOf
import com.caverock.androidsvg.PreserveAspectRatio
import com.caverock.androidsvg.RenderOptions
import com.caverock.androidsvg.SVG
import com.eleckoi.android.feature.chat.data.markdown.NativeMermaidRenderer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import java.util.concurrent.Executors

/** Serializes native Mermaid work and keeps geometry prewarming below viewport work. */
internal object MermaidRenderCoordinator {
    private val worker = Mutex()
    private val prewarmDispatcher = Executors.newSingleThreadExecutor { task ->
        Thread(
            {
                runCatching { Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND) }
                task.run()
            },
            "ElecKoi-Mermaid-Prewarm",
        ).apply { isDaemon = true }
    }.asCoroutineDispatcher()
    private val prewarmScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val inFlightGeometry = mutableSetOf<String>()

    suspend fun render(
        cacheKey: String,
        source: String,
        dark: Boolean,
        targetWidthPx: Int,
    ): RenderedMermaid? = worker.withLock {
        MermaidBitmapCache.get(cacheKey) ?: withContext(Dispatchers.Default) {
            prepareSvg(source = source, dark = dark)
                ?.let { prepared -> rasterize(prepared, targetWidthPx) }
                ?.also { MermaidBitmapCache.put(cacheKey, it) }
        }
    }

    fun requestGeometryPrewarm(
        context: Context,
        sources: List<String>,
        dark: Boolean,
        targetWidthPx: Int,
    ) {
        val boundedSources = sources.distinct().take(MaxPrewarmedDiagramsPerDocument)
        if (boundedSources.isEmpty()) return
        prewarmScope.launch {
            boundedSources.forEach { source ->
                val geometryKey = MermaidGeometryCache.key(source, targetWidthPx)
                val requestKey = "$dark:${geometryKey.storageKey}"
                if (!markGeometryInFlight(requestKey)) return@forEach
                try {
                    val prepared = worker.withLock {
                        withContext(prewarmDispatcher) {
                            prepareSvg(source = source, dark = dark)
                        }
                    }
                    if (prepared != null) {
                        val displayHeightPx = calculateMermaidDisplayHeightPx(
                            intrinsicWidth = prepared.intrinsicWidth,
                            intrinsicHeight = prepared.intrinsicHeight,
                            targetWidthPx = targetWidthPx,
                            maxDisplayHeightPx = MaxMermaidDisplayHeightPx,
                        )
                        val aspectRatio = targetWidthPx.toFloat() / displayHeightPx
                        withContext(Dispatchers.Main.immediate) {
                            MermaidGeometryCache.put(context, geometryKey, aspectRatio)
                        }
                    }
                } finally {
                    unmarkGeometryInFlight(requestKey)
                }
                yield()
            }
        }
    }

    @Synchronized
    private fun markGeometryInFlight(key: String): Boolean = inFlightGeometry.add(key)

    @Synchronized
    private fun unmarkGeometryInFlight(key: String) {
        inFlightGeometry.remove(key)
    }
}

internal fun requestMermaidGeometryPrewarm(
    context: Context,
    sources: List<String>,
    dark: Boolean,
    layoutWidthPx: Int,
) {
    MermaidRenderCoordinator.requestGeometryPrewarm(
        context = context.applicationContext,
        sources = sources,
        dark = dark,
        targetWidthPx = layoutWidthPx.coerceIn(1, MaxRasterWidthPx),
    )
}

internal fun currentMermaidGeometryRevision(): Int = MermaidGeometryCache.revision

internal fun retainedMermaidHeightPx(
    context: Context,
    source: String,
    layoutWidthPx: Int,
    framePaddingPx: Float,
): Float? {
    val targetWidthPx = layoutWidthPx.coerceIn(1, MaxRasterWidthPx)
    val key = MermaidGeometryCache.key(source, targetWidthPx)
    val aspectRatio = MermaidGeometryCache.get(context.applicationContext, key) ?: return null
    return calculateMermaidContainerHeightPx(
        layoutWidthPx = layoutWidthPx,
        framePaddingPx = framePaddingPx,
        aspectRatio = aspectRatio,
    )
}

internal fun isInsideMermaidRenderWindow(
    top: Float,
    bottom: Float,
    viewportHeight: Float,
    prefetchDistance: Float,
): Boolean = viewportHeight > 0f &&
    bottom >= -prefetchDistance &&
    top <= viewportHeight + prefetchDistance

private fun prepareSvg(source: String, dark: Boolean): PreparedMermaidSvg? {
    if (source.toByteArray(Charsets.UTF_8).size > MaxMermaidSourceBytes) return null
    val cacheKey = "$dark:$source"
    MermaidSvgCache.get(cacheKey)?.let { return it }
    val svgText = NativeMermaidRenderer.renderSvg(source, dark) ?: return null
    val svg = runCatching { SVG.getFromString(svgText) }.getOrNull() ?: return null
    val viewBox = svg.documentViewBox
    val intrinsicWidth = viewBox?.width()?.takeIf { it.isFinite() && it > 0f }
        ?: svg.documentWidth.takeIf { it.isFinite() && it > 0f }
        ?: 1f
    val intrinsicHeight = viewBox?.height()?.takeIf { it.isFinite() && it > 0f }
        ?: svg.documentHeight.takeIf { it.isFinite() && it > 0f }
        ?: intrinsicWidth * DefaultAspectRatio
    return PreparedMermaidSvg(
        svgText = svgText,
        intrinsicWidth = intrinsicWidth,
        intrinsicHeight = intrinsicHeight,
        viewBoxLeft = viewBox?.left ?: 0f,
        viewBoxTop = viewBox?.top ?: 0f,
        viewBoxWidth = viewBox?.width() ?: intrinsicWidth,
        viewBoxHeight = viewBox?.height() ?: intrinsicHeight,
    ).also { MermaidSvgCache.put(cacheKey, it) }
}

private fun rasterize(
    prepared: PreparedMermaidSvg,
    targetWidthPx: Int,
): RenderedMermaid? {
    val displayHeightPx = calculateMermaidDisplayHeightPx(
        intrinsicWidth = prepared.intrinsicWidth,
        intrinsicHeight = prepared.intrinsicHeight,
        targetWidthPx = targetWidthPx,
        maxDisplayHeightPx = MaxMermaidDisplayHeightPx,
    )
    val rasterSize = calculateMermaidRasterSize(
        displayWidthPx = targetWidthPx,
        displayHeightPx = displayHeightPx,
        maxRasterPixels = MaxMermaidRasterPixels,
    )
    val svg = runCatching { SVG.getFromString(prepared.svgText) }.getOrNull() ?: return null
    return runCatching {
        // Mermaid roots use percentage dimensions. Override viewport and viewBox so AndroidSVG
        // fills the selected raster instead of drawing a half-sized top-left image.
        svg.documentWidth = rasterSize.widthPx.toFloat()
        svg.documentHeight = rasterSize.heightPx.toFloat()
        svg.documentPreserveAspectRatio = PreserveAspectRatio.STRETCH
        val renderOptions = RenderOptions.create()
            .viewBox(
                prepared.viewBoxLeft,
                prepared.viewBoxTop,
                prepared.viewBoxWidth,
                prepared.viewBoxHeight,
            )
            .viewPort(0f, 0f, rasterSize.widthPx.toFloat(), rasterSize.heightPx.toFloat())
            .preserveAspectRatio(PreserveAspectRatio.STRETCH)
        val picture = svg.renderToPicture(rasterSize.widthPx, rasterSize.heightPx, renderOptions)
        val bitmap = Bitmap.createBitmap(
            rasterSize.widthPx,
            rasterSize.heightPx,
            Bitmap.Config.ARGB_8888,
        ).also { Canvas(it).drawPicture(picture) }
        RenderedMermaid(
            bitmap = bitmap,
            displayAspectRatio = targetWidthPx.toFloat() / displayHeightPx,
        )
    }.getOrNull()
}

private data class PreparedMermaidSvg(
    val svgText: String,
    val intrinsicWidth: Float,
    val intrinsicHeight: Float,
    val viewBoxLeft: Float,
    val viewBoxTop: Float,
    val viewBoxWidth: Float,
    val viewBoxHeight: Float,
)

internal data class RenderedMermaid(
    val bitmap: Bitmap,
    val displayAspectRatio: Float,
)

internal object MermaidBitmapCache {
    private val cache = object : LruCache<String, RenderedMermaid>(MaxCacheKilobytes) {
        override fun sizeOf(key: String, value: RenderedMermaid): Int =
            (value.bitmap.byteCount / 1024).coerceAtLeast(1)
    }

    @Synchronized
    fun get(key: String): RenderedMermaid? = cache.get(key)

    @Synchronized
    fun put(key: String, render: RenderedMermaid): RenderedMermaid {
        cache.put(key, render)
        return render
    }

    @Synchronized
    fun clear() {
        cache.evictAll()
        MermaidSvgCache.clear()
    }
}

private object MermaidSvgCache {
    private val cache = object : LruCache<String, PreparedMermaidSvg>(MaxSvgCacheKilobytes) {
        override fun sizeOf(key: String, value: PreparedMermaidSvg): Int =
            ((key.length + value.svgText.length) * 2 / 1_024).coerceAtLeast(1)
    }

    @Synchronized
    fun get(key: String): PreparedMermaidSvg? = cache.get(key)

    @Synchronized
    fun put(key: String, prepared: PreparedMermaidSvg): PreparedMermaidSvg {
        cache.put(key, prepared)
        return prepared
    }

    @Synchronized
    fun clear() {
        cache.evictAll()
    }
}

/**
 * 位图可以按内存上限淘汰，但已经渲染过的纵横比必须保留。
 * 这里只存一个短 key 和 Float；强退重进后也能先占住准确高度，不再从 120dp 突然膨胀。
 */
internal object MermaidGeometryCache {
    private const val PreferenceName = "mermaid_geometry_v1"
    private const val MaxMemoryEntries = 1_024
    private const val MissingAspectRatio = -1f
    private val memory = LruCache<String, Float>(MaxMemoryEntries)
    private val revisionState = mutableIntStateOf(0)

    val revision: Int
        get() = revisionState.intValue

    fun key(source: String, targetWidthPx: Int): MermaidGeometryKey = MermaidGeometryKey(
        // v4 invalidates geometry produced before ordinary state-edge labels were kept clear of
        // nodes. Reusing an older ratio would briefly reserve the pre-fix diagram height.
        storageKey = "v4_${targetWidthPx}_${source.length}_${source.hashCode().toUInt().toString(16)}",
    )

    @Synchronized
    fun get(context: Context, key: MermaidGeometryKey): Float? {
        memory.get(key.storageKey)?.let { return it }
        val preferences = context.getSharedPreferences(PreferenceName, Context.MODE_PRIVATE)
        val stored = preferences.getFloat(key.storageKey, MissingAspectRatio)
            .takeIf(::isValidAspectRatio)
            ?: return null
        memory.put(key.storageKey, stored)
        return stored
    }

    @Synchronized
    fun put(context: Context, key: MermaidGeometryKey, aspectRatio: Float) {
        if (!isValidAspectRatio(aspectRatio)) return
        val previous = memory.put(key.storageKey, aspectRatio)
        if (previous == aspectRatio) return
        revisionState.intValue += 1
        context.getSharedPreferences(PreferenceName, Context.MODE_PRIVATE)
            .edit()
            .putFloat(key.storageKey, aspectRatio)
            .apply()
    }

    private fun isValidAspectRatio(value: Float): Boolean =
        value.isFinite() && value in MinStoredAspectRatio..MaxStoredAspectRatio
}

internal data class MermaidGeometryKey(val storageKey: String)

internal const val MaxRasterWidthPx = 2_048
private const val DefaultAspectRatio = 0.62f
private const val MaxMermaidDisplayHeightPx = 4_096
private const val MaxMermaidRasterPixels = 3 * 1_024 * 1_024
private const val MaxMermaidSourceBytes = 64 * 1_024
private const val MaxCacheKilobytes = 20 * 1_024
private const val MaxSvgCacheKilobytes = 6 * 1_024
private const val MaxPrewarmedDiagramsPerDocument = 16
private const val MinStoredAspectRatio = 0.08f
private const val MaxStoredAspectRatio = 12f
