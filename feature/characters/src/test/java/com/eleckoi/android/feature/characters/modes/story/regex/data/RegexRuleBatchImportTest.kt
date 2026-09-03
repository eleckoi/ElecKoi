package com.eleckoi.android.feature.characters.modes.story.regex.data

import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleImportDocument
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleScope
import org.junit.Assert.assertEquals
import org.junit.Test

class RegexRuleBatchImportTest {
    @Test
    fun multipleDocumentsKeepFileAndRuleOrderWhileReportingInvalidFiles() {
        val documents = listOf(
            RegexRuleImportDocument(
                displayName = "first.json",
                json = """{"rules":[{"name":"A","pattern":"a"},{"name":"B","pattern":"b"}]}""",
            ),
            RegexRuleImportDocument(displayName = "broken.json", json = "not-json"),
            RegexRuleImportDocument(
                displayName = "second.json",
                json = """{"regex_scripts":[{"scriptName":"C","findRegex":"c"}]}""",
            ),
        )

        val decoded = decodeRegexImportDocuments(documents, RegexRuleScope.Character)

        assertEquals(2, decoded.importedByFile.size)
        assertEquals(listOf("A", "B", "C"), decoded.importedByFile.flatten().map { it.rule.name })
        assertEquals(
            listOf(RegexRuleScope.Character, RegexRuleScope.Character, RegexRuleScope.Character),
            decoded.importedByFile.flatten().map { it.scope },
        )
        assertEquals(listOf("broken.json"), decoded.failedFileNames)
        assertEquals(0, decoded.skippedDepthRuleCount)
    }

    @Test
    fun depthLimitedRulesAreSkippedWithoutDiscardingSupportedRulesInTheSameFile() {
        val document = RegexRuleImportDocument(
            displayName = "mixed.json",
            json = """
                {
                  "regex_scripts": [
                    {"scriptName":"普通规则","findRegex":"cat","replaceString":"dog","minDepth":null,"maxDepth":null},
                    {"scriptName":"删除历史消息","findRegex":"^([\\s\\S]*)$","replaceString":"","minDepth":1,"maxDepth":null},
                    {"scriptName":"只改最新消息","findRegex":"([\\s\\S]*)","replaceString":"<$1>","minDepth":null,"maxDepth":1}
                  ]
                }
            """.trimIndent(),
        )

        val decoded = decodeRegexImportDocuments(listOf(document), RegexRuleScope.PromptPreset)

        assertEquals(listOf("普通规则"), decoded.importedByFile.flatten().map { it.rule.name })
        assertEquals(2, decoded.skippedDepthRuleCount)
        assertEquals(emptyList<String>(), decoded.failedFileNames)
    }

    @Test
    fun repeatedLargeImportsNeverAdmitDepthLimitedRules() {
        val scripts = (0 until 300).joinToString(",") { index ->
            if (index % 3 == 0) {
                """{"scriptName":"depth-$index","findRegex":"x$index","minDepth":1}"""
            } else {
                """{"scriptName":"plain-$index","findRegex":"x$index","minDepth":null}"""
            }
        }
        val document = RegexRuleImportDocument("large.json", """{"regex_scripts":[$scripts]}""")

        repeat(12) {
            val decoded = decodeRegexImportDocuments(listOf(document), RegexRuleScope.Character)

            assertEquals(200, decoded.importedByFile.single().size)
            assertEquals(100, decoded.skippedDepthRuleCount)
            assertEquals(0, decoded.importedByFile.flatten().count { it.rule.name.startsWith("depth-") })
        }
    }
}
