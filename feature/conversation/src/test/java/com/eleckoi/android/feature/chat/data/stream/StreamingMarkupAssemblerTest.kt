package com.eleckoi.android.feature.chat.data.stream

import com.eleckoi.android.feature.chat.model.content.ChatContentBlock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StreamingMarkupAssemblerTest {
    @Test
    fun growingPlainMarkdownStaysOnFastPath() {
        val assembler = StreamingMarkupAssembler()
        assembler.update("普通正文", streaming = true)
        val blocks = assembler.update("普通正文继续增长", streaming = true)

        assertFalse(assembler.structuredMode)
        assertEquals("普通正文继续增长", (blocks.single() as ChatContentBlock.Text).markdown)
    }

    @Test
    fun supportedTagSwitchesToStructuredParser() {
        val assembler = StreamingMarkupAssembler()
        assembler.update("开头正文", streaming = true)
        val blocks = assembler.update("开头正文<think>分析中", streaming = true)

        assertTrue(assembler.structuredMode)
        assertTrue(blocks.any { it is ChatContentBlock.Reasoning })
    }

    @Test
    fun sourceCorrectionResetsStructuredMode() {
        val assembler = StreamingMarkupAssembler()
        assembler.update("<think>分析中", streaming = true)
        val blocks = assembler.update("改成普通正文", streaming = true)

        assertFalse(assembler.structuredMode)
        assertTrue(blocks.single() is ChatContentBlock.Text)
    }
}
