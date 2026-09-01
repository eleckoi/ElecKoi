package com.eleckoi.android.engine.agent.adapter

import com.eleckoi.android.engine.generation.model.ModelConfig
import org.junit.Assert.assertEquals
import org.junit.Test

class AdapterUpstreamClientTest {
    @Test
    fun `DeepSeek official Anthropic route includes its required base path`() {
        val call = AdapterUpstreamClient.openNativeCall(
            payload = "{}".toByteArray(),
            modelConfig = ModelConfig(
                provider = "deepseek",
                apiKey = "test-key",
                model = "deepseek-v4-flash",
            ),
            format = ProviderWireFormat.AnthropicMessages,
        )

        assertEquals(
            "https://api.deepseek.com/anthropic/v1/messages",
            call.request().url.toString(),
        )
    }

    @Test
    fun `explicit DeepSeek OpenAI root is normalized for Anthropic messages`() {
        val call = AdapterUpstreamClient.openNativeCall(
            payload = "{}".toByteArray(),
            modelConfig = ModelConfig(
                provider = "custom",
                apiKey = "test-key",
                baseUrl = "https://api.deepseek.com/v1",
                model = "deepseek-v4-flash",
            ),
            format = ProviderWireFormat.AnthropicMessages,
        )

        assertEquals(
            "https://api.deepseek.com/anthropic/v1/messages",
            call.request().url.toString(),
        )
    }

    @Test
    fun `custom Anthropic gateway keeps its own root path`() {
        val call = AdapterUpstreamClient.openNativeCall(
            payload = "{}".toByteArray(),
            modelConfig = ModelConfig(
                provider = "custom",
                apiKey = "test-key",
                baseUrl = "https://gateway.example/api",
                model = "deepseek-v4-flash",
            ),
            format = ProviderWireFormat.AnthropicMessages,
        )

        assertEquals(
            "https://gateway.example/api/v1/messages",
            call.request().url.toString(),
        )
    }

    @Test
    fun `versioned Anthropic gateway appends only messages`() {
        val call = AdapterUpstreamClient.openNativeCall(
            payload = "{}".toByteArray(),
            modelConfig = ModelConfig(
                provider = "custom",
                apiKey = "test-key",
                baseUrl = "https://gateway.example/zen/go/v1",
                model = "qwen3.8-flash",
            ),
            format = ProviderWireFormat.AnthropicMessages,
        )

        assertEquals(
            "https://gateway.example/zen/go/v1/messages",
            call.request().url.toString(),
        )
    }

    @Test
    fun `complete Anthropic messages endpoint is preserved`() {
        val call = AdapterUpstreamClient.openNativeCall(
            payload = "{}".toByteArray(),
            modelConfig = ModelConfig(
                provider = "custom",
                apiKey = "test-key",
                baseUrl = "https://gateway.example/zen/go/v1/messages",
                model = "minimax-m3",
            ),
            format = ProviderWireFormat.AnthropicMessages,
        )

        assertEquals(
            "https://gateway.example/zen/go/v1/messages",
            call.request().url.toString(),
        )
    }

    @Test
    fun `explicit DeepSeek OpenAI messages endpoint is normalized`() {
        val call = AdapterUpstreamClient.openNativeCall(
            payload = "{}".toByteArray(),
            modelConfig = ModelConfig(
                provider = "custom",
                apiKey = "test-key",
                baseUrl = "https://api.deepseek.com/v1/messages",
                model = "deepseek-v4-flash",
            ),
            format = ProviderWireFormat.AnthropicMessages,
        )

        assertEquals(
            "https://api.deepseek.com/anthropic/v1/messages",
            call.request().url.toString(),
        )
    }
}
