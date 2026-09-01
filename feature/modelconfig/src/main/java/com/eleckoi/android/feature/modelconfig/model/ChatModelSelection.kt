package com.eleckoi.android.feature.modelconfig.model

data class ModelParameters(
    val stream: Boolean = true,
    val temperature: Double = 0.7,
    val topP: Double = 1.0,
)

data class ChatModelSelection(
    val capability: String = "chat",
    val configId: String = "",
    val model: String = "",
    val parameters: ModelParameters = ModelParameters(),
)
