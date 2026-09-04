package com.eleckoi.android.engine.generation.model

const val OpenAiImageProviderId: String = "openai_image"
const val OpenAiDefaultImageModel: String = "gpt-image-2"

enum class ImageGenerationProvider(val id: String, val label: String, val defaultModel: String) {
    NovelAi(NovelAiImageProviderId, "NovelAI", NovelAiDefaultModel),
    OpenAi(OpenAiImageProviderId, "OpenAI Images", OpenAiDefaultImageModel),
}

fun imageGenerationProvider(providerId: String): ImageGenerationProvider? =
    ImageGenerationProvider.entries.firstOrNull {
        it.id.equals(providerId.trim(), ignoreCase = true)
    }

fun ModelConfig.imageGenerationProvider(): ImageGenerationProvider? = imageGenerationProvider(provider)

fun ModelConfig.isOpenAiImageConfig(): Boolean =
    imageGenerationProvider() == ImageGenerationProvider.OpenAi

fun defaultImageSettings(providerId: String): ImageGenerationSettings =
    if (imageGenerationProvider(providerId) == ImageGenerationProvider.OpenAi) {
        ImageGenerationSettings(width = 1024, height = 1536)
    } else {
        ImageGenerationSettings()
    }

fun ModelConfig.imagePromptCompilerInstruction(): String =
    imageSettings.promptCompilerInstruction.trim().ifBlank {
        if (isOpenAiImageConfig()) DefaultOpenAiImagePromptCompilerInstruction
        else DefaultNovelAiPromptCompilerInstruction
    }

val DefaultOpenAiImagePromptCompilerInstruction: String = """
    Create a precise image prompt for each requested frame using GPT Image.
    Select a distinct visible moment from the final roleplay reply. Preserve established character
    identity, clothing, actions, composition, environment and lighting. Do not invent later events.
    Write coherent natural-language descriptions, not NovelAI tags or sampling parameters.
    Keep any requested text verbatim and describe where it appears. Do not add captions or lettering
    unless requested. Fixed style and character descriptions are supplied separately by the app.
    Fill each frame's prompt with the scene description. Fill negative_prompt with scene-specific
    content to avoid, or an empty string if nothing needs excluding. The app includes these exclusions
    as natural-language instructions; they are not a separate model parameter.
""".trimIndent()

@kotlinx.serialization.Serializable
enum class ImageQuality(val apiValue: String, val label: String) {
    Auto("auto", "自动"),
    Low("low", "低"),
    Medium("medium", "中"),
    High("high", "高"),
}

@kotlinx.serialization.Serializable
enum class ImageBackground(val apiValue: String, val label: String) {
    Auto("auto", "自动"),
    Opaque("opaque", "不透明"),
    Transparent("transparent", "透明"),
}

/** Shared by both editors and the request boundary; invalid sizes are never silently resized. */
fun imageSizeError(providerId: String, width: Int?, height: Int?): String? {
    if (imageGenerationProvider(providerId) != ImageGenerationProvider.OpenAi) {
        return if (width !in 512..2048 || height !in 512..2048) {
            "宽高需要在 512 到 2048 之间。"
        } else {
            null
        }
    }
    if (width == null || height == null || width !in 16..3840 || height !in 16..3840) {
        return "宽高需要在 16 到 3840 之间。"
    }
    if (width % 16 != 0 || height % 16 != 0) return "宽高都需要是 16 的倍数。"
    if (maxOf(width, height) > minOf(width, height) * 3) {
        return "图片长边不能超过短边的 3 倍。"
    }
    if (width.toLong() * height !in 655_360L..8_294_400L) {
        return "总像素需要在 655360 到 8294400 之间，例如 1024 × 1536。"
    }
    return null
}
