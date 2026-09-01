package com.eleckoi.android.foundation.storage.room

import androidx.room.Entity

@Entity(
    tableName = "model_configs",
    primaryKeys = ["id"],
)
data class ModelConfigEntity(
    val id: String,
    val name: String,
    val provider: String,
    val apiKey: String,
    val baseUrl: String,
    val proxyUrl: String,
    val model: String,
    val modelOptionsJson: String,
    /** JSON object of header name to value. Empty string means no custom headers. */
    val customHeadersJson: String = "",
    /**
     * Result of the last connection test's tool-calling probe. Null means never tested. Agent mode
     * is the point of this app, so a proxy that cannot do tool calls has to be knowable before the
     * user hits a confusing failure mid-conversation.
     */
    val supportsTools: Boolean? = null,
    /** Only used by non-chat capabilities such as NovelAI image generation. */
    val enabled: Boolean = false,
    val imageSettingsJson: String = "{}",
    /** Connection wire format. Repository creation supplies a provider-specific default. */
    val apiFormat: String = "responses",
)

@Entity(
    tableName = "model_config_meta",
    primaryKeys = ["id"],
)
data class ModelConfigMetaEntity(
    val id: String = "default",
    val activeConfigId: String,
)
