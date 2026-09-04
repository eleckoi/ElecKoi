package com.eleckoi.android.engine.generation.image

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.NovelAiDefaultBaseUrl
import com.eleckoi.android.engine.generation.model.NovelAiDefaultModel
import com.eleckoi.android.engine.generation.model.NovelAiSamplerCatalog
import kotlin.random.Random
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

class NovelAiImageClient : ImageGenerationClient {
    override suspend fun generate(
        config: ModelConfig,
        scenePrompt: SceneImagePrompt,
        onRequestCapture: ((ImageGenerationRequestCapture) -> Unit)?,
    ): ByteArray {
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
        onRequestCapture?.invoke(
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
        val base = config.baseUrl.trim().ifBlank { NovelAiDefaultBaseUrl }.trimEnd('/')
        val endpoint = if (base.endsWith("/ai/generate-image", ignoreCase = true)) base
            else "$base/ai/generate-image"
        return generationLock.withLock {
            requestGeneratedImage(config, endpoint, payload, ::decodeNovelAiImage)
        }
    }

    private companion object {
        val generationLock = Mutex()
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
            JSONObject().put("caption", caption).put("use_coords", false).put("use_order", true),
        )
        .put(
            "v4_negative_prompt",
            JSONObject().put("caption", negativeCaption).put("use_coords", false).put("use_order", true),
        )
    return JSONObject()
        .put("action", "generate")
        .put("input", prompt)
        .put("model", model.ifBlank { NovelAiDefaultModel })
        .put("parameters", parameters)
}

internal fun decodeNovelAiImage(body: String): ByteArray {
    val encoded = JSONObject(body)
        .optJSONArray("images")
        ?.optJSONObject(0)
        ?.optString("image")
        .orEmpty()
    return decodeGeneratedPng(encoded, "NovelAI")
}
