package com.eleckoi.android.feature.chat.ui.blocks.image

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.eleckoi.android.feature.chat.model.ChatImageAttachment
import com.eleckoi.android.feature.chat.model.ChatImageStatus
import com.eleckoi.android.foundation.design.AppearanceTheme
import java.io.File

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun GeneratedImageBlock(
    attachment: ChatImageAttachment,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
    onRegenerate: (() -> Unit)? = null,
    onContentReady: () -> Unit = {},
) {
    val shape = RoundedCornerShape(14.dp)
    val downloadImage = rememberGeneratedImageDownloader()
    var imageMenuOpen by remember(attachment.id) { mutableStateOf(false) }
    var imagePreviewOpen by remember(attachment.id) { mutableStateOf(false) }
    when (attachment.status) {
        ChatImageStatus.Generating -> {
            LaunchedEffect(attachment.id) { onContentReady() }
            Box(
                modifier = modifier
                    .fillMaxWidth()
                    .aspectRatio(attachment.displayAspectRatio())
                    .clip(shape)
                    .background(appearance.mobileSurface)
                    .semantics { contentDescription = "正在根据本轮剧情生成插图" },
                contentAlignment = Alignment.Center,
            ) {
                ImageGenerationDotField(
                    color = appearance.mobileMuted,
                    modifier = Modifier.matchParentSize(),
                )
                if (attachment.frameCount > 1) {
                    Text(
                        "正在生成 ${attachment.frameIndex}/${attachment.frameCount}",
                        color = appearance.mobileMuted,
                        fontSize = 12.sp,
                    )
                }
            }
        }

        ChatImageStatus.Ready -> {
            val file = attachment.localPath.takeIf(String::isNotBlank)?.let(::File)
            Box(
                modifier = modifier
                    .fillMaxWidth()
                    .aspectRatio(attachment.displayAspectRatio())
                    .clip(shape)
                    .background(appearance.mobileSurface)
                    .semantics { contentDescription = "本轮剧情插图，点击放大，长按可下载或重新生成" }
                    .combinedClickable(
                        onClick = {
                            if (file?.isFile == true) imagePreviewOpen = true
                        },
                        onLongClick = {
                            if (file?.isFile == true) imageMenuOpen = true
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (file?.isFile == true) {
                    AsyncImage(
                        model = file,
                        contentDescription = "本轮剧情插图",
                        modifier = Modifier.matchParentSize(),
                        contentScale = ContentScale.Fit,
                        onSuccess = { onContentReady() },
                        onError = { onContentReady() },
                    )
                } else {
                    LaunchedEffect(attachment.localPath) { onContentReady() }
                    Text("图片文件不存在", color = appearance.mobileMuted, fontSize = 12.sp)
                }
                if (attachment.frameCount > 1) {
                    Text(
                        "${attachment.frameIndex}/${attachment.frameCount}",
                        color = Color.White,
                        fontSize = 11.sp,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(9.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color.Black.copy(alpha = 0.58f))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
                Box(modifier = Modifier.align(Alignment.BottomEnd)) {
                    DropdownMenu(
                        expanded = imageMenuOpen,
                        onDismissRequest = { imageMenuOpen = false },
                        modifier = Modifier.background(appearance.mobileSurface),
                    ) {
                        DropdownMenuItem(
                            text = { Text("下载图片", color = appearance.mobileText, fontSize = 15.sp) },
                            onClick = {
                                imageMenuOpen = false
                                downloadImage(attachment)
                            },
                        )
                        onRegenerate?.let { regenerate ->
                            DropdownMenuItem(
                                text = { Text("重新生成", color = appearance.mobileText, fontSize = 15.sp) },
                                onClick = {
                                    imageMenuOpen = false
                                    regenerate()
                                },
                            )
                        }
                    }
                }
            }
            if (imagePreviewOpen && file?.isFile == true) {
                GeneratedImagePreviewDialog(
                    attachment = attachment,
                    file = file,
                    onDismiss = { imagePreviewOpen = false },
                )
            }
        }

        ChatImageStatus.Failed -> {
            LaunchedEffect(attachment.id, attachment.errorMessage) { onContentReady() }
            val regenerateOnLongPress = if (onRegenerate == null) {
                Modifier
            } else {
                Modifier.pointerInput(onRegenerate) {
                    detectTapGestures(onLongPress = { imageMenuOpen = true })
                }
            }
            if (compact) {
                Box(
                    modifier = modifier
                        .fillMaxWidth()
                        .aspectRatio(attachment.displayAspectRatio())
                        .clip(shape)
                        .background(appearance.mobileSurface)
                        .then(regenerateOnLongPress)
                        .semantics {
                            contentDescription = if (onRegenerate == null) {
                                "第 ${attachment.frameIndex} 张插图生成失败"
                            } else {
                                "第 ${attachment.frameIndex} 张插图生成失败，长按可重新生成"
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "生成失败",
                        color = appearance.mobileMuted,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(12.dp),
                    )
                    RegenerateImageMenu(
                        expanded = imageMenuOpen,
                        appearance = appearance,
                        onDismiss = { imageMenuOpen = false },
                        onRegenerate = onRegenerate,
                        modifier = Modifier.align(Alignment.BottomEnd),
                    )
                }
                return
            }
            Box(
                modifier = modifier
                    .fillMaxWidth()
                    .aspectRatio(attachment.displayAspectRatio())
                    .clip(shape)
                    .background(appearance.mobileSurface)
                    .then(regenerateOnLongPress)
                    .semantics {
                        contentDescription = if (onRegenerate == null) {
                            "插图生成失败"
                        } else {
                            "插图生成失败，长按可重新生成"
                        }
                    }
                    .padding(horizontal = 14.dp, vertical = 11.dp),
            ) {
                Text(
                    text = "插图生成失败：${attachment.errorMessage.ifBlank { "未知错误" }}",
                    color = appearance.mobileMuted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier,
                )
                RegenerateImageMenu(
                    expanded = imageMenuOpen,
                    appearance = appearance,
                    onDismiss = { imageMenuOpen = false },
                    onRegenerate = onRegenerate,
                    modifier = Modifier.align(Alignment.BottomEnd),
                )
            }
        }
    }
}

@Composable
private fun RegenerateImageMenu(
    expanded: Boolean,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onRegenerate: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    if (onRegenerate == null) return
    Box(modifier = modifier) {
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = onDismiss,
            modifier = Modifier.background(appearance.mobileSurface),
        ) {
            DropdownMenuItem(
                text = { Text("重新生成", color = appearance.mobileText, fontSize = 15.sp) },
                onClick = {
                    onDismiss()
                    onRegenerate()
                },
            )
        }
    }
}

@Composable
private fun ImageGenerationDotField(
    color: Color,
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "image-generation-dots")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1_800, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "dot-wave-phase",
    )
    Canvas(modifier = modifier.padding(28.dp)) {
        val columns = 15
        val rows = 15
        val stepX = size.width / (columns - 1)
        val stepY = size.height / (rows - 1)
        val cycle = phase * (Math.PI * 2.0).toFloat()
        for (row in 0 until rows) {
            for (column in 0 until columns) {
                val x = column * stepX
                val y = row * stepY
                val nx = (column - (columns - 1) / 2f) / ((columns - 1) / 2f)
                val ny = (row - (rows - 1) / 2f) / ((rows - 1) / 2f)
                val distance = kotlin.math.sqrt(nx * nx + ny * ny)
                val edgeFade = (1f - distance / 1.25f).coerceIn(0f, 1f)
                val wave = (0.5f + 0.5f * kotlin.math.sin(cycle - distance * 7f + nx * 1.4f))
                val alpha = (0.07f + edgeFade * (0.12f + wave * 0.34f)).coerceIn(0f, 0.48f)
                val radius = 0.8.dp.toPx() + edgeFade * wave * 0.65.dp.toPx()
                drawCircle(
                    color = color.copy(alpha = alpha),
                    radius = radius,
                    center = Offset(x, y),
                )
            }
        }
    }
}
