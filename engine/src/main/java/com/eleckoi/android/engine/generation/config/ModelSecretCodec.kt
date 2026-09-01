package com.eleckoi.android.engine.generation.config

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface ModelSecretCodec {
    fun protect(configId: String, plaintext: String): String
    fun reveal(configId: String, stored: String): String
    fun isProtected(stored: String): Boolean
}

internal const val ModelSecretUnavailableMarker = "egsec:v2:unavailable"

internal class ModelSecretUnavailableException(
    message: String,
    cause: Throwable? = null,
) : IllegalStateException(message, cause)

internal fun <T> retryOnceAfterModelSecretReset(
    operation: () -> T,
    shouldReset: (Exception) -> Boolean,
    reset: () -> Unit,
): T {
    return try {
        operation()
    } catch (error: Exception) {
        if (!shouldReset(error)) throw error
        reset()
        operation()
    }
}

internal class AesGcmModelSecretCodec(
    private val keyProvider: () -> SecretKey,
) : ModelSecretCodec {
    override fun protect(configId: String, plaintext: String): String {
        if (plaintext.isBlank()) return ""
        val plaintextBytes = plaintext.toByteArray(Charsets.UTF_8)
        require(plaintextBytes.size <= MaxPlaintextBytes) { "API Key 长度超过安全上限" }
        val cipher = Cipher.getInstance(Transformation).apply {
            // Android Keystore keys with randomized encryption reject caller-provided IVs.
            // Let the provider create a fresh IV, then persist that IV with the ciphertext.
            init(Cipher.ENCRYPT_MODE, keyProvider())
            updateAAD(aad(configId))
        }
        val iv = requireNotNull(cipher.iv).also { generatedIv ->
            require(generatedIv.size == IvBytes) { "API Key 加密 IV 长度无效" }
        }
        val ciphertext = cipher.doFinal(plaintextBytes)
        return CurrentPrefix + Base64.getUrlEncoder().withoutPadding().encodeToString(iv + ciphertext)
    }

    override fun reveal(configId: String, stored: String): String {
        if (stored.isBlank()) return ""
        if (stored == ModelSecretUnavailableMarker) {
            throw ModelSecretUnavailableException("此前保存的 API Key 已无法解密，请重新填写")
        }
        if (!stored.startsWith(CurrentPrefix)) {
            throw ModelSecretUnavailableException("API Key 加密格式不受支持，请重新填写")
        }
        val encodedEnvelope = stored.removePrefix(CurrentPrefix)
        if (encodedEnvelope.length > MaxEncodedEnvelopeChars) {
            throw ModelSecretUnavailableException("API Key 加密数据大小无效")
        }
        val envelope = runCatching {
            Base64.getUrlDecoder().decode(encodedEnvelope)
        }.getOrElse { throw ModelSecretUnavailableException("API Key 加密数据已损坏", it) }
        if (envelope.size !in (IvBytes + MinimumCiphertextBytes)..MaxEnvelopeBytes) {
            throw ModelSecretUnavailableException("API Key 加密数据大小无效")
        }
        val iv = envelope.copyOfRange(0, IvBytes)
        val ciphertext = envelope.copyOfRange(IvBytes, envelope.size)
        return runCatching {
            Cipher.getInstance(Transformation).run {
                init(Cipher.DECRYPT_MODE, keyProvider(), GCMParameterSpec(TagBits, iv))
                updateAAD(aad(configId))
                doFinal(ciphertext).toString(Charsets.UTF_8)
            }
        }.getOrElse { throw ModelSecretUnavailableException("无法解密 API Key，请重新填写", it) }
    }

    override fun isProtected(stored: String): Boolean =
        stored == ModelSecretUnavailableMarker ||
            stored.startsWith(CurrentPrefix)

    private fun aad(configId: String): ByteArray =
        "ElecKoi/model-config/${configId.trim()}".toByteArray(Charsets.UTF_8)

    private companion object {
        const val CurrentPrefix = "egsec:v2:aes-gcm:"
        const val Transformation = "AES/GCM/NoPadding"
        const val IvBytes = 12
        const val TagBits = 128
        const val MinimumCiphertextBytes = TagBits / 8
        const val MaxPlaintextBytes = 16 * 1024
        const val MaxEnvelopeBytes = IvBytes + MinimumCiphertextBytes + MaxPlaintextBytes
        const val MaxEncodedEnvelopeChars = ((MaxEnvelopeBytes + 2) / 3) * 4
    }
}

class AndroidKeystoreModelSecretCodec : ModelSecretCodec {
    private val delegate = AesGcmModelSecretCodec(::getOrCreateKey)

    override fun protect(configId: String, plaintext: String): String {
        return retryOnceAfterModelSecretReset(
            operation = { delegate.protect(configId, plaintext) },
            shouldReset = { error -> error.hasPermanentKeyInvalidationCause() },
            reset = ::resetKey,
        )
    }
    override fun reveal(configId: String, stored: String): String = delegate.reveal(configId, stored)
    override fun isProtected(stored: String): Boolean = delegate.isProtected(stored)

    @Synchronized
    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(AndroidKeyStore).apply { load(null) }
        (keyStore.getKey(KeyAlias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, AndroidKeyStore).run {
            init(
                KeyGenParameterSpec.Builder(
                    KeyAlias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    @Synchronized
    private fun resetKey() {
        KeyStore.getInstance(AndroidKeyStore).apply {
            load(null)
            if (containsAlias(KeyAlias)) deleteEntry(KeyAlias)
        }
    }

    private fun Throwable.hasPermanentKeyInvalidationCause(): Boolean {
        var current: Throwable? = this
        while (current != null) {
            if (current is KeyPermanentlyInvalidatedException) return true
            current = current.cause
        }
        return false
    }

    private companion object {
        const val AndroidKeyStore = "AndroidKeyStore"
        const val KeyAlias = "eleckoi.model-api-keys.v1"
    }
}
