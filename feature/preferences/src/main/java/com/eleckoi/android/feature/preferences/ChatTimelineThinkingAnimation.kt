package com.eleckoi.android.feature.preferences

/** Visual used by active reasoning entries in the chat timeline. */
enum class ChatTimelineThinkingAnimation(val storageKey: String) {
    Bars("bars"),
    HalfBody("half_body"),
    BigHead("big_head"),
    ;

    companion object {
        val Default: ChatTimelineThinkingAnimation = BigHead

        fun fromStorageKey(value: String?): ChatTimelineThinkingAnimation =
            entries.firstOrNull { it.storageKey == value } ?: Default
    }
}
