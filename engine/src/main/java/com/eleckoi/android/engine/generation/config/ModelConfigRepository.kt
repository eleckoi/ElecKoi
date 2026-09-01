package com.eleckoi.android.engine.generation.config

import com.eleckoi.android.engine.agent.adapter.AgentModelCapabilityValidator
import com.eleckoi.android.foundation.storage.newId
import com.eleckoi.android.engine.generation.provider.OpenAiCompatibleClient
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import com.eleckoi.android.foundation.storage.room.ElecKoiDatabase
import com.eleckoi.android.foundation.storage.room.ModelConfigMetaEntity
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.isChatModelConfig
import com.eleckoi.android.engine.generation.model.isImageGenerationConfig
import com.eleckoi.android.engine.generation.model.DeepSeekOfficialVisionModel
import com.eleckoi.android.engine.generation.model.defaultApiFormatForProvider
import com.eleckoi.android.engine.generation.model.isOfficialDeepSeekEndpoint
import com.eleckoi.android.engine.generation.model.withProviderDefaults
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.Dispatchers
import org.json.JSONArray
import org.json.JSONObject

data class ModelConfigCollection(
    val activeConfigId: String,
    val activeConfig: ModelConfig,
    val configs: List<ModelConfig>,
) {
    val chatConfigs: List<ModelConfig>
        get() = configs.filter(ModelConfig::isChatModelConfig)

    val activeImageConfig: ModelConfig?
        get() = configs.firstOrNull { it.isImageGenerationConfig() && it.enabled }
}

class ModelConfigRepository internal constructor(
    private val database: ElecKoiDatabase,
    private val provider: OpenAiCompatibleClient = OpenAiCompatibleClient(),
    private val secretCodec: ModelSecretCodec,
    private val agentCapabilityValidator: AgentModelCapabilityValidator = AgentModelCapabilityValidator(),
) {
    constructor(
        database: ElecKoiDatabase,
        provider: OpenAiCompatibleClient = OpenAiCompatibleClient(),
        secretCodec: ModelSecretCodec,
    ) : this(
        database = database,
        provider = provider,
        secretCodec = secretCodec,
        agentCapabilityValidator = AgentModelCapabilityValidator(),
    )

    private val dao = database.modelConfigDao()

    val modelConfigCollectionFlow: Flow<ModelConfigCollection> = combine(
        dao.configsFlow(),
        dao.metaFlow(),
    ) { configs, meta ->
        collectionFromRoom(configs.map { it.toModelConfig(secretCodec) }, meta)
    }.flowOn(Dispatchers.IO)

    fun loadModelConfigCollection(): ModelConfigCollection {
        val entities = dao.configs()
        val configs = entities.map { it.toModelConfig(secretCodec) }
        return collectionFromRoom(configs, dao.meta())
    }

    /** Portable model endpoints without secrets; credentials are deliberately re-entered. */
    fun exportBackupJson(): String {
        val collection = loadModelConfigCollection()
        return JSONObject()
            .put("format", "eleckoi.model-configs")
            .put("version", 1)
            .put("active_config_id", collection.activeConfigId)
            .put("configs", JSONArray(collection.configs.map { config ->
                JSONObject()
                    .put("id", config.id)
                    .put("name", config.name)
                    .put("provider", config.provider)
                    .put("base_url", config.baseUrl.takeIf(::isSafeBackupUrl).orEmpty())
                    .put("proxy_url", config.proxyUrl.takeIf(::isSafeBackupUrl).orEmpty())
                    .put("model", config.model)
                    .put("model_options", JSONArray(config.modelOptions.toModelOptionsJson()))
                    .put("custom_headers", JSONObject(config.customHeaders.filterKeys(::isSafeBackupHeader)))
                    .put("supports_tools", config.supportsTools ?: JSONObject.NULL)
                    .put("enabled", config.enabled)
                    .put("image_settings", JSONObject(config.imageSettings.toJson()))
                    .put("api_format", config.apiFormat.storageValue)
                    .put("had_api_key", config.apiKey.isNotBlank() || config.apiKeyNeedsReentry)
            }))
            .toString(2)
    }

    /** Restores endpoint metadata and marks previously configured secrets for re-entry. */
    fun restoreBackupJson(json: String) {
        val root = runCatching { JSONObject(json) }
            .getOrElse { throw ElecKoiDataException("模型配置备份已损坏", it) }
        require(root.optString("format") == "eleckoi.model-configs") { "模型配置备份格式不正确" }
        require(root.optInt("version", -1) == 1) { "不支持的模型配置备份版本" }
        val activeId = root.optString("active_config_id")
        val values = root.optJSONArray("configs") ?: JSONArray()
        val configs = (0 until values.length()).mapNotNull { index ->
            val item = values.optJSONObject(index) ?: return@mapNotNull null
            val id = item.optString("id").trim()
            if (id.isBlank()) return@mapNotNull null
            val options = item.optJSONArray("model_options")
                ?.let { optionsFromJson(it.toString()) }
                .orEmpty()
            val provider = item.optString("provider")
            ModelConfig(
                id = id,
                name = item.optString("name"),
                provider = provider,
                apiKeyNeedsReentry = item.optBoolean("had_api_key"),
                baseUrl = item.optString("base_url").takeIf(::isSafeBackupUrl).orEmpty(),
                proxyUrl = item.optString("proxy_url").takeIf(::isSafeBackupUrl).orEmpty(),
                model = item.optString("model"),
                modelOptions = options,
                customHeaders = item.optJSONObject("custom_headers")?.let { headers ->
                    headers.keys().asSequence()
                        .filter(::isSafeBackupHeader)
                        .associateWith { headers.optString(it) }
                }.orEmpty(),
                supportsTools = if (item.isNull("supports_tools")) null else item.optBoolean("supports_tools"),
                enabled = item.optBoolean("enabled"),
                imageSettings = imageSettingsFromJson(item.optJSONObject("image_settings")?.toString().orEmpty()),
                // A clean-install backup is imported into the current baseline. Do not carry the
                // previous app's generic Chat default forward; provider defaults are authoritative
                // until the user explicitly changes the format in this installation.
                apiFormat = defaultApiFormatForProvider(provider),
            )
        }
        configs.sortedBy { it.id == activeId }.forEach(::saveModelConfig)
    }

    fun blankConfig(providerId: String, id: String = ""): ModelConfig {
        val provider = normalizeProvider(providerId)
        return ModelConfig(
            id = id.ifBlank { "config-${newId(12)}" },
            provider = provider,
            apiFormat = defaultApiFormatForProvider(provider),
        ).withProviderDefaults()
    }

    fun saveModelConfig(config: ModelConfig): ModelConfig {
        val normalized = normalizeConfig(config)
        database.runInTransaction {
            dao.upsertConfig(normalized.toEntity(secretCodec))
            if (normalized.isImageGenerationConfig()) {
                if (normalized.enabled) {
                    dao.disableOtherProviderConfigs(normalized.provider, normalized.id)
                }
            } else {
                dao.upsertMeta(ModelConfigMetaEntity(activeConfigId = normalized.id))
            }
        }
        return normalized
    }

    fun deleteModelConfig(configId: String): ModelConfigCollection {
        val collection = loadModelConfigCollection()
        val target = collection.configs.firstOrNull { it.id == configId }
            ?: return collection
        val sameProvider = collection.configs.filter { it.provider == target.provider }
        if (sameProvider.size <= 1) {
            val cleared = blankConfig(target.provider, target.id)
            saveModelConfig(cleared)
            return loadModelConfigCollection()
        }
        if (target.isImageGenerationConfig()) {
            dao.deleteConfig(configId)
            return loadModelConfigCollection()
        }
        val remaining = collection.configs.filterNot { it.id == target.id }
        val activeId = collection.activeConfigId.takeIf { id -> remaining.any { it.id == id } }
            ?: remaining.firstOrNull { it.provider == target.provider }?.id
            ?: remaining.firstOrNull()?.id
            ?: ""
        database.runInTransaction {
            dao.deleteConfig(configId)
            dao.upsertMeta(ModelConfigMetaEntity(activeConfigId = activeId))
        }
        return loadModelConfigCollection()
    }

    fun fetchModelOptions(config: ModelConfig): ModelConfig {
        val previousById = config.modelOptions.associateBy { it.id }
        val models = provider.fetchModels(config).map { fetched ->
            val previous = previousById[fetched.id]
            fetched.copy(
                contextWindowTokens = previous?.contextWindowTokens ?: fetched.contextWindowTokens,
                autoCompactTokenLimit = previous?.autoCompactTokenLimit ?: fetched.autoCompactTokenLimit,
                maxOutputTokens = previous?.maxOutputTokens ?: fetched.maxOutputTokens,
                reasoningEffort = previous?.reasoningEffort,
                apiFormatOverride = previous?.apiFormatOverride,
                supportsImageInput = previous?.supportsImageInput == true ||
                    (config.isOfficialDeepSeekEndpoint() &&
                        fetched.id.equals(DeepSeekOfficialVisionModel, ignoreCase = true)),
            )
        }
        val saved = saveModelConfig(config.copy(modelOptions = models, model = config.model.ifBlank { models.firstOrNull()?.id.orEmpty() }))
        return saved
    }

    suspend fun testConnection(config: ModelConfig) {
        val target = config.copy(
            model = config.model.trim().ifBlank { config.modelOptions.firstOrNull()?.id.orEmpty() },
        )
        if (target.apiKey.isBlank()) throw ElecKoiDataException("缺少 API Key")
        if (target.model.isBlank()) {
            throw ElecKoiDataException("请先选择模型，再测试 Agent 工具连接")
        }
        agentCapabilityValidator.verify(target)
    }

    private fun collectionFromRoom(configs: List<ModelConfig>, meta: ModelConfigMetaEntity?): ModelConfigCollection {
        val cleanConfigs = configs.map(::normalizeConfig).filterNot { it.id.isBlank() }
        val chatConfigs = cleanConfigs.filter(ModelConfig::isChatModelConfig)
        val activeId = meta?.activeConfigId
            ?.takeIf { id -> chatConfigs.any { it.id == id } }
            ?: chatConfigs.firstOrNull()?.id
            ?: ""
        val active = chatConfigs.firstOrNull { it.id == activeId }
            ?: chatConfigs.firstOrNull()
            ?: ModelConfig()
        return ModelConfigCollection(activeId, active, cleanConfigs)
    }

    private fun normalizeConfig(config: ModelConfig): ModelConfig {
        val normalized = config.copy(
            id = config.id.trim().ifBlank { "config-${newId(12)}" },
            name = config.name.trim(),
            provider = normalizeProvider(config.provider),
            apiKeyNeedsReentry = config.apiKeyNeedsReentry && config.apiKey.isBlank(),
        ).withProviderDefaults()
        return normalized.copy(
            modelOptions = normalized.modelOptions.map { option ->
                option.copy(
                    supportsImageInput = option.supportsImageInput ||
                        (normalized.isOfficialDeepSeekEndpoint() &&
                            option.id.equals(DeepSeekOfficialVisionModel, ignoreCase = true)),
                )
            },
        )
    }

    private fun normalizeProvider(providerId: String): String {
        return providerId.trim().lowercase().ifBlank { "custom" }
    }

}

private fun isSafeBackupHeader(name: String): Boolean =
    !Regex("(?i)(authorization|api[-_]?key|token|secret|password)").containsMatchIn(name)

private fun isSafeBackupUrl(value: String): Boolean =
    value.isBlank() || runCatching { java.net.URI(value).userInfo == null }.getOrDefault(false)
