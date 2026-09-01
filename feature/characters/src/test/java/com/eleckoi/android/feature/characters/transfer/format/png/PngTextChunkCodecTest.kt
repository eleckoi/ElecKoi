package com.eleckoi.android.feature.characters.transfer.format.png

import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PngTextChunkCodecTest {
    @Test
    fun writesAndReplacesCharacterMetadataWithoutChangingPngContainer() {
        val original = Base64.getDecoder().decode(OnePixelPng)
        val first = PngTextChunkCodec.writeText(
            original,
            mapOf("chara" to "first", "eleckoi" to "full-config"),
        )
        val replaced = PngTextChunkCodec.writeText(first, mapOf("chara" to "second"))

        assertTrue(PngTextChunkCodec.isPng(replaced))
        assertEquals(
            mapOf("eleckoi" to "full-config", "chara" to "second"),
            PngTextChunkCodec.readText(replaced),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsNonPngInput() {
        PngTextChunkCodec.readText("not a png".toByteArray())
    }

    private companion object {
        const val OnePixelPng =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    }
}
