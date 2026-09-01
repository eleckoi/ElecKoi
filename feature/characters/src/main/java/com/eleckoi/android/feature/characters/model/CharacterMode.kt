package com.eleckoi.android.feature.characters.model

enum class CharacterMode(val storageValue: String, val label: String) {
    Story("story", "剧情小说"),
    Agent("agent", "智能体");

    companion object {
        fun fromStorage(value: String): CharacterMode {
            return entries.firstOrNull { it.storageValue == value } ?: Story
        }
    }
}
