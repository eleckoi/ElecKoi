package com.eleckoi.android.feature.characters.transfer.format.png

import com.eleckoi.android.feature.characters.transfer.format.CharacterCardFormat
import com.eleckoi.android.feature.characters.transfer.format.CharacterCardJsonCodec
import com.eleckoi.android.feature.characters.transfer.model.DecodedCharacterCard
import com.eleckoi.android.feature.characters.transfer.model.PortableCharacterPackage
import java.nio.charset.StandardCharsets
import java.util.Base64

internal object PngCharacterCardFormat : CharacterCardFormat {
    override fun decode(bytes: ByteArray): DecodedCharacterCard? {
        if (!PngTextChunkCodec.isPng(bytes)) return null
        val text = PngTextChunkCodec.readText(bytes)
        text[CharacterCardJsonCodec.PortableKeyword]?.let { encoded ->
            return DecodedCharacterCard(
                packageData = CharacterCardJsonCodec.decodePortable(encoded),
                sourceImage = bytes,
                complete = true,
            )
        }
        text[CharacterCardJsonCodec.StandardKeyword]?.let { encoded ->
            return CharacterCardJsonCodec.decodeStandard(encoded, bytes)
        }
        error("图片里没有角色卡数据")
    }

    fun encode(image: ByteArray, value: PortableCharacterPackage): ByteArray {
        val standard = Base64.getEncoder().encodeToString(
            CharacterCardJsonCodec.encodeStandard(value.character)
                .toByteArray(StandardCharsets.UTF_8),
        )
        return PngTextChunkCodec.writeText(
            image,
            mapOf(
                CharacterCardJsonCodec.StandardKeyword to standard,
                CharacterCardJsonCodec.PortableKeyword to CharacterCardJsonCodec.encodePortable(value),
            ),
        )
    }
}
