package com.eleckoi.android.feature.characters.modes.story.regex.ui.presentation

import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleScope
import com.eleckoi.android.foundation.design.components.AppIconPaths

internal fun RegexRuleScope.sectionTitle(): String = when (this) {
    RegexRuleScope.Global -> "全局正则"
    RegexRuleScope.PromptPreset -> "预设正则"
    RegexRuleScope.Character -> "角色正则"
}

internal fun RegexRuleScope.sectionHint(): String = when (this) {
    RegexRuleScope.Global -> "全局生效"
    RegexRuleScope.PromptPreset -> "指定预设生效"
    RegexRuleScope.Character -> "指定角色生效"
}

internal fun RegexRuleScope.importIcon(): List<String> = when (this) {
    RegexRuleScope.Global -> AppIconPaths.Sparkles
    RegexRuleScope.PromptPreset -> AppIconPaths.Pin
    RegexRuleScope.Character -> AppIconPaths.User
}
