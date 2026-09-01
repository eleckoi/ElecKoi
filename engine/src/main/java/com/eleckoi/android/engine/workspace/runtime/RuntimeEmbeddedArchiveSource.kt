package com.eleckoi.android.engine.workspace.runtime

import android.content.Context
import android.content.res.AssetManager
import java.io.InputStream
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext

/** Reads immutable, APK-signed runtime payloads without copying another archive into app data. */
internal class RuntimeEmbeddedArchiveSource(context: Context) {
    private val assets = context.applicationContext.assets

    suspend fun verify(
        archive: RuntimeArchiveSpec,
        onProgress: (verifiedBytes: Long, totalBytes: Long?) -> Unit = { _, _ -> },
    ): Long = withContext(Dispatchers.IO) {
        val assetPath = requireNotNull(archive.assetPath) { "运行时目录没有声明内置资源" }
        val expectedLength = runCatching {
            assets.openFd(assetPath).use { descriptor -> descriptor.length }
        }.getOrNull()?.takeIf { it >= 0L }
        expectedLength?.let { length ->
            require(length <= archive.archiveBytesLimit) { "内置运行时资源超过大小上限" }
        }

        val digest = MessageDigest.getInstance("SHA-256")
        var verifiedBytes = 0L
        assets.open(assetPath, AssetManager.ACCESS_STREAMING).buffered().use { input ->
            val buffer = ByteArray(64 * 1024)
            onProgress(0L, expectedLength)
            while (true) {
                coroutineContext.ensureActive()
                val count = input.read(buffer)
                if (count < 0) break
                verifiedBytes += count
                require(verifiedBytes <= archive.archiveBytesLimit) { "内置运行时资源超过大小上限" }
                digest.update(buffer, 0, count)
                onProgress(verifiedBytes, expectedLength)
            }
        }
        expectedLength?.let { length ->
            require(verifiedBytes == length) { "内置运行时资源长度不匹配" }
        }
        val actualHash = digest.digest().joinToString("") { byte ->
            (byte.toInt() and 0xff).toString(16).padStart(2, '0')
        }
        require(actualHash == archive.sha256) { "内置运行时资源 SHA-256 校验失败" }
        verifiedBytes
    }

    fun open(archive: RuntimeArchiveSpec): InputStream {
        val assetPath = requireNotNull(archive.assetPath) { "运行时目录没有声明内置资源" }
        return assets.open(assetPath, AssetManager.ACCESS_STREAMING)
    }
}
