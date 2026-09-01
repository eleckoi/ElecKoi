package com.eleckoi.android.engine.generation.config

import javax.crypto.KeyGenerator
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test

class ModelSecretCodecTest {
    private val key = KeyGenerator.getInstance("AES").run {
        init(256)
        generateKey()
    }
    private val codec = AesGcmModelSecretCodec(keyProvider = { key })

    @Test
    fun `round trips without storing plaintext`() {
        val protected = codec.protect("config-1", "sk-secret-value")

        assertTrue(codec.isProtected(protected))
        assertTrue(protected.startsWith("egsec:v2:aes-gcm:"))
        assertNotEquals("sk-secret-value", protected)
        assertEquals("sk-secret-value", codec.reveal("config-1", protected))
    }

    @Test
    fun `provider generates a fresh iv for every encryption`() {
        val first = codec.protect("config-1", "same-secret")
        val second = codec.protect("config-1", "same-secret")

        assertNotEquals(first, second)
        assertEquals("same-secret", codec.reveal("config-1", first))
        assertEquals("same-secret", codec.reveal("config-1", second))
    }

    @Test
    fun `binds ciphertext to config identity and rejects tampering`() {
        val protected = codec.protect("config-1", "secret")

        assertThrows(IllegalStateException::class.java) {
            codec.reveal("config-2", protected)
        }
        val envelope = Base64.getUrlDecoder().decode(protected.removePrefix("egsec:v2:aes-gcm:"))
        envelope[envelope.lastIndex] = (envelope.last().toInt() xor 1).toByte()
        val tampered = "egsec:v2:aes-gcm:" + Base64.getUrlEncoder().withoutPadding().encodeToString(envelope)
        assertThrows(IllegalStateException::class.java) {
            codec.reveal("config-1", tampered)
        }
    }

    @Test
    fun `rejects legacy plaintext after clean baseline`() {
        assertThrows(ModelSecretUnavailableException::class.java) {
            codec.reveal("config-1", "legacy-key")
        }
        assertEquals("", codec.protect("config-1", ""))
    }

    @Test
    fun `rejects retired ciphertext format after clean baseline`() {
        val stored = "egk1:retired-ciphertext"

        assertFalse(codec.isProtected(stored))
        assertThrows(ModelSecretUnavailableException::class.java) {
            codec.reveal("config-1", stored)
        }
    }

    @Test
    fun `unavailable marker never becomes an api key`() {
        assertTrue(codec.isProtected(ModelSecretUnavailableMarker))
        assertThrows(ModelSecretUnavailableException::class.java) {
            codec.reveal("config-1", ModelSecretUnavailableMarker)
        }
    }

    @Test
    fun `a permanently invalid key reset retries a new secret exactly once`() {
        var attempts = 0
        var reset = false

        val result = retryOnceAfterModelSecretReset(
            operation = {
                attempts += 1
                if (attempts == 1) throw IllegalStateException("invalidated")
                "protected-with-new-key"
            },
            shouldReset = { it.message == "invalidated" },
            reset = { reset = true },
        )

        assertEquals("protected-with-new-key", result)
        assertEquals(2, attempts)
        assertTrue(reset)
    }

    @Test
    fun `unrelated encryption failures do not reset the key`() {
        var reset = false

        assertThrows(IllegalArgumentException::class.java) {
            retryOnceAfterModelSecretReset(
                operation = { throw IllegalArgumentException("bad input") },
                shouldReset = { false },
                reset = { reset = true },
            )
        }
        assertFalse(reset)
    }

    @Test
    fun `applies the same utf8 byte bound before encryption and decryption`() {
        val multibyte = "你".repeat(6_000)
        assertThrows(IllegalArgumentException::class.java) {
            codec.protect("config-1", multibyte)
        }
        assertThrows(ModelSecretUnavailableException::class.java) {
            codec.reveal("config-1", "egsec:v2:aes-gcm:${"A".repeat(30_000)}")
        }
    }
}
