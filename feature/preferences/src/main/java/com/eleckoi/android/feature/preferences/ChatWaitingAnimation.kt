package com.eleckoi.android.feature.preferences

// What plays inside the placeholder reply while the first chunk is still on the wire. Stored as a
// key rather than an ordinal so a reordered enum cannot silently repoint everyone's saved choice.
enum class ChatWaitingAnimation(val storageKey: String) {
    Dots("dots"),
    Cat("cat"),
    ;

    companion object {
        val Default: ChatWaitingAnimation = Dots

        fun fromStorageKey(value: String?): ChatWaitingAnimation =
            entries.firstOrNull { it.storageKey == value } ?: Default
    }
}
