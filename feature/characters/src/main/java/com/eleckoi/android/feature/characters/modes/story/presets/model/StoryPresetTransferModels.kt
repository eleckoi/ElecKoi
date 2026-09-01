package com.eleckoi.android.feature.characters.modes.story.presets.model

enum class StoryPresetImportSource {
    ElecKoi,
    SillyTavern,
}

data class StoryPresetImportDocument(
    val fileName: String,
    val json: String = "",
    val bytes: ByteArray? = null,
)

data class ExportedStoryPresetCard(
    val presetId: String,
    val name: String,
    val imageBytes: ByteArray,
)
