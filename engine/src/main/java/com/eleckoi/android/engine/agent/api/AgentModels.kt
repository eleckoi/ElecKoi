package com.eleckoi.android.engine.agent.api

/**
 * Provider-neutral conversation model for agents that use OpenAI-style tool calls.
 *
 * This deliberately does not reuse the ordinary chat message model: an assistant
 * tool-call message and its matching tool result must be retained exactly between
 * model turns, while user-facing chat messages currently do not carry that protocol
 * data.
 */
enum class AgentMessageRole(val apiValue: String) {
    System("system"),
    User("user"),
    Assistant("assistant"),
    Tool("tool"),
}

data class AgentToolCall(
    val id: String,
    val name: String,
    /** Raw JSON object text supplied by the model. Parsing belongs to the executor. */
    val argumentsJson: String,
)

data class AgentMessage(
    val role: AgentMessageRole,
    val content: String? = null,
    val toolCalls: List<AgentToolCall> = emptyList(),
    val toolCallId: String? = null,
) {
    companion object {
        fun system(content: String) = AgentMessage(AgentMessageRole.System, content = content)

        fun user(content: String) = AgentMessage(AgentMessageRole.User, content = content)

        fun assistant(content: String?, toolCalls: List<AgentToolCall> = emptyList()) = AgentMessage(
            role = AgentMessageRole.Assistant,
            content = content,
            toolCalls = toolCalls,
        )

        fun tool(callId: String, content: String) = AgentMessage(
            role = AgentMessageRole.Tool,
            content = content,
            toolCallId = callId,
        )
    }
}

data class AgentAssistantTurn(
    val message: AgentMessage,
    val finishReason: String,
    val providerModel: String,
    val reasoningContent: String = "",
)

enum class AgentErrorCode {
    InvalidConfiguration,
    InvalidEndpoint,
    NetworkError,
    HttpError,
    ToolsUnsupported,
    ProtocolError,
    Cancelled,
}

class AgentException(
    val code: AgentErrorCode,
    override val message: String,
    val httpStatus: Int? = null,
    cause: Throwable? = null,
) : RuntimeException(message, cause)
