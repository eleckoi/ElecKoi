package com.eleckoi.android.engine.agent.tools

import java.io.File
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class AgentToolDeletionTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test fun `deletion persists across reopen and preserves other characters and shared tools`() {
        val file = File(temporary.root, "tools.json")
        val store = AgentToolCatalogStore(file) { target, state -> target.writeText(encodeAgentToolCatalogState(state)) }
        val removed = AgentToolScopes.character("removed")
        val retained = AgentToolScopes.character("retained")
        listOf(removed, retained, AgentToolScopes.Shared).forEach { scope ->
            store.setSubagentModel(scope, "model-config", "model")
            store.setToolModelConfigId(scope, "image", "image-config")
            store.setEnabled(scope, AgentToolRequestPolicy.BuiltInCreator, true)
        }
        repeat(2) { store.deleteForCharacters(listOf("removed", " ", "removed")) }
        val loaded = readAgentToolCatalogState(file)
        assertFalse(removed in loaded.scopedDisabledGroups)
        assertFalse(removed in loaded.scopedEnabledOptInGroups)
        assertFalse(removed in loaded.scopedToolModelConfigIds)
        val reopened = AgentToolCatalogStore(file)
        assertEquals("", reopened.subagentModelConfigId(removed))
        assertEquals("", reopened.subagentModel(removed))
        listOf(retained, AgentToolScopes.Shared).forEach {
            assertEquals("model-config", reopened.subagentModelConfigId(it))
            assertEquals("image-config", reopened.toolModelConfigId(it, "image"))
        }
    }
}
