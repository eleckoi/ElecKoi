package com.eleckoi.android.engine.agent.adapter

import com.eleckoi.android.foundation.serialization.ElecKoiJson
import com.eleckoi.android.foundation.network.BoundedTextLimitException
import com.eleckoi.android.foundation.network.BoundedUtf8LineReader
import com.eleckoi.android.engine.agent.api.AgentErrorCode
import com.eleckoi.android.engine.agent.api.AgentException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.Proxy
import java.net.URI
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

internal data class ResponsesAdapterCapability(
    val reasoningReplayObserved: Boolean,
)

/**
 * Runs the expensive, two-request Agent protocol probe only from model settings.
 * Normal Harness sessions trust the saved configuration and never invoke this validator.
 */
internal class AgentModelCapabilityValidator(
    private val capabilityProbe: ResponsesAdapterCapabilityProbe = ResponsesAdapterCapabilityProbe(),
) {
    suspend fun verify(config: com.eleckoi.android.engine.generation.model.ModelConfig): ResponsesAdapterCapability =
        coroutineScope {
            val adapter = LoopbackResponsesAdapterServer(
                modelConfig = config,
                scope = this,
                legacyResponsesProbeEnabled = true,
            )
            try {
                val endpoint = adapter.start()
                adapter.beginTurn()
                capabilityProbe.verify(endpoint, config.model.trim())
            } finally {
                withContext(NonCancellable) { adapter.stop() }
            }
        }
}

/** Exercises the local Responses bridge a Harness uses, including the tool-result round trip. */
internal class ResponsesAdapterCapabilityProbe(
    private val connectTimeoutMillis: Int = 10_000,
    private val readTimeoutMillis: Int = 90_000,
) {
    suspend fun verify(endpoint: ResponsesAdapterEndpoint, model: String): ResponsesAdapterCapability =
        runInterruptible(Dispatchers.IO) {
            val first = postWithTransientRetry(
                endpoint,
                buildJsonObject {
                    put("model", model)
                    put("instructions", "This is a protocol check. You must call the supplied capability tool exactly once.")
                    put("input", buildJsonArray {
                        add(message("user", "Call eleckoi_capability_probe with value ok."))
                    })
                    put("tools", buildJsonArray { add(probeTool()) })
                    put("stream", true)
                },
            )
            val failed = first.firstOrNull { it.type == "response.failed" }
            if (failed != null) protocolFailure(failed.errorMessage().ifBlank { "能力检测首轮失败" })
            requireCompleted(first, "工具调用首轮")
            val call = first.outputItems()
                .firstOrNull { it.string("type") == "function_call" }
                ?: toolsUnsupported("模型没有返回标准 tool_calls")
            if (call.string("name") != ProbeToolName) {
                toolsUnsupported("模型调用了错误工具：${call.string("name")}")
            }
            val callId = call.string("call_id").orEmpty().ifBlank {
                protocolFailure("工具调用缺少 call_id")
            }
            val arguments = call.string("arguments").orEmpty()
            val argumentValue = runCatching {
                ElecKoiJson.parseToJsonElement(arguments).jsonObject.string("value")
            }.getOrNull()
            if (argumentValue != "ok") toolsUnsupported("工具参数不是要求的 {\"value\":\"ok\"}")
            val reasoning = first.outputItems().firstOrNull { it.string("type") == "reasoning" }

            val secondInput = buildJsonArray {
                add(message("user", "Call eleckoi_capability_probe with value ok."))
                reasoning?.let(::add)
                add(call)
                add(buildJsonObject {
                    put("type", "function_call_output")
                    put("call_id", callId)
                    put("output", "{\"accepted\":true}")
                })
            }
            val second = postWithTransientRetry(
                endpoint,
                buildJsonObject {
                    put("model", model)
                    put("instructions", "Acknowledge the tool result with a short text response.")
                    put("input", secondInput)
                    put("stream", true)
                },
            )
            second.firstOrNull { it.type == "response.failed" }?.let {
                toolsUnsupported("接口不接受 assistant.tool_calls + role=tool 回传：${it.errorMessage()}")
            }
            requireCompleted(second, "工具结果回传轮")
            if (second.outputItems().any { it.string("type") == "function_call" }) {
                toolsUnsupported("tool_choice=none 后模型仍返回工具调用")
            }
            if (second.outputItems().none { it.string("type") == "message" }) {
                protocolFailure("工具结果回传轮没有 assistant 消息")
            }
            ResponsesAdapterCapability(reasoningReplayObserved = reasoning != null)
        }

    private fun postWithTransientRetry(
        endpoint: ResponsesAdapterEndpoint,
        body: JsonObject,
    ): List<ProbeEvent> {
        repeat(MaxTransientAttempts) { attempt ->
            try {
                return post(endpoint, body)
            } catch (error: AgentException) {
                val retryable = error.code == AgentErrorCode.NetworkError &&
                    (error.httpStatus == 400 || error.httpStatus?.let { it in 500..599 } == true)
                if (!retryable || attempt == MaxTransientAttempts - 1) throw error
                Thread.sleep(TransientRetryDelayMillis * (attempt + 1L))
            }
        }
        error("能力检测重试状态无效")
    }

    private fun post(endpoint: ResponsesAdapterEndpoint, body: JsonObject): List<ProbeEvent> {
        val url = URI("${endpoint.baseUrl}/responses").toURL()
        val connection = url.openConnection(Proxy.NO_PROXY) as HttpURLConnection
        try {
            connection.connectTimeout = connectTimeoutMillis
            connection.readTimeout = readTimeoutMillis
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Accept", "text/event-stream")
            val payload = body.toString().toByteArray(Charsets.UTF_8)
            connection.setFixedLengthStreamingMode(payload.size)
            connection.outputStream.use { it.write(payload) }
            val status = connection.responseCode
            if (status !in 200..299) {
                val detail = unwrapProviderError(readBounded(connection.errorStream, MaxErrorBytes))
                val message = "能力检测 HTTP $status：${detail.ifBlank { "上游未提供详情" }}"
                if (
                    status in 500..599 ||
                    detail.contains("upstream request failed", ignoreCase = true)
                ) {
                    transientUpstreamFailure(status, detail)
                }
                if (status == 400 || status == 422) toolsUnsupported(message) else protocolFailure(message)
            }
            return readSse(connection.inputStream)
        } finally {
            connection.disconnect()
        }
    }

    private fun readSse(input: InputStream): List<ProbeEvent> {
        val events = mutableListOf<ProbeEvent>()
        try {
            BoundedUtf8LineReader(input, MaxSseLineChars, MaxSseResponseChars).use { reader ->
            var type = ""
            val data = mutableListOf<String>()
            fun flush() {
                if (data.isEmpty()) return
                val payload = runCatching {
                    ElecKoiJson.parseToJsonElement(data.joinToString("\n")).jsonObject
                }.getOrElse { protocolFailure("Responses adapter 返回了无效 SSE JSON") }
                events += ProbeEvent(type.ifBlank { payload.string("type").orEmpty() }, payload)
                type = ""
                data.clear()
            }
            while (true) {
                val line = reader.readLine() ?: break
                when {
                    line.isEmpty() -> flush()
                    line.startsWith("event:") -> type = line.removePrefix("event:").trim()
                    line.startsWith("data:") -> data += line.removePrefix("data:").trimStart()
                }
            }
            flush()
            }
        } catch (error: BoundedTextLimitException) {
            protocolFailure(error.message ?: "Responses adapter SSE 超过安全上限")
        }
        return events
    }

    private fun requireCompleted(events: List<ProbeEvent>, stage: String) {
        if (events.none { it.type == "response.completed" }) {
            protocolFailure("$stage 未收到 response.completed")
        }
    }

    private fun List<ProbeEvent>.outputItems(): List<JsonObject> = mapNotNull { event ->
        if (event.type == "response.output_item.done") event.payload["item"] as? JsonObject else null
    }

    private fun ProbeEvent.errorMessage(): String {
        val response = payload["response"] as? JsonObject
        val error = response?.get("error") as? JsonObject
        return error?.string("message").orEmpty()
    }

    private fun message(role: String, text: String): JsonObject = buildJsonObject {
        put("type", "message")
        put("role", role)
        put("content", buildJsonArray {
            add(buildJsonObject {
                put("type", if (role == "assistant") "output_text" else "input_text")
                put("text", text)
            })
        })
    }

    private fun probeTool(): JsonObject = buildJsonObject {
        put("type", "function")
        put("name", ProbeToolName)
        put("description", "Return the exact protocol probe value.")
        put("parameters", buildJsonObject {
            put("type", "object")
            put("properties", buildJsonObject {
                put("value", buildJsonObject {
                    put("type", "string")
                    put("enum", buildJsonArray { add(JsonPrimitive("ok")) })
                })
            })
            put("required", buildJsonArray { add(JsonPrimitive("value")) })
            put("additionalProperties", false)
        })
    }

    private fun readBounded(stream: InputStream?, maxBytes: Int): String {
        if (stream == null) return ""
        return stream.use { input ->
            val bytes = ByteArray(maxBytes)
            var offset = 0
            while (offset < bytes.size) {
                val count = input.read(bytes, offset, bytes.size - offset)
                if (count < 0) break
                offset += count
            }
            bytes.copyOf(offset).toString(Charsets.UTF_8).take(MaxErrorChars)
        }
    }

    private fun unwrapProviderError(raw: String): String {
        var value = raw.trim()
        repeat(MaxNestedErrorDepth) {
            val objectValue = runCatching {
                ElecKoiJson.parseToJsonElement(value).jsonObject
            }.getOrNull() ?: return value.take(MaxErrorChars)
            val error = objectValue["error"] as? JsonObject
            val next = error?.string("message") ?: objectValue.string("message")
                ?: return value.take(MaxErrorChars)
            if (next == value) return value.take(MaxErrorChars)
            value = next.trim()
        }
        return value.take(MaxErrorChars)
    }

    private fun toolsUnsupported(message: String): Nothing = throw AgentException(
        AgentErrorCode.ToolsUnsupported,
        "当前接口不能完整支持 Agent Harness 工具调用：$message",
    )

    private fun protocolFailure(message: String): Nothing = throw AgentException(
        AgentErrorCode.ProtocolError,
        "Agent Harness 接口能力检测失败：$message",
    )

    private fun transientUpstreamFailure(status: Int, detail: String): Nothing = throw AgentException(
        AgentErrorCode.NetworkError,
        "模型上游暂时不可用（HTTP $status），不是 API Key 或工具协议配置错误，请稍后重试：" +
            detail.take(MaxProviderDetailChars),
        httpStatus = status,
    )

    private data class ProbeEvent(val type: String, val payload: JsonObject)
    private fun JsonObject.string(name: String): String? =
        (get(name) as? JsonPrimitive)?.contentOrNull

    private companion object {
        const val ProbeToolName = "eleckoi_capability_probe"
        const val MaxErrorBytes = 64 * 1024
        const val MaxErrorChars = 2_000
        const val MaxSseLineChars = 4 * 1024 * 1024
        const val MaxSseResponseChars = 16 * 1024 * 1024
        const val MaxNestedErrorDepth = 4
        const val MaxProviderDetailChars = 400
        const val MaxTransientAttempts = 3
        const val TransientRetryDelayMillis = 500L
    }
}
