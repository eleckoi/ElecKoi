package com.eleckoi.android.feature.studio.ui.assistant.session

internal fun Throwable.creationAssistantMessage(fallback: String): String =
    message?.trim()?.takeIf(String::isNotEmpty) ?: fallback

internal fun String.toCreationConversationTitle(): String =
    lineSequence()
        .firstOrNull { it.isNotBlank() }
        .orEmpty()
        .trim()
        .replace(Regex("\\s+"), " ")
        .take(28)
        .ifBlank { "新对话" }
