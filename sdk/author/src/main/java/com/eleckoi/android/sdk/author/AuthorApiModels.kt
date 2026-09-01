package com.eleckoi.android.sdk.author

import android.content.Context
import com.eleckoi.android.engine.creator.capability.CreatorCapabilityDefinition
import com.eleckoi.android.engine.creator.capability.CreatorCapabilityException
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.story.variables.model.VariableConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

const val AuthorApiVersion: String = "0.2.0-preview.3"
const val AuthorApiStage: String = "preview"

@Serializable
data class AuthorApiRequest(
    val id: String,
    val apiVersion: String,
    val method: String,
    val params: JsonObject = buildJsonObject {},
)

@Serializable
data class AuthorApiDefinition(
    val method: String,
    val namespace: String,
    val description: String,
    val permission: String,
    val stage: String = AuthorApiStage,
    val since: String = AuthorApiVersion,
) : CreatorCapabilityDefinition {
    override val capabilityId: String
        get() = method
}

data class AuthorApiEnvironment(
    val appContext: Context,
    val runtime: AuthorApiRuntimeState,
    val permissions: Set<AuthorApiPermission> = AuthorApiPermission.previewReadOnly,
) {
    companion object {
        fun forChat(
            appContext: Context,
            runtime: AuthorApiRuntimeState,
            gateway: AuthorChatGateway,
            permissions: Set<AuthorApiPermission> = AuthorApiPermission.previewReadOnly,
        ): AuthorApiEnvironment {
            runtime.chatGateway = gateway
            return AuthorApiEnvironment(
                appContext = appContext,
                runtime = runtime,
                permissions = permissions,
            )
        }

        /**
         * A rich message is authored content, so it receives only a message-scoped read grant.
         * Keeping this construction here prevents individual message components from widening it.
         */
        fun forInlineMessage(
            appContext: Context,
            message: AuthorMessageSnapshot,
        ): AuthorApiEnvironment {
            val runtime = AuthorApiRuntimeState(
                surface = "inline_message",
                characterId = "",
                characterName = "",
            ).apply {
                currentMessage = message
                variableStateJson = message.variableStateJson
            }
            return AuthorApiEnvironment(
                appContext = appContext,
                runtime = runtime,
                permissions = AuthorApiPermission.inlineMessageReadOnly,
            )
        }
    }
}

class AuthorApiRuntimeState(
    val surface: String,
    val characterId: String,
    val characterName: String,
) {
    @Volatile
    var variableConfig: VariableConfig? = null

    @Volatile
    var variableStateJson: String? = null

    @Volatile
    var chatSession: AuthorChatSessionSnapshot? = null

    /** The only message visible to an inline rich-message frontend. */
    @Volatile
    var currentMessage: AuthorMessageSnapshot? = null

    @Volatile
    var settingLibrary: AuthorSettingLibrarySnapshot? = null

    @Volatile
    var inputText: String? = null

    @Volatile
    var chatGateway: AuthorChatGateway? = null
}

data class AuthorChatSnapshot(
    val draft: AuthorChatDraftSnapshot?,
    val sessions: List<AuthorChatListItemSnapshot>,
    val input: String,
    val isGenerating: Boolean,
    val errorMessage: String,
    val modelConfigs: List<ModelConfig>,
)

/** Stable SDK-owned projections; public API code never reaches into feature implementation models. */
data class AuthorChatDraftSnapshot(
    val session: AuthorChatSessionSnapshot,
    val selectedConfigId: String,
    val selectedModel: String,
    val modelParameters: AuthorModelParameters,
)

data class AuthorChatSessionSnapshot(
    val id: String,
    val title: String,
    val characterId: String,
    val characterName: String,
    val characterMode: String,
    val messages: List<AuthorMessageSnapshot>,
    val createdAt: String,
    val updatedAt: String,
    val variableStateJson: String,
)

data class AuthorChatListItemSnapshot(
    val id: String,
    val title: String,
    val characterId: String,
    val characterName: String,
    val characterAvatar: String,
    val summary: String,
    val updatedAt: String,
    val messageCount: Int,
)

data class AuthorMessageSnapshot(
    val id: String,
    val role: String,
    val content: String,
    val reasoningContent: String,
    val provider: String,
    val model: String,
    val createdAt: String,
    val pending: Boolean,
    val variableStateJson: String,
    val toolCalls: List<AuthorToolCallSnapshot> = emptyList(),
)

data class AuthorToolCallSnapshot(
    val callId: String,
    val name: String,
    val arguments: String,
    val result: String,
    val state: String,
    val rollbackOnAbort: Boolean,
)

data class AuthorModelParameters(
    val stream: Boolean = true,
    val temperature: Double = 0.7,
    val topP: Double = 1.0,
)

data class AuthorSettingLibrarySnapshot(
    val characterId: String,
    val name: String,
    val entryCount: Int,
    val groupCount: Int,
    val versionCount: Int,
    val activeVersionId: String,
)

data class AuthorCommandResult(
    val accepted: Boolean,
    val message: String = "",
)

data class AuthorApiEvent(
    val name: String,
    val payload: JsonElement = JsonNull,
)

interface AuthorChatGateway {
    val authorEvents: Flow<AuthorApiEvent>

    fun snapshot(): AuthorChatSnapshot
    fun setInput(value: String): AuthorCommandResult
    fun send(text: String): AuthorCommandResult
    fun stopGeneration(): AuthorCommandResult
    fun regenerate(messageId: String): AuthorCommandResult
    fun editAndRegenerate(messageId: String, text: String): AuthorCommandResult
    fun createNewChat(characterId: String, characterMode: String?): AuthorCommandResult
    fun openChat(sessionId: String): AuthorCommandResult
    fun deleteChat(sessionId: String): AuthorCommandResult
    fun selectModel(configId: String, model: String, parameters: AuthorModelParameters): AuthorCommandResult
    suspend fun replaceVariableState(stateJson: String): AuthorCommandResult
    suspend fun resetVariableState(): AuthorCommandResult
}

internal fun AuthorApiEnvironment.requireChatGateway(): AuthorChatGateway {
    return runtime.chatGateway ?: throw AuthorApiCallException(
        AuthorApiErrorCode.ContextUnavailable,
        "当前 WebView 没有连接聊天运行环境",
    )
}

internal fun AuthorCommandResult.toAuthorJson(): JsonObject {
    if (!accepted) {
        throw AuthorApiCallException(
            AuthorApiErrorCode.CommandRejected,
            message.ifBlank { "原生聊天核心拒绝了这次操作" },
        )
    }
    return buildJsonObject {
        put("accepted", true)
        put("message", message)
    }
}

internal class AuthorApiCallException(
    code: String,
    message: String,
) : CreatorCapabilityException(code, message)

internal object AuthorApiErrorCode {
    const val InvalidRequest = "INVALID_REQUEST"
    const val UnsupportedVersion = "UNSUPPORTED_VERSION"
    const val MethodNotFound = "METHOD_NOT_FOUND"
    const val PermissionDenied = "PERMISSION_DENIED"
    const val InvalidParams = "INVALID_PARAMS"
    const val ContextUnavailable = "CONTEXT_UNAVAILABLE"
    const val CommandRejected = "COMMAND_REJECTED"
    const val InternalError = "INTERNAL_ERROR"
}
