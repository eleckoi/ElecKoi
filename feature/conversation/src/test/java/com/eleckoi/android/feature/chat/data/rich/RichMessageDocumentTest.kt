package com.eleckoi.android.feature.chat.data.rich

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichMessageDocumentTest {
    @Test
    fun `recognizes complete html documents`() {
        val document = detectRichMessageDocument(
            "<!doctype html><html><body><button>打开</button></body></html>",
        )

        assertNotNull(document)
        assertEquals(RichMessageDocumentKind.FullDocument, document?.kind)
    }

    @Test
    fun `recognizes interactive html fragments`() {
        val document = detectRichMessageDocument(
            """<div class="status"><button onclick="toggle()">状态</button></div>""",
        )

        assertNotNull(document)
        assertEquals(RichMessageDocumentKind.Fragment, document?.kind)
    }

    @Test
    fun `does not execute html examples inside markdown fences`() {
        val document = detectRichMessageDocument(
            """
            示例：
            ```html
            <div class="status"><script>alert('no')</script></div>
            ```
            """.trimIndent(),
        )

        assertNull(document)
    }

    @Test
    fun `does not treat roleplay xml wrappers as browser content`() {
        assertNull(detectRichMessageDocument("<status>紧张</status>"))
        assertNull(detectRichMessageDocument("请把 <div> 当作普通文本解释"))
    }

    @Test
    fun `explicit marker opts into fragment rendering`() {
        val source = "<!-- eleckoi:rich --><custom-panel>内容</custom-panel>"
        val document = detectRichMessageDocument(source)

        assertNotNull(document)
        assertTrue(document?.contentKey?.isNotBlank() == true)
    }

    @Test
    fun `complete regex html renders during streaming without exposing its source`() {
        val document = detectCompleteStreamingRichMessageDocument(
            "正文<style>.status{display:block}</style><section class=\"status\">状态</section>",
        )

        assertNotNull(document)
        assertEquals(RichMessageDocumentKind.Fragment, document?.kind)
    }

    @Test
    fun `display regex html tail does not absorb preceding markdown prose`() {
        val presentation = detectRichMessagePresentation(
            source = "正文第一段。\n\n正文第二段。\n<style>.status{display:block}</style><section class=\"status\">状态</section>",
            streaming = true,
        )

        assertNotNull(presentation)
        assertEquals(2, presentation?.parts?.size)
        assertEquals(
            "正文第一段。\n\n正文第二段。",
            (presentation?.parts?.get(0) as? RichMessagePart.Native)?.source,
        )
        assertEquals(
            "<style>.status{display:block}</style><section class=\"status\">状态</section>",
            (presentation?.parts?.get(1) as? RichMessagePart.Rich)?.document?.source,
        )
    }

    @Test
    fun `nested regex template remains one complete browser block`() {
        val html = """
            <style>.status{display:block}</style>
            <section class="status">
              <div class="group"><div>世界</div></div>
              <div class="group"><div>角色</div></div>
            </section>
            <script>document.body.dataset.ready = 'true'</script>
        """.trimIndent()
        val presentation = detectRichMessagePresentation(
            source = "正文\n$html",
            streaming = true,
        )

        assertNotNull(presentation)
        assertEquals("正文", (presentation?.parts?.get(0) as? RichMessagePart.Native)?.source)
        assertEquals(html, (presentation?.parts?.get(1) as? RichMessagePart.Rich)?.document?.source)
    }

    @Test
    fun `display replacement boundaries preserve native and rich interleaving`() {
        val first = decorateRichDisplayReplacement(
            "<style>.one{display:block}</style><section class=\"one\">状态一</section>",
        )
        val second = decorateRichDisplayReplacement(
            "<div class=\"two\"><button>状态二</button></div>",
        )

        val presentation = detectRichMessagePresentation(
            source = "开头\n$first\n中间\n$second\n结尾",
            streaming = true,
        )

        assertNotNull(presentation)
        assertEquals(5, presentation?.parts?.size)
        assertEquals("开头", (presentation?.parts?.get(0) as? RichMessagePart.Native)?.source)
        assertEquals(
            "<style>.one{display:block}</style><section class=\"one\">状态一</section>",
            (presentation?.parts?.get(1) as? RichMessagePart.Rich)?.document?.source,
        )
        assertEquals("中间", (presentation?.parts?.get(2) as? RichMessagePart.Native)?.source)
        assertEquals(
            "<div class=\"two\"><button>状态二</button></div>",
            (presentation?.parts?.get(3) as? RichMessagePart.Rich)?.document?.source,
        )
        assertEquals("结尾", (presentation?.parts?.get(4) as? RichMessagePart.Native)?.source)
    }

    @Test
    fun `plain display replacements are not decorated`() {
        assertEquals("普通文本", decorateRichDisplayReplacement("普通文本"))
    }

    @Test
    fun `display replacement boundaries escape an indented markdown code block`() {
        val decorated = decorateRichDisplayReplacement(
            "<div class=\"status\"><button>状态</button></div>",
        )
        val replaced = "    <ImportedFrontendMount/>".replace("<ImportedFrontendMount/>", decorated)

        assertEquals("    ", replaced.lineSequence().first())
        assertTrue(replaced.lines()[1].startsWith("<!-- eleckoi:rich-replacement:start -->"))
        assertTrue(replaced.endsWith("<!-- eleckoi:rich-replacement:end -->\n"))
    }

    @Test
    fun `partial authored markup stays non executable while streaming`() {
        assertNull(
            detectCompleteStreamingRichMessageDocument(
                "<div class=\"status\">仍在生成",
            ),
        )
        assertNull(
            detectCompleteStreamingRichMessageDocument(
                "<!doctype html><html><body><div>仍在生成",
            ),
        )
    }
}
