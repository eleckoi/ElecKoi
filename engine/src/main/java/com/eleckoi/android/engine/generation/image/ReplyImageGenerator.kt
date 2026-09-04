package com.eleckoi.android.engine.generation.image

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ImageGenerationSettings
import com.eleckoi.android.engine.generation.model.isOpenAiImageConfig
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

data class GeneratedImageFile(
    val path: String,
    val nameWithoutExtension: String,
    val modifiedAtMillis: Long,
)

class ReplyImageGenerator(
    private val rootDirectory: File,
    private val imageClient: ImageGenerationClient = ProviderImageGenerationClient(),
) {
    suspend fun generate(
        imageConfig: ModelConfig,
        sessionId: String,
        imageId: String,
        characterImagePrompt: String,
        scenePrompt: SceneImagePrompt,
        includeConfiguredPromptDefaults: Boolean = true,
        onRequestCapture: ((ImageGenerationRequestCapture) -> Unit)? = null,
    ): String {
        val prompt = finalSceneImagePrompt(
            settings = if (includeConfiguredPromptDefaults) {
                imageConfig.imageSettings
            } else {
                imageConfig.imageSettings.copy(promptPrefix = "", negativePrompt = "")
            },
            characterImagePrompt = characterImagePrompt.takeIf {
                includeConfiguredPromptDefaults
            }.orEmpty(),
            generatedPrompt = scenePrompt,
            naturalLanguage = imageConfig.isOpenAiImageConfig(),
        )
        val bytes = imageClient.generate(imageConfig, prompt, onRequestCapture)
        val directory = File(rootDirectory, safeSegment(sessionId)).also { folder ->
            check(folder.exists() || folder.mkdirs()) { "无法创建图片目录" }
        }
        // imageId identifies one concrete generation, not the stable assistant message. A
        // regenerated reply deliberately keeps its message id, while its bitmap must get a new
        // path so image loaders cannot return the previous revision from memory or disk cache.
        val target = File(directory, "${safeSegment(imageId)}.png")
        val temporary = File.createTempFile("reply-", ".png.tmp", directory)
        try {
            temporary.outputStream().use { stream ->
                stream.write(bytes)
                stream.flush()
            }
            runCatching {
                Files.move(
                    temporary.toPath(),
                    target.toPath(),
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE,
                )
            }.getOrElse {
                Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
        } finally {
            if (temporary.exists()) temporary.delete()
        }
        return target.absolutePath
    }

    fun deleteGeneratedFiles(localPaths: Iterable<String>) {
        val root = runCatching { rootDirectory.canonicalFile }.getOrNull() ?: return
        localPaths.asSequence()
            .filter(String::isNotBlank)
            .mapNotNull { path -> runCatching { File(path).canonicalFile }.getOrNull() }
            .filter { file -> file.isFile && file.extension.equals("png", ignoreCase = true) }
            .filter { file -> file.toPath().startsWith(root.toPath()) }
            .forEach { file ->
                val parent = file.parentFile
                if (file.delete() && parent?.list()?.isEmpty() == true) {
                    parent.delete()
                }
            }
    }

    fun deleteSessionImages(sessionId: String) {
        val root = runCatching { rootDirectory.canonicalFile }.getOrNull() ?: return
        val directory = runCatching {
            File(root, safeSegment(sessionId)).canonicalFile
        }.getOrNull() ?: return
        if (directory.parentFile != root || !directory.isDirectory) return
        directory.listFiles()
            .orEmpty()
            .filter { file ->
                file.isFile &&
                    file.parentFile == directory &&
                    (
                        file.extension.equals("png", ignoreCase = true) ||
                            file.name.endsWith(".png.tmp")
                        )
            }
            .forEach(File::delete)
        if (directory.list()?.isEmpty() == true) directory.delete()
    }

    fun generatedFiles(sessionId: String): List<GeneratedImageFile> {
        val root = runCatching { rootDirectory.canonicalFile }.getOrNull() ?: return emptyList()
        val directory = runCatching {
            File(root, safeSegment(sessionId)).canonicalFile
        }.getOrNull() ?: return emptyList()
        if (directory.parentFile != root || !directory.isDirectory) return emptyList()
        return directory.listFiles()
            .orEmpty()
            .asSequence()
            .filter { file ->
                file.isFile &&
                    file.parentFile == directory &&
                    file.extension.equals("png", ignoreCase = true)
            }
            .map { file ->
                GeneratedImageFile(
                    path = file.absolutePath,
                    nameWithoutExtension = file.nameWithoutExtension,
                    modifiedAtMillis = file.lastModified(),
                )
            }
            .sortedBy(GeneratedImageFile::modifiedAtMillis)
            .toList()
    }

    private fun safeSegment(value: String): String = value
        .trim()
        .replace(Regex("[^A-Za-z0-9._-]"), "_")
        .take(120)
        .ifBlank { "unknown" }

}

internal fun finalSceneImagePrompt(
    settings: ImageGenerationSettings,
    characterImagePrompt: String,
    generatedPrompt: SceneImagePrompt,
    naturalLanguage: Boolean = false,
): SceneImagePrompt = SceneImagePrompt(
    prompt = if (naturalLanguage) {
        listOf(settings.promptPrefix, characterImagePrompt, generatedPrompt.prompt)
            .map(String::trim)
            .filter(String::isNotBlank)
            .joinToString("\n\n")
            .take(8_000)
    } else {
        joinPromptParts(settings.promptPrefix, characterImagePrompt, generatedPrompt.prompt).take(8_000)
    },
    negativePrompt = joinPromptParts(
        generatedPrompt.negativePrompt.ifBlank { if (naturalLanguage) "" else DefaultNegativePrompt },
        settings.negativePrompt,
    ).take(4_000),
    frameIndex = generatedPrompt.frameIndex,
    afterParagraph = generatedPrompt.afterParagraph,
)

private fun joinPromptParts(vararg parts: String): String = parts
    .map(String::trim)
    .filter(String::isNotBlank)
    .joinToString(", ")
