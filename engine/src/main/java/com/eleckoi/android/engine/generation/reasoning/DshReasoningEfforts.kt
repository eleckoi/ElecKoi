package com.eleckoi.android.engine.generation.reasoning

import com.eleckoi.android.engine.generation.model.ModelApiFormat
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.engine.generation.model.effectiveApiFormat
import com.eleckoi.android.engine.generation.model.usesDeepSeekThinkingContract

/** A DSH-native reasoning level. pi-ai owns its final provider-protocol representation. */
data class DshReasoningEffortOption(
    val id: String,
    val label: String,
)

object DshReasoningEfforts {
    private val common = listOf(
        DshReasoningEffortOption("off", "关闭"),
        DshReasoningEffortOption("minimal", "最低"),
        DshReasoningEffortOption("low", "低"),
        DshReasoningEffortOption("medium", "中"),
        DshReasoningEffortOption("high", "高"),
    )
    private val extended = common + listOf(
        DshReasoningEffortOption("xhigh", "极高"),
        DshReasoningEffortOption("max", "最高"),
    )
    private val deepSeek = listOf(
        DshReasoningEffortOption("off", "关闭"),
        DshReasoningEffortOption("low", "低"),
        DshReasoningEffortOption("high", "高"),
        DshReasoningEffortOption("max", "最高"),
    )

    fun forModel(config: ModelConfig, option: ModelOption): List<DshReasoningEffortOption> {
        if (option.id.isBlank()) return emptyList()
        val selectedConfig = config.copy(model = option.id)
        val format = selectedConfig.effectiveApiFormat()
        if (
            selectedConfig.usesDeepSeekThinkingContract() &&
            format in setOf(ModelApiFormat.Responses, ModelApiFormat.ChatCompletions)
        ) {
            return deepSeek
        }
        return when (format) {
            ModelApiFormat.Responses,
            ModelApiFormat.ChatCompletions,
            -> extended
            ModelApiFormat.AnthropicMessages,
            ModelApiFormat.GoogleGemini,
            -> common
        }
    }

    fun selected(config: ModelConfig): String? {
        val option = config.modelOptions.firstOrNull { it.id == config.model.trim() } ?: return null
        val selected = option.reasoningEffort?.trim()?.lowercase()?.takeIf(String::isNotBlank)
            ?: return null
        return selected.takeIf { candidate -> forModel(config, option).any { it.id == candidate } }
    }

    fun label(id: String?): String = when (id?.trim()?.lowercase()) {
        null, "" -> "上游默认"
        else -> (extended.firstOrNull { it.id == id.trim().lowercase() }?.label ?: "上游默认")
    }
}
