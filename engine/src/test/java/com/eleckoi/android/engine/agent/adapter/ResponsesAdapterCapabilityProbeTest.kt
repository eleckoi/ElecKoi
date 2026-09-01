package com.eleckoi.android.engine.agent.adapter

import com.eleckoi.android.foundation.serialization.ElecKoiJson
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelApiFormat
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ResponsesAdapterCapabilityProbeTest {
    @Test
    fun `native Responses verifies function call and tool output without translation`() = runBlocking {
        val upstream = ServerSocket().apply {
            bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0))
        }
        val captured = mutableListOf<JsonObject>()
        val upstreamJob = async(Dispatchers.IO) {
            repeat(2) { requestIndex ->
                upstream.accept().use { socket ->
                    captured += ElecKoiJson.parseToJsonElement(
                        readRequest(socket.getInputStream()),
                    ).jsonObject
                    val events = if (requestIndex == 0) {
                        listOf(
                            """{"type":"response.output_item.done","item":{"type":"reasoning","id":"reasoning_probe","content":[{"type":"reasoning_text","text":"check"}]}}""",
                            """{"type":"response.output_item.done","item":{"type":"function_call","id":"item_probe","call_id":"call_probe","name":"eleckoi_capability_probe","arguments":"{\"value\":\"ok\"}"}}""",
                            """{"type":"response.completed","response":{"id":"response_probe_one","output":[]}}""",
                        )
                    } else {
                        listOf(
                            """{"type":"response.output_item.done","item":{"type":"message","id":"message_probe","role":"assistant","content":[{"type":"output_text","text":"ok"}]}}""",
                            """{"type":"response.completed","response":{"id":"response_probe_two","output":[]}}""",
                        )
                    }
                    val response = buildString {
                        append("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n")
                        events.forEach { event ->
                            val type = ElecKoiJson.parseToJsonElement(event).jsonObject.string("type")
                            append("event: ").append(type).append("\n")
                            append("data: ").append(event).append("\n\n")
                        }
                    }
                    socket.getOutputStream().apply {
                        write(response.toByteArray(Charsets.UTF_8))
                        flush()
                    }
                }
            }
        }
        val capability = AgentModelCapabilityValidator().verify(
            ModelConfig(
                provider = "test",
                apiKey = "native-secret",
                baseUrl = "http://127.0.0.1:${upstream.localPort}",
                model = "native-model",
                apiFormat = ModelApiFormat.Responses,
            ),
        )

        assertTrue(capability.reasoningReplayObserved)
        upstreamJob.await()
        assertEquals(2, captured.size)
        assertTrue("messages" !in captured[0])
        assertTrue("messages" !in captured[1])
        val secondInput = captured[1]["input"] as JsonArray
        assertTrue(secondInput.any { it.jsonObject.string("type") == "reasoning" })
        assertTrue(secondInput.any { it.jsonObject.string("type") == "function_call" })
        assertTrue(secondInput.any { it.jsonObject.string("type") == "function_call_output" })
        upstream.close()
        Unit
    }

    @Test
    fun `retries transient nested upstream error then verifies tool result round trip`() = runBlocking {
        val upstream = ServerSocket().apply {
            bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0))
        }
        val captured = mutableListOf<JsonObject>()
        val upstreamJob = async(Dispatchers.IO) {
            repeat(3) { requestIndex ->
                upstream.accept().use { socket ->
                    captured += ElecKoiJson.parseToJsonElement(readRequest(socket.getInputStream())).jsonObject
                    if (requestIndex == 0) {
                        val body =
                            """{"error":{"message":"Error from provider (Console Go): Upstream request failed","type":"invalid_request_error"}}"""
                        val response = buildString {
                            append("HTTP/1.1 400 Bad Request\r\n")
                            append("Content-Type: application/json\r\n")
                            append("Content-Length: ${body.toByteArray().size}\r\n")
                            append("Connection: close\r\n\r\n")
                            append(body)
                        }
                        socket.getOutputStream().apply {
                            write(response.toByteArray(Charsets.UTF_8))
                            flush()
                        }
                        return@use
                    }
                    val chunks = if (requestIndex == 1) {
                        listOf(
                            """{"id":"one","model":"test","choices":[{"index":0,"delta":{"reasoning_content":"check"},"finish_reason":null}]}""",
                            """{"id":"one","model":"test","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_probe","type":"function","function":{"name":"eleckoi_capability_","arguments":"{\"value\":"}}]},"finish_reason":null}]}""",
                            """{"id":"one","model":"test","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"name":"probe","arguments":"\"ok\"}"}}]},"finish_reason":"tool_calls"}]}""",
                        )
                    } else {
                        listOf(
                            """{"id":"two","model":"test","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}""",
                            """{"id":"two","model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}""",
                        )
                    }
                    val response = buildString {
                        append("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n")
                        chunks.forEach { append("data: ").append(it).append("\n\n") }
                        append("data: [DONE]\n\n")
                    }
                    socket.getOutputStream().apply {
                        write(response.toByteArray(Charsets.UTF_8))
                        flush()
                    }
                }
            }
        }
        val capability = AgentModelCapabilityValidator().verify(
            ModelConfig(
                provider = "test",
                apiKey = "secret",
                baseUrl = "http://127.0.0.1:${upstream.localPort}/v1",
                model = "test-model",
                apiFormat = ModelApiFormat.ChatCompletions,
            ),
        )
        assertTrue(capability.reasoningReplayObserved)
        upstreamJob.await()
        assertEquals(3, captured.size)
        assertTrue("tool_choice" !in captured[1])
        assertTrue("parallel_tool_calls" !in captured[1])
        assertTrue("tools" !in captured[2])
        val secondMessages = captured[2]["messages"] as JsonArray
        assertTrue(secondMessages.any { it.jsonObject.string("role") == "assistant" })
        assertTrue(secondMessages.any { it.jsonObject.string("role") == "tool" })
        assertTrue(secondMessages.any { it.jsonObject.string("reasoning_content") == "check" })
        upstream.close()
        Unit
    }

    private fun readRequest(input: InputStream): String {
        readLine(input)
        var length = 0
        while (true) {
            val line = readLine(input)
            if (line.isEmpty()) break
            if (line.startsWith("content-length:", ignoreCase = true)) {
                length = line.substringAfter(':').trim().toInt()
            }
        }
        val body = ByteArray(length)
        var offset = 0
        while (offset < length) offset += input.read(body, offset, length - offset)
        return body.toString(Charsets.UTF_8)
    }

    private fun readLine(input: InputStream): String {
        val output = ByteArrayOutputStream()
        while (true) {
            val value = input.read()
            if (value < 0 || value == '\n'.code) break
            if (value != '\r'.code) output.write(value)
        }
        return output.toString(Charsets.ISO_8859_1)
    }

    private fun JsonObject.string(name: String): String? = (get(name) as? JsonPrimitive)?.content
}
