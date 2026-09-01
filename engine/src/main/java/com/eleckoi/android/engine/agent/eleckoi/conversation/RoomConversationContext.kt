package com.eleckoi.android.engine.agent.eleckoi.conversation

import android.util.Base64
import com.eleckoi.android.engine.agent.api.AgentHistoryItem
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import java.io.File
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Rebuilds text-only role history from Room before the current user prompt is appended.
 *
 * Role chat intentionally omits native tool/reasoning items from older turns. Conversation history
 * is real thread history, not a depth-based prompt injection: the latter can place depth zero after
 * the current prompt and make the model treat an old assistant reply as the answer being generated.
 */
fun roomConversationHistory(
    messages: List<LedgerMessage>,
    currentUserMessageId: String,
): List<AgentHistoryItem> {
    val candidates = messages
    .filterNot { message ->
        message.pending ||
            (message.content.isBlank() && message.inputImageAttachmentsJson == "[]") ||
            (message.role == "user" && message.id == currentUserMessageId)
    }
    val imagesByMessage = candidates.associate { it.id to it.roomInputImages() }
    val retainedImageIds = buildSet {
        var remaining = MaxHistoricalImagePayloadBytes
        candidates.asReversed().forEach { message ->
            imagesByMessage[message.id].orEmpty().asReversed().forEach { image ->
                val projected = ((image.bytes.coerceAtLeast(0L) + 2L) / 3L) * 4L
                if (projected in 1L..remaining) {
                    add(image.id)
                    remaining -= projected
                }
            }
        }
    }
    return candidates.map { message ->
        val assistant = message.role == "assistant"
        val role = when (message.role) {
            "user" -> "user"
            "assistant" -> "assistant"
            else -> "developer"
        }
        AgentHistoryItem(
            buildJsonObject {
                put("type", "message")
                put("role", role)
                put("content", buildJsonArray {
                    if (message.content.isNotBlank()) {
                        add(buildJsonObject {
                            put("type", if (assistant) "output_text" else "input_text")
                            put("text", message.content)
                        })
                    }
                    if (!assistant) {
                        imagesByMessage[message.id].orEmpty().forEach { image ->
                            val dataUrl = image.takeIf { it.id in retainedImageIds }?.dataUrlOrNull()
                            if (dataUrl == null) {
                                add(buildJsonObject {
                                    put("type", "input_text")
                                    put("text", "[较早的图片附件已因累计载荷上限省略，请在需要时重新发送]")
                                })
                            } else {
                                add(buildJsonObject {
                                    put("type", "input_image")
                                    put("image_url", dataUrl)
                                })
                            }
                        }
                    }
                })
            }.toString(),
        )
    }
}

@Serializable
private data class RoomInputImage(
    val id: String = "",
    @SerialName("local_path")
    val localPath: String = "",
    @SerialName("media_type")
    val mediaType: String = "image/jpeg",
    val bytes: Long = 0L,
)

private fun LedgerMessage.roomInputImages(): List<RoomInputImage> = runCatching {
    ElecKoiJson.decodeFromString<List<RoomInputImage>>(inputImageAttachmentsJson)
}.getOrDefault(emptyList())

private fun RoomInputImage.dataUrlOrNull(): String? = runCatching {
    val file = File(localPath)
    if (!file.isFile || file.length() !in 1L..MaxSourceImageBytes) return@runCatching null
    "data:$mediaType;base64,${Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)}"
}.getOrNull()

private const val MaxSourceImageBytes = 20L * 1024L * 1024L
private const val MaxHistoricalImagePayloadBytes = 12L * 1024L * 1024L
