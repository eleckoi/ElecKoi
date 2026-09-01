package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentDynamicTool
import com.eleckoi.android.engine.agent.api.AgentVirtualFileSearch
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryAgentEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryAgentTurnContext

internal fun characterSettingLibraryGlobTool(
    entries: List<SettingLibraryAgentEntry>,
    virtualFileSearch: AgentVirtualFileSearch,
): AgentDynamicTool? = buildCharacterSettingLibraryGlobTool(entries, virtualFileSearch)

internal fun characterSettingLibraryGlobTool(
    contextProvider: suspend () -> SettingLibraryAgentTurnContext,
    virtualFileSearch: AgentVirtualFileSearch,
): AgentDynamicTool = buildCharacterSettingLibraryGlobTool(contextProvider, virtualFileSearch)

internal fun characterSettingLibraryGrepTool(
    entries: List<SettingLibraryAgentEntry>,
    virtualFileSearch: AgentVirtualFileSearch,
): AgentDynamicTool? = buildCharacterSettingLibraryGrepTool(entries, virtualFileSearch)

internal fun characterSettingLibraryGrepTool(
    contextProvider: suspend () -> SettingLibraryAgentTurnContext,
    virtualFileSearch: AgentVirtualFileSearch,
): AgentDynamicTool = buildCharacterSettingLibraryGrepTool(contextProvider, virtualFileSearch)

internal fun characterSettingLibraryReadTool(
    entries: List<SettingLibraryAgentEntry>,
): AgentDynamicTool? = buildCharacterSettingLibraryReadTool(entries)

internal fun characterSettingLibraryReadTool(
    contextProvider: suspend () -> SettingLibraryAgentTurnContext,
): AgentDynamicTool = buildCharacterSettingLibraryReadTool(contextProvider)
