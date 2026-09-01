package com.eleckoi.android.engine.agent.remotedsh

import java.io.IOException
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

internal class RemoteDshApiClient(
    private val baseUrl: String,
    private val http: OkHttpClient,
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun call(method: String, payload: JsonObject): JsonElement {
        val rpcId = "eleckoi-${UUID.randomUUID()}"
        val body = buildJsonObject {
            put("type", "client-request")
            put("method", method)
            put("rpcId", rpcId)
            put("payload", payload)
        }
        val request = Request.Builder()
            .url("$baseUrl/api/$method")
            .post(body.toString().toRequestBody(JsonMediaType))
            .build()
        val document = http.executeJson(request, json)
        val responseRpcId = document["rpcId"]?.jsonPrimitive?.content
        check(responseRpcId == rpcId) { "DSH 返回了不匹配的 RPC 响应" }
        val result = document["result"]?.jsonObject ?: error("DSH RPC 响应缺少 result")
        val ok = result["ok"]?.jsonPrimitive?.content?.toBooleanStrictOrNull() == true
        if (!ok) {
            val remoteError = result["error"]?.jsonObject
            val message = remoteError?.get("message")?.jsonPrimitive?.content
                ?: "DSH 拒绝了 $method"
            error(message)
        }
        return result["value"] ?: buildJsonObject { }
    }

    suspend fun respond(rpcId: String, value: JsonObject) {
        val body = buildJsonObject {
            put("type", "client-response")
            put("rpcId", rpcId)
            put("result", buildJsonObject {
                put("ok", true)
                put("value", value)
            })
        }
        val request = Request.Builder()
            .url("$baseUrl/api/respond")
            .post(body.toString().toRequestBody(JsonMediaType))
            .build()
        http.executeJson(request, json)
    }

    fun openMux(
        onEnvelope: (rpcId: String, payload: JsonObject) -> Unit,
        onFailure: (Throwable) -> Unit,
    ): WebSocket {
        val request = Request.Builder()
            .url(baseUrl.replaceFirst("http://", "ws://") + "/api/events.mux")
            .build()
        return http.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching {
                    val document = json.parseToJsonElement(text).jsonObject
                    val rpcId = document["rpcId"]?.jsonPrimitive?.content
                        ?: error("DSH 事件缺少 rpcId")
                    val payload = document["payload"]?.jsonObject
                        ?: error("DSH 事件缺少 payload")
                    onEnvelope(rpcId, payload)
                }.onFailure(onFailure)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onFailure(t)
            }
        })
    }

    private suspend fun OkHttpClient.executeJson(request: Request, json: Json): JsonObject =
        suspendCancellableCoroutine { continuation ->
            val call = newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        if (!response.isSuccessful) {
                            if (continuation.isActive) {
                                continuation.resumeWithException(
                                    IOException("DSH HTTP ${response.code}"),
                                )
                            }
                            return
                        }
                        runCatching {
                            json.parseToJsonElement(
                                response.body?.string() ?: error("DSH 返回了空响应"),
                            ).jsonObject
                        }.onSuccess { document ->
                            if (continuation.isActive) continuation.resume(document)
                        }.onFailure { error ->
                            if (continuation.isActive) continuation.resumeWithException(error)
                        }
                    }
                }
            })
        }

    private companion object {
        val JsonMediaType = "application/json; charset=utf-8".toMediaType()
    }
}
