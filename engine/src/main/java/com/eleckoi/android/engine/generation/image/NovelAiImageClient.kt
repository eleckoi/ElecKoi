package com.eleckoi.android.engine.generation.image

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.NovelAiDefaultBaseUrl
import com.eleckoi.android.engine.generation.model.NovelAiDefaultModel
import com.eleckoi.android.engine.generation.model.NovelAiSamplerCatalog
import com.eleckoi.android.engine.generation.provider.applyCustomHeaders
import com.eleckoi.android.foundation.network.SecureModelHttpClientFactory
import com.eleckoi.android.foundation.network.SensitiveTextSanitizer
import com.eleckoi.android.foundation.network.StrictProxyParser
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import java.io.InputStreamReader
import java.io.IOException
import java.net.Proxy
import java.net.URI
import java.util.Base64
import kotlin.random.Random
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject

class NovelAiImageClient {
    suspend fun generate(
        config: ModelConfig,
        scenePrompt: SceneImagePrompt,
        onRequestCapture: (ImageGenerationRequestCapture) -> Unit = {},
    ): ByteArray {
        val apiKey = config.apiKey.trim()
        if (apiKey.isBlank()) throw ElecKoiDataException("NovelAI 缺少 Persistent API Token")
        val target = requestTarget(config)
        val client = SecureModelHttpClientFactory.create(
            explicitProxy = target.proxy,
            connectTimeoutMillis = 15_000,
            readTimeoutMillis = 180_000,
        )
        val samplerApiValue = NovelAiSamplerCatalog.normalizeApiValue(config.imageSettings.sampler)
        val payload = novelAiRequestJson(
            model = config.model.trim().ifBlank { NovelAiDefaultModel },
            prompt = scenePrompt.prompt,
            negativePrompt = scenePrompt.negativePrompt,
            seed = Random.nextLong(1, UInt.MAX_VALUE.toLong()),
            width = config.imageSettings.width,
            height = config.imageSettings.height,
            steps = config.imageSettings.steps,
            scale = config.imageSettings.scale,
            sampler = samplerApiValue,
        )
        onRequestCapture(
            ImageGenerationRequestCapture(
                label = "NovelAI 生图",
                logicalRequestBody = JSONObject()
                    .put("kind", "novelai_roleplay_illustration")
                    .put("final_prompt", scenePrompt.prompt)
                    .put("final_negative_prompt", scenePrompt.negativePrompt)
                    .put("width", config.imageSettings.width)
                    .put("height", config.imageSettings.height)
                    .put("steps", config.imageSettings.steps)
                    .put("scale", config.imageSettings.scale)
                    .put("sampler", samplerApiValue)
                    .toString(),
                providerRequestBody = payload.toString(),
            ),
        )
        val request = Request.Builder()
            .url(target.uri.toString())
            .applyCustomHeaders(config)
            .header("Authorization", "Bearer $apiKey")
            .header("Accept", "application/json")
            .post(payload.toString().toRequestBody(JsonMediaType))
            .build()
        return suspendCancellableCoroutine { continuation ->
            val call = client.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) {
                        continuation.resumeWith(Result.failure(e))
                    }
                }

                override fun onResponse(call: Call, response: Response) {
                    val result = runCatching {
                        response.use {
                            val body = readLimitedBody(
                                response.body?.byteStream(),
                                error = !response.isSuccessful,
                            )
                            if (!response.isSuccessful) {
                                throw ElecKoiDataException(
                                    "NovelAI 生图 HTTP ${response.code}：" +
                                        SensitiveTextSanitizer.sanitize(body, apiKey),
                                )
                            }
                            decodeNovelAiImage(body)
                        }
                    }
                    if (continuation.isActive) continuation.resumeWith(result)
                }
            })
        }
    }

    private fun requestTarget(config: ModelConfig): RequestTarget {
        val base = config.baseUrl.trim().ifBlank { NovelAiDefaultBaseUrl }.trimEnd('/')
        val value = if (base.endsWith("/ai/generate-image", ignoreCase = true)) base
        else "$base/ai/generate-image"
        val uri = runCatching { URI(value) }.getOrElse {
            throw ElecKoiDataException("NovelAI 接口地址格式无效")
        }
        val scheme = uri.scheme?.lowercase()
        if (scheme !in setOf("http", "https") || uri.host.isNullOrBlank()) {
            throw ElecKoiDataException("NovelAI 接口地址无效")
        }
        val loopback = uri.host.equals("localhost", true) || uri.host == "127.0.0.1"
        if (scheme == "http" && !loopback) {
            throw ElecKoiDataException("远程 NovelAI 接口必须使用 HTTPS")
        }
        if (uri.userInfo != null || uri.query != null || uri.fragment != null) {
            throw ElecKoiDataException("NovelAI 接口地址不能包含账号、查询参数或片段")
        }
        val proxy = try {
            StrictProxyParser.parse(config.proxyUrl)
        } catch (error: IllegalArgumentException) {
            throw ElecKoiDataException("代理配置无效：${error.message.orEmpty()}")
        }
        if (scheme == "http" && proxy != null) {
            throw ElecKoiDataException("本机 HTTP NovelAI 接口不能经过代理")
        }
        return RequestTarget(uri, proxy)
    }

    private fun readLimitedBody(stream: java.io.InputStream?, error: Boolean): String {
        if (stream == null) return ""
        val maxChars = if (error) MaxErrorChars else MaxResponseChars
        val output = StringBuilder(minOf(maxChars, 16 * 1024))
        InputStreamReader(stream, Charsets.UTF_8).use { reader ->
            val buffer = CharArray(8 * 1024)
            while (true) {
                val count = reader.read(buffer)
                if (count < 0) break
                val remaining = maxChars - output.length
                if (count > remaining) {
                    if (!error) throw ElecKoiDataException("NovelAI 图片响应超过安全上限")
                    output.append(buffer, 0, remaining.coerceAtLeast(0))
                    output.append("\n…上游错误内容已截断")
                    break
                }
                output.append(buffer, 0, count)
            }
        }
        return output.toString()
    }

    private data class RequestTarget(val uri: URI, val proxy: Proxy?)

    private companion object {
        val JsonMediaType = "application/json; charset=utf-8".toMediaType()
        const val MaxResponseChars = 32 * 1024 * 1024
        const val MaxErrorChars = 64 * 1024
    }
}

internal fun novelAiRequestJson(
    model: String,
    prompt: String,
    negativePrompt: String,
    seed: Long,
    width: Int = 832,
    height: Int = 1216,
    steps: Int = 28,
    scale: Double = 5.0,
    sampler: String = NovelAiSamplerCatalog.DefaultApiValue,
): JSONObject {
    val caption = JSONObject()
        .put("base_caption", prompt)
        .put("char_captions", JSONArray())
    val negativeCaption = JSONObject()
        .put("base_caption", negativePrompt)
        .put("char_captions", JSONArray())
    val parameters = JSONObject()
        .put("params_version", 3)
        .put("width", width.coerceIn(512, 2048))
        .put("height", height.coerceIn(512, 2048))
        .put("scale", scale.coerceIn(0.1, 10.0))
        .put("sampler", NovelAiSamplerCatalog.normalizeApiValue(sampler))
        .put("steps", steps.coerceIn(1, 50))
        .put("n_samples", 1)
        .put("seed", seed)
        .put("negative_prompt", negativePrompt)
        .put("noise_schedule", "karras")
        .put("qualityToggle", true)
        .put("ucPreset", 0)
        .put("dynamic_thresholding", false)
        .put("cfg_rescale", 0.0)
        .put("image_format", "png")
        .put(
            "v4_prompt",
            JSONObject()
                .put("caption", caption)
                .put("use_coords", false)
                .put("use_order", true),
        )
        .put(
            "v4_negative_prompt",
            JSONObject()
                .put("caption", negativeCaption)
                .put("use_coords", false)
                .put("use_order", true),
        )
    return JSONObject()
        .put("action", "generate")
        .put("input", prompt)
        .put("model", model.ifBlank { NovelAiDefaultModel })
        .put("parameters", parameters)
}

internal fun decodeNovelAiImage(body: String): ByteArray {
    val encoded = runCatching {
        JSONObject(body).optJSONArray("images")?.optJSONObject(0)?.optString("image")
    }.getOrNull()?.trim().orEmpty()
    if (encoded.isBlank()) throw ElecKoiDataException("NovelAI 响应中没有图片")
    val payload = encoded.substringAfter("base64,", encoded)
    val bytes = runCatching { Base64.getMimeDecoder().decode(payload) }.getOrElse {
        throw ElecKoiDataException("NovelAI 返回了无效图片数据")
    }
    if (bytes.size !in 8..MaxImageBytes) throw ElecKoiDataException("NovelAI 图片大小异常")
    val png = bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() &&
        bytes[2] == 0x4E.toByte() && bytes[3] == 0x47.toByte()
    if (!png) throw ElecKoiDataException("NovelAI 返回的不是 PNG 图片")
    return bytes
}

private const val MaxImageBytes = 24 * 1024 * 1024
