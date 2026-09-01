package com.eleckoi.android.feature.conversation.timeline

data class AgentToolTimelinePresentation(
    val title: String,
    val target: String,
)

data class SettingEntryToolResult(
    val entryId: String,
    val groupPath: String,
    val title: String,
    val selectionHint: String,
    val readStrategy: String,
    val content: String,
    val truncated: Boolean,
    val autoIncluded: Boolean,
    val resolvedReferences: List<SettingReferenceToolResult>,
)

data class SettingReferenceToolResult(
    val title: String,
    val path: String,
)

data class VariableEntryToolResult(
    val path: String,
    val type: String,
    val defaultValue: String?,
    val currentValue: String?,
    val description: String,
    val updateRule: String,
)

data class AgentGlobToolResult(
    val scope: String,
    val pattern: String,
    val paths: List<String>,
    val requiredPaths: List<String>,
    val truncated: Boolean,
    val omitted: Int,
    val pathDetails: Map<String, AgentGlobPathDetail> = emptyMap(),
)

data class AgentGlobPathDetail(
    val readStrategy: String,
    val selectionHint: String,
)

enum class AgentPlanStepStatus {
    Pending,
    InProgress,
    Completed,
}

data class AgentPlanStepPresentation(
    val text: String,
    val status: AgentPlanStepStatus,
)

data class AgentPlanUpdatePresentation(
    val explanation: String,
    val steps: List<AgentPlanStepPresentation>,
)

data class SubagentToolPresentation(
    val description: String,
    val prompt: String,
    val background: Boolean,
)

data class CreatorGeneratedMediaResult(
    val assetId: String,
    val displayName: String,
    val width: Int,
    val height: Int,
)

