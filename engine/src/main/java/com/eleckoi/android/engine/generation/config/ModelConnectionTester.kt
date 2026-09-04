package com.eleckoi.android.engine.generation.config

import com.eleckoi.android.engine.generation.image.ImageGenerationClient
import com.eleckoi.android.engine.generation.image.ProviderImageGenerationClient
import com.eleckoi.android.engine.generation.image.SceneImagePrompt
import com.eleckoi.android.engine.generation.model.ImageQuality
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.isImageGenerationConfig
import com.eleckoi.android.foundation.storage.ElecKoiDataException

internal suspend fun testModelConnection(
    config: ModelConfig,
    verifyAgentCapabilities: suspend (ModelConfig) -> Unit,
    imageClient: ImageGenerationClient = ProviderImageGenerationClient(),
) {
    val target = config.copy(
        model = config.model.trim().ifBlank { config.modelOptions.firstOrNull()?.id.orEmpty().trim() },
    )
    if (target.apiKey.isBlank()) throw ElecKoiDataException("缺少 API Key")
    if (target.model.isBlank()) {
        val action = if (target.isImageGenerationConfig()) "测试生图" else "测试 Agent 工具连接"
        throw ElecKoiDataException("请先选择模型，再$action")
    }
    if (target.isImageGenerationConfig()) {
        imageClient.generate(
            target.copy(imageSettings = target.imageSettings.copy(quality = ImageQuality.Low)),
            SceneImagePrompt("A simple blue circle on a white background.", ""),
            null,
        )
    } else {
        verifyAgentCapabilities(target)
    }
}
