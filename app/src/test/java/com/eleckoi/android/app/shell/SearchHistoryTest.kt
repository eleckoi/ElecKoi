package com.eleckoi.android.app.shell

import org.junit.Assert.assertEquals
import org.junit.Test

class SearchHistoryTest {
    @Test
    fun `new term moves to front without case duplicate`() {
        assertEquals(
            listOf("DeepSeek", "角色", "会话"),
            rememberSearchTerm(listOf("角色", "deepseek", "会话"), " DeepSeek "),
        )
    }

    @Test
    fun `history keeps at most eight terms`() {
        val history = (1..8).map(Int::toString)

        assertEquals(listOf("新词") + (1..7).map(Int::toString), rememberSearchTerm(history, "新词"))
    }

    @Test
    fun `forget term ignores case and surrounding spaces`() {
        assertEquals(
            listOf("角色"),
            forgetSearchTerm(listOf("DeepSeek", "角色"), " deepseek "),
        )
    }
}
