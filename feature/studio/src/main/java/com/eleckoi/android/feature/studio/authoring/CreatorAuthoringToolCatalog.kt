package com.eleckoi.android.feature.studio.authoring

import com.eleckoi.android.engine.creator.capability.CreatorToolsetCatalog
import com.eleckoi.android.feature.studio.authoring.capability.CharacterCreatorCapabilities
import com.eleckoi.android.feature.studio.authoring.capability.CharacterMediaCreatorCapabilities
import com.eleckoi.android.feature.studio.authoring.capability.RegexRuleCreatorCapabilities
import com.eleckoi.android.feature.studio.authoring.capability.SettingLibraryCreatorCapabilities
import com.eleckoi.android.feature.studio.authoring.capability.VariableCreatorCapabilities

internal object CreatorAuthoringToolCatalog {
    fun create() = CreatorToolsetCatalog(
        toolsets = listOf(
            CharacterCreatorCapabilities.toolset,
            CharacterMediaCreatorCapabilities.toolset,
            SettingLibraryCreatorCapabilities.toolset,
            VariableCreatorCapabilities.toolset,
            RegexRuleCreatorCapabilities.toolset,
        ),
        capabilities = CharacterCreatorCapabilities.capabilities() +
            CharacterMediaCreatorCapabilities.capabilities() +
            SettingLibraryCreatorCapabilities.capabilities() +
            VariableCreatorCapabilities.capabilities() +
            RegexRuleCreatorCapabilities.capabilities(),
    )
}
