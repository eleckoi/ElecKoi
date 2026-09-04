package com.eleckoi.android.foundation.design.components.common

import org.junit.Assert.assertEquals
import org.junit.Test

class TunerSliderTest {
    @Test
    fun `pointer position maps across the whole slider track`() {
        val range = 0.12f..1f

        assertEquals(0.12f, tunerValueAtPosition(0f, 100f, range), 0.0001f)
        assertEquals(0.56f, tunerValueAtPosition(50f, 100f, range), 0.0001f)
        assertEquals(1f, tunerValueAtPosition(100f, 100f, range), 0.0001f)
    }

    @Test
    fun `pointer position clamps outside the slider track`() {
        val range = 0f..24f

        assertEquals(0f, tunerValueAtPosition(-50f, 100f, range), 0.0001f)
        assertEquals(24f, tunerValueAtPosition(150f, 100f, range), 0.0001f)
    }

    @Test
    fun `drag values snap to the configured decimal step`() {
        assertEquals(14.1f, snapTunerValue(14.06f, 9f..20f, 0.1f), 0.0001f)
        assertEquals(0.73f, snapTunerValue(0.734f, 0f..0.95f, 0.01f), 0.0001f)
    }

    @Test
    fun `stepper values stay inside the control range`() {
        assertEquals(9f, snapTunerValue(8.9f, 9f..20f, 0.1f), 0.0001f)
        assertEquals(20f, snapTunerValue(20.1f, 9f..20f, 0.1f), 0.0001f)
    }
}
