package com.eleckoi.android.engine.agent.adapter

import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Losslessly merges high-frequency Responses delta events before they cross the local runtime
 * transport. This mirrors Grok's ReplayBuffer policy: flush on item count, payload bytes, elapsed
 * time, or any protocol boundary; non-streaming events always remain immediate and ordered.
 */
internal class ResponsesEventReplayBuffer(
    private val settings: Settings = Settings(),
    private val nanoTime: () -> Long = System::nanoTime,
) {
    private var pending: PendingDelta? = null

    init {
        require(settings.maxItems > 0) { "ReplayBuffer maxItems 必须大于 0" }
        require(settings.maxBytes > 0) { "ReplayBuffer maxBytes 必须大于 0" }
        require(settings.maxDurationMillis > 0) { "ReplayBuffer maxDurationMillis 必须大于 0" }
    }

    fun consume(events: List<ResponsesSseEvent>): List<ResponsesSseEvent> = buildList {
        events.forEach { event -> consumeOne(event, this) }
    }

    fun flush(): List<ResponsesSseEvent> {
        val event = takePending() ?: return emptyList()
        return listOf(event)
    }

    fun flushIntervalMillis(): Long = maxOf(MinimumFlushIntervalMillis, settings.maxDurationMillis)

    private fun consumeOne(
        incoming: ResponsesSseEvent,
        output: MutableList<ResponsesSseEvent>,
    ) {
        val delta = incoming.bufferableDelta()
        if (delta == null) {
            takePending()?.let(output::add)
            output += incoming
            return
        }
        val now = nanoTime()
        val current = pending
        if (current == null) {
            bufferOrEmit(incoming, delta, now, output)
            return
        }

        if (current.key != incoming.streamKey()) {
            takePending()?.let(output::add)
            emit(incoming, output)
            return
        }

        val elapsedMillis = TimeUnit.NANOSECONDS.toMillis(now - current.startedAtNanos)
        if (elapsedMillis > settings.maxDurationMillis) {
            takePending()?.let(output::add)
            bufferOrEmit(incoming, delta, now, output)
            return
        }

        current.delta.append(delta)
        current.itemCount += 1
        current.payloadBytes += delta.toByteArray(Charsets.UTF_8).size
        if (
            current.itemCount >= settings.maxItems ||
            current.payloadBytes >= settings.maxBytes
        ) {
            takePending()?.let(output::add)
        }
    }

    private fun bufferOrEmit(
        event: ResponsesSseEvent,
        delta: String,
        now: Long,
        output: MutableList<ResponsesSseEvent>,
    ) {
        val payloadBytes = delta.toByteArray(Charsets.UTF_8).size
        if (settings.maxItems <= 1 || payloadBytes >= settings.maxBytes) {
            emit(event, output)
            return
        }
        pending = PendingDelta(
            key = event.streamKey(),
            template = event,
            delta = StringBuilder(delta),
            itemCount = 1,
            payloadBytes = payloadBytes,
            startedAtNanos = now,
        )
    }

    private fun takePending(): ResponsesSseEvent? {
        val current = pending ?: return null
        pending = null
        val merged = current.template.withDelta(current.delta.toString())
        return merged
    }

    private fun emit(event: ResponsesSseEvent, output: MutableList<ResponsesSseEvent>) {
        output += event
    }

    private fun ResponsesSseEvent.bufferableDelta(): String? {
        if (type !in BufferableDeltaTypes) return null
        return (payload["delta"] as? JsonPrimitive)?.contentOrNull
    }

    private fun ResponsesSseEvent.streamKey(): StreamKey = StreamKey(
        type = type,
        itemId = payload["item_id"],
        outputIndex = payload["output_index"],
        contentIndex = payload["content_index"],
        callId = payload["call_id"],
    )

    private fun ResponsesSseEvent.withDelta(delta: String): ResponsesSseEvent =
        copy(payload = JsonObject(payload + ("delta" to JsonPrimitive(delta))))

    internal data class Settings(
        val maxItems: Int = DefaultMaxItems,
        val maxBytes: Int = DefaultMaxBytes,
        val maxDurationMillis: Long = DefaultMaxDurationMillis,
    )

    private data class StreamKey(
        val type: String,
        val itemId: JsonElement?,
        val outputIndex: JsonElement?,
        val contentIndex: JsonElement?,
        val callId: JsonElement?,
    )

    private data class PendingDelta(
        val key: StreamKey,
        val template: ResponsesSseEvent,
        val delta: StringBuilder,
        var itemCount: Int,
        var payloadBytes: Int,
        val startedAtNanos: Long,
    )

    private companion object {
        const val DefaultMaxItems = 100
        const val DefaultMaxBytes = 2 * 1024
        const val DefaultMaxDurationMillis = 10L
        const val MinimumFlushIntervalMillis = 20L

        const val OutputTextDelta = "response.output_text.delta"
        const val ReasoningTextDelta = "response.reasoning_text.delta"
        const val FunctionArgumentsDelta = "response.function_call_arguments.delta"
        const val CustomToolInputDelta = "response.custom_tool_call_input.delta"

        val BufferableDeltaTypes = setOf(
            OutputTextDelta,
            ReasoningTextDelta,
            FunctionArgumentsDelta,
            CustomToolInputDelta,
        )
    }
}
