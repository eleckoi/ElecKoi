package com.eleckoi.android.foundation.network

/** Prevents credentials echoed by an upstream or exception from reaching UI, logs, or a Harness. */
object SensitiveTextSanitizer {
    fun sanitize(value: String, vararg secrets: String, maxChars: Int = DefaultMaxChars): String {
        require(maxChars > 0) { "脱敏文本上限必须大于 0" }
        val candidates = secrets
            .flatMap { secret ->
                val trimmed = secret.trim()
                buildList {
                    if (secret.isNotEmpty()) add(secret)
                    if (trimmed.isNotEmpty()) {
                        add(trimmed)
                        add("Bearer $trimmed")
                    }
                }
            }
            .distinct()
            .sortedByDescending(String::length)
        return candidates.fold(value) { sanitized, secret -> sanitized.replace(secret, Redacted) }
            .take(maxChars)
    }

    private const val Redacted = "***"
    private const val DefaultMaxChars = 4_096
}
