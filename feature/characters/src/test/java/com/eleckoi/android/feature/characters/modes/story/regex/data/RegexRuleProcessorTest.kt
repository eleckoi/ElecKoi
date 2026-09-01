package com.eleckoi.android.feature.characters.modes.story.regex.data

import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRule
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleScope
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RegexRuleProcessorTest {
    @Test
    fun transformsOnlyTheSelectedTargetInRuleOrder() {
        val rules = listOf(
            RegexRule(pattern = "cat", replacement = "dog", targets = setOf(RegexRuleTarget.AiOutput), order = 0),
            RegexRule(pattern = "dog", replacement = "bird", targets = setOf(RegexRuleTarget.AiOutput), order = 1),
            RegexRule(pattern = "bird", replacement = "fish", targets = setOf(RegexRuleTarget.UserInput), order = 2),
        )

        assertEquals("bird", RegexRuleProcessor.transform("cat", rules, RegexRuleTarget.AiOutput))
        assertEquals("cat", RegexRuleProcessor.transform("cat", rules, RegexRuleTarget.UserInput))
    }

    @Test
    fun supportsDelimitersAndCaptureReferences() {
        val rule = RegexRule(pattern = "/(hello) (world)/i", replacement = "$2, $1: $&")

        assertEquals("WORLD, HELLO: HELLO WORLD", RegexRuleProcessor.transform("HELLO WORLD", listOf(rule), RegexRuleTarget.AiOutput))
    }

    @Test
    fun importsACommonRuleShape() {
        val rules = RegexRuleImportCodec.decode(
            """{"name":"格式整理","regex_scripts":[{"scriptName":"删标记","findRegex":"\\[x\\]","replaceString":"","placement":[2]}]}""",
        )

        assertEquals("\\[x\\]", rules.single().pattern)
        assertTrue(RegexRuleTarget.AiOutput in rules.single().targets)
    }

    @Test
    fun importsStandaloneAndArrayRuleFilesWithoutLosingScopeOrTargets() {
        val standalone = RegexRuleImportCodec.decodeScoped(
            """{"scriptName":"单条","findRegex":"cat","replaceString":"dog","placement":[1]}""",
            RegexRuleScope.Character,
        )
        val grouped = RegexRuleImportCodec.decodeScoped(
            """[{"scope":"Global","name":"全局","pattern":"a","replacement":"b","targets":["Reasoning"]}]""",
            RegexRuleScope.Character,
        )

        assertEquals(RegexRuleScope.Character, standalone.single().scope)
        assertTrue(RegexRuleTarget.UserInput in standalone.single().rule.targets)
        assertEquals(RegexRuleScope.Global, grouped.single().scope)
        assertTrue(RegexRuleTarget.Reasoning in grouped.single().rule.targets)
    }

    @Test
    fun reportsUnsupportedDelimitedPatternFlags() {
        val message = RegexRuleProcessor.validationMessage(RegexRule(pattern = "/cat/z"))

        assertTrue(message.orEmpty().contains("z"))
    }

    @Test
    fun ordinaryRulesAreReappliedWhenExistingMessagesAreProjectedForDisplay() {
        val ordinary = RegexRule(displayOnly = false, promptOnly = false)
        val displayOnly = RegexRule(displayOnly = true, promptOnly = false)
        val promptOnly = RegexRule(displayOnly = false, promptOnly = true)

        assertTrue(ordinary.appliesTo(RegexRuleSurface.Display, RegexRuleTarget.AiOutput))
        assertTrue(displayOnly.appliesTo(RegexRuleSurface.Display, RegexRuleTarget.AiOutput))
        assertFalse(promptOnly.appliesTo(RegexRuleSurface.Display, RegexRuleTarget.AiOutput))
    }

    @Test
    fun replacementDecoratorWrapsEveryResolvedGlobalMatchIndependently() {
        val rule = RegexRule(
            pattern = "/\\[([ab])]/g",
            replacement = "$1",
            targets = setOf(RegexRuleTarget.AiOutput),
        )

        val transformed = RegexRuleProcessor.transform(
            text = "前[a]中[b]后",
            rules = listOf(rule),
            target = RegexRuleTarget.AiOutput,
            replacementDecorator = { replacement -> "<$replacement>" },
        )

        assertEquals("前<a>中<b>后", transformed)
    }

    @Test
    fun preservesCallerScopeSequenceWhenEachScopeRestartsItsLocalOrder() {
        val presetRule = RegexRule(pattern = "cat", replacement = "dog", order = 12)
        val characterRule = RegexRule(pattern = "dog", replacement = "bird", order = 0)

        assertEquals(
            "bird",
            RegexRuleProcessor.transform(
                text = "cat",
                rules = listOf(presetRule, characterRule),
                target = RegexRuleTarget.AiOutput,
            ),
        )
    }

    @Test
    fun repositoryNormalizationPreservesLongHtmlReplacement() {
        val html = "<style>${"x".repeat(6_000)}</style><section>状态栏</section>"

        val normalized = listOf(
            RegexRule(
                pattern = "x".repeat(5_000),
                replacement = html,
            ),
        ).normalizedRegexRules().single()

        assertEquals(4_000, normalized.pattern.length)
        assertEquals(html, normalized.replacement)
    }
}
