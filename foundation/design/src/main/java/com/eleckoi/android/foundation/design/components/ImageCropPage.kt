package com.eleckoi.android.foundation.design.components

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Paint
import android.net.Uri
import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import kotlinx.coroutines.delay

internal const val MaxZoom = 6f
internal const val MaxAngle = 45f
internal const val AngleSnapWindow = 1.2f

/**
 * 取景框外面压一层遮罩，框内外的亮度差本身就是边界；描边只是勾边，做成内白外黑两层，白底黑底
 * 都压得住。这一步之前只有一根白线，压在浅色图上等于没有。
 */
// 整页是一个暗色看图环境，顶栏和工具栏都算在内——中间挖一块白出来，状态栏那条又是黑的，
// 页面就断成了三截。主题色是从用户图里吸出来的，压在照片下面会干扰对构图和颜色的判断，所以
// 这一页的底色不跟主题走；「完成」和高亮仍然用主题的强调色。
internal val StageBackground = Color(0xFF101114)
internal val BarBackground = Color(0xFF17181C)
internal val BarText = Color(0xFFF2F3F5)
internal val BarMuted = Color(0xFF9AA0AA)
internal val ScrimColor = Color(0xFF08090B).copy(alpha = 0.62f)
internal val FrameLine = Color.White.copy(alpha = 0.92f)
internal val FrameHalo = Color(0xFF08090B).copy(alpha = 0.55f)
internal val GridLine = Color.White.copy(alpha = 0.42f)

/** 取景的全部状态。屏幕上画的和最后裁出来的走同一个矩阵，所见即所得。 */
internal data class CropTransform(
    val zoom: Float = 1f,
    val offset: Offset = Offset.Zero,
    // 尺子上拧出来的角度，-45..45。
    val fineAngle: Float = 0f,
    // 「旋转」按钮按了几下。
    val quarterTurns: Int = 0,
    val flipped: Boolean = false,
) {
    val angle: Float get() = quarterTurns * 90f + fineAngle
    val untouched: Boolean
        get() = zoom == 1f && offset == Offset.Zero && fineAngle == 0f && quarterTurns == 0 && !flipped
}

@Composable
fun ImageCropPage(
    sourceUri: Uri,
    title: String,
    cropAspect: Float,
    circularFrame: Boolean,
    outputWidth: Int?,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onCropped: (Bitmap, Bitmap) -> Unit,
    // 头像页从当前这张图直接进来调取景，所以换图得在这里能按到，而不是退回去重来一遍。
    onPickAnother: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
    ratioLabel: String = "",
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val view = LocalView.current
    val source = remember(sourceUri) {
        runCatching {
            context.contentResolver.openInputStream(sourceUri)?.use { BitmapFactory.decodeStream(it) }
        }.getOrNull()
    }
    var transform by remember(sourceUri) { mutableStateOf(CropTransform()) }
    var stageSize by remember { mutableStateOf(IntSize.Zero) }
    // detectTransformGestures 不会告诉我们手指什么时候松开，所以拖动期间不停敲这个计数器，
    // 安静半秒就当结束了——三分线跟着淡出，正好也不会一松手就闪掉。
    var stageGestureTick by remember { mutableStateOf(0) }
    var stageActive by remember { mutableStateOf(false) }
    var rulerActive by remember { mutableStateOf(false) }
    val gridAlpha by animateFloatAsState(if (stageActive || rulerActive) 1f else 0f, label = "cropGridAlpha")

    LaunchedEffect(stageGestureTick) {
        if (stageGestureTick == 0) return@LaunchedEffect
        stageActive = true
        delay(600)
        stageActive = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(StageBackground),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(BarBackground)
                .statusBarsPadding()
                .height(60.dp)
                .padding(start = 12.dp, end = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(50.dp).noRippleClickable(onClick = onBack),
                contentAlignment = Alignment.CenterStart,
            ) {
                StrokeSvgIcon(AppIconPaths.Back, BarText, iconSize = 29.dp)
            }
            Text(
                if (ratioLabel.isBlank()) title else "$title · $ratioLabel",
                modifier = Modifier.weight(1f),
                color = BarText,
                fontSize = 17.sp,
                fontWeight = FontWeight.Medium,
            )
            Box(
                modifier = Modifier
                    .height(38.dp)
                    .background(appearance.mobileBlue, RoundedCornerShape(999.dp))
                    .noRippleClickable {
                        val bitmap = source ?: return@noRippleClickable
                        val frame = cropFramePx(stageSize, circularFrame, cropAspect, density)
                        onCropped(
                            cropBitmap(
                                source = bitmap,
                                stageSize = stageSize,
                                frame = frame,
                                transform = transform,
                                requestedOutputWidth = outputWidth,
                                circle = circularFrame,
                            ),
                            bitmap,
                        )
                    }
                    .padding(horizontal = 17.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("完成", color = appearance.mobileAccentFg, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            }
        }

        if (source == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("图片读取失败", color = BarText, fontSize = 16.sp)
            }
            return@Column
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .clipToBounds()
                .onSizeChanged { stageSize = it }
                .pointerInput(source, cropAspect, circularFrame) {
                    detectTransformGestures(
                        onGesture = { centroid, pan, zoomChange, _ ->
                            stageGestureTick++
                            val frame = cropFramePx(stageSize, circularFrame, cropAspect, density)
                            val stageCenter = Offset(size.width / 2f, size.height / 2f)
                            val current = transform
                            val nextZoom = (current.zoom * zoomChange).coerceIn(1f, MaxZoom)
                            val zoomRatio = nextZoom / current.zoom
                            val fromCenter = centroid - stageCenter
                            val raw = current.offset * zoomRatio + fromCenter * (1f - zoomRatio) + pan
                            transform = current.copy(
                                zoom = nextZoom,
                                offset = clampOffset(raw, source, frame, nextZoom, current.angle),
                            )
                        },
                    )
                },
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val frame = cropFramePx(stageSize, circularFrame, cropAspect, density)
                val stageCenter = Offset(size.width / 2f, size.height / 2f)
                val framePath = framePath(stageCenter, frame, circularFrame)

                drawRect(StageBackground)
                drawIntoCanvas { canvas ->
                    canvas.nativeCanvas.drawBitmap(
                        source,
                        displayMatrix(source, stageCenter, frame, transform),
                        Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG),
                    )
                }
                clipPath(framePath, ClipOp.Difference) { drawRect(ScrimColor) }

                if (gridAlpha > 0.01f) drawThirds(stageCenter, frame, circularFrame, gridAlpha)
                drawPath(framePath, FrameHalo, style = Stroke(width = 3.5.dp.toPx()))
                drawPath(framePath, FrameLine, style = Stroke(width = 1.2.dp.toPx()))
                if (!circularFrame) drawCornerHandles(stageCenter, frame)
            }
        }

        AngleRuler(
            angle = transform.fineAngle,
            appearance = appearance,
            onAngleChange = { next ->
                val frame = cropFramePx(stageSize, circularFrame, cropAspect, density)
                val candidate = transform.copy(fineAngle = next)
                transform = candidate.copy(
                    offset = clampOffset(transform.offset, source, frame, transform.zoom, candidate.angle),
                )
            },
            onScrubStart = { rulerActive = true },
            onScrubEnd = { rulerActive = false },
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(BarBackground)
                .navigationBarsPadding()
                .padding(start = 12.dp, end = 12.dp, top = 14.dp, bottom = 16.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CropTool(AppIconPaths.RotateClockwise, "旋转", BarText) {
                view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                val frame = cropFramePx(stageSize, circularFrame, cropAspect, density)
                val next = transform.copy(quarterTurns = (transform.quarterTurns + 1) % 4)
                transform = next.copy(offset = clampOffset(next.offset, source, frame, next.zoom, next.angle))
            }
            CropTool(AppIconPaths.FlipHorizontal, "翻转", BarText) {
                view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                transform = transform.copy(flipped = !transform.flipped)
            }
            if (onPickAnother != null) {
                CropTool(AppIconPaths.PhotoUp, "换图", BarText, onClick = onPickAnother)
            }
            if (onDelete != null) {
                CropTool(AppIconPaths.Trash, "删除", ElecKoiDanger, onClick = onDelete)
            }
            CropTool(
                AppIconPaths.ArrowBackUp,
                "重置",
                if (transform.untouched) BarMuted.copy(alpha = 0.45f) else appearance.mobileBlue,
            ) {
                if (transform.untouched) return@CropTool
                view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                transform = CropTransform()
            }
        }
    }
}
