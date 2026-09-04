package com.eleckoi.android.engine.generation.image

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.OpenAiImageProviderId
import com.eleckoi.android.engine.generation.model.defaultImageSettings
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetSocketAddress
import java.util.Base64
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ImageGenerationIntegrationTest {
    @get:Rule val files = TemporaryFolder()

    @Test(timeout = 10_000)
    fun `configured GPT provider sends Images request and persists PNG`() = runBlocking {
        val captured = AtomicReference<JSONObject>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1/images/generations") { exchange ->
            assertEquals("Bearer test-key", exchange.requestHeaders.getFirst("Authorization"))
            assertEquals("image-test", exchange.requestHeaders.getFirst("X-Channel"))
            captured.set(JSONObject(exchange.requestBody.bufferedReader().readText()))
            val body = """{"data":[{"b64_json":"$Png"}]}""".toByteArray()
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        server.start()
        try {
            val path = ReplyImageGenerator(files.root).generate(
                imageConfig = config(server).copy(customHeaders = mapOf("X-Channel" to "image-test")),
                sessionId = "conversation",
                imageId = "frame-1",
                characterImagePrompt = "A silver-haired character.",
                scenePrompt = SceneImagePrompt("Standing beside a window.", ""),
            )
            assertArrayEquals(Base64.getDecoder().decode(Png), File(path).readBytes())
            assertEquals("gpt-image-2", captured.get().getString("model"))
            assertEquals(
                "A silver-haired character.\n\nStanding beside a window.",
                captured.get().getString("prompt"),
            )
        } finally {
            server.stop(0)
        }
    }

    private fun config(server: HttpServer) = ModelConfig(
        provider = OpenAiImageProviderId,
        baseUrl = "http://127.0.0.1:${server.address.port}/v1",
        apiKey = "test-key",
        imageSettings = defaultImageSettings(OpenAiImageProviderId),
    )

    private companion object {
        const val Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
    }
}
