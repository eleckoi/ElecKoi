package com.eleckoi.android.feature.characters.transfer.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import com.eleckoi.android.feature.characters.model.AvatarSlot
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.roundToInt

internal object CharacterCardMedia {
    fun cardPng(source: File?, name: String): ByteArray {
        val bitmap = source?.takeIf(File::isFile)?.let { BitmapFactory.decodeFile(it.absolutePath) }
            ?: fallback(name)
        val resized = resizeInside(bitmap, 1200, 1600)
        return try {
            ByteArrayOutputStream().use { output ->
                check(resized.compress(Bitmap.CompressFormat.PNG, 100, output))
                output.toByteArray()
            }
        } finally {
            if (resized !== bitmap) resized.recycle()
            bitmap.recycle()
        }
    }

    fun avatarFiles(root: File, source: ByteArray): Map<AvatarSlot, File> {
        val bitmap = BitmapFactory.decodeByteArray(source, 0, source.size)
            ?: error("角色卡图片无法读取")
        root.mkdirs()
        return try {
            AvatarSlot.entries.associateWith { slot ->
                val cropped = centerCrop(bitmap, slot.aspect, slot.outputWidth)
                val extension = if (slot == AvatarSlot.Circle) "png" else "jpg"
                val output = File(root, "${slot.fileNamePrefix}.$extension")
                output.outputStream().buffered().use { stream ->
                    val format = if (slot == AvatarSlot.Circle) {
                        Bitmap.CompressFormat.PNG
                    } else {
                        Bitmap.CompressFormat.JPEG
                    }
                    check(cropped.compress(format, 92, stream))
                }
                cropped.recycle()
                output
            }
        } finally {
            bitmap.recycle()
        }
    }

    private fun centerCrop(source: Bitmap, aspect: Float, width: Int): Bitmap {
        val sourceAspect = source.width.toFloat() / source.height.coerceAtLeast(1)
        val cropWidth: Int
        val cropHeight: Int
        if (sourceAspect > aspect) {
            cropHeight = source.height
            cropWidth = (cropHeight * aspect).roundToInt().coerceAtMost(source.width)
        } else {
            cropWidth = source.width
            cropHeight = (cropWidth / aspect).roundToInt().coerceAtMost(source.height)
        }
        val left = (source.width - cropWidth) / 2
        val top = (source.height - cropHeight) / 2
        val height = (width / aspect).roundToInt().coerceAtLeast(1)
        val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        Canvas(output).drawBitmap(
            source,
            Rect(left, top, left + cropWidth, top + cropHeight),
            Rect(0, 0, width, height),
            Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG),
        )
        return output
    }

    private fun resizeInside(source: Bitmap, maxWidth: Int, maxHeight: Int): Bitmap {
        val scale = minOf(
            1f,
            maxWidth.toFloat() / source.width.coerceAtLeast(1),
            maxHeight.toFloat() / source.height.coerceAtLeast(1),
        )
        if (scale >= 1f) return source
        return Bitmap.createScaledBitmap(
            source,
            (source.width * scale).roundToInt().coerceAtLeast(1),
            (source.height * scale).roundToInt().coerceAtLeast(1),
            true,
        )
    }

    private fun fallback(name: String): Bitmap {
        val width = 900
        val height = 1200
        return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { bitmap ->
            val canvas = Canvas(bitmap)
            canvas.drawColor(Color.rgb(239, 244, 249))
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.rgb(41, 54, 70)
                textAlign = Paint.Align.CENTER
                textSize = 72f
                isFakeBoldText = true
            }
            val label = name.trim().take(8).ifBlank { "角色" }
            val bounds = RectF(72f, 72f, width - 72f, height - 72f)
            val baseline = bounds.centerY() - (paint.ascent() + paint.descent()) / 2f
            canvas.drawText(label, bounds.centerX(), baseline, paint)
        }
    }
}
