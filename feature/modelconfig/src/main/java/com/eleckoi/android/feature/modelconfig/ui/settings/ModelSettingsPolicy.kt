package com.eleckoi.android.feature.modelconfig.ui.settings

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption

internal fun modelPickerItems(config: ModelConfig): List<ModelOption> {
    val current = config.model.trim()
    val options = config.modelOptions
    return if (current.isNotBlank() && options.none { it.id == current }) {
        listOf(ModelOption(current, current)) + options
    } else {
        options
    }
}

internal fun ModelConfig.updateActiveModelOption(
    transform: (ModelOption) -> ModelOption,
): ModelConfig {
    val selected = model.trim()
    if (selected.isBlank()) return this
    val existing = modelOptions.firstOrNull { it.id == selected } ?: ModelOption(selected, selected)
    val updated = transform(existing)
    return copy(
        modelOptions = if (modelOptions.any { it.id == selected }) {
            modelOptions.map { if (it.id == selected) updated else it }
        } else {
            modelOptions + updated
        },
    )
}

internal fun String.optionalTokenCount(): Int? = filter(Char::isDigit).take(7).toIntOrNull()

private fun ModelOption?.hasInvalidAgentLimits(): Boolean {
    val option = this ?: return false
    val contextWindowTokens = option.contextWindowTokens
    val contextInvalid = contextWindowTokens?.let {
        it !in ModelOption.MinContextWindowTokens..ModelOption.MaxContextWindowTokens
    } ?: false
    val compactInvalid = option.autoCompactTokenLimit?.let {
        it !in ModelOption.MinAutoCompactTokenLimit..ModelOption.MaxContextWindowTokens ||
            (contextWindowTokens != null && it > contextWindowTokens)
    } ?: false
    val outputInvalid = option.maxOutputTokens?.let {
        it !in ModelOption.MinMaxOutputTokens..ModelOption.MaxContextWindowTokens ||
            (contextWindowTokens != null && it > contextWindowTokens)
    } ?: false
    return contextInvalid || compactInvalid || outputInvalid
}

internal fun modelLimitHint(option: ModelOption?): String {
    return if (option.hasInvalidAgentLimits()) {
        "上下文需为 4096–4000000；压缩阈值和单次输出不能超过上下文。"
    } else {
        ""
    }
}
