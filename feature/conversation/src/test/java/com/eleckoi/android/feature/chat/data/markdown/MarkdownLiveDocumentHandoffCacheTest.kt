package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownBlockType
import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode
import org.junit.After
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class MarkdownLiveDocumentHandoffCacheTest {
    @After
    fun tearDown() {
        MarkdownLiveDocumentHandoffCache.clear()
    }

    @Test
    fun exactStreamingRevisionIsHandedToTheNextOwner() {
        val nodes = listOf(node("answer"))

        MarkdownLiveDocumentHandoffCache.put("creation:turn:answer", "**answer**", nodes)

        assertSame(
            nodes,
            MarkdownLiveDocumentHandoffCache.get("creation:turn:answer", "**answer**"),
        )
        assertNull(MarkdownLiveDocumentHandoffCache.get("creation:turn:answer", "answer"))
    }

    @Test
    fun deletingAScopeRemovesItsTransientRichFrame() {
        MarkdownLiveDocumentHandoffCache.put(
            "chat:session:message",
            "answer",
            listOf(node("answer")),
        )

        MarkdownLiveDocumentHandoffCache.removeScopes(setOf("chat:session"))

        assertNull(MarkdownLiveDocumentHandoffCache.get("chat:session:message", "answer"))
    }

    private fun node(source: String) = MarkdownNode(
        id = "node",
        type = MarkdownBlockType.Paragraph,
        source = source,
        start = 0,
        end = source.length,
        stable = false,
    )
}
