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
    }
}
