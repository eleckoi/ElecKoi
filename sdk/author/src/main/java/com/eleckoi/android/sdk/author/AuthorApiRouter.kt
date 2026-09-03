package com.eleckoi.android.sdk.author

import com.eleckoi.android.foundation.serialization.ElecKoiJson
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.filter

class AuthorApiRouter(
    private val environment: AuthorApiEnvironment,
) {
    private val registry = AuthorCapabilityRegistry.Default
    private val executor = AuthorCapabilityExecutor(environment, registry)

    fun eventFlow(): Flow<AuthorApiEvent> {
        if (AuthorApiPermission.EventsRead !in environment.permissions) return emptyFlow()
        return environment.runtime.chatGateway?.authorEvents
            ?.filter { event -> AuthorApiEventAccess.canReceive(event.name, environment.permissions) }
            ?: emptyFlow()
    }

    suspend fun route(rawRequest: String): String {
        var requestId = ""
        return try {
            val request = ElecKoiJson.decodeFromString<AuthorApiRequest>(rawRequest)
            requestId = request.id
            require(request.id.isNotBlank()) {
                throw AuthorApiCallException(AuthorApiErrorCode.InvalidRequest, "请求 id 不能为空")
            }
            if (request.apiVersion != AuthorApiVersion) {
                throw AuthorApiCallException(
                    AuthorApiErrorCode.UnsupportedVersion,
                    "不支持的 API 版本：${request.apiVersion}",
                )
            }
            successResponse(request.id, executor.invoke(request.method, request.params))
        } catch (error: AuthorApiCallException) {
            errorResponse(requestId, error.code, error.message)
        } catch (_: SerializationException) {
            errorResponse(requestId, AuthorApiErrorCode.InvalidRequest, "请求不是有效的作者 API JSON")
        } catch (_: IllegalArgumentException) {
            errorResponse(requestId, AuthorApiErrorCode.InvalidRequest, "请求格式不正确")
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            errorResponse(requestId, AuthorApiErrorCode.InternalError, "原生 API 调用失败")
        }
    }

    private fun successResponse(id: String, result: JsonElement): String {
        return ElecKoiJson.encodeToString(
            buildJsonObject {
                put("id", id)
                put("ok", true)
                put("result", result)
            },
        )
    }

    private fun errorResponse(id: String, code: String, message: String): String {
        return ElecKoiJson.encodeToString(
            buildJsonObject {
                put("id", id)
                put("ok", false)
                put("error", buildJsonObject {
                    put("code", code)
                    put("message", message)
                })
            },
        )
    }
}

/**
 * Events are another read surface, not a permission bypass around the request router.
 * Unknown event names deliberately fail closed until their payload contract is classified.
 */
internal object AuthorApiEventAccess {
    private val requiredDataPermission = mapOf(
        "context.changed" to AuthorApiPermission.ContextRead,
        "variables.changed" to AuthorApiPermission.VariablesRead,
        "opening.changed" to AuthorApiPermission.OpeningsRead,
        "messages.changed" to AuthorApiPermission.MessagesRead,
        "message.delta" to AuthorApiPermission.MessagesRead,
        "chat.changed" to AuthorApiPermission.ChatRead,
        "generation.started" to AuthorApiPermission.ChatRead,
        "generation.completed" to AuthorApiPermission.ChatRead,
        "generation.stopped" to AuthorApiPermission.ChatRead,
        "generation.failed" to AuthorApiPermission.ChatRead,
        "model.changed" to AuthorApiPermission.ChatRead,
        "input.changed" to AuthorApiPermission.InputRead,
    )

    val knownEventNames: Set<String> = requiredDataPermission.keys

    fun canReceive(name: String, permissions: Set<AuthorApiPermission>): Boolean {
        if (AuthorApiPermission.EventsRead !in permissions) return false
        val dataPermission = requiredDataPermission[name] ?: return false
        return dataPermission in permissions
    }
}
