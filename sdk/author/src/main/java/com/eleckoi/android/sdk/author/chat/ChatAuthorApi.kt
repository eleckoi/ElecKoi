package com.eleckoi.android.sdk.author.chat

import com.eleckoi.android.sdk.author.AuthorApiCatalog
import com.eleckoi.android.sdk.author.AuthorApiRoute
import com.eleckoi.android.sdk.author.AuthorApiCallException
import com.eleckoi.android.sdk.author.AuthorApiErrorCode
import com.eleckoi.android.sdk.author.AuthorApiEnvironment
import com.eleckoi.android.sdk.author.AuthorModelParameters
import com.eleckoi.android.sdk.author.requireChatGateway
import com.eleckoi.android.sdk.author.requireMessageSendGateway
import com.eleckoi.android.sdk.author.toAuthorJson
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal object ChatAuthorApi {
    val routes = listOf(
        AuthorApiRoute(AuthorApiCatalog.require("chat.current")) { environment, _ ->
            val snapshot = environment.runtime.chatGateway?.snapshot()
            val session = snapshot?.draft?.session ?: environment.runtime.chatSession
            buildJsonObject {
                put("available", session != null)
                put("chat", session?.let {
                    buildJsonObject {
                        put("id", it.id)
                        put("title", it.title)
                        put("characterId", it.characterId)
                        put("characterName", it.characterName)
                        put("mode", it.characterMode)
                        put("messageCount", it.messages.size)
                        put("createdAt", it.createdAt)
                        put("updatedAt", it.updatedAt)
                        put("selectedConfigId", snapshot?.draft?.selectedConfigId.orEmpty())
                        put("selectedModel", snapshot?.draft?.selectedModel.orEmpty())
                        put("stream", snapshot?.draft?.modelParameters?.stream ?: true)
                        put("temperature", snapshot?.draft?.modelParameters?.temperature ?: 0.7)
                        put("topP", snapshot?.draft?.modelParameters?.topP ?: 1.0)
                    }
                } ?: JsonNull)
            }
        },
        AuthorApiRoute(AuthorApiCatalog.require("chat.list")) { environment, _ ->
            val gateway = environment.requireChatGateway()
            val characterId = environment.scopedCharacterId()
            buildJsonObject {
                put("items", buildJsonArray {
                    gateway.snapshot().sessions.filter { it.characterId == characterId }.forEach { item ->
                        add(buildJsonObject {
                            put("id", item.id)
                            put("title", item.title)
                            put("characterId", item.characterId)
                            put("characterName", item.characterName)
                            put("characterAvatar", item.characterAvatar)
                            put("summary", item.summary)
                            put("updatedAt", item.updatedAt)
                            put("messageCount", item.messageCount)
                        })
                    }
                })
            }
        },
        AuthorApiRoute(AuthorApiCatalog.require("chat.getGenerationState")) { environment, _ ->
            val snapshot = environment.requireChatGateway().snapshot()
            buildJsonObject {
                put("isGenerating", snapshot.isGenerating)
                put("errorMessage", snapshot.errorMessage)
                put("sessionId", snapshot.draft?.session?.id.orEmpty())
                put("pendingMessageId", snapshot.draft?.session?.messages?.lastOrNull { it.pending }?.id.orEmpty())
            }
        },
        AuthorApiRoute(AuthorApiCatalog.require("chat.getModels")) { environment, _ ->
            val snapshot = environment.requireChatGateway().snapshot()
            buildJsonObject {
            put("selectedConfigId", snapshot.draft?.selectedConfigId.orEmpty())
                put("selectedModel", snapshot.draft?.selectedModel.orEmpty())
                put("items", buildJsonArray {
                    snapshot.modelConfigs.forEach { config ->
                        add(buildJsonObject {
                            put("id", config.id)
                            put("name", config.name)
                            put("provider", config.provider)
                            put("defaultModel", config.model)
                            put("models", buildJsonArray {
                                config.modelOptions.forEach { option ->
                                    add(buildJsonObject {
                                        put("id", option.id)
                                        put("name", option.name)
                                    })
                                }
                            })
                        })
                    }
                })
            }
        },
        AuthorApiRoute(AuthorApiCatalog.require("chat.send")) { environment, params ->
            val text = (params["text"] as? JsonPrimitive)?.content.orEmpty()
            environment.requireMessageSendGateway().send(text).toAuthorJson()
        },
        AuthorApiRoute(AuthorApiCatalog.require("chat.stopGeneration")) { environment, _ ->
            environment.requireChatGateway().stopGeneration().toAuthorJson()
        },
        AuthorApiRoute(AuthorApiCatalog.require("chat.create")) { environment, params ->
            val characterId = environment.scopedCharacterId()
            val requestedCharacterId = (params["characterId"] as? JsonPrimitive)?.content.orEmpty()
            if (requestedCharacterId.isNotBlank() && requestedCharacterId != characterId) {
                throw AuthorApiCallException(
                    AuthorApiErrorCode.PermissionDenied,
                    "作者前端只能为当前角色创建对话",
                )
            }
            val characterMode = (params["characterMode"] as? JsonPrimitive)?.content
            environment.requireChatGateway().createNewChat(characterId, characterMode).toAuthorJson()
        },
        AuthorApiRoute(AuthorApiCatalog.require("chat.open")) { environment, params ->
            val sessionId = (params["sessionId"] as? JsonPrimitive)?.content.orEmpty()
            val gateway = environment.requireChatGateway()
            environment.requireSessionInScope(gateway.snapshot(), sessionId)
            gateway.openChat(sessionId).toAuthorJson()
        },
        AuthorApiRoute(AuthorApiCatalog.require("chat.delete")) { environment, params ->
            val sessionId = (params["sessionId"] as? JsonPrimitive)?.content.orEmpty()
            val gateway = environment.requireChatGateway()
            environment.requireSessionInScope(gateway.snapshot(), sessionId)
            gateway.deleteChat(sessionId).toAuthorJson()
        },
        AuthorApiRoute(AuthorApiCatalog.require("chat.selectModel")) { environment, params ->
            val configId = (params["configId"] as? JsonPrimitive)?.content.orEmpty()
            val model = (params["model"] as? JsonPrimitive)?.content.orEmpty()
            val stream = (params["stream"] as? JsonPrimitive)?.content?.toBooleanStrictOrNull() ?: true
            val temperature = (params["temperature"] as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.7
            val topP = (params["topP"] as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 1.0
            environment.requireChatGateway().selectModel(
                configId = configId,
                model = model,
                parameters = AuthorModelParameters(
                    stream = stream,
                    temperature = temperature.coerceIn(0.0, 2.0),
                    topP = topP.coerceIn(0.0, 1.0),
                ),
            ).toAuthorJson()
        },
    )
}

private fun AuthorApiEnvironment.scopedCharacterId(): String {
    return runtime.chatGateway?.snapshot()?.draft?.session?.characterId
        ?.takeIf { it.isNotBlank() }
        ?: runtime.characterId
}

private fun AuthorApiEnvironment.requireSessionInScope(
    snapshot: com.eleckoi.android.sdk.author.AuthorChatSnapshot,
    sessionId: String,
) {
    val characterId = snapshot.sessions.firstOrNull { it.id == sessionId }?.characterId
        ?: snapshot.draft?.session?.takeIf { it.id == sessionId }?.characterId
    if (characterId == null || characterId != scopedCharacterId()) {
        throw AuthorApiCallException(
            AuthorApiErrorCode.PermissionDenied,
            "作者前端只能操作当前角色的对话",
        )
    }
}
