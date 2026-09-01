package com.eleckoi.android.engine.display

/** Optional external-format projection applied only to ephemeral display text. */
interface MessageDisplayCompatibility {
    fun prepareAssistantText(
        text: String,
        complete: Boolean,
        displayRulePatterns: Iterable<String>,
    ): String

    fun resolveVariableMacros(text: String, variableStateJson: String): String
}
