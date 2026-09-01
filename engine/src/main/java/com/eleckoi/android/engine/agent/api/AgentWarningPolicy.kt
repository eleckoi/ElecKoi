package com.eleckoi.android.engine.agent.api

/** Converts a Harness diagnostic into a user-visible warning, hiding self-resolved fallbacks. */
fun agentWarningNotice(message: String): String? {
    val trimmed = message.trim()
    if (trimmed.isEmpty() || isSelfResolvedAgentWarning(trimmed)) return null
    return trimmed
}

fun isSelfResolvedAgentWarning(message: String): Boolean {
    val trimmed = message.trim()
    return SelfResolvedModelMetadataFallback.matches(trimmed)
}

private val SelfResolvedModelMetadataFallback = Regex(
    pattern = """Model metadata for `[^`\r\n]+` not found\. Defaulting to fallback metadata; this can degrade performance and cause issues\.""",
)
