package com.eleckoi.android.engine.generation.image

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ImageGenerationSettings
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class GeneratedImageFile(
    val path: String,
    val nameWithoutExtension: String,
    val modifiedAtMillis: Long,
)

class ReplyImageGenerator(
    private val rootDirectory: File,
    private val imageClient: NovelAiImageClient = NovelAiImageClient(),
) {
    /** NovelAI rejects concurrent generations for one account, including manual regenerations. */
    private val generationLock = Mutex()

    suspend fun generate(
        imageConfig: ModelConfig,
        sessionId: String,
        imageId: String,
        characterImagePrompt: String,
        scenePrompt: SceneImagePrompt,
        onRequestCapture: (ImageGenerationRequestCapture) -> Unit = {},
    ): String {
        val prompt = finalSceneImagePrompt(
            settings = imageConfig.imageSettings,
            characterImagePrompt = characterImagePrompt,
            generatedPrompt = scenePrompt,
        )
        val bytes = generationLock.withLock {
            imageClient.generate(imageConfig, prompt, onRequestCapture)
        }
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
): SceneImagePrompt = SceneImagePrompt(
    prompt = joinPromptParts(
        settings.promptPrefix,
        characterImagePrompt,
        generatedPrompt.prompt,
    ).take(8_000),
    negativePrompt = joinPromptParts(
        generatedPrompt.negativePrompt,
        settings.negativePrompt,
    ).take(4_000),
    frameIndex = generatedPrompt.frameIndex,
    afterParagraph = generatedPrompt.afterParagraph,
)

private fun joinPromptParts(vararg parts: String): String = parts
    .map(String::trim)
    .filter(String::isNotBlank)
    .joinToString(", ")
