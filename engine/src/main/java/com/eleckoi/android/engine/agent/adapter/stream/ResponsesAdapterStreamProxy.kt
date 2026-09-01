package com.eleckoi.android.engine.agent.adapter

import com.eleckoi.android.engine.agent.adapter.AdapterHttpCodec.readBounded
import com.eleckoi.android.engine.agent.adapter.AdapterHttpCodec.writeEvents
import com.eleckoi.android.engine.agent.adapter.AdapterHttpCodec.writeJsonError
import com.eleckoi.android.engine.agent.adapter.AdapterHttpCodec.writeProxyHeaders
import com.eleckoi.android.engine.agent.adapter.AdapterHttpCodec.writeSseHeaders
import com.eleckoi.android.engine.agent.diagnostics.AgentRequestDiagnostics
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.configuredMaxOutputTokens
import com.eleckoi.android.foundation.network.BoundedUtf8LineReader
import com.eleckoi.android.foundation.network.SensitiveTextSanitizer
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import java.io.OutputStream
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import okhttp3.Call
import okhttp3.Response

internal class ResponsesAdapterStreamProxy(
    private val scope: CoroutineScope,
    private val upstreams: MutableSet<Call>,
    private val deepSeekVisionFiles: DeepSeekVisionFilesAdapter?,
) {
    suspend fun proxyNativeProviderRequest(
        output: OutputStream,
        request: JsonObject,
        format: ProviderWireFormat,
        requestId: String,
        captureId: String,
        route: AdapterProviderRoute,
        routeModelConfig: ModelConfig,
        protocolHeaders: Map<String, String>,
    ) {
        val imageFormat = when (format) {
            ProviderWireFormat.Responses -> DeepSeekImageRequestFormat.Responses
            ProviderWireFormat.ChatCompletions -> DeepSeekImageRequestFormat.ChatCompletions
            ProviderWireFormat.AnthropicMessages,
            ProviderWireFormat.GoogleGemini,
            -> null
        }
        val nativeRequest = imageFormat?.let { target ->
            deepSeekVisionFiles?.prepare(request, routeModelConfig, target)?.body
        } ?: request
        val providerRequestBody = nativeRequest.toString()
        if (captureId.isNotBlank()) {
            AgentRequestDiagnostics.recordProviderRequest(captureId, requestId, providerRequestBody)
        }
        val payload = providerRequestBody.toByteArray(Charsets.UTF_8)
        require(payload.size <= MaxBodyBytes) { "Provider 请求超过 24 MiB" }
        val call = runCatching {
            AdapterUpstreamClient.openNativeCall(payload, routeModelConfig, format, protocolHeaders)
        }.getOrElse { error ->
            val message = safeErrorMessage(error, routeModelConfig)
            writeJsonError(output, AdapterUpstreamClient.failureStatus(error), message)
            return
        }
        var response: Response? = null
        var started = false
        upstreams += call
        try {
            response = call.execute()
            val status = response.code
            if (status !in 200..299) {
                val body = readBounded(response.body?.byteStream(), MaxErrorBytes).toString(Charsets.UTF_8)
                val sanitized = SensitiveTextSanitizer.sanitize(body, routeModelConfig.apiKey)
                writeJsonError(output, status, sanitized.ifBlank { "Provider 上游请求失败" })
                return
            }
            val contentType = response.header("Content-Type").orEmpty()
            if (!contentType.contains("text/event-stream", ignoreCase = true)) {
                val body = readBounded(response.body?.byteStream(), MaxErrorBytes).toString(Charsets.UTF_8)
                val sanitized = SensitiveTextSanitizer.sanitize(body, routeModelConfig.apiKey)
                writeJsonError(output, 502, sanitized.ifBlank { "Provider 上游没有返回流式 SSE" })
                return
            }
            writeProxyHeaders(output, status, contentType)
            started = true
            val input = requireNotNull(response.body) { "Provider 上游缺少响应正文" }.byteStream()
            val buffer = ByteArray(8_192)
            var total = 0L
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                require(total <= MaxNativeUpstreamBytes) { "Provider 流超过大小上限" }
                writeDownstream {
                    output.write(buffer, 0, count)
                    output.flush()
                }
            }
        } catch (closed: DownstreamConnectionClosed) {
            call.cancel()
            route.failTurn("Agent Harness 提前关闭本地响应连接，上游生成未完成")
        } catch (error: Exception) {
            val message = safeErrorMessage(error, routeModelConfig)
            route.failTurn(message)
            if (!started) runCatching {
                writeJsonError(output, AdapterUpstreamClient.failureStatus(error), message)
            }
        } finally {
            upstreams -= call
            response?.close()
        }
    }

    suspend fun proxyConvertedChatRequest(
        output: OutputStream,
        request: JsonObject,
        requestId: String,
        captureId: String,
        turnRequestIndex: Int,
        route: AdapterProviderRoute,
        routeModelConfig: ModelConfig,
        isCompactionRequest: Boolean,
    ) {
        val adaptedRequest = runCatching {
            val configuredMaxOutputTokens = if (isCompactionRequest) {
                null
            } else {
                routeModelConfig.configuredMaxOutputTokens()
            }
            ResponsesToChatCompletions.convertWithRoutes(
                request = request,
                upstreamModel = routeModelConfig.model,
                configuredMaxOutputTokens = configuredMaxOutputTokens,
            )
        }.getOrElse { error ->
            writeJsonError(output, 400, error.message ?: "Responses 请求无法转换")
            return
        }
        val imagePreparation = deepSeekVisionFiles?.prepare(
            request = adaptedRequest.body,
            config = routeModelConfig,
            format = DeepSeekImageRequestFormat.ChatCompletions,
        ) ?: DeepSeekPreparedImageRequest(adaptedRequest.body)
        val providerRequestBody = imagePreparation.body.toString()
        val preparedChatRequest = adaptedRequest.copy(
            body = imagePreparation.body,
            estimatedInputTokens = approximateTokenCount(providerRequestBody),
        )
        if (captureId.isNotBlank()) {
            AgentRequestDiagnostics.recordProviderRequest(
                captureId = captureId,
                requestId = requestId,
                requestBody = providerRequestBody,
            )
        }
        proxyChatStream(
            output = output,
            request = preparedChatRequest,
            turnRequestIndex = turnRequestIndex,
            route = route,
            routeModelConfig = routeModelConfig,
        )
    }

    suspend fun proxyNativeResponsesRequest(
        output: OutputStream,
        request: JsonObject,
        requestId: String,
        captureId: String,
        route: AdapterProviderRoute,
        routeModelConfig: ModelConfig,
    ) {
        val imagePreparation = deepSeekVisionFiles?.prepare(
            request = request,
            config = routeModelConfig,
            format = DeepSeekImageRequestFormat.Responses,
        ) ?: DeepSeekPreparedImageRequest(request)
        val nativeRequest = imagePreparation.body
        if (captureId.isNotBlank()) {
            AgentRequestDiagnostics.recordProviderRequest(
                captureId = captureId,
                requestId = requestId,
                requestBody = nativeRequest.toString(),
            )
        }
        proxyNativeResponsesStream(
            output = output,
            request = nativeRequest,
            route = route,
            routeModelConfig = routeModelConfig,
        )
    }

    private suspend fun proxyNativeResponsesStream(
        output: OutputStream,
        request: JsonObject,
        route: AdapterProviderRoute,
        routeModelConfig: ModelConfig,
    ) {
        val payload = request.toString().toByteArray(Charsets.UTF_8)
        require(payload.size <= MaxBodyBytes) { "Responses 请求超过 24 MiB" }
        val call = runCatching {
            AdapterUpstreamClient.openResponsesCall(payload, routeModelConfig)
        }.getOrElse { error ->
            val failureMessage = safeErrorMessage(error, routeModelConfig)
            writeJsonError(
                output,
                AdapterUpstreamClient.failureStatus(error),
                "无法连接 Responses 上游：$failureMessage",
            )
            return
        }
        var sseStarted = false
        var response: Response? = null
        var terminalType = ""
        val eventDecoder = NativeResponsesSseEventDecoder(ElecKoiJson)
        val replayBuffer = ResponsesEventReplayBuffer(
            settings = ResponsesEventReplayBuffer.Settings(
                maxItems = 100,
                maxBytes = 2 * 1024,
                maxDurationMillis = NativeReplayWindowMillis,
            ),
        )
        val streamLock = Any()
        val asynchronousDownstreamClose = AtomicReference<DownstreamConnectionClosed?>(null)
        var replayFlushJob: Job? = null

        fun writeNativeEvents(events: List<ResponsesSseEvent>) {
            if (events.isEmpty()) return
            asynchronousDownstreamClose.get()?.let { throw it }
            synchronized(streamLock) {
                asynchronousDownstreamClose.get()?.let { throw it }
                events.firstOrNull { it.type in NativeTerminalEvents }?.let { terminal ->
                    terminalType = terminal.type
                }
                val outbound = replayBuffer.consume(events)
                writeDownstream { writeEvents(output, outbound) }
            }
        }

        fun flushNativeReplay() {
            asynchronousDownstreamClose.get()?.let { throw it }
            synchronized(streamLock) {
                asynchronousDownstreamClose.get()?.let { throw it }
                val outbound = replayBuffer.flush()
                writeDownstream { writeEvents(output, outbound) }
            }
        }
        upstreams += call
        try {
            response = call.execute()
            val status = response.code
            if (status !in 200..299) {
                val body = readBounded(response.body?.byteStream(), MaxErrorBytes)
                    .toString(Charsets.UTF_8)
                val sanitizedBody = SensitiveTextSanitizer.sanitize(body, routeModelConfig.apiKey)
                writeJsonError(output, status, sanitizedBody.ifBlank { "Responses 上游请求失败" })
                return
            }
            val contentType = response.header("Content-Type").orEmpty()
            if (!contentType.contains("text/event-stream", ignoreCase = true)) {
                val body = readBounded(response.body?.byteStream(), MaxErrorBytes)
                    .toString(Charsets.UTF_8)
                val sanitizedBody = SensitiveTextSanitizer.sanitize(body, routeModelConfig.apiKey)
                writeJsonError(
                    output,
                    502,
                    sanitizedBody.ifBlank { "Responses 上游没有返回流式 SSE" },
                )
                return
            }
            writeDownstream { writeSseHeaders(output) }
            sseStarted = true
            replayFlushJob = scope.launch(Dispatchers.IO) {
                while (isActive) {
                    delay(replayBuffer.flushIntervalMillis())
                    try {
                        flushNativeReplay()
                    } catch (closed: DownstreamConnectionClosed) {
                        if (asynchronousDownstreamClose.compareAndSet(null, closed)) {
                            call.cancel()
                        }
                        break
                    }
                }
            }
            BoundedUtf8LineReader(
                requireNotNull(response.body) { "Responses 上游缺少响应正文" }.byteStream(),
                maxLineChars = MaxUpstreamLineChars,
                maxTotalChars = MaxUpstreamResponseChars,
            ).use { reader ->
                while (true) {
                    val line = reader.readLine() ?: break
                    writeNativeEvents(eventDecoder.acceptLine(line))
                }
            }
            asynchronousDownstreamClose.get()?.let { throw it }
            writeNativeEvents(eventDecoder.finish())
            flushNativeReplay()
            if (terminalType.isBlank()) {
                route.failTurn("Responses 流在完成事件前关闭")
            }
        } catch (closed: DownstreamConnectionClosed) {
            call.cancel()
            route.failTurn("Agent Harness 提前关闭本地响应连接，上游生成未完成")
        } catch (error: Exception) {
            val failureMessage = safeErrorMessage(error, routeModelConfig)
            route.failTurn(failureMessage)
            if (!sseStarted) {
                runCatching {
                    writeJsonError(output, AdapterUpstreamClient.failureStatus(error), failureMessage)
                }
            }
        } finally {
            replayFlushJob?.cancelAndJoin()
            upstreams -= call
            response?.close()
        }
    }

    private suspend fun proxyChatStream(
        output: OutputStream,
        request: AdaptedChatCompletionsRequest,
        turnRequestIndex: Int,
        route: AdapterProviderRoute,
        routeModelConfig: ModelConfig,
    ) {
        val payload = request.body.toString().toByteArray(Charsets.UTF_8)
        require(payload.size <= MaxBodyBytes) { "Chat Completions 请求超过 24 MiB" }
        val call = runCatching {
            AdapterUpstreamClient.openChatCall(payload, routeModelConfig)
        }.getOrElse { error ->
            val failureMessage = safeErrorMessage(error, routeModelConfig)
            writeJsonError(
                output,
                AdapterUpstreamClient.failureStatus(error),
                "无法连接 Chat Completions 上游：${SensitiveTextSanitizer.sanitize(error.message.orEmpty(), routeModelConfig.apiKey)}",
            )
            return
        }
        val translator = ChatCompletionsToResponsesStream(
            toolRoutes = request.toolRoutes,
            estimatedInputTokens = request.estimatedInputTokens,
            allowTerminalReasoningFallback = turnRequestIndex == 1,
        )
        val replayBuffer = ResponsesEventReplayBuffer()
        val streamLock = Any()
        val asynchronousDownstreamClose = AtomicReference<DownstreamConnectionClosed?>(null)
        var replayFlushJob: Job? = null

        fun writeTranslatedEvents(events: List<ResponsesSseEvent>) {
            asynchronousDownstreamClose.get()?.let { throw it }
            synchronized(streamLock) {
                asynchronousDownstreamClose.get()?.let { throw it }
                val outbound = replayBuffer.consume(events)
                writeDownstream { writeEvents(output, outbound) }
            }
        }

        fun flushReplayBuffer() {
            asynchronousDownstreamClose.get()?.let { throw it }
            synchronized(streamLock) {
                asynchronousDownstreamClose.get()?.let { throw it }
                val outbound = replayBuffer.flush()
                writeDownstream { writeEvents(output, outbound) }
            }
        }

        fun processData(data: String): Boolean {
            synchronized(streamLock) {
                asynchronousDownstreamClose.get()?.let { throw it }
                val translated = translator.acceptData(data)
                val outbound = replayBuffer.consume(translated)
                writeDownstream { writeEvents(output, outbound) }
            }
            return data.trim() == "[DONE]"
        }

        fun reportDownstreamClosed() {
            route.failTurn("Agent Harness 提前关闭本地响应连接，上游生成未完成")
        }
        var sseStarted = false
        var response: Response? = null
        upstreams += call
        try {
            response = call.execute()
            val status = response.code
            if (status !in 200..299) {
                val body = readBounded(response.body?.byteStream(), MaxErrorBytes)
                    .toString(Charsets.UTF_8)
                val sanitizedBody = SensitiveTextSanitizer.sanitize(body, routeModelConfig.apiKey)
                writeJsonError(output, status, sanitizedBody.ifBlank { "Chat Completions 上游请求失败" })
                return
            }
            writeDownstream { writeSseHeaders(output) }
            sseStarted = true
            replayFlushJob = scope.launch(Dispatchers.IO) {
                while (isActive) {
                    delay(replayBuffer.flushIntervalMillis())
                    try {
                        flushReplayBuffer()
                    } catch (closed: DownstreamConnectionClosed) {
                        if (asynchronousDownstreamClose.compareAndSet(null, closed)) {
                            call.cancel()
                        }
                        break
                    }
                }
            }
            var sawDone = false
            BoundedUtf8LineReader(
                requireNotNull(response.body) { "Chat Completions 上游缺少响应正文" }.byteStream(),
                maxLineChars = MaxUpstreamLineChars,
                maxTotalChars = MaxUpstreamResponseChars,
            ).use { reader ->
                val dataLines = mutableListOf<String>()
                while (true) {
                    val line = reader.readLine()
                    if (line == null) {
                        if (dataLines.isNotEmpty()) {
                            sawDone = processData(dataLines.joinToString("\n")) || sawDone
                        }
                        break
                    }
                    if (line.isEmpty()) {
                        if (dataLines.isNotEmpty()) {
                            sawDone = processData(dataLines.joinToString("\n")) || sawDone
                            dataLines.clear()
                        }
                    } else if (line.startsWith("data:")) {
                        dataLines += line.removePrefix("data:").trimStart()
                    }
                }
            }
            asynchronousDownstreamClose.get()?.let { throw it }
            if (!sawDone && translator.canFinishAtEof()) {
                writeTranslatedEvents(translator.finish())
                sawDone = true
            }
            if (!sawDone) {
                val failureMessage = "Chat Completions 流在 [DONE] 前关闭"
                route.failTurn(failureMessage)
                writeTranslatedEvents(translator.fail("adapter_stream_closed", failureMessage))
            } else if (translator.terminalFailure() != null) {
                val failure = requireNotNull(translator.terminalFailure())
                route.failTurn(failure.message)
            }
        } catch (closed: DownstreamConnectionClosed) {
            reportDownstreamClosed()
        } catch (error: Exception) {
            val asynchronousClose = asynchronousDownstreamClose.get()
            if (asynchronousClose != null) {
                reportDownstreamClosed()
                return
            }
            val failureMessage = safeErrorMessage(error, routeModelConfig)
            runCatching {
                if (sseStarted) {
                    route.failTurn(failureMessage)
                    val failureEvents = translator.fail(
                        "adapter_upstream_error",
                        failureMessage,
                    )
                    writeTranslatedEvents(failureEvents)
                } else {
                    writeJsonError(
                        output,
                        AdapterUpstreamClient.failureStatus(error),
                        failureMessage,
                    )
                }
            }
        } finally {
            replayFlushJob?.cancelAndJoin()
            upstreams -= call
            response?.close()
        }
    }

    private inline fun writeDownstream(block: () -> Unit) {
        try {
            block()
        } catch (error: Exception) {
            throw DownstreamConnectionClosed(error)
        }
    }

    private fun safeErrorMessage(error: Throwable, routeModelConfig: ModelConfig): String =
        SensitiveTextSanitizer.sanitize(
            error.message ?: "模型上游流处理失败",
            routeModelConfig.apiKey,
            maxChars = MaxClientErrorChars,
        )

    private class DownstreamConnectionClosed(cause: Throwable) : RuntimeException(cause)

    private companion object {
        const val MaxBodyBytes = 24 * 1024 * 1024
        const val MaxErrorBytes = 64 * 1024
        const val MaxClientErrorChars = 2_000
        const val MaxUpstreamLineChars = 4 * 1024 * 1024
        const val MaxUpstreamResponseChars = 32 * 1024 * 1024
        const val MaxNativeUpstreamBytes = 32L * 1024L * 1024L
        const val NativeReplayWindowMillis = 40L
        val NativeTerminalEvents = setOf(
            "response.completed",
            "response.failed",
            "response.incomplete",
        )
    }
}
