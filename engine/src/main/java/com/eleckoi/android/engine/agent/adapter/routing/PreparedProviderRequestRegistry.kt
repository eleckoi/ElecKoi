package com.eleckoi.android.engine.agent.adapter

import com.eleckoi.android.engine.generation.model.ModelConfig
import java.util.concurrent.ConcurrentHashMap

/** One-time authority connecting a projected DSH request to exactly one native provider request. */
internal data class PreparedProviderRequest(
    val route: AdapterProviderRoute,
    val modelConfig: ModelConfig,
    val format: ProviderWireFormat,
    val requestId: String,
    val captureId: String,
    val isCompactionRequest: Boolean,
    val createdAtMillis: Long,
)

internal enum class ProviderWireFormat(val piApi: String) {
    Responses("openai-responses"),
    ChatCompletions("openai-completions"),
    AnthropicMessages("anthropic-messages"),
    GoogleGemini("google-generative-ai"),
}

internal class PreparedProviderRequestRegistry(
    private val tokenFactory: () -> String,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val requests = ConcurrentHashMap<String, PreparedProviderRequest>()

    fun issue(request: PreparedProviderRequest): String {
        discardExpired()
        check(requests.size < MaxPendingRequests) { "等待发送的模型请求过多" }
        repeat(MaxTokenAttempts) {
            val token = tokenFactory()
            require(Token.matches(token)) { "Provider request token 格式无效" }
            if (requests.putIfAbsent(token, request) == null) return token
        }
        error("无法分配 Provider request token")
    }

    fun consume(token: String): PreparedProviderRequest? {
        if (!Token.matches(token)) return null
        val request = requests.remove(token) ?: return null
        return request.takeIf { clock() - it.createdAtMillis <= RequestTtlMillis }
    }

    fun cancel(token: String): Boolean = requests.remove(token) != null

    fun clear() = requests.clear()

    private fun discardExpired() {
        val now = clock()
        requests.entries.removeIf { (_, request) ->
            now - request.createdAtMillis > RequestTtlMillis
        }
    }

    private companion object {
        const val MaxPendingRequests = 64
        const val MaxTokenAttempts = 8
        const val RequestTtlMillis = 2 * 60 * 1_000L
        val Token = Regex("^[A-Za-z0-9_-]{24,128}$")
    }
}
