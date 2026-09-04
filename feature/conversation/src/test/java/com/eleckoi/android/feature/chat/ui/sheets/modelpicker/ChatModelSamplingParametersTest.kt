package com.eleckoi.android.feature.chat.ui.sheets.modelpicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ChatModelSamplingParametersTest {
    @Test
    fun `sampling controls start from neutral one`() {
        assertEquals("1", 1.0.samplingParameterText())
    }

    @Test
    fun `sampling input accepts decimal comma and removes extra separators`() {
        assertEquals("0.75", "0,75".samplingInput())
        assertEquals("0.812", "0..8129".samplingInput())
    }

    @Test
    fun `disabled sampling control omits the parameter`() {
        assertNull("0.7".toSamplingValue(enabled = false))
        assertEquals(0.7, "0.7".toSamplingValue(enabled = true)!!, 0.0)
    }
}
