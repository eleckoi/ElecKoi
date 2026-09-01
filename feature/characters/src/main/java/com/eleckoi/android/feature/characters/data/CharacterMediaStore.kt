package com.eleckoi.android.feature.characters.data

import com.eleckoi.android.feature.characters.model.AvatarSlot
import com.eleckoi.android.foundation.storage.JsonFileStore
import com.eleckoi.android.foundation.storage.newId
import java.io.File

internal class CharacterMediaStore(
    private val store: JsonFileStore,
) {
    fun storeAvatar(folder: String, slot: AvatarSlot, source: File): File {
        val extension = if (slot == AvatarSlot.Circle) "png" else "jpg"
        return copyToCharacterFolder(
            folder = folder,
            fileName = "${slot.fileNamePrefix}-${newId(10)}.$extension",
            source = source,
        )
    }

    fun storeCover(folder: String, source: File): File {
        return copyToCharacterFolder(
            folder = folder,
            fileName = "cover-${newId(10)}.jpg",
            source = source,
        )
    }

    fun storeChatBackground(folder: String, source: File): File {
        val extension = source.extension.lowercase()
            .takeIf { it in setOf("jpg", "jpeg", "png", "webp") }
            ?: "jpg"
        return copyToCharacterFolder(
            folder = folder,
            fileName = "chat-background-${newId(10)}.$extension",
            source = source,
        )
    }

    fun cleanupAvatarSlot(folder: String, slot: AvatarSlot, keep: File?) {
        cleanupFiles(folder, "${slot.fileNamePrefix}-", keep)
    }

    fun cleanupCovers(folder: String, keep: File?) {
        cleanupFiles(folder, "cover-", keep)
    }

    fun cleanupChatBackgrounds(folder: String, keep: File?) {
        cleanupFiles(folder, "chat-background-", keep)
    }

    fun deleteCharacterFolder(folder: String) {
        val root = store.dir("characters")
        val dir = File(root, folder)
        if (dir.exists() && dir.canonicalPath.startsWith(root.canonicalPath)) {
            dir.deleteRecursively()
        }
    }

    private fun copyToCharacterFolder(folder: String, fileName: String, source: File): File {
        val destination = store.file("characters", folder, fileName)
        destination.parentFile?.mkdirs()
        source.inputStream().use { input ->
            destination.outputStream().use { output -> input.copyTo(output) }
        }
        return destination
    }

    private fun cleanupFiles(folder: String, prefix: String, keep: File?) {
        val directory = store.dir("characters", folder)
        val rootPath = directory.canonicalPath
        val keepPath = keep?.canonicalPath
        directory.listFiles { file -> file.isFile && file.name.startsWith(prefix) }
            .orEmpty()
            .filter { it.canonicalPath != keepPath && it.canonicalPath.startsWith(rootPath) }
            .forEach(File::delete)
    }
}
