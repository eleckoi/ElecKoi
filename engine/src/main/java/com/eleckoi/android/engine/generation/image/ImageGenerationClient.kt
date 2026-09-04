package com.eleckoi.android.engine.generation.image

import com.eleckoi.android.engine.generation.model.ImageGenerationProvider
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.imageGenerationProvider

fun interface ImageGenerationClient {
    suspend fun generate(
        config: ModelConfig,
        scenePrompt: SceneImagePrompt,
        onRequestCapture: ((ImageGenerationRequestCapture) -> Unit)?,
    ): ByteArray
}

class ProviderImageGenerationClient(
    private val novelAi: ImageGenerationClient = NovelAiImageClient(),
    private val openAi: ImageGenerationClient = OpenAiImageClient(),
) : ImageGenerationClient {
    override suspend fun generate(
        config: ModelConfig,
        scenePrompt: SceneImagePrompt,
        onRequestCapture: ((ImageGenerationRequestCapture) -> Unit)?,
    ): ByteArray = when (config.imageGenerationProvider()) {
        ImageGenerationProvider.NovelAi -> novelAi
        ImageGenerationProvider.OpenAi -> openAi
        null -> throw IllegalArgumentException("当前配置不是绘画模型")
    }.generate(config, scenePrompt, onRequestCapture)
}
