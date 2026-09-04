package com.eleckoi.android.engine.generation.image

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.imageGenerationProvider
import com.eleckoi.android.engine.generation.provider.applyCustomHeaders
import com.eleckoi.android.foundation.network.SecureModelHttpClientFactory
import com.eleckoi.android.foundation.network.SensitiveTextSanitizer
import com.eleckoi.android.foundation.network.StrictProxyParser
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.net.URI
import java.util.Base64
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject

internal suspend fun requestGeneratedImage(
    config: ModelConfig,
    endpoint: String,
    payload: JSONObject,
    decode: (String) -> ByteArray,
): ByteArray {
    val label = requireNotNull(config.imageGenerationProvider()).label
    val apiKey = config.apiKey.trim()
    if (apiKey.isBlank()) throw ElecKoiDataException("$label 缺少 API Key")
    val uri = validatedImageEndpoint(endpoint)
    val proxy = try {
        StrictProxyParser.parse(config.proxyUrl)
    } catch (error: IllegalArgumentException) {
        throw ElecKoiDataException("代理配置无效：${error.message.orEmpty()}", error)
    }
    if (uri.scheme.equals("http", ignoreCase = true) && proxy != null) {
        throw ElecKoiDataException("HTTP 图片接口不能经过代理，以免密钥被代理读取")
    }
    val client = SecureModelHttpClientFactory.create(
        explicitProxy = proxy,
        connectTimeoutMillis = 15_000,
        readTimeoutMillis = 180_000,
    )
    val request = Request.Builder()
        .url(uri.toString())
        .applyCustomHeaders(config)
        .header("Authorization", "Bearer $apiKey")
        .header("Accept", "application/json")
        .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
        .build()
    return suspendCancellableCoroutine { continuation ->
        val call = client.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isActive) continuation.resumeWith(Result.failure(e))
            }

            override fun onResponse(call: Call, response: Response) {
                val result = runCatching {
                    response.use {
                        val body = readImageResponseBody(response.body?.byteStream(), !response.isSuccessful)
                        if (!response.isSuccessful) {
                            throw ElecKoiDataException(
                                "$label 生图 HTTP ${response.code}：" +
                                    SensitiveTextSanitizer.sanitize(body, apiKey),
                            )
                        }
                        decode(body)
                    }
                }
                if (continuation.isActive) continuation.resumeWith(result)
            }
        })
    }
}

internal fun validatedImageEndpoint(endpoint: String): URI {
    val uri = runCatching { URI(endpoint) }.getOrElse {
        throw ElecKoiDataException("图片接口地址格式无效", it)
    }
    if (uri.scheme?.lowercase() !in setOf("http", "https") || uri.host.isNullOrBlank()) {
        throw ElecKoiDataException("图片接口地址无效")
    }
    if (uri.userInfo != null || uri.query != null || uri.fragment != null) {
        throw ElecKoiDataException("图片接口地址不能包含账号、查询参数或片段")
    }
    return uri
}

internal fun readImageResponseBody(stream: InputStream?, error: Boolean): String {
    if (stream == null) return ""
    val maxChars = if (error) 64 * 1024 else 32 * 1024 * 1024
    val output = StringBuilder(minOf(maxChars, 16 * 1024))
    InputStreamReader(stream, Charsets.UTF_8).use { reader ->
        val buffer = CharArray(8 * 1024)
        while (true) {
            val count = reader.read(buffer)
            if (count < 0) break
            val remaining = maxChars - output.length
            if (count > remaining) {
                if (!error) throw ElecKoiDataException("图片响应超过安全上限")
                output.append(buffer, 0, remaining.coerceAtLeast(0))
                output.append("\n…上游错误内容已截断")
                break
            }
            output.append(buffer, 0, count)
        }
    }
    return output.toString()
}

internal fun decodeGeneratedPng(encoded: String, label: String): ByteArray {
    if (encoded.isBlank()) throw ElecKoiDataException("$label 响应中没有图片")
    val payload = encoded.substringAfter("base64,", encoded).filterNot(Char::isWhitespace)
    val bytes = runCatching { Base64.getDecoder().decode(payload) }.getOrElse {
        throw ElecKoiDataException("$label 返回了无效图片数据", it)
    }
    if (bytes.size !in 8..(24 * 1024 * 1024)) throw ElecKoiDataException("$label 图片大小异常")
    val signature = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
    if (!bytes.copyOfRange(0, 8).contentEquals(signature)) {
        throw ElecKoiDataException("$label 返回的不是 PNG 图片")
    }
    return bytes
}
