package com.eleckoi.android.foundation.design.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ModelProviderIconsTest {
    @Test
    fun `known model names resolve to their bundled icons`() {
        assertEquals("deepseek", detectKnownModelProviderId("deepseek-v4-preview"))
        assertEquals("zhipu", detectKnownModelProviderId("glm-4.5"))
        assertEquals("kimi", detectKnownModelProviderId("kimi-k2.5"))
    }

    @Test
    fun `unknown and retired model names do not claim an icon`() {
        assertNull(detectKnownModelProviderId("my-company-model-v2"))
        assertNull(detectKnownModelProviderId("o1"))
        assertNull(detectKnownModelProviderId("o3-mini"))
        assertNull(detectKnownModelProviderId("o4-mini"))
    }
}
