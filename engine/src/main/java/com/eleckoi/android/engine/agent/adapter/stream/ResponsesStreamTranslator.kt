package com.eleckoi.android.engine.agent.adapter

import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.agent.protocol.AssistantPhaseHeaderDecoder
import java.util.UUID
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

internal data class ResponsesSseEvent(val type: String, val payload: JsonObject) {
    fun encode(): String = "event: $type\ndata: $payload\n\n"
}

/** Stateful conversion of standard Chat Completions chunks into Responses SSE events. */
internal class ChatCompletionsToResponsesStream(
    private val idFactory: () -> String = { UUID.randomUUID().toString().replace("-", "") },
    private val toolRoutes: Map<String, ResponsesToolRoute> = emptyMap(),
    private val estimatedInputTokens: Int = 0,
    private val allowTerminalReasoningFallback: Boolean = false,
) {
    private var responseId: String? = null
    private var model: String? = null
    private var created = false
    private var completed = false
    private var finishReason: String? = null
    private val text = StringBuilder()
    private val reasoning = StringBuilder()
    private val inlineThink = InlineThinkTagDecoder()
    private val assistantPhaseHeader = AssistantPhaseHeaderDecoder()
    private val toolCalls = linkedMapOf<Int, ToolAccumulator>()
    private var upstreamUsage: ChatCompletionUsage? = null
    private var activeOutputItem: ActiveOutputItem? = null
    private var nextOutputIndex = 0
    private var reasoningItemCount = 0
    private var messageItemCount = 0
    private var translationFailure: ResponsesTranslationFailure? = null

    fun acceptData(data: String): List<ResponsesSseEvent> {
        if (completed) return emptyList()
        if (data.trim() == "[DONE]") return finish()
        val chunk = com.eleckoi.android.foundation.serialization.ElecKoiJson
            .parseToJsonElement(data)
            .let { it as? JsonObject ?: throw ResponsesAdapterException("Chat SSE chunk 不是对象") }
        responseId = responseId ?: chunk.stringOrNull("id")?.toResponseId() ?: "resp_${idFactory()}"
        model = model ?: chunk.stringOrNull("model")
        (chunk["usage"] as? JsonObject)?.let { usage ->
            upstreamUsage = ChatCompletionUsage.from(usage) ?: upstreamUsage
        }
        val events = mutableListOf<ResponsesSseEvent>()
        ensureCreated(events)
        val choice = (chunk["choices"] as? JsonArray)?.firstOrNull() as? JsonObject
        if (choice != null) {
            choice.stringOrNull("finish_reason")?.let { finishReason = it }
            val delta = choice["delta"] as? JsonObject
            delta?.reasoningField()?.let { (_, value) ->
                appendReasoningDelta(events, value)
            }
            delta?.stringOrNull("content")?.takeIf(String::isNotEmpty)?.let { value ->
                appendContentDelta(events, value)
            }
            (delta?.get("tool_calls") as? JsonArray)?.forEach { rawCall ->
                val call = rawCall as? JsonObject ?: return@forEach
                val index = (call["index"] as? JsonPrimitive)?.intOrNull ?: 0
                val accumulator = toolCalls.getOrPut(index) { ToolAccumulator() }
                call.stringOrNull("id")?.takeIf(String::isNotBlank)?.let(accumulator::acceptId)
                val function = call["function"] as? JsonObject
                function?.stringOrNull("name")?.takeIf(String::isNotEmpty)?.let { accumulator.name.append(it) }
                function?.stringOrNull("arguments")?.takeIf(String::isNotEmpty)?.let {
                    accumulator.arguments.append(it)
                }
                streamToolCall(events, index, accumulator)
            }
        }
        return events
    }

    private fun streamToolCall(
        events: MutableList<ResponsesSseEvent>,
        index: Int,
        call: ToolAccumulator,
    ) {
        if (call.arguments.isEmpty()) return
        val route = toolRoutes[call.name.toString()] ?: return
        val state = ensureToolOutputItemStarted(events, call, route)
        val pendingArguments = call.arguments.substring(state.processedArgumentChars)
        state.processedArgumentChars = call.arguments.length
        if (pendingArguments.isEmpty()) return
        when (route.kind) {
            ResponsesToolKind.Function -> emitFunctionArgumentsDelta(events, state, pendingArguments)
            ResponsesToolKind.Custom -> {
                val delta = state.customInputDecoder?.accept(pendingArguments).orEmpty()
                emitCustomToolInputDelta(events, state, delta)
            }
        }
    }

    private fun ensureToolOutputItemStarted(
        events: MutableList<ResponsesSseEvent>,
        call: ToolAccumulator,
        route: ResponsesToolRoute,
    ): ToolStreamState {
        call.streamState?.let { return it }
        if (activeOutputItem != null) closeActiveOutputItem(events, terminal = false)
        val state = ToolStreamState(
            route = route,
            itemId = if (route.kind == ResponsesToolKind.Custom) {
                "ct_${idFactory()}"
            } else {
                "fc_${idFactory()}"
            },
            callId = call.id.ifBlank { "call_${idFactory()}" },
            outputIndex = nextOutputIndex++,
            customInputDecoder = if (route.kind == ResponsesToolKind.Custom) {
                StreamingCustomToolInputDecoder()
            } else {
                null
            },
        )
        call.streamState = state
        events += responsesEvent("response.output_item.added") {
            put("output_index", state.outputIndex)
            put("item", responsesToolItem(state, value = "", status = "in_progress"))
        }
        return state
    }

    private fun emitFunctionArgumentsDelta(
        events: MutableList<ResponsesSseEvent>,
        state: ToolStreamState,
        delta: String,
    ) {
        if (delta.isEmpty()) return
        events += responsesEvent("response.function_call_arguments.delta") {
            put("item_id", state.itemId)
            put("output_index", state.outputIndex)
            put("delta", delta)
        }
    }

    private fun emitCustomToolInputDelta(
        events: MutableList<ResponsesSseEvent>,
        state: ToolStreamState,
        delta: String,
    ) {
        if (delta.isEmpty()) return
        state.streamedCustomInput.append(delta)
        events += responsesEvent("response.custom_tool_call_input.delta") {
            put("item_id", state.itemId)
            put("output_index", state.outputIndex)
            put("call_id", state.callId)
            put("delta", delta)
        }
    }

    fun terminalFailure(): ResponsesTranslationFailure? = translationFailure

    /** Some compatible relays close a valid SSE stream after finish_reason without sending [DONE]. */
    fun canFinishAtEof(): Boolean = finishReason != null

    fun finish(): List<ResponsesSseEvent> {
        if (completed) return emptyList()
        completed = true
        val events = mutableListOf<ResponsesSseEvent>()
        ensureCreated(events)
        inlineThink.finish().forEach { segment -> appendInlineSegment(events, segment) }
        assistantPhaseHeader.finish().rawText
            .takeIf(String::isNotEmpty)
            ?.let { currentTurnText -> appendMessageDelta(events, currentTurnText) }
        if (shouldPromoteReasoningToFinalAnswer()) {
            appendMessageDelta(events, reasoning.toString())
        }
        closeActiveOutputItem(events, terminal = true)
        if (messageItemCount == 0 && toolCalls.isEmpty()) {
            openMessageItem(events)
            closeActiveOutputItem(events, terminal = true)
        }
        if (finishReason != "length") {
            val routedCalls = toolCalls.toSortedMap().values.map { call ->
                val chatName = call.name.toString()
                if (chatName.isBlank()) {
                    return toolRouteFailure(
                        events = events,
                        code = "adapter_invalid_tool_name",
                        message = "上游返回了名称为空的工具调用",
                        chatName = chatName,
                        call = call,
                        expectedKind = "non_empty_tool_name",
                    )
                }
                val route = toolRoutes[chatName] ?: ResponsesToolRoute(
                    chatName = chatName,
                    namespace = null,
                    responseName = chatName,
                    kind = ResponsesToolKind.Function,
                )
                val customInput = if (route.kind == ResponsesToolKind.Custom) {
                    parseCustomToolInput(call.arguments.toString()) ?: return toolRouteFailure(
                        events = events,
                        code = "adapter_invalid_custom_tool_arguments",
                        message = "自由文本工具 ${safeToolName(route.responseName)} 的参数格式无效",
                        chatName = chatName,
                        call = call,
                        expectedKind = "custom/freeform",
                    )
                } else {
                    null
                }
                RoutedToolCall(call = call, route = route, customInput = customInput)
            }
            routedCalls.forEach { routed ->
                val call = routed.call
                val route = routed.route
                val state = ensureToolOutputItemStarted(events, call, route)
                val pendingArguments = call.arguments.substring(state.processedArgumentChars)
                state.processedArgumentChars = call.arguments.length
                when (route.kind) {
                    ResponsesToolKind.Function -> emitFunctionArgumentsDelta(events, state, pendingArguments)
                    ResponsesToolKind.Custom -> {
                        val decodedDelta = state.customInputDecoder?.accept(pendingArguments).orEmpty()
                        emitCustomToolInputDelta(events, state, decodedDelta)
                        val finalInput = routed.customInput.orEmpty()
                        val streamedInput = state.streamedCustomInput.toString()
                        if (finalInput.startsWith(streamedInput)) {
                            emitCustomToolInputDelta(
                                events,
                                state,
                                finalInput.substring(streamedInput.length),
                            )
                        }
                    }
                }
                val finalValue = routed.customInput ?: call.arguments.toString().ifBlank { "{}" }
                events += responsesEvent("response.output_item.done") {
                    put("output_index", state.outputIndex)
                    put("item", responsesToolItem(state, finalValue))
                }
            }
        }
        if (finishReason == "length" && toolCalls.isNotEmpty()) {
            events += responsesEvent("response.incomplete") {
                put("response", buildJsonObject {
                    put("id", requireResponseId())
                    put("status", "incomplete")
                    put("error", JsonNull)
                    put("incomplete_details", buildJsonObject {
                        put("reason", "max_output_tokens")
                    })
                })
            }
            return events
        }
        events += responsesEvent("response.completed") {
            put("response", buildJsonObject {
                put("id", requireResponseId())
                model?.let { put("model", it) }
                put("usage", responsesUsage(upstreamUsage, estimatedInputTokens, text, reasoning, toolCalls))
                if (finishReason == "length") put("end_turn", false)
            })
        }
        return events
    }

    /**
     * Some reasoning models occasionally put the user-facing answer entirely in their exposed
     * reasoning field and then end with an empty assistant body. The adapter may recover that
     * text only for the first provider request of a turn. Tool rounds and later continuation
     * requests deliberately never enable this flag, so intermediate reasoning cannot leak into
     * the visible answer.
     */
    private fun shouldPromoteReasoningToFinalAnswer(): Boolean =
        allowTerminalReasoningFallback &&
            reasoning.isNotBlank() &&
            text.isBlank() &&
            toolCalls.isEmpty() &&
            (finishReason == null || finishReason == "stop")

    private fun toolRouteFailure(
        events: MutableList<ResponsesSseEvent>,
        code: String,
        message: String,
        chatName: String,
        call: ToolAccumulator,
        expectedKind: String,
    ): List<ResponsesSseEvent> {
        translationFailure = ResponsesTranslationFailure(
            code = code,
            message = message,
            fields = linkedMapOf(
                "phase" to "tool_routing",
                "tool.name" to safeToolName(chatName),
                "tool.expected_type" to expectedKind,
                "tool.actual_type" to "chat_function",
                "tool.arguments.chars" to call.arguments.length,
                "tools.declared.count" to toolRoutes.size,
            ),
        )
        events += responsesEvent("response.failed") {
            put("response", buildJsonObject {
                put("id", requireResponseId())
                put("error", buildJsonObject {
                    put("code", code)
                    put("message", message)
                })
            })
        }
        return events
    }

    fun fail(code: String, message: String): List<ResponsesSseEvent> {
        if (completed) return emptyList()
        completed = true
        val events = mutableListOf<ResponsesSseEvent>()
        ensureCreated(events)
        events += responsesEvent("response.failed") {
            put("response", buildJsonObject {
                put("id", requireResponseId())
                put("error", buildJsonObject {
                    put("code", code)
                    put("message", message)
                })
            })
        }
        return events
    }

    private fun ensureCreated(events: MutableList<ResponsesSseEvent>) {
        if (created) return
        created = true
        events += responsesEvent("response.created") {
            put("response", buildJsonObject {
                put("id", requireResponseId())
                model?.let { put("model", it) }
            })
        }
    }

    private fun appendReasoningDelta(events: MutableList<ResponsesSseEvent>, value: String) {
        val item = when (val active = activeOutputItem) {
            is ActiveOutputItem.Reasoning -> active
            else -> {
                if (active != null) closeActiveOutputItem(events, terminal = false)
                openReasoningItem(events)
            }
        }
        reasoning.append(value)
        item.content.append(value)
        events += responsesEvent("response.reasoning_text.delta") {
            put("item_id", item.id)
            put("output_index", item.outputIndex)
            put("content_index", 0)
            put("delta", value)
        }
    }

    private fun appendContentDelta(events: MutableList<ResponsesSseEvent>, value: String) {
        inlineThink.accept(value).forEach { segment -> appendInlineSegment(events, segment) }
    }

    private fun appendInlineSegment(
        events: MutableList<ResponsesSseEvent>,
        segment: InlineThinkSegment,
    ) {
        if (segment.value.isEmpty()) return
        when (segment.kind) {
            InlineThinkSegment.Kind.Reasoning -> {
                appendReasoningDelta(events, segment.value)
            }
            InlineThinkSegment.Kind.Text -> {
                assistantPhaseHeader.accept(segment.value).rawText
                    .takeIf(String::isNotEmpty)
                    ?.let { currentTurnText -> appendMessageDelta(events, currentTurnText) }
            }
        }
    }

    private fun appendMessageDelta(events: MutableList<ResponsesSseEvent>, value: String) {
        val item = when (val active = activeOutputItem) {
            is ActiveOutputItem.Message -> active
            else -> {
                if (active != null) closeActiveOutputItem(events, terminal = false)
                openMessageItem(events)
            }
        }
        text.append(value)
        item.content.append(value)
        events += responsesEvent("response.output_text.delta") {
            put("item_id", item.id)
            put("output_index", item.outputIndex)
            put("content_index", 0)
            put("delta", value)
        }
    }

    private fun openReasoningItem(events: MutableList<ResponsesSseEvent>): ActiveOutputItem.Reasoning {
        reasoningItemCount += 1
        val suffix = if (reasoningItemCount == 1) "" else "_$reasoningItemCount"
        val item = ActiveOutputItem.Reasoning(
            id = "rs_${requireResponseId().removePrefix("resp_")}$suffix",
            outputIndex = nextOutputIndex++,
        )
        activeOutputItem = item
        events += responsesEvent("response.output_item.added") {
            put("output_index", item.outputIndex)
            put("item", responsesReasoningItem(item.id, ""))
        }
        return item
    }

    private fun openMessageItem(events: MutableList<ResponsesSseEvent>): ActiveOutputItem.Message {
        messageItemCount += 1
        val suffix = if (messageItemCount == 1) "" else "_$messageItemCount"
        val item = ActiveOutputItem.Message(
            id = "msg_${requireResponseId().removePrefix("resp_")}$suffix",
            outputIndex = nextOutputIndex++,
            declaredPhase = assistantPhaseHeader.phase?.responsesValue(),
        )
        activeOutputItem = item
        events += responsesEvent("response.output_item.added") {
            put("output_index", item.outputIndex)
            put(
                "item",
                responsesMessageItem(
                    id = item.id,
                    text = "",
                    phase = item.declaredPhase,
                    includeTextPart = false,
                ),
            )
        }
        return item
    }

    private fun closeActiveOutputItem(
        events: MutableList<ResponsesSseEvent>,
        terminal: Boolean,
    ) {
        val item = activeOutputItem ?: return
        events += responsesEvent("response.output_item.done") {
            put("output_index", item.outputIndex)
            put(
                "item",
                when (item) {
                    is ActiveOutputItem.Reasoning -> responsesReasoningItem(item.id, item.content.toString())
                    is ActiveOutputItem.Message -> responsesMessageItem(
                        id = item.id,
                        text = item.content.toString(),
                        phase = when {
                            toolCalls.isNotEmpty() -> "commentary"
                            item.declaredPhase != null -> item.declaredPhase
                            terminal -> messagePhase()
                            else -> null
                        },
                        includeTextPart = true,
                    )
                },
            )
        }
        activeOutputItem = null
    }

    /**
     * Chat Completions has no Harness message phase field. A response that asks the client to
     * execute tools is the mid-turn commentary round; a tool-free response closes the
     * turn. Truncated text stays unclassified because it is not a completed final answer.
     */
    private fun messagePhase(): String? = when {
        toolCalls.isNotEmpty() -> "commentary"
        assistantPhaseHeader.phase != null -> assistantPhaseHeader.phase?.responsesValue()
        finishReason == "length" -> null
        else -> "final_answer"
    }
    private fun AgentMessagePhase.responsesValue(): String = when (this) {
        AgentMessagePhase.Commentary -> "commentary"
        AgentMessagePhase.FinalAnswer -> "final_answer"
    }
    private fun requireResponseId(): String = responseId ?: "resp_${idFactory()}".also { responseId = it }
    private fun String.toResponseId(): String = if (startsWith("resp_")) this else "resp_$this"

}
