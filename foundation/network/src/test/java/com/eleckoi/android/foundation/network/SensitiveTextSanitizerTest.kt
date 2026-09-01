package com.eleckoi.android.foundation.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SensitiveTextSanitizerTest {
    @Test
    fun `redacts the exact and trimmed bearer value without treating blank as a secret`() {
        val result = SensitiveTextSanitizer.sanitize(
            "upstream echoed Bearer sk-live and sk-live; blank remains readable",
            "  sk-live  ",
            "",
        )

        assertFalse(result.contains("sk-live"))
        assertEquals("upstream echoed *** and ***; blank remains readable", result)
    }
}
