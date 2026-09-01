package com.eleckoi.android.engine.workspace.storage

import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.StandardCopyOption
import java.util.UUID

internal class AtomicWorkspaceFileStore {
    fun writeJson(file: File, text: String) {
        writeBytes(file, text.toByteArray(Charsets.UTF_8))
    }

    fun writeBytes(file: File, bytes: ByteArray) {
        file.parentFile?.mkdirs()
        val temporary = File(file.parentFile, ".${file.name}.tmp-${UUID.randomUUID()}")
        try {
            temporary.writeBytes(bytes)
            try {
                Files.move(
                    temporary.toPath(),
                    file.toPath(),
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING,
                )
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
        } finally {
            temporary.delete()
        }
    }
}

internal fun moveWorkspaceDirectoryAtomically(source: File, destination: File) {
    require(
        !Files.isSymbolicLink(source.toPath()) &&
            Files.isDirectory(source.toPath(), LinkOption.NOFOLLOW_LINKS),
    ) { "待移动的工作区目录不存在或不安全" }
    require(!Files.exists(destination.toPath(), LinkOption.NOFOLLOW_LINKS)) {
        "工作区恢复目标已存在"
    }
    destination.parentFile?.mkdirs()
    try {
        Files.move(source.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE)
    } catch (_: AtomicMoveNotSupportedException) {
        Files.move(source.toPath(), destination.toPath())
    }
}
