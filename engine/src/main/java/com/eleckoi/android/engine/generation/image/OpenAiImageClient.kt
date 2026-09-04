package com.eleckoi.android.engine.generation.image

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.OpenAiDefaultBaseUrl
import com.eleckoi.android.engine.generation.model.OpenAiDefaultImageModel
import com.eleckoi.android.engine.generation.model.imageSizeError
import com.eleckoi.android.engine.generation.model.isOpenAiImageConfig
import org.json.JSONObject

class OpenAiImageClient : ImageGenerationClient {
    override suspend fun generate(
        config: ModelConfig,
        scenePrompt: SceneImagePrompt,
        onRequestCapture: ((ImageGenerationRequestCapture) -> Unit)?,
    ): ByteArray {
        val payload = openAiImageRequestJson(config, scenePrompt)
        onRequestCapture?.invoke(
            ImageGenerationRequestCapture(
                label = "OpenAI 生图",
                logicalRequestBody = payload.toString(),
                providerRequestBody = payload.toString(),
            ),
        )
        return requestGeneratedImage(
            config = config,
            endpoint = openAiImageEndpoint(config.baseUrl),
            payload = payload,
            decode = ::decodeOpenAiImage,
        )
    }
}

internal fun openAiImageEndpoint(baseUrl: String): String {
    val base = baseUrl.trim().ifBlank { OpenAiDefaultBaseUrl }.trimEnd('/')
    val uri = validatedImageEndpoint(base)
    return when {
        uri.path.endsWith("/images/generations") -> base
        uri.path.isNullOrEmpty() -> "$base/v1/images/generations"
        else -> "$base/images/generations"
    }
}

internal fun openAiImageRequestJson(config: ModelConfig, scene: SceneImagePrompt): JSONObject {
    require(config.isOpenAiImageConfig()) { "当前配置不是 OpenAI 绘画模型" }
    val settings = config.imageSettings
    imageSizeError(config.provider, settings.width, settings.height)?.let {
        throw IllegalArgumentException(it)
    }
    require(scene.prompt.isNotBlank()) { "图片提示词不能为空" }
    val prompt = buildString {
        append(scene.prompt.trim())
        if (scene.negativePrompt.isNotBlank()) append("\n\nAvoid: ${scene.negativePrompt.trim()}")
    }
    return JSONObject()
        .put("model", config.model.trim().ifBlank { OpenAiDefaultImageModel })
        .put("prompt", prompt)
        .put("n", 1)
        .put("size", "${settings.width}x${settings.height}")
        .put("quality", settings.quality.apiValue)
        .put("background", settings.background.apiValue)
        .put("output_format", "png")
}

internal fun decodeOpenAiImage(body: String): ByteArray {
    val encoded = JSONObject(body).optJSONArray("data")?.optJSONObject(0)?.optString("b64_json").orEmpty()
    return decodeGeneratedPng(encoded, "OpenAI")
}
