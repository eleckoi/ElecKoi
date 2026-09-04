package com.eleckoi.android.foundation.design.components

import androidx.compose.ui.geometry.Offset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ImageCropTransformTest {
    @Test
    fun `quarter turns and fine adjustment share one display angle`() {
        val transform = CropTransform(quarterTurns = 3, fineAngle = -12.5f)

        assertEquals(257.5f, transform.angle, 0f)
    }

    @Test
    fun `untouched only describes the exact initial transform`() {
        assertTrue(CropTransform().untouched)
        assertFalse(CropTransform(zoom = 1.01f).untouched)
        assertFalse(CropTransform(offset = Offset(1f, 0f)).untouched)
        assertFalse(CropTransform(fineAngle = 0.1f).untouched)
        assertFalse(CropTransform(quarterTurns = 1).untouched)
        assertFalse(CropTransform(flipped = true).untouched)
    }

    @Test
    fun `circular crop does not enlarge its minimum scale when rotated`() {
        val frame = CropFrame(width = 300f, height = 300f)
        val atZero = coverScale(
            sourceWidth = 1000,
            sourceHeight = 1000,
            frame = frame,
            angleDegrees = 0f,
            circle = true,
        )
        val rotatedCircle = coverScale(
            sourceWidth = 1000,
            sourceHeight = 1000,
            frame = frame,
            angleDegrees = 16f,
            circle = true,
        )
        val rotatedSquare = coverScale(
            sourceWidth = 1000,
            sourceHeight = 1000,
            frame = frame,
            angleDegrees = 16f,
            circle = false,
        )

        assertEquals(0.3f, atZero, 0.0001f)
        assertEquals(atZero, rotatedCircle, 0.0001f)
        assertTrue(rotatedSquare > rotatedCircle)
    }
}
