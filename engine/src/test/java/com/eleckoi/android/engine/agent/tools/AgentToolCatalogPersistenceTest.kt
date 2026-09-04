package com.eleckoi.android.engine.agent.tools

import com.eleckoi.android.foundation.storage.ElecKoiDataException
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.Assert.assertThrows

class AgentToolCatalogPersistenceTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun malformedCatalogFailsWithFileContextInsteadOfResettingPreferences() {
        val file = temporaryFolder.newFile("agent-tools.json").apply {
            writeText("{ not valid json")
        }

        val error = assertThrows(ElecKoiDataException::class.java) {
            readAgentToolCatalogState(file)
        }

        assertTrue(error.message.orEmpty().contains(file.absolutePath))
        assertNotNull(error.cause)
    }

    @Test
    fun missingCatalogStillStartsWithEmptyState() {
        val file = temporaryFolder.newFile("missing-agent-tools.json").apply {
            delete()
        }

        assertEquals(AgentToolCatalogState(), readAgentToolCatalogState(file))
    }

    @Test
    fun unsupportedCatalogVersionIsRejected() {
        val file = temporaryFolder.newFile("unsupported-agent-tools.json").apply {
            writeText("{\"version\":999,\"disabledGroups\":[]}")
        }

        val error = assertThrows(ElecKoiDataException::class.java) {
            readAgentToolCatalogState(file)
        }

        assertTrue(error.message.orEmpty().contains(file.absolutePath))
        assertNotNull(error.cause)
    }

    @Test
    fun defaultPolicyClosesEveryKnownToolWithoutChangingExplicitScopes() {
        val storedDefaults = setOf(AgentToolRequestPolicy.BuiltInWorkspace)
        val observedExtension = group(
            id = "extension:weather",
            source = AgentToolGroupSource.Extension,
            members = listOf("weather"),
        )

        val resolvedDefaults = defaultDisabledToolGroups(
            disabled = storedDefaults,
            observed = listOf(observedExtension),
        )

        assertTrue(AgentToolRequestPolicy.BuiltInSettingLibrary in resolvedDefaults)
        assertTrue(AgentToolRequestPolicy.BuiltInVariables in resolvedDefaults)
        assertTrue(observedExtension.id in resolvedDefaults)
        assertEquals(
            emptySet<String>(),
            disabledToolGroupsIn(
                scopeId = AgentToolScopes.character("explicit"),
                defaults = resolvedDefaults,
                scoped = mapOf(AgentToolScopes.character("explicit") to emptySet()),
            ) - AgentToolRequestPolicy.HiddenGroupIds,
        )
    }

    @Test
    fun unknownProviderToolIsClosedAndNewProviderGroupGetsAStoredDefault() {
        val extension = group(
            id = "extension:new-provider",
            source = AgentToolGroupSource.Extension,
            members = listOf("new_tool"),
        )

        assertFalse(
            toolGroupEnabled(
                groupId = extension.id,
                disabled = emptySet(),
                knownGroupIds = AgentToolRequestPolicy.builtInGroups()
                    .mapTo(hashSetOf(), AgentToolGroupSnapshot::id),
            ),
        )
        assertEquals(
            setOf(extension.id),
            newlyObservedCapabilityGroupIds(previous = emptyList(), incoming = listOf(extension)),
        )
    }

    @Test
    fun observingKnownBuiltInDoesNotOverrideAnExplicitScopeChoice() {
        val settingLibrary = AgentToolRequestPolicy.builtInGroups()
            .single { it.id == AgentToolRequestPolicy.BuiltInSettingLibrary }

        assertTrue(
            newlyObservedCapabilityGroupIds(
                previous = emptyList(),
                incoming = listOf(settingLibrary),
            ).isEmpty(),
        )
    }

    @Test
    fun latestBuiltInObservationReplacesRemovedTools() {
        val previous = group(
            id = AgentToolRequestPolicy.BuiltInOther,
            source = AgentToolGroupSource.BuiltIn,
            members = listOf("eleckoi_web_search", "eleckoi_next_request"),
        )
        val current = group(
            id = AgentToolRequestPolicy.BuiltInOther,
            source = AgentToolGroupSource.BuiltIn,
            members = listOf("eleckoi_web_search"),
        )

        val merged = mergeObservedToolGroups(listOf(previous), listOf(current)).single()

        assertTrue(merged.members.any { it.name == "eleckoi_web_search" })
        assertFalse(merged.members.any { it.name == "eleckoi_next_request" })
    }

    @Test
    fun explicitBuiltInCatalogDoesNotMergeStaleObservedMembers() {
        val current = group(
            id = AgentToolRequestPolicy.BuiltInSettingLibrary,
            source = AgentToolGroupSource.BuiltIn,
            members = listOf(
                "eleckoi_setting_bash",
                "eleckoi_setting_read",
                "eleckoi_setting_edit",
                "eleckoi_setting_write",
            ),
        )
        val stale = group(
            id = AgentToolRequestPolicy.BuiltInSettingLibrary,
            source = AgentToolGroupSource.BuiltIn,
            members = listOf(
                "eleckoi_glob_setting_files",
                "eleckoi_read_setting_files",
                "eleckoi_delete_setting_file",
            ),
        )

        assertEquals(current.members, resolveBuiltInMembers(current, stale))
    }

    @Test
    fun runtimeOwnedBuiltInCatalogStillUsesObservedMembers() {
        val fallback = group(
            id = AgentToolRequestPolicy.BuiltInWorkspace,
            source = AgentToolGroupSource.BuiltIn,
            members = emptyList(),
        )
        val observed = group(
            id = AgentToolRequestPolicy.BuiltInWorkspace,
            source = AgentToolGroupSource.BuiltIn,
            members = listOf("bash", "read", "edit", "write"),
        )

        assertEquals(observed.members, resolveBuiltInMembers(fallback, observed))
    }

    @Test
    fun eachCharacterKeepsItsOwnSwitches() {
        val defaults = setOf(AgentToolRequestPolicy.BuiltInWorkspace)
        val firstCharacter = AgentToolScopes.character("character-a")
        val secondCharacter = AgentToolScopes.character("character-b")

        val afterFirst = toggleScopedToolGroup(
            scopeId = firstCharacter,
            groupId = AgentToolRequestPolicy.BuiltInWorkspace,
            enabled = true,
            defaults = defaults,
            scoped = emptyMap(),
        )
        val afterBoth = toggleScopedToolGroup(
            scopeId = secondCharacter,
            groupId = AgentToolRequestPolicy.BuiltInVariables,
            enabled = false,
            defaults = defaults,
            scoped = afterFirst,
        )

        assertFalse(AgentToolRequestPolicy.BuiltInWorkspace in disabledToolGroupsIn(firstCharacter, defaults, afterBoth))
        assertTrue(AgentToolRequestPolicy.BuiltInWorkspace in disabledToolGroupsIn(secondCharacter, defaults, afterBoth))
        assertFalse(AgentToolRequestPolicy.BuiltInVariables in disabledToolGroupsIn(firstCharacter, defaults, afterBoth))
        assertTrue(AgentToolRequestPolicy.BuiltInVariables in disabledToolGroupsIn(secondCharacter, defaults, afterBoth))
    }

    @Test
    fun characterDefaultsKeepCreatorOffWhileSharedAssistantKeepsItOn() {
        val defaults = AgentToolRequestPolicy.defaultDisabledGroupIds()
        val character = AgentToolScopes.character("character-1")
        var scoped = emptyMap<String, Set<String>>()

        scoped = toggleScopedToolGroup(
            scopeId = character,
            groupId = AgentToolRequestPolicy.BuiltInSettingLibrary,
            enabled = true,
            defaults = defaults,
            scoped = scoped,
        )
        scoped = toggleScopedToolGroup(
            scopeId = character,
            groupId = AgentToolRequestPolicy.BuiltInVariables,
            enabled = true,
            defaults = defaults,
            scoped = scoped,
        )

        val characterDisabled = disabledToolGroupsIn(character, defaults, scoped)
        val sharedDisabled = disabledToolGroupsIn(AgentToolScopes.Shared, defaults, emptyMap())
        val knownGroupIds = AgentToolRequestPolicy.builtInGroups()
            .mapTo(hashSetOf(), AgentToolGroupSnapshot::id)
        val state = AgentToolCatalogState(scopedDisabledGroups = scoped)

        assertFalse(AgentToolRequestPolicy.BuiltInSettingLibrary in characterDisabled)
        assertFalse(AgentToolRequestPolicy.BuiltInVariables in characterDisabled)
        assertFalse(
            state.groupEnabled(
                scopeId = character,
                groupId = AgentToolRequestPolicy.BuiltInCreator,
                disabled = characterDisabled,
                knownGroupIds = knownGroupIds,
            ),
        )
        assertTrue(
            state.groupEnabled(
                scopeId = AgentToolScopes.Shared,
                groupId = AgentToolRequestPolicy.BuiltInCreator,
                disabled = sharedDisabled,
                knownGroupIds = knownGroupIds,
            ),
        )
    }

    @Test
    fun characterCreatorCanBeEnabledWithoutChangingSharedAssistant() {
        val character = AgentToolScopes.character("character-1")
        val knownGroupIds = AgentToolRequestPolicy.builtInGroups()
            .mapTo(hashSetOf(), AgentToolGroupSnapshot::id)
        val optIn = toggleScopedOptInGroup(
            scopeId = character,
            groupId = AgentToolRequestPolicy.BuiltInCreator,
            enabled = true,
            scoped = emptyMap(),
        )
        val state = AgentToolCatalogState(scopedEnabledOptInGroups = optIn)

        assertTrue(
            state.groupEnabled(
                scopeId = character,
                groupId = AgentToolRequestPolicy.BuiltInCreator,
                disabled = state.disabledIn(character),
                knownGroupIds = knownGroupIds,
            ),
        )
        assertTrue(
            state.groupEnabled(
                scopeId = AgentToolScopes.Shared,
                groupId = AgentToolRequestPolicy.BuiltInCreator,
                disabled = state.disabledIn(AgentToolScopes.Shared),
                knownGroupIds = knownGroupIds,
            ),
        )
    }

    @Test
    fun sharedCreatorSwitchDoesNotChangeCharacterCreatorSwitch() {
        val character = AgentToolScopes.character("character-1")
        val knownGroupIds = AgentToolRequestPolicy.builtInGroups()
            .mapTo(hashSetOf(), AgentToolGroupSnapshot::id)
        val sharedDisabled = toggleScopedToolGroup(
            scopeId = AgentToolScopes.Shared,
            groupId = AgentToolRequestPolicy.BuiltInCreator,
            enabled = false,
            defaults = AgentToolRequestPolicy.defaultDisabledGroupIds(),
            scoped = emptyMap(),
        )
        val characterOptIn = toggleScopedOptInGroup(
            scopeId = character,
            groupId = AgentToolRequestPolicy.BuiltInCreator,
            enabled = true,
            scoped = emptyMap(),
        )
        val state = AgentToolCatalogState(
            scopedDisabledGroups = sharedDisabled,
            scopedEnabledOptInGroups = characterOptIn,
        )

        assertFalse(
            state.groupEnabled(
                scopeId = AgentToolScopes.Shared,
                groupId = AgentToolRequestPolicy.BuiltInCreator,
                disabled = state.disabledIn(AgentToolScopes.Shared),
                knownGroupIds = knownGroupIds,
            ),
        )
        assertTrue(
            state.groupEnabled(
                scopeId = character,
                groupId = AgentToolRequestPolicy.BuiltInCreator,
                disabled = state.disabledIn(character),
                knownGroupIds = knownGroupIds,
            ),
        )
    }

    @Test
    fun automaticIllustrationRequiresAnExplicitChoiceForEachCharacter() {
        val firstCharacter = AgentToolScopes.character("character-a")
        val secondCharacter = AgentToolScopes.character("character-b")

        val afterFirst = toggleScopedOptInGroup(
            scopeId = firstCharacter,
            groupId = AgentToolRequestPolicy.BuiltInAutoIllustration,
            enabled = true,
            scoped = emptyMap(),
        )

        assertTrue(
            AgentToolRequestPolicy.BuiltInAutoIllustration in enabledOptInGroupsIn(firstCharacter, afterFirst),
        )
        assertFalse(
            AgentToolRequestPolicy.BuiltInAutoIllustration in enabledOptInGroupsIn(secondCharacter, afterFirst),
        )
        assertFalse(
            AgentToolRequestPolicy.BuiltInAutoIllustration in
                enabledOptInGroupsIn(AgentToolScopes.Shared, afterFirst),
        )

        val disabledAgain = toggleScopedOptInGroup(
            scopeId = firstCharacter,
            groupId = AgentToolRequestPolicy.BuiltInAutoIllustration,
            enabled = false,
            scoped = afterFirst,
        )
        assertTrue(disabledAgain.isEmpty())
    }

    @Test
    fun imageGenerationIsPartOfCreatorInsteadOfASeparateTopLevelGroup() {
        val groups = AgentToolRequestPolicy.builtInGroups()

        assertTrue(
            groups.any { group ->
                group.id == AgentToolRequestPolicy.BuiltInCreator &&
                    group.name == "创作能力"
            },
        )
        assertFalse(groups.any { group -> group.name == "图片生成" })
    }

    @Test
    fun creatorImageGenerationAndCharacterIllustrationKeepIndependentModelSelections() {
        val creatorScope = AgentToolScopes.Shared
        val characterScope = AgentToolScopes.character("character-a")
        var selections = emptyMap<String, Map<String, String>>()

        selections = selectScopedToolModelConfig(
            scopeId = creatorScope,
            groupId = AgentToolRequestPolicy.BuiltInCreator,
            configId = "creator-image-model",
            scoped = selections,
        )
        selections = selectScopedToolModelConfig(
            scopeId = characterScope,
            groupId = AgentToolRequestPolicy.BuiltInAutoIllustration,
            configId = "roleplay-image-model",
            scoped = selections,
        )

        assertEquals(
            "creator-image-model",
            scopedToolModelConfigId(
                creatorScope,
                AgentToolRequestPolicy.BuiltInCreator,
                selections,
            ),
        )
        assertEquals(
            "roleplay-image-model",
            scopedToolModelConfigId(
                characterScope,
                AgentToolRequestPolicy.BuiltInAutoIllustration,
                selections,
            ),
        )
        assertEquals(
            "",
            scopedToolModelConfigId(
                creatorScope,
                AgentToolRequestPolicy.BuiltInAutoIllustration,
                selections,
            ),
        )
    }

    @Test
    fun toolModelSelectionsAreReadFromTheCatalogFile() {
        val file = temporaryFolder.newFile("agent-tools.json").apply {
            writeText(
                """{
                  "version":7,
                  "disabledGroups":[],
                  "scopedToolModelConfigIds":{
                    "shared":{"builtin:creator":"creator-image-model"},
                    "character:one":{"builtin:auto-illustration":"roleplay-image-model"}
                  }
                }""".trimIndent(),
            )
        }

        val state = readAgentToolCatalogState(file)

        assertEquals(
            "creator-image-model",
            state.scopedToolModelConfigIds[AgentToolScopes.Shared]
                ?.get(AgentToolRequestPolicy.BuiltInCreator),
        )
        assertEquals(
            "roleplay-image-model",
            state.scopedToolModelConfigIds[AgentToolScopes.character("one")]
                ?.get(AgentToolRequestPolicy.BuiltInAutoIllustration),
        )
    }

    @Test
    fun localImageInspectionIsNotAdvertisedBeforeDshDeclaresIt() {
        assertFalse(
            AgentToolRequestPolicy.builtInGroups().any {
                it.id == AgentToolRequestPolicy.BuiltInVisual
            },
        )
    }

    @Test
    fun theAssistantScopeIsSeparateFromEveryCharacter() {
        val defaults = setOf(AgentToolRequestPolicy.BuiltInCollaboration)
        val scoped = toggleScopedToolGroup(
            scopeId = AgentToolScopes.Shared,
            groupId = AgentToolRequestPolicy.BuiltInCollaboration,
            enabled = true,
            defaults = defaults,
            scoped = emptyMap(),
        )

        val shared = disabledToolGroupsIn(AgentToolScopes.Shared, defaults, scoped)
        val character = disabledToolGroupsIn(AgentToolScopes.character("character-a"), defaults, scoped)

        assertFalse(AgentToolRequestPolicy.BuiltInCollaboration in shared)
        assertTrue(AgentToolRequestPolicy.BuiltInCollaboration in character)
        // A blank scope is the assistant's, so both spellings address the same switches.
        assertEquals(shared, disabledToolGroupsIn("", defaults, scoped))
    }

    @Test
    fun untouchedScopesFallBackToTheStoredDefaults() {
        val defaults = setOf(AgentToolRequestPolicy.BuiltInVisual)
        val scoped = toggleScopedToolGroup(
            scopeId = AgentToolScopes.Shared,
            groupId = AgentToolRequestPolicy.BuiltInVisual,
            enabled = true,
            defaults = defaults,
            scoped = emptyMap(),
        )

        assertEquals(
            defaults + AgentToolRequestPolicy.HiddenGroupIds,
            disabledToolGroupsIn(AgentToolScopes.character("new"), defaults, scoped),
        )
    }

    @Test
    fun hiddenGroupsStayDisabledEvenWhenPersistedStateEnabledThem() {
        val disabled = disabledToolGroupsIn(
            scopeId = AgentToolScopes.character("character-a"),
            defaults = emptySet(),
            scoped = mapOf(AgentToolScopes.character("character-a") to emptySet()),
        )

        assertTrue(AgentToolRequestPolicy.BuiltInOther in disabled)
    }

    private fun group(
        id: String,
        source: AgentToolGroupSource,
        members: List<String>,
    ) = AgentToolGroupSnapshot(
        id = id,
        name = id,
        description = "",
        source = source,
        members = members.map { AgentToolMember(name = it, displayName = it) },
    )
}
