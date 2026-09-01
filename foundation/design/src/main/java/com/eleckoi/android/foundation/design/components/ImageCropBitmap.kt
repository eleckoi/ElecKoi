package com.eleckoi.android.foundation.design.components

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path as AndroidPath
import android.graphics.RectF
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import java.io.File
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

fun saveBitmapToCache(dir: File, bitmap: Bitmap, prefix: String, format: Bitmap.CompressFormat, quality: Int): File {
    val ext = if (format == Bitmap.CompressFormat.PNG) "png" else "jpg"
    val file = File(dir, "$prefix-${System.currentTimeMillis()}.$ext")
    file.outputStream().use { bitmap.compress(format, quality, it) }
    return file
}

/** 第一次设置头像时，从同一张未裁剪原图自动生成居中的其余槽位。 */
fun centerCropBitmap(
    source: Bitmap,
    aspect: Float,
    outputWidth: Int,
): Bitmap {
    require(aspect > 0f)
    val sourceAspect = source.width.toFloat() / source.height.toFloat()
    val cropWidth: Int
    val cropHeight: Int
    if (sourceAspect > aspect) {
        cropHeight = source.height
        cropWidth = (cropHeight * aspect).roundToInt().coerceIn(1, source.width)
    } else {
        cropWidth = source.width
        cropHeight = (cropWidth / aspect).roundToInt().coerceIn(1, source.height)
    }
    val left = ((source.width - cropWidth) / 2).coerceAtLeast(0)
    val top = ((source.height - cropHeight) / 2).coerceAtLeast(0)
    val cropped = Bitmap.createBitmap(source, left, top, cropWidth, cropHeight)
    val safeOutputWidth = outputWidth.coerceAtLeast(1)
    val outputHeight = (safeOutputWidth / aspect).roundToInt().coerceAtLeast(1)
    val scaled = Bitmap.createScaledBitmap(cropped, safeOutputWidth, outputHeight, true)
    if (scaled !== cropped && cropped !== source) cropped.recycle()
    return scaled
}

internal data class CropFrame(val width: Float, val height: Float)

internal fun cropFramePx(
    stageSize: IntSize,
    circle: Boolean,
    aspect: Float,
    density: Density,
): CropFrame {
    val stageWidth = stageSize.width.toFloat().coerceAtLeast(1f)
    val stageHeight = stageSize.height.toFloat().coerceAtLeast(1f)
    val maxWidth = with(density) { if (circle) 300.dp.toPx() else 360.dp.toPx() }
    var width = min(stageWidth * if (circle) 0.72f else 0.80f, maxWidth)
    var height = if (circle) width else width / aspect
    val maxHeight = stageHeight * if (circle) 0.72f else 0.84f
    if (height > maxHeight) {
        height = maxHeight
        width = if (circle) height else height * aspect
    }
    return CropFrame(width, height)
}

/**
 * 图片要盖满取景框：旋转之后一个 w×h 的矩形要罩住 frameW×frameH，最小倍率就是这个。角度算进去，
 * 所以拧尺子的时候图会自己撑大，四角永远不会露空。
 */
internal fun coverScale(source: Bitmap, frame: CropFrame, angleDegrees: Float): Float {
    val radians = Math.toRadians(angleDegrees.toDouble())
    val c = abs(cos(radians)).toFloat()
    val s = abs(sin(radians)).toFloat()
    return max(
        (frame.width * c + frame.height * s) / source.width.toFloat(),
        (frame.width * s + frame.height * c) / source.height.toFloat(),
    )
}

/**
 * 把平移限制在"取景框不越出图片"的范围里。判断得在图片自己的坐标系里做，所以先把偏移转回未旋转
 * 的方向，夹好再转回来。
 */
internal fun clampOffset(
    offset: Offset,
    source: Bitmap,
    frame: CropFrame,
    zoom: Float,
    angleDegrees: Float,
): Offset {
    val scale = coverScale(source, frame, angleDegrees) * zoom
    val radians = Math.toRadians(angleDegrees.toDouble())
    val c = abs(cos(radians)).toFloat()
    val s = abs(sin(radians)).toFloat()
    val localFrameWidth = frame.width * c + frame.height * s
    val localFrameHeight = frame.width * s + frame.height * c
    val maxX = max(0f, (source.width * scale - localFrameWidth) / 2f)
    val maxY = max(0f, (source.height * scale - localFrameHeight) / 2f)

    val cosBack = cos(-radians).toFloat()
    val sinBack = sin(-radians).toFloat()
    val localX = (offset.x * cosBack - offset.y * sinBack).coerceIn(-maxX, maxX)
    val localY = (offset.x * sinBack + offset.y * cosBack).coerceIn(-maxY, maxY)

    val cosForward = cos(radians).toFloat()
    val sinForward = sin(radians).toFloat()
    return Offset(
        localX * cosForward - localY * sinForward,
        localX * sinForward + localY * cosForward,
    )
}

/** 源图像素 → 屏幕像素。翻转在图片自己的坐标系里做，旋转之后再叠，转起来的方向才跟手一致。 */
internal fun displayMatrix(
    source: Bitmap,
    stageCenter: Offset,
    frame: CropFrame,
    transform: CropTransform,
): Matrix {
    val scale = coverScale(source, frame, transform.angle) * transform.zoom
    return Matrix().apply {
        postTranslate(-source.width / 2f, -source.height / 2f)
        if (transform.flipped) postScale(-1f, 1f)
        postScale(scale, scale)
        postRotate(transform.angle)
        postTranslate(stageCenter.x + transform.offset.x, stageCenter.y + transform.offset.y)
    }
}

internal fun cropBitmap(
    source: Bitmap,
    stageSize: IntSize,
    frame: CropFrame,
    transform: CropTransform,
    requestedOutputWidth: Int?,
    circle: Boolean,
): Bitmap {
    val stageCenter = Offset(
        stageSize.width.toFloat().coerceAtLeast(frame.width) / 2f,
        stageSize.height.toFloat().coerceAtLeast(frame.height) / 2f,
    )
    val outputWidth = (requestedOutputWidth ?: frame.width.roundToInt()).coerceAtLeast(1)
    val outputHeight = (outputWidth * frame.height / frame.width).roundToInt().coerceAtLeast(1)

    val output = Bitmap.createBitmap(outputWidth, outputHeight, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(output)
    if (circle) {
        canvas.clipPath(
            AndroidPath().apply {
                addOval(RectF(0f, 0f, outputWidth.toFloat(), outputHeight.toFloat()), AndroidPath.Direction.CW)
            },
        )
    } else {
        canvas.drawColor(android.graphics.Color.WHITE)
    }
    // 屏幕上那个矩阵原样拿过来，只把取景框的左上角挪到原点、再缩到输出尺寸。所以存下来的就是
    // 刚才看到的，旋转和翻转不用在这里重算一遍。
    val matrix = Matrix(displayMatrix(source, stageCenter, frame, transform)).apply {
        postTranslate(-(stageCenter.x - frame.width / 2f), -(stageCenter.y - frame.height / 2f))
        postScale(outputWidth / frame.width, outputHeight / frame.height)
    }
    canvas.drawBitmap(source, matrix, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
    return output
}
