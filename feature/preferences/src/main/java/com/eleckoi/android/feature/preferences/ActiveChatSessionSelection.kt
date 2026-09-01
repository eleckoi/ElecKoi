package com.eleckoi.android.feature.preferences

internal data class ActiveChatSessionSelection(
    val lastSessionId: String = "",
    val sessionIdsByContext: Map<String, String> = emptyMap(),
) {
    fun sessionIdFor(characterId: String): String {
        val key = characterId.trim()
        if (key.isBlank()) return ""
        return sessionIdsByContext[key].orEmpty()
    }

    fun sessionIdFor(characterId: String, characterMode: String): String {
        return sessionIdsByContext[modeKey(characterId, characterMode)].orEmpty()
    }

    fun remember(
        characterId: String,
        characterMode: String,
        sessionId: String,
    ): ActiveChatSessionSelection {
        val characterKey = characterId.trim()
        val contextKey = modeKey(characterId, characterMode)
        val normalizedSessionId = sessionId.trim()
        if (characterKey.isBlank() || contextKey.isBlank() || normalizedSessionId.isBlank()) return this
        return copy(
            lastSessionId = normalizedSessionId,
            sessionIdsByContext = sessionIdsByContext +
                (characterKey to normalizedSessionId) +
                (contextKey to normalizedSessionId),
        )
    }

    fun forget(sessionId: String): ActiveChatSessionSelection {
        val normalizedSessionId = sessionId.trim()
        if (normalizedSessionId.isBlank()) return this
        return copy(
            lastSessionId = lastSessionId.takeUnless { it == normalizedSessionId }.orEmpty(),
            sessionIdsByContext = sessionIdsByContext.filterValues { it != normalizedSessionId },
        )
    }

    private fun modeKey(characterId: String, characterMode: String): String {
        val normalizedCharacterId = characterId.trim()
        val normalizedMode = characterMode.trim()
        if (normalizedCharacterId.isBlank() || normalizedMode.isBlank()) return ""
        return "$normalizedCharacterId:$normalizedMode"
    }
}
