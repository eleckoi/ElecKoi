package com.eleckoi.android.engine.agent.adapter

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Pure request conversion from Responses API payloads to standard Chat Completions. */
internal object ResponsesToChatCompletions {
    fun convert(
        request: JsonObject,
        upstreamModel: String,
        configuredMaxOutputTokens: Int? = null,
        providerRequestFields: JsonObject = JsonObject(emptyMap()),
    ): JsonObject = convertWithRoutes(
        request = request,
        upstreamModel = upstreamModel,
        configuredMaxOutputTokens = configuredMaxOutputTokens,
        providerRequestFields = providerRequestFields,
    ).body

    fun convertWithRoutes(
        request: JsonObject,
        upstreamModel: String,
        configuredMaxOutputTokens: Int? = null,
        providerRequestFields: JsonObject = JsonObject(emptyMap()),
    ): AdaptedChatCompletionsRequest {
        require(upstreamModel.isNotBlank()) { "上游模型名不能为空" }
        require(providerRequestFields.keys.none { it in ReservedProviderFieldNames }) {
            "提供商推理参数不能覆盖标准 Chat Completions 字段"
        }
        rejectUnsupportedRequestFeatures(request)
        val toolConversion = ResponsesChatToolConverter.convert(request.array("tools"))
        val messages = mutableListOf<MutableChatMessage>()
        val customCallNamesById = linkedMapOf<String, String>()
        val priorToolFailures = mutableListOf<ResponsesToolResultFailure>()
        request.stringOrNull("instructions")?.takeIf(String::isNotBlank)?.let {
            messages += MutableChatMessage(role = "system", content = JsonPrimitive(it))
        }
        var pendingReasoning = ""
        request.array("input").forEach { element ->
            val item = element as? JsonObject ?: throw ResponsesAdapterException("Responses input 项不是对象")
            // pi-ai uses the Responses "easy input message" shape for system and user turns:
            // {"role":"user","content":[...]}. Its outer `type` is intentionally omitted, while
            // output messages and tool items remain explicitly discriminated.
            val itemType = item.stringOrNull("type")
                ?: "message".takeIf { item.stringOrNull("role") != null }
            when (itemType) {
                "message" -> {
                    val role = when (val rawRole = item.stringOrNull("role")) {
                        "developer", "system" -> "system"
                        "user", "assistant" -> rawRole
                        else -> throw ResponsesAdapterException("不支持的 Responses message role：$rawRole")
                    }
                    messages += MutableChatMessage(
                        role = role,
                        content = chatContent(item["content"]),
                        reasoningContent = pendingReasoning
                            .takeIf { role == "assistant" && it.isNotBlank() },
                    )
                    if (role == "user") {
                        // A resumed thread carries every old tool result. Only failures after the
                        // most recent user message belong to the active turn; otherwise an app
                        // restart would incorrectly report an old patch failure as a new one.
                        customCallNamesById.clear()
                        priorToolFailures.clear()
                    }
                    if (role == "assistant") pendingReasoning = ""
                }
                "reasoning" -> {
                    val value = reasoningText(item)
                    pendingReasoning = listOf(pendingReasoning, value)
                        .filter(String::isNotBlank)
                        .joinToString("\n")
                }
                "function_call" -> {
                    val responseName = item.string("name")
                    val call = ChatToolCall(
                        id = item.string("call_id"),
                        name = toolConversion.chatName(
                            namespace = item.stringOrNull("namespace"),
                            responseName = responseName,
                        ),
                        arguments = item.stringOrNull("arguments").orEmpty().ifBlank { "{}" },
                    )
                    // Responses can emit assistant text followed by one or more function calls.
                    // Chat Completions represents that contiguous output as one assistant message.
                    val assistant = messages.lastOrNull()?.takeIf { it.role == "assistant" }
                        ?: MutableChatMessage(
                        role = "assistant",
                        content = null,
                        reasoningContent = pendingReasoning.takeIf(String::isNotBlank),
                    ).also(messages::add)
                    if (assistant.reasoningContent.isNullOrBlank() && pendingReasoning.isNotBlank()) {
                        assistant.reasoningContent = pendingReasoning
                    }
                    assistant.toolCalls += call
                    pendingReasoning = ""
                }
                "function_call_output" -> messages += MutableChatMessage(
                    role = "tool",
                    content = JsonPrimitive(outputText(item["output"])),
                    toolCallId = item.string("call_id"),
                )
                "custom_tool_call" -> {
                    val responseName = item.string("name")
                    val callId = item.string("call_id")
                    customCallNamesById[callId] = responseName
                    val route = toolConversion.route(namespace = null, responseName = responseName)
                    if (route != null && route.kind != ResponsesToolKind.Custom) {
                        throw ResponsesAdapterException("Responses custom 工具类型与声明不一致：$responseName")
                    }
                    val call = ChatToolCall(
                        id = callId,
                        name = route?.chatName ?: responseName,
                        arguments = ResponsesChatToolConverter.customArguments(
                            item.stringOrNull("input").orEmpty(),
                        ),
                    )
                    val assistant = messages.lastOrNull()?.takeIf { it.role == "assistant" }
                        ?: MutableChatMessage(
                            role = "assistant",
                            content = null,
                            reasoningContent = pendingReasoning.takeIf(String::isNotBlank),
                        ).also(messages::add)
                    if (assistant.reasoningContent.isNullOrBlank() && pendingReasoning.isNotBlank()) {
                        assistant.reasoningContent = pendingReasoning
                    }
                    assistant.toolCalls += call
                    pendingReasoning = ""
                }
                "custom_tool_call_output" -> {
                    val callId = item.string("call_id")
                    val output = outputText(item["output"])
                    ResponsesChatToolConverter.classifyFailure(
                        callId = callId,
                        toolName = customCallNamesById[callId].orEmpty().ifBlank { "custom_tool" },
                        output = output,
                    )?.let(priorToolFailures::add)
                    messages += MutableChatMessage(
                        role = "tool",
                        content = JsonPrimitive(output),
                        toolCallId = callId,
                    )
                }
                "compaction", "context_compaction" -> Unit
                "web_search_call", "tool_search_call" -> {
                    throw ResponsesAdapterException(
                        "当前 Chat Completions 上游不支持 Responses 专有工具：${item.stringOrNull("type")}",
                    )
                }
                else -> throw ResponsesAdapterException(
                    "不支持的 Responses input 类型：$itemType",
                )
            }
        }
        if (messages.isEmpty()) throw ResponsesAdapterException("Responses 请求没有可转换的消息")

        val body = buildJsonObject {
            put("model", upstreamModel)
            put("messages", JsonArray(messages.map(MutableChatMessage::toJson)))
            put("stream", true)
            // Harness clients base token accounting and automatic compaction on the provider's
            // response usage. Compatible streaming APIs expose the final exact counts only when
            // include_usage is requested (including DeepSeek Chat Completions).
            put("stream_options", buildJsonObject { put("include_usage", true) })
            resolvedMaxOutputTokens(request, configuredMaxOutputTokens)?.let { put("max_tokens", it) }
            providerRequestFields.forEach { (key, value) -> put(key, value) }
            val toolChoice = request["tool_choice"]?.takeUnless { it == JsonNull }
            val disablesTools = (toolChoice as? JsonPrimitive)?.contentOrNull == "none"
            if (toolConversion.tools.isNotEmpty() && !disablesTools) {
                put("tools", JsonArray(toolConversion.tools))
            }
            // Baseline Chat Completions tool calling needs tools/tool_calls/role=tool. Generic
            // gateways frequently reject Responses-only tuning fields even though their models
            // support that baseline. Default `auto` needs no explicit field, while `none` is
            // represented portably by omitting tools from this request.
            toolChoice?.let { choice ->
                val primitive = (choice as? JsonPrimitive)?.contentOrNull
                when (primitive) {
                    null -> ResponsesChatToolConverter.convertChoice(choice, toolConversion)?.let {
                        put("tool_choice", it)
                    }
                    "auto", "none" -> Unit
                    else -> put("tool_choice", choice)
                }
            }
        }
        return AdaptedChatCompletionsRequest(
            body = body,
            toolRoutes = toolConversion.routesByChatName,
            estimatedInputTokens = approximateTokenCount(body.toString()),
            priorToolFailures = priorToolFailures,
        )
    }

    private fun requestedMaxOutputTokens(request: JsonObject): Int? {
        val raw = request["max_output_tokens"]
        if (raw == null || raw == JsonNull) return null
        val requested = (raw as? JsonPrimitive)?.intOrNull
            ?: throw ResponsesAdapterException("Responses max_output_tokens 必须是整数")
        if (requested <= 0) throw ResponsesAdapterException("Responses max_output_tokens 必须大于 0")
        return requested
    }

    private fun resolvedMaxOutputTokens(request: JsonObject, configured: Int?): Int? {
        if (configured != null) {
            if (configured <= 0) throw ResponsesAdapterException("配置的单次最大输出 Token 必须大于 0")
            return configured
        }
        return requestedMaxOutputTokens(request)
    }

    private fun rejectUnsupportedRequestFeatures(request: JsonObject) {
        if (request["text"] != null && request["text"] != JsonNull) {
            throw ResponsesAdapterException("当前 Chat Completions 上游暂不支持 Responses text/structured output")
        }
    }

    private val ReservedProviderFieldNames = setOf(
        "model",
        "messages",
        "stream",
        "stream_options",
        "max_tokens",
        "tools",
        "tool_choice",
    )


    private fun chatContent(value: JsonElement?): JsonElement = when (value) {
        is JsonPrimitive -> value
        is JsonArray -> {
            val converted = value.map { part ->
                val item = part as? JsonObject
                    ?: throw ResponsesAdapterException("message content 项不是对象")
                when (item.stringOrNull("type")) {
                    "input_text", "output_text", "text" -> buildJsonObject {
                        put("type", "text")
                        put("text", item.stringOrNull("text").orEmpty())
                    }
                    "input_image", "image_url" -> buildJsonObject {
                        val imageUrl = item.stringOrNull("image_url")
                            ?: (item["image_url"] as? JsonObject)?.stringOrNull("url")
                            ?: throw ResponsesAdapterException("Responses 图片缺少 image_url")
                        put("type", "image_url")
                        put("image_url", buildJsonObject { put("url", imageUrl) })
                    }
                    else -> throw ResponsesAdapterException(
                        "当前 Chat adapter 暂不支持多模态内容：${item.stringOrNull("type")}",
                    )
                }
            }
            if (converted.all { (it as JsonObject).stringOrNull("type") == "text" }) {
                JsonPrimitive(converted.joinToString("\n\n") { part ->
                    (part as JsonObject).stringOrNull("text").orEmpty()
                })
            } else {
                JsonArray(converted)
            }
        }
        null, JsonNull -> JsonPrimitive("")
        else -> throw ResponsesAdapterException("message content 格式无效")
    }

    private fun reasoningText(item: JsonObject): String {
        val content = item.array("content").mapNotNull { (it as? JsonObject)?.stringOrNull("text") }
        val summary = item.array("summary").mapNotNull { (it as? JsonObject)?.stringOrNull("text") }
        return (content + summary).joinToString("\n")
    }

    private fun outputText(value: JsonElement?): String = when (value) {
        is JsonPrimitive -> value.contentOrNull.orEmpty()
        is JsonArray -> value.joinToString("\n") { it.toString() }
        null, JsonNull -> ""
        else -> value.toString()
    }

    private data class MutableChatMessage(
        val role: String,
        val content: JsonElement?,
        val toolCallId: String? = null,
        var reasoningContent: String? = null,
        val toolCalls: MutableList<ChatToolCall> = mutableListOf(),
    ) {
        fun toJson(): JsonObject = buildJsonObject {
            put("role", role)
            if (content == null) put("content", JsonNull) else put("content", content)
            toolCallId?.let { put("tool_call_id", it) }
            reasoningContent?.takeIf(String::isNotBlank)?.let { put("reasoning_content", it) }
            if (toolCalls.isNotEmpty()) {
                put("tool_calls", buildJsonArray {
                    toolCalls.forEach { call ->
                        add(buildJsonObject {
                            put("id", call.id)
                            put("type", "function")
                            put("function", buildJsonObject {
                                put("name", call.name)
                                put("arguments", call.arguments)
                            })
                        })
                    }
                })
            }
        }
    }

    private data class ChatToolCall(val id: String, val name: String, val arguments: String)

    private fun JsonObject.string(name: String): String = stringOrNull(name)
        ?.takeIf(String::isNotBlank)
        ?: throw ResponsesAdapterException("Responses 字段 $name 不能为空")
    private fun JsonObject.stringOrNull(name: String): String? = (get(name) as? JsonPrimitive)?.contentOrNull
    private fun JsonObject.array(name: String): JsonArray = get(name) as? JsonArray ?: JsonArray(emptyList())

    private const val ApplyPatchToolName = "apply_patch"
    private const val CustomToolInputField = "input"
    private const val MaxToolFailureMessageChars = 320
    private val ChatToolName = Regex("^[A-Za-z0-9_-]{1,64}$")
}
