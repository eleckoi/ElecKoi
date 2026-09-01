package com.eleckoi.android.feature.chat.ui.blocks.markdown.render.mermaid

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.chat.ui.blocks.markdown.layout.MarkdownRenderBlock

@Composable
internal fun MarkdownMermaidBlock(
    block: MarkdownRenderBlock.Mermaid,
    dark: Boolean,
    textColor: Color,
    background: Color,
    borderColor: Color,
    retainedLayoutHeightPx: Int? = null,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val context = LocalContext.current.applicationContext
        val density = LocalDensity.current
        val view = LocalView.current
        val layoutWidthPx = with(density) { maxWidth.roundToPx() }.coerceAtLeast(1)
        val targetWidthPx = layoutWidthPx.coerceAtMost(MaxRasterWidthPx)
        val prefetchDistancePx = with(density) { MermaidPrefetchDistance.toPx() }
        // Keep the complete bounded source in the key. A String hash alone could display the
        // wrong diagram on a collision, which is not acceptable for model-generated content.
        val cacheKey = "$dark:$targetWidthPx:${block.source}"
        val cachedRender = remember(cacheKey) { MermaidBitmapCache.get(cacheKey) }
        val geometryKey = remember(block.source, targetWidthPx) {
            MermaidGeometryCache.key(block.source, targetWidthPx)
        }
        val geometryRevision = MermaidGeometryCache.revision
        val retainedAspectRatio = remember(geometryKey, cachedRender, geometryRevision) {
            cachedRender?.displayAspectRatio
                ?: MermaidGeometryCache.get(context, geometryKey)
        }
        var renderRequested by remember(cacheKey) { mutableStateOf(cachedRender != null) }
        var insideRenderWindow by remember(cacheKey) { mutableStateOf(cachedRender != null) }
        val state by produceState<MermaidState>(
            initialValue = cachedRender?.let(MermaidState::Ready) ?: MermaidState.Loading,
            key1 = cacheKey,
            key2 = renderRequested,
        ) {
            if (!renderRequested) return@produceState
            if (value is MermaidState.Ready) return@produceState
            value = MermaidRenderCoordinator.render(
                cacheKey = cacheKey,
                source = block.source,
                dark = dark,
                targetWidthPx = targetWidthPx,
            )?.let(MermaidState::Ready) ?: MermaidState.Fallback
        }
        LaunchedEffect(cacheKey, insideRenderWindow) {
            if (renderRequested || !insideRenderWindow) return@LaunchedEffect
            renderRequested = true
        }
        LaunchedEffect(cacheKey, state) {
            val ready = state as? MermaidState.Ready ?: return@LaunchedEffect
            MermaidGeometryCache.put(
                context = context,
                key = geometryKey,
                aspectRatio = ready.render.displayAspectRatio,
            )
        }
        val resolvedAspectRatio = when (val current = state) {
            is MermaidState.Ready -> current.render.displayAspectRatio
            else -> retainedAspectRatio
        }
        val retainedAspectHeightPx = resolvedAspectRatio?.let { aspectRatio ->
            val framePaddingPx = with(density) { MermaidFramePadding.toPx() * 2f }
            calculateMermaidContainerHeightPx(
                layoutWidthPx = layoutWidthPx,
                framePaddingPx = framePaddingPx,
                aspectRatio = aspectRatio,
            )
        }
        // A split Markdown fragment may already have an exact persisted outer height while the
        // Mermaid-specific aspect cache is still cold. Keep that exact reservation when the render
        // plan takes over; falling back to 120dp here would collapse and re-expand the Lazy item.
        val retainedHeight = resolveRetainedMermaidHeightPx(
            aspectHeightPx = retainedAspectHeightPx,
            persistedLayoutHeightPx = retainedLayoutHeightPx,
        )?.let { heightPx -> with(density) { heightPx.toDp() } }

        when (val current = state) {
            MermaidState.Loading -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(retainedHeight ?: MermaidInitialPlaceholderHeight)
                    .onGloballyPositioned { coordinates ->
                        if (!renderRequested) {
                            val bounds = coordinates.boundsInWindow()
                            insideRenderWindow = isInsideMermaidRenderWindow(
                                top = bounds.top,
                                bottom = bounds.bottom,
                                viewportHeight = view.height.toFloat(),
                                prefetchDistance = prefetchDistancePx,
                            )
                        }
                    }
                    .clip(MermaidShape)
                    .background(background)
                    .border(1.dp, borderColor, MermaidShape),
            )
            MermaidState.Fallback -> SelectionContainer {
                Text(
                    text = block.source,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(MermaidShape)
                        .background(background)
                        .border(1.dp, borderColor, MermaidShape)
                        .padding(12.dp),
                    color = textColor,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                )
            }
            is MermaidState.Ready -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(requireNotNull(retainedHeight))
                    .clip(MermaidShape)
                    .background(background)
                    .border(1.dp, borderColor, MermaidShape)
                    .padding(MermaidFramePadding),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    bitmap = current.render.bitmap.asImageBitmap(),
                    contentDescription = "Mermaid diagram",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit,
                )
            }
        }
    }
}

private sealed interface MermaidState {
    data object Loading : MermaidState
    data object Fallback : MermaidState
    data class Ready(val render: RenderedMermaid) : MermaidState
}

private val MermaidShape = RoundedCornerShape(12.dp)
private val MermaidFramePadding = 8.dp
private val MermaidInitialPlaceholderHeight = 120.dp
private val MermaidPrefetchDistance = 240.dp
