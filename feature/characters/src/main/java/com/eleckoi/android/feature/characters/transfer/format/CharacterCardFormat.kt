package com.eleckoi.android.feature.characters.transfer.format

import com.eleckoi.android.feature.characters.transfer.model.DecodedCharacterCard

internal interface CharacterCardFormat {
    fun decode(bytes: ByteArray): DecodedCharacterCard?
}
internal class CharacterCardFormatRegistry(
    private val formats: List<CharacterCardFormat>,
) {
    fun decode(bytes: ByteArray): DecodedCharacterCard {
        formats.forEach { format ->
            format.decode(bytes)?.let { return it }
        }
        error("无法识别这个角色卡")
    }
}
