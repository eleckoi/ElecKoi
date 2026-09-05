package com.eleckoi.android.feature.modelconfig.ui

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.engine.generation.model.NovelAiDefaultBaseUrl
import com.eleckoi.android.engine.generation.model.NovelAiDefaultModel
import com.eleckoi.android.engine.generation.model.NovelAiImageProviderId
import com.eleckoi.android.engine.generation.model.OpenAiDefaultBaseUrl
import com.eleckoi.android.engine.generation.model.OpenAiDefaultImageModel
import com.eleckoi.android.engine.generation.model.OpenAiImageProviderId
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
    ModelProviderMeta("deepseek", "DeepSeek", "官方 API", "官方 API", "DS", "默认：https://api.deepseek.com", "填写 DeepSeek API Key", "例如：deepseek-v4-flash、deepseek-v4-pro、deepseek-v4-flash-vision-exp"),
    ModelProviderMeta(
        id = "zhipu",
        label = "智谱开放平台",
        badge = "官方 API",
        summary = "智谱 AI 国内开放平台。",
        initials = "GLM",
        baseUrlPlaceholder = "默认：https://open.bigmodel.cn/api/paas/v4",
        apiKeyPlaceholder = "填写智谱 API Key",
        modelPlaceholder = "填写模型名称，例如 glm-4.5",
    ),
    ModelProviderMeta(
        id = "zai",
        label = "Z.ai",
        badge = "官方 API",
        summary = "智谱 AI 国际平台。",
        initials = "Z",
        baseUrlPlaceholder = "默认：https://api.z.ai/api/paas/v4",
        apiKeyPlaceholder = "填写 Z.ai API Key",
        modelPlaceholder = "填写模型名称，例如 glm-4.5",
    ),
    ModelProviderMeta(
        id = "moonshot",
        label = "月之暗面",
        badge = "官方 API",
        summary = "月之暗面 Kimi 开放平台。",
        initials = "K",
        baseUrlPlaceholder = "默认：https://api.moonshot.cn/v1",
        apiKeyPlaceholder = "填写月之暗面 API Key",
        modelPlaceholder = "填写模型名称，例如 kimi-k2.5",
    ),
    ModelProviderMeta(
        id = OpenAiImageProviderId,
        label = "OpenAI Images",
        badge = "绘画 API",
        summary = "GPT Image 2",
        initials = "OA",
        baseUrlPlaceholder = "默认：$OpenAiDefaultBaseUrl",
        apiKeyPlaceholder = "填写 OpenAI API Key",
        modelPlaceholder = "默认：$OpenAiDefaultImageModel",
        section = ModelLibrarySectionId.Image,
    ),
    ModelProviderMeta(
        id = NovelAiImageProviderId,
        label = "NovelAI",
        badge = "绘画 API",
        summary = "NovelAI 图片生成 API",
        initials = "NAI",
        baseUrlPlaceholder = "默认：$NovelAiDefaultBaseUrl",
        apiKeyPlaceholder = "填写 NovelAI Persistent API Token",
        modelPlaceholder = "默认：$NovelAiDefaultModel",
        section = ModelLibrarySectionId.Image,
    ),
)

private val alwaysVisibleGeneralProviderIds = setOf("custom", "deepseek")

internal fun isFixedModelProvider(providerId: String): Boolean =
    normalizeProviderId(providerId) in alwaysVisibleGeneralProviderIds

/** The library stays compact: fixed entries are always present; optional channels appear once saved. */
fun visibleModelProviders(configs: List<ModelConfig>): List<ModelProviderMeta> = modelProviders.filter { provider ->
    isFixedModelProvider(provider.id) ||
        configs.any { config ->
            normalizeProviderId(config.provider) == provider.id
        }
}

/** Deliberately excludes foreign-provider promotional entries. */
val addableModelProviders: List<ModelProviderMeta> = modelProviders.filter {
    it.id in setOf(
        "custom",
        "deepseek",
        "zhipu",
        "zai",
        "moonshot",
        OpenAiImageProviderId,
        NovelAiImageProviderId,
    )
}

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

internal fun modelNameError(
    items: List<ModelOption>,
    input: String,
): String? {
    val candidate = input.trim()
    return when {
        candidate.isBlank() -> "请填写模型名"
        candidate.any { it.isWhitespace() || it.isISOControl() } -> "模型名中不能包含空格或换行"
        items.any { it.id == candidate } -> "该模型已在列表中，请返回列表选择"
        else -> null
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
    return configs.count { normalizeProviderId(it.provider) == provider }
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
    if (normalizeProviderId(provider.id) == "deepseek") return "官方 API"
    val first = firstConfigForProvider(configs, provider.id, preferredConfigId) ?: return provider.summary
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
