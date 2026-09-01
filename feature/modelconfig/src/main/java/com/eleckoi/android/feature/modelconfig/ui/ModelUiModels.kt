package com.eleckoi.android.feature.modelconfig.ui

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.engine.generation.model.NovelAiDefaultBaseUrl
import com.eleckoi.android.engine.generation.model.NovelAiDefaultModel
import com.eleckoi.android.engine.generation.model.NovelAiImageProviderId
import kotlinx.serialization.Serializable

enum class ModelLibrarySectionId { General, Image, Voice }

data class ModelProviderMeta(
    val id: String,
    val label: String,
    val badge: String,
    val summary: String,
    val initials: String,
    val baseUrlPlaceholder: String,
    val apiKeyPlaceholder: String,
    val modelPlaceholder: String,
    val section: ModelLibrarySectionId = ModelLibrarySectionId.General,
)

internal data class ModelLibrarySectionMeta(
    val id: ModelLibrarySectionId,
    val title: String,
)

internal val modelLibrarySections = listOf(
    ModelLibrarySectionMeta(ModelLibrarySectionId.General, "通用大模型"),
    ModelLibrarySectionMeta(ModelLibrarySectionId.Image, "绘画模型"),
    ModelLibrarySectionMeta(ModelLibrarySectionId.Voice, "语音模型"),
)

val modelProviders = listOf(
    ModelProviderMeta(
        id = "custom",
        label = "自定义模型提供商",
        badge = "自定义",
        summary = "添加并配置自定义模型提供商。",
        initials = "API",
        baseUrlPlaceholder = "填写模型提供商 API 地址",
        apiKeyPlaceholder = "填写 API Key",
        modelPlaceholder = "填写模型名称",
    ),
    ModelProviderMeta("deepseek", "DeepSeek", "原厂 API", "默认使用 Responses API；deepseek-v4-flash-vision-exp 支持图片输入与 Files API。", "DS", "默认：https://api.deepseek.com", "填写 DeepSeek API Key", "例如：deepseek-v4-flash、deepseek-v4-pro、deepseek-v4-flash-vision-exp"),
    ModelProviderMeta(
        id = NovelAiImageProviderId,
        label = "NovelAI",
        badge = "绘画 API",
        summary = "开启后，每轮角色回复完成时自动生成一张剧情插图。",
        initials = "NAI",
        baseUrlPlaceholder = "默认：$NovelAiDefaultBaseUrl",
        apiKeyPlaceholder = "填写 NovelAI Persistent API Token",
        modelPlaceholder = "默认：$NovelAiDefaultModel",
        section = ModelLibrarySectionId.Image,
    ),
)

fun normalizeProviderId(providerId: String): String {
    return providerId.trim().lowercase().ifBlank { "custom" }
}

fun providerMeta(providerId: String): ModelProviderMeta {
    val id = normalizeProviderId(providerId)
    return modelProviders.firstOrNull { it.id == id } ?: modelProviders.first()
}

internal fun filterModelProvidersForSearch(
    providers: List<ModelProviderMeta>,
    keyword: String,
): List<ModelProviderMeta> {
    val key = keyword.trim().lowercase()
    if (key.isBlank()) return providers
    return providers.filter { provider ->
        listOf(provider.label, provider.summary, provider.badge, provider.id)
            .joinToString(" ")
            .lowercase()
            .contains(key)
    }
}

internal fun filterModelPickerItems(
    items: List<ModelOption>,
    keyword: String,
): List<ModelOption> {
    val key = keyword.trim()
    if (key.isBlank()) return items
    return items.filter { item ->
        item.id.contains(key, ignoreCase = true) || item.name.contains(key, ignoreCase = true)
    }
}

fun configVersionName(config: ModelConfig): String {
    return config.name.trim().ifBlank { "未命名" }
}

fun hasModelConfigContent(config: ModelConfig): Boolean {
    return listOf(config.name, config.baseUrl, config.apiKey, config.proxyUrl, config.model)
        .any { it.trim().isNotEmpty() } || config.modelOptions.isNotEmpty() || config.apiKeyNeedsReentry
}

internal fun countConfigs(configs: List<ModelConfig>, providerId: String): Int {
    val provider = normalizeProviderId(providerId)
    return configs.count { normalizeProviderId(it.provider) == provider && hasModelConfigContent(it) }
}

internal fun firstConfigForProvider(
    configs: List<ModelConfig>,
    providerId: String,
    preferredConfigId: String = "",
): ModelConfig? {
    val provider = normalizeProviderId(providerId)
    val providerConfigs = configs.filter { normalizeProviderId(it.provider) == provider }
    return providerConfigs.firstOrNull { it.id == preferredConfigId }
        ?: providerConfigs.firstOrNull()
}

internal fun latestConfigSummary(
    configs: List<ModelConfig>,
    provider: ModelProviderMeta,
    preferredConfigId: String = "",
): String {
    val first = firstConfigForProvider(configs, provider.id, preferredConfigId)
        ?.takeIf(::hasModelConfigContent)
        ?: configs.firstOrNull {
            normalizeProviderId(it.provider) == provider.id && hasModelConfigContent(it)
        }
        ?: return provider.summary
    return listOf(configVersionName(first), first.model).filter { it.isNotBlank() }.joinToString(" · ")
        .ifBlank { provider.summary }
}

fun modelOptionsKey(config: ModelConfig): String {
    return listOf(
        config.id,
        normalizeProviderId(config.provider),
        config.apiFormat.storageValue,
        config.baseUrl,
        config.apiKey,
    )
        .joinToString("|") { it.trim() }
}

@Serializable
data class ModelTarget(
    val providerId: String,
    val configId: String = "",
    val draftId: String = "",
)

internal fun ModelConfig.toDraftModelTarget(): ModelTarget {
    return ModelTarget(providerId = provider, draftId = id)
}
