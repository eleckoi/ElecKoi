package com.eleckoi.android.feature.characters.transfer.format.json

import com.eleckoi.android.feature.characters.transfer.format.CharacterCardFormat
import com.eleckoi.android.feature.characters.transfer.format.CharacterCardJsonCodec
import com.eleckoi.android.feature.characters.transfer.model.DecodedCharacterCard
import java.nio.charset.StandardCharsets

internal object JsonCharacterCardFormat : CharacterCardFormat {
    override fun decode(bytes: ByteArray): DecodedCharacterCard? {
        val text = bytes.toString(StandardCharsets.UTF_8).trim()
        if (!text.startsWith("{")) return null
        return CharacterCardJsonCodec.decodeStandard(text, null)
    }
}
