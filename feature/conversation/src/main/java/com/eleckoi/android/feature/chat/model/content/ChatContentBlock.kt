package com.eleckoi.android.feature.chat.model.content

sealed interface ChatContentBlock {
    val id: String

    data class Text(
        override val id: String,
        val markdown: String,
    ) : ChatContentBlock

    /** Invisible [[IMAGE:n]] markers resolved to one image or an adjacent-marker gallery. */
    data class ImagePlacement(
        override val id: String,
        val frameIndexes: List<Int>,
    ) : ChatContentBlock

    data class Reasoning(
        override val id: String,
        val content: String,
        val state: ReasoningState,
    ) : ChatContentBlock

    /** Parser-level tool markup; Agent runtime operations are rendered from ChatToolCallRecord. */
    data class ToolCall(
        override val id: String,
        val callId: String,
        val name: String,
        val arguments: String = "",
        val result: String = "",
        val state: ToolCallState,
    ) : ChatContentBlock

    data class Operation(
        override val id: String,
        val type: OperationType,
        val label: String,
        val detail: String = "",
        val status: OperationStatus,
    ) : ChatContentBlock
}

enum class OperationType {
    VariableSync,
    ContextProcessing,
    Other,
}

enum class OperationStatus {
    Running,
    Succeeded,
    Failed,
}
