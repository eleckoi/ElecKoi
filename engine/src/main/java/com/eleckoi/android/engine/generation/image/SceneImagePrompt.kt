package com.eleckoi.android.engine.generation.image

import org.json.JSONArray
import org.json.JSONObject

data class SceneImagePrompt(
    val prompt: String,
    val negativePrompt: String,
    val frameIndex: Int = 1,
    /** Retained only for reading older saved actions; new replies use [[IMAGE:n]] markers. */
    val afterParagraph: Int = Int.MAX_VALUE,
)

data class ImageGenerationRequestCapture(
    val label: String,
    val logicalRequestBody: String,
    val providerRequestBody: String,
)

internal fun parseSceneImagePrompt(raw: String): SceneImagePrompt {
    return parseSceneImagePrompts(raw).singleOrNull()
        ?: throw IllegalArgumentException("generate_image 必须包含一个画面")
}

fun parseSceneImagePrompts(raw: String): List<SceneImagePrompt> {
    val cleaned = raw.trim()
        .removePrefix("```json")
        .removePrefix("```JSON")
        .removePrefix("```")
        .removeSuffix("```")
        .trim()
    val objectText = cleaned.indexOf('{').takeIf { it >= 0 }?.let { start ->
        cleaned.lastIndexOf('}').takeIf { it > start }?.let { end -> cleaned.substring(start, end + 1) }
    } ?: cleaned
    val json = runCatching { JSONObject(objectText) }.getOrElse {
        return recoverCompleteSceneImageFrames(objectText)
            .takeIf(List<SceneImagePrompt>::isNotEmpty)
            ?: throw IllegalArgumentException("generate_image 的参数不是有效 JSON，且没有可恢复的完整分镜")
    }
    val frames = json.optJSONArray("frames") ?: run {
        val prompt = json.optString("prompt").trim().take(4_000)
        if (prompt.isBlank()) throw IllegalArgumentException("generate_image 缺少 frames")
        return listOf(
            SceneImagePrompt(
                prompt = prompt,
                negativePrompt = json.optString("negative_prompt").trim().take(2_000)
                    .ifBlank { DefaultNegativePrompt },
            ),
        )
    }
    require(frames.length() > 0) { "generate_image 的 frames 不能为空" }
    return buildList(frames.length()) {
        for (index in 0 until frames.length()) {
            val frame = frames.optJSONObject(index)
                ?: throw IllegalArgumentException("generate_image 第 ${index + 1} 个画面不是 JSON object")
            val prompt = frame.optString("prompt").trim().take(4_000)
            val negative = frame.optString("negative_prompt").trim().take(2_000)
            val frameIndex = frame.optInt("id", index + 1)
            val afterParagraph = frame.optInt("after_paragraph", Int.MAX_VALUE).coerceAtLeast(1)
            require(prompt.isNotBlank()) { "generate_image 第 ${index + 1} 个画面缺少 prompt" }
            require(frameIndex > 0) { "generate_image 第 ${index + 1} 个画面的 id 必须大于 0" }
            add(
                SceneImagePrompt(
                    prompt = prompt,
                    negativePrompt = negative.ifBlank { DefaultNegativePrompt },
                    frameIndex = frameIndex,
                    afterParagraph = afterParagraph,
                ),
            )
        }
    }
}

/**
 * Recovers complete frames when a model finishes a long action with malformed outer closers.
 *
 * This is intentionally not a general "fix arbitrary JSON" routine. It reads only complete JSON
 * string values for the exact `id`, `prompt`, and `negative_prompt` properties after `frames`.
 * A truncated string is never guessed, while earlier complete frames remain usable.
 */
private fun recoverCompleteSceneImageFrames(raw: String): List<SceneImagePrompt> {
    var cursor = 0
    var insideFrames = false
    var frameId: Int? = null
    var prompt: String? = null
    var negativePrompt: String? = null
    val recovered = mutableListOf<SceneImagePrompt>()

    fun flushFrame() {
        val id = frameId
        val positive = prompt
        val negative = negativePrompt
        if (id != null && id > 0 && positive != null && positive.isNotBlank() && negative != null) {
            recovered += SceneImagePrompt(
                prompt = positive.trim().take(4_000),
                negativePrompt = negative.trim().take(2_000).ifBlank { DefaultNegativePrompt },
                frameIndex = id,
            )
        }
        frameId = null
        prompt = null
        negativePrompt = null
    }

    while (cursor < raw.length) {
        val quote = raw.indexOf('"', startIndex = cursor)
        if (quote < 0) break
        val propertyToken = completeJsonString(raw, quote) ?: break
        var valueStart = propertyToken.endExclusive
        while (valueStart < raw.length && raw[valueStart].isWhitespace()) valueStart += 1
        if (valueStart >= raw.length || raw[valueStart] != ':') {
            cursor = propertyToken.endExclusive
            continue
        }
        valueStart += 1
        while (valueStart < raw.length && raw[valueStart].isWhitespace()) valueStart += 1

        when {
            propertyToken.value == "frames" -> {
                insideFrames = true
                cursor = valueStart
            }
            !insideFrames -> cursor = valueStart
            propertyToken.value == "id" -> {
                flushFrame()
                val numberEnd = raw.indexOfFirstFrom(valueStart) { !it.isDigit() }
                val end = if (numberEnd < 0) raw.length else numberEnd
                frameId = raw.substring(valueStart, end).toIntOrNull()
                cursor = end.coerceAtLeast(valueStart + 1)
            }
            propertyToken.value == "prompt" || propertyToken.value == "negative_prompt" -> {
                if (valueStart >= raw.length || raw[valueStart] != '"') {
                    cursor = valueStart.coerceAtLeast(propertyToken.endExclusive)
                    continue
                }
                val valueToken = completeJsonString(raw, valueStart) ?: break
                if (propertyToken.value == "prompt") {
                    prompt = valueToken.value
                } else {
                    negativePrompt = valueToken.value
                }
                cursor = valueToken.endExclusive
            }
            else -> cursor = valueStart.coerceAtLeast(propertyToken.endExclusive)
        }
    }
    flushFrame()
    return recovered
}

private data class CompleteJsonString(
    val value: String,
    val endExclusive: Int,
)

private fun completeJsonString(raw: String, start: Int): CompleteJsonString? {
    if (start !in raw.indices || raw[start] != '"') return null
    var escaped = false
    var cursor = start + 1
    while (cursor < raw.length) {
        val character = raw[cursor]
        when {
            escaped -> escaped = false
            character == '\\' -> escaped = true
            character == '"' -> {
                val token = raw.substring(start, cursor + 1)
                val value = runCatching { JSONArray("[$token]").getString(0) }.getOrNull()
                    ?: return null
                return CompleteJsonString(value = value, endExclusive = cursor + 1)
            }
        }
        cursor += 1
    }
    return null
}

private inline fun String.indexOfFirstFrom(start: Int, predicate: (Char) -> Boolean): Int {
    for (index in start until length) {
        if (predicate(this[index])) return index
    }
    return -1
}

internal const val DefaultNegativePrompt: String =
    "lowres, worst quality, bad quality, bad anatomy, bad hands, extra limbs, extra fingers, " +
        "missing fingers, malformed, text, subtitles, signature, logo, watermark"
