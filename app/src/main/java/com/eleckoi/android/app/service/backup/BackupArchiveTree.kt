package com.eleckoi.android.app.service.backup

import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption

internal data class BackupArchiveTree(
    val directories: List<String>,
    val files: List<BackupArchiveFile>,
)

internal data class BackupArchiveFile(
    val entryName: String,
    val file: File,
)

/** Captures files and empty directories without following links outside app-owned storage. */
internal fun collectBackupArchiveTree(root: File, includedRoots: List<String>): BackupArchiveTree {
    val canonicalRoot = root.canonicalFile
    val directories = linkedMapOf<String, Unit>()
    val files = linkedMapOf<String, BackupArchiveFile>()

    fun entryName(file: File): String {
        val canonical = file.canonicalFile
        require(canonical != canonicalRoot && canonical.toPath().startsWith(canonicalRoot.toPath())) {
            "备份文件路径越界"
        }
        return "files/" + canonical.relativeTo(canonicalRoot).invariantSeparatorsPath
    }

    fun visit(current: File) {
        val path = current.toPath()
        require(!Files.isSymbolicLink(path)) { "备份目录不能包含符号链接" }
        when {
            Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS) -> {
                directories[entryName(current)] = Unit
                requireNotNull(current.listFiles()) { "无法读取备份目录：${current.absolutePath}" }
                    .sortedBy(File::getName)
                    .forEach(::visit)
            }
            Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) -> {
                if (!current.name.endsWith(".part", ignoreCase = true)) {
                    val name = entryName(current)
                    files[name] = BackupArchiveFile(name, current)
                }
            }
            else -> error("备份目录包含不支持的文件类型：${current.absolutePath}")
        }
    }

    includedRoots.forEach { relative ->
        val candidate = File(canonicalRoot, relative.replace('/', File.separatorChar))
        if (Files.exists(candidate.toPath(), LinkOption.NOFOLLOW_LINKS)) visit(candidate)
    }
    return BackupArchiveTree(
        directories = directories.keys.sortedWith(compareBy<String> { it.count { char -> char == '/' } }.thenBy { it }),
        files = files.values.sortedBy(BackupArchiveFile::entryName),
    )
}

internal fun restoreBackupDirectories(root: File, entryNames: List<String>) {
    entryNames
        .sortedWith(compareBy<String> { it.count { char -> char == '/' } }.thenBy { it })
        .forEach { entryName ->
            val directory = resolveBackupEntry(root, entryName)
            require(!Files.isSymbolicLink(directory.toPath())) { "备份目录路径不安全" }
            require(directory.mkdirs() || Files.isDirectory(directory.toPath(), LinkOption.NOFOLLOW_LINKS)) {
                "无法恢复备份目录：$entryName"
            }
        }
}

internal fun resolveBackupEntry(root: File, entryName: String): File {
    require(entryName.startsWith("files/") && entryName.length > "files/".length) {
        "备份文件路径不安全"
    }
    val relative = entryName.removePrefix("files/")
    require(relative.split('/').none { it.isBlank() || it == "." || it == ".." }) {
        "备份文件路径不安全"
    }
    val canonicalRoot = root.canonicalFile
    val target = File(canonicalRoot, relative.replace('/', File.separatorChar)).canonicalFile
    require(target != canonicalRoot && target.toPath().startsWith(canonicalRoot.toPath())) {
        "备份文件路径越界"
    }
    return target
}
