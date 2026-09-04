package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.feature.modelconfig.model.ChatModelSelection
import com.eleckoi.android.feature.modelconfig.model.ModelParameters
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
internal data class ChatModelSelectionJson(
    val capability: String = "",
    @SerialName("config_id")
    val configId: String = "",
    val model: String = "",
    val parameters: ModelParametersJson = ModelParametersJson(),
) {
    fun toDomain(key: String): ChatModelSelection {
        return ChatModelSelection(
            capability = capability.ifBlank { key },
            configId = configId,
            model = model,
            parameters = parameters.toDomain(),
        )
    }

    companion object {
        fun fromDomain(selection: ChatModelSelection): ChatModelSelectionJson {
            return ChatModelSelectionJson(
                capability = selection.capability,
                configId = selection.configId,
                model = selection.model,
                parameters = ModelParametersJson.fromDomain(selection.parameters),
            )
        }
    }
}

@Serializable
internal data class ModelParametersJson(
    val stream: Boolean = true,
    val temperature: Double = 1.0,
    @SerialName("top_p")
    val topP: Double = 1.0,
) {
    fun toDomain(): ModelParameters {
        return ModelParameters(
            stream = stream,
            temperature = temperature,
            topP = topP,
        )
    }

    companion object {
        fun fromDomain(parameters: ModelParameters): ModelParametersJson {
            return ModelParametersJson(
                stream = parameters.stream,
                temperature = parameters.temperature,
                topP = parameters.topP,
            )
        }
    }
}
