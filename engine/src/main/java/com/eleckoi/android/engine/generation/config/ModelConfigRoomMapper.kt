package com.eleckoi.android.engine.generation.config

import com.eleckoi.android.foundation.storage.room.ModelConfigEntity
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.engine.generation.model.ModelApiFormat
import com.eleckoi.android.engine.generation.model.ImageGenerationSettings
import com.eleckoi.android.engine.generation.model.DefaultNovelAiPromptCompilerInstruction
import com.eleckoi.android.engine.generation.model.MaxStoryImagesPerTurn
import com.eleckoi.android.engine.generation.model.NovelAiSamplerCatalog
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.encodeToString

internal fun ModelConfig.toEntity(secretCodec: ModelSecretCodec): ModelConfigEntity {
    val storedApiKey = when {
        apiKey.isNotBlank() -> secretCodec.protect(id, apiKey)
        apiKeyNeedsReentry -> ModelSecretUnavailableMarker
        else -> ""
    }
    return ModelConfigEntity(
        id = id,
        name = name,
        provider = provider,
        apiKey = storedApiKey,
        baseUrl = baseUrl,
        proxyUrl = proxyUrl,
        model = model,
        modelOptionsJson = modelOptions.toModelOptionsJson(),
        customHeadersJson = customHeaders.toHeadersJson(),
        supportsTools = supportsTools,
        enabled = enabled,
        imageSettingsJson = imageSettings.toJson(),
        apiFormat = apiFormat.storageValue,
    )
}

internal fun ModelConfigEntity.toModelConfig(secretCodec: ModelSecretCodec): ModelConfig {
    val revealedKey = try {
        RevealedModelSecret(
            value = secretCodec.reveal(id, apiKey),
            needsReentry = false,
        )
    } catch (_: Exception) {
        RevealedModelSecret(
            value = "",
            needsReentry = apiKey.isNotBlank(),
        )
    }
    return ModelConfig(
        id = id,
        name = name,
        provider = provider,
        apiKey = revealedKey.value,
        baseUrl = baseUrl,
        proxyUrl = proxyUrl,
        model = model,
        modelOptions = optionsFromJson(modelOptionsJson),
        apiKeyNeedsReentry = revealedKey.needsReentry,
        customHeaders = headersFromJson(customHeadersJson),
        supportsTools = supportsTools,
        enabled = enabled,
        imageSettings = imageSettingsFromJson(imageSettingsJson),
        apiFormat = ModelApiFormat.fromStorageValue(apiFormat),
    )
}

private data class RevealedModelSecret(
    val value: String,
    val needsReentry: Boolean,
)

@Serializable
private data class ModelOptionJson(
    val id: String = "",
    val name: String = "",
    val contextWindowTokens: Int? = null,
    val autoCompactTokenLimit: Int? = null,
    val maxOutputTokens: Int? = null,
    val reasoningEffort: String? = null,
    val apiFormat: String? = null,
    val supportsImageInput: Boolean = false,
)

@Serializable
private data class ImageGenerationSettingsJson(
    val width: Int = 832,
    val height: Int = 1216,
    val steps: Int = 28,
    val scale: Double = 5.0,
    val sampler: String = NovelAiSamplerCatalog.DefaultApiValue,
    val automaticImageCount: Boolean = false,
    val fixedImageCount: Int = 1,
    val automaticImageMin: Int = 1,
    val automaticImageMax: Int = 6,
    val promptCompilerInstruction: String = "",
    val promptPrefix: String = "",
    val negativePrompt: String = "",
) {
    fun toDomain(): ImageGenerationSettings = ImageGenerationSettings(
        width = width.coerceIn(512, 2048),
        height = height.coerceIn(512, 2048),
        steps = steps.coerceIn(1, 50),
        scale = scale.coerceIn(0.1, 10.0),
        sampler = NovelAiSamplerCatalog.normalizeApiValue(sampler),
        automaticImageCount = automaticImageCount,
        fixedImageCount = fixedImageCount.coerceIn(1, MaxStoryImagesPerTurn),
        automaticImageMin = automaticImageMin.coerceIn(1, MaxStoryImagesPerTurn),
        automaticImageMax = automaticImageMax.coerceIn(1, MaxStoryImagesPerTurn),
        promptCompilerInstruction = promptCompilerInstruction
            .trim()
            .ifBlank { DefaultNovelAiPromptCompilerInstruction },
        promptPrefix = promptPrefix.trim().take(4_000),
        negativePrompt = negativePrompt.trim().take(2_000),
    )

    companion object {
        fun fromDomain(settings: ImageGenerationSettings): ImageGenerationSettingsJson =
            ImageGenerationSettingsJson(
                width = settings.width,
                height = settings.height,
                steps = settings.steps,
                scale = settings.scale,
                sampler = NovelAiSamplerCatalog.normalizeApiValue(settings.sampler),
                automaticImageCount = settings.automaticImageCount,
                fixedImageCount = settings.fixedImageCount,
                automaticImageMin = settings.automaticImageMin,
                automaticImageMax = settings.automaticImageMax,
                promptCompilerInstruction = settings.promptCompilerInstruction,
                promptPrefix = settings.promptPrefix,
                negativePrompt = settings.negativePrompt,
            )
    }
}

internal fun imageSettingsFromJson(value: String): ImageGenerationSettings = runCatching {
    ElecKoiJson.decodeFromString(ImageGenerationSettingsJson.serializer(), value.ifBlank { "{}" })
        .toDomain()
}.getOrDefault(ImageGenerationSettings())

internal fun ImageGenerationSettings.toJson(): String = ElecKoiJson.encodeToString(
    ImageGenerationSettingsJson.serializer(),
    ImageGenerationSettingsJson.fromDomain(this),
)

internal fun optionsFromJson(value: String): List<ModelOption> {
    return runCatching {
        ElecKoiJson.decodeFromString(
            ListSerializer(ModelOptionJson.serializer()),
            value.ifBlank { "[]" },
        ).mapNotNull { item ->
            val id = item.id.ifBlank { item.name }.trim()
            if (id.isBlank()) {
                null
            } else {
                ModelOption(
                    id = id,
                    name = item.name.ifBlank { id },
                    contextWindowTokens = item.contextWindowTokens,
                    autoCompactTokenLimit = item.autoCompactTokenLimit,
                    maxOutputTokens = item.maxOutputTokens,
                    reasoningEffort = item.reasoningEffort?.trim()?.lowercase()?.takeIf(String::isNotBlank),
                    apiFormatOverride = item.apiFormat
                        ?.trim()
                        ?.takeIf(String::isNotEmpty)
                        ?.let(ModelApiFormat::fromStorageValue),
                    supportsImageInput = item.supportsImageInput,
                )
            }
        }
    }.getOrDefault(emptyList())
}

// Header names are restricted to what HTTP actually permits in a field name, and blank entries are
// dropped, so a half-finished row in the editor can never produce a request the client rejects.
private val HeaderNamePattern = Regex("^[A-Za-z0-9!#$%&'*+._`|~^-]+$")

fun isValidHeaderName(name: String): Boolean = HeaderNamePattern.matches(name.trim())

private fun headersFromJson(value: String): Map<String, String> {
    if (value.isBlank()) return emptyMap()
    return runCatching {
        ElecKoiJson.decodeFromString(
            MapSerializer(String.serializer(), String.serializer()),
            value,
        ).filterKeys { isValidHeaderName(it) }
    }.getOrDefault(emptyMap())
}

private fun Map<String, String>.toHeadersJson(): String {
    val sanitized = entries
        .mapNotNull { (name, value) ->
            val trimmed = name.trim()
            if (isValidHeaderName(trimmed)) trimmed to value.trim() else null
        }
        .toMap()
    if (sanitized.isEmpty()) return ""
    return ElecKoiJson.encodeToString(
        MapSerializer(String.serializer(), String.serializer()),
        sanitized,
    )
}

internal fun List<ModelOption>.toModelOptionsJson(): String {
    return ElecKoiJson.encodeToString(
        map { option ->
            ModelOptionJson(
                id = option.id,
                name = option.name,
                contextWindowTokens = option.contextWindowTokens,
                autoCompactTokenLimit = option.autoCompactTokenLimit,
                maxOutputTokens = option.maxOutputTokens,
                reasoningEffort = option.reasoningEffort,
                apiFormat = option.apiFormatOverride?.storageValue,
                supportsImageInput = option.supportsImageInput,
            )
        },
    )
}
