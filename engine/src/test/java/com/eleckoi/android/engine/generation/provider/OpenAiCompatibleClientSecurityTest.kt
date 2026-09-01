package com.eleckoi.android.engine.generation.provider

import com.eleckoi.android.foundation.storage.ElecKoiDataException
import com.eleckoi.android.engine.generation.model.ModelConfig
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class OpenAiCompatibleClientSecurityTest {
    @Test
    fun `custom model provider requires an explicit API address`() {
        val error = assertThrows(ElecKoiDataException::class.java) {
            OpenAiCompatibleClient().fetchModels(
                ModelConfig(
                    provider = "custom",
                    apiKey = "secret",
                ),
            )
        }

        assertTrue(error.message.orEmpty().contains("自定义模型提供商 API 地址"))
    }

    @Test
    fun `does not send bearer through a proxy to a plaintext loopback endpoint`() {
        val error = assertThrows(ElecKoiDataException::class.java) {
            OpenAiCompatibleClient().fetchModels(
                ModelConfig(
                    apiKey = "secret",
                    baseUrl = "http://127.0.0.1:43210/v1",
                    proxyUrl = "http://proxy.example:8080",
                    model = "test-model",
                ),
            )
        }

        assertTrue(error.message.orEmpty().contains("不能经过代理"))
    }

    @Test
    fun `invalid configured proxy fails closed instead of silently connecting directly`() {
        val error = assertThrows(ElecKoiDataException::class.java) {
            OpenAiCompatibleClient().fetchModels(
                ModelConfig(
                    apiKey = "secret",
                    baseUrl = "https://api.example/v1",
                    proxyUrl = "not-a-proxy",
                    model = "test-model",
                ),
            )
        }

        assertTrue(error.message.orEmpty().contains("代理配置无效"))
    }
}
