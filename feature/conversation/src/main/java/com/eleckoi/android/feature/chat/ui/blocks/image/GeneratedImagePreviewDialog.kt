package com.eleckoi.android.feature.chat.ui.blocks.image

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.AsyncImage
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.feature.chat.model.ChatImageAttachment
import java.io.File
import kotlin.math.max

private const val PreviewDoubleTapZoom = 2.5f
private const val PreviewMaxZoom = 6f
private val PreviewBackground = Color(0xFF0C0D10)

@Composable
internal fun GeneratedImagePreviewDialog(
    attachment: ChatImageAttachment,
    file: File,
    onDismiss: () -> Unit,
) {
    var scale by remember(file.path) { mutableFloatStateOf(1f) }
    var offset by remember(file.path) { mutableStateOf(Offset.Zero) }
    var viewport by remember { mutableStateOf(IntSize.Zero) }
    val aspectRatio = attachment.displayAspectRatio()

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(PreviewBackground)
                .onSizeChanged {
                    viewport = it
                    offset = clampPreviewOffset(offset, scale, it, aspectRatio)
                },
        ) {
            AsyncImage(
                model = file,
                contentDescription = "第 ${attachment.frameIndex} 张剧情插图，全屏预览",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationX = offset.x
                        translationY = offset.y
                    }
                    .pointerInput(file.path, viewport, aspectRatio) {
                        detectTransformGestures { centroid, pan, zoomChange, _ ->
                            val nextScale = (scale * zoomChange).coerceIn(1f, PreviewMaxZoom)
                            val zoomRatio = nextScale / scale
                            val center = Offset(size.width / 2f, size.height / 2f)
                            val focusedOffset =
                                offset * zoomRatio + (centroid - center) * (1f - zoomRatio) + pan
                            scale = nextScale
                            offset = clampPreviewOffset(
                                raw = focusedOffset,
                                scale = nextScale,
                                viewport = viewport,
                                aspectRatio = aspectRatio,
                            )
                        }
                    }
                    .pointerInput(file.path, viewport, aspectRatio) {
                        detectTapGestures(
                            onDoubleTap = {
                                scale = if (scale > 1f) 1f else PreviewDoubleTapZoom
                                offset = Offset.Zero
                            },
                        )
                    }
                    .semantics {
                        contentDescription = "剧情插图；双击或双指缩放"
                    },
            )

            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(12.dp)
                    .size(48.dp)
                    .background(Color.Black.copy(alpha = 0.56f), RoundedCornerShape(24.dp))
                    .semantics { contentDescription = "关闭图片预览" }
                    .noRippleClickable(onClick = onDismiss),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Close,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(26.dp),
                )
            }

            if (attachment.frameCount > 1) {
                Text(
                    text = "${attachment.frameIndex}/${attachment.frameCount}",
                    color = Color.White,
                    fontSize = 13.sp,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .windowInsetsPadding(WindowInsets.safeDrawing)
                        .padding(16.dp)
                        .background(Color.Black.copy(alpha = 0.56f), RoundedCornerShape(10.dp))
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
    }
}

internal fun clampPreviewOffset(
    raw: Offset,
    scale: Float,
    viewport: IntSize,
    aspectRatio: Float,
): Offset {
    if (scale <= 1f || viewport.width <= 0 || viewport.height <= 0) return Offset.Zero
    val fitted = fittedImageSize(viewport, aspectRatio)
    val maxX = max(0f, (fitted.width * scale - viewport.width) / 2f)
    val maxY = max(0f, (fitted.height * scale - viewport.height) / 2f)
    return Offset(
        x = raw.x.coerceIn(-maxX, maxX),
        y = raw.y.coerceIn(-maxY, maxY),
    )
}

private fun fittedImageSize(viewport: IntSize, aspectRatio: Float): Size {
    val viewportRatio = viewport.width.toFloat() / viewport.height.toFloat()
    return if (viewportRatio > aspectRatio) {
        Size(width = viewport.height * aspectRatio, height = viewport.height.toFloat())
    } else {
        Size(width = viewport.width.toFloat(), height = viewport.width / aspectRatio)
    }
}
