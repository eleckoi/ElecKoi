package com.eleckoi.android.foundation.design.components

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MobileSwipeRowTest {
    @Test
    fun `drag past forty percent opens actions`() {
        assertTrue(shouldOpenMobileSwipeActions(offsetPx = -61f, revealPx = 152f))
    }

    @Test
    fun `short drag returns row to rest`() {
        assertFalse(shouldOpenMobileSwipeActions(offsetPx = -60f, revealPx = 152f))
    }

    @Test
    fun `open row closes after dragging forty percent toward rest`() {
        assertFalse(
            shouldOpenMobileSwipeActions(
                offsetPx = -90f,
                revealPx = 152f,
                openedAtDragStart = true,
            ),
        )
    }

    @Test
    fun `open row stays open after a short reverse drag`() {
        assertTrue(
            shouldOpenMobileSwipeActions(
                offsetPx = -100f,
                revealPx = 152f,
                openedAtDragStart = true,
            ),
        )
    }

    @Test
    fun `invalid reveal distance never opens actions`() {
        assertFalse(shouldOpenMobileSwipeActions(offsetPx = -10f, revealPx = 0f))
    }
}
