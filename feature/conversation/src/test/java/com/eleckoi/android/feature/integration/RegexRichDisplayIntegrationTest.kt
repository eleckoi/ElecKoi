package com.eleckoi.android.feature.integration

import com.eleckoi.android.feature.characters.modes.story.regex.data.RegexRuleProcessor
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRule
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleTarget
import com.eleckoi.android.feature.chat.data.rich.decorateRichDisplayReplacement
import com.eleckoi.android.feature.chat.data.rich.detectRichMessageDocument
import com.eleckoi.android.feature.chat.data.rich.detectRichMessagePresentation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RegexRichDisplayIntegrationTest {
    @Test
    fun displayReplacementCanProduceAnInteractiveMessageDocument() {
        val rule = RegexRule(
            pattern = "/\\[status:(.+)]/s",
            replacement = "<button onclick=\"this.textContent='已展开'\">$1</button>",
            targets = setOf(RegexRuleTarget.AiOutput),
        )

        val transformed = RegexRuleProcessor.transform(
            "[status:查看状态]",
            listOf(rule),
            RegexRuleTarget.AiOutput,
        )

        assertEquals("<button onclick=\"this.textContent='已展开'\">查看状态</button>", transformed)
        assertTrue(detectRichMessageDocument(transformed) != null)
    }

    @Test
    fun protectedRichReplacementIsNotReprocessedByLaterDisplayRules() {
        val rules = listOf(
            RegexRule(
                pattern = "<Status/>",
                replacement = "<section><UpdateVariable>generated UI</UpdateVariable></section>",
                targets = setOf(RegexRuleTarget.AiOutput),
                order = 0,
            ),
            RegexRule(
                pattern = "/<UpdateVariable>.*<\\/UpdateVariable>/s",
                replacement = "BROKEN",
                targets = setOf(RegexRuleTarget.AiOutput),
                order = 1,
            ),
        )

        val transformed = RegexRuleProcessor.transform(
            text = "<Status/>",
            rules = rules,
            target = RegexRuleTarget.AiOutput,
            replacementDecorator = ::decorateRichDisplayReplacement,
            protectDecoratedReplacements = true,
        )

        assertTrue(transformed.contains("generated UI"))
        assertFalse(transformed.contains("BROKEN"))
        assertTrue(detectRichMessageDocument(transformed) != null)
    }

    @Test
    fun largeFencedFrontendReplacementIsAtomicAndRemainsRenderable() {
        val payload = "A".repeat(2_000_000)
        val frontend = "```\n<body><script id=\"app-data\" type=\"text/plain\">$payload</script></body>\n```"
        val rules = listOf(
            RegexRule(
                pattern = "系统加载中\\.\\.\\.",
                replacement = frontend,
                order = 0,
            ),
            RegexRule(
                pattern = "app-data",
                replacement = "BROKEN",
                order = 1,
            ),
        )

        val transformed = RegexRuleProcessor.transform(
            text = "系统加载中...",
            rules = rules,
            target = RegexRuleTarget.AiOutput,
            replacementDecorator = ::decorateRichDisplayReplacement,
            protectDecoratedReplacements = true,
        )

        assertFalse(transformed.contains("BROKEN"))
        assertTrue(transformed.contains(payload))
        assertFalse(transformed.contains("```"))
        assertTrue(detectRichMessagePresentation(transformed, streaming = false) != null)
    }
}
