package com.eleckoi.android.engine.workspace.runtime

import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeStorageUsage
import java.io.File
import java.nio.file.Files

/** Measures the active installation without following guest-layout symbolic links. */
internal object RuntimeStorageUsageReader {
    fun measure(
        installation: File,
        harnessRelativePaths: Collection<String>,
    ): LocalRuntimeStorageUsage {
        if (!installation.isDirectory) return LocalRuntimeStorageUsage.Unknown
        val tools = File(installation, "tools")
        val harnessFiles = harnessRelativePaths
            .mapNotNull { relative -> safeChild(tools, relative) }
            .filter(File::isFile)
            .distinctBy(File::getPath)
        val harnessBytes = harnessFiles.sumOf(File::length)
        return LocalRuntimeStorageUsage(
            ubuntuBytes = directorySize(File(installation, "rootfs")),
            harnessBytes = harnessBytes,
            toolchainBytes = (directorySize(tools) - harnessBytes).coerceAtLeast(0L),
        )
    }

    fun directorySize(root: File): Long {
        if (!root.exists()) return 0L
        var total = 0L
        var visited = 0
        val pending = ArrayDeque<File>()
        pending.addLast(root)
        while (pending.isNotEmpty() && visited < MaxVisitedEntries) {
            val current = pending.removeFirst()
            visited++
            if (Files.isSymbolicLink(current.toPath())) {
                total += runCatching {
                    Files.readSymbolicLink(current.toPath()).toString().length.toLong()
                }.getOrDefault(0L)
                continue
            }
            if (current.isDirectory) {
                current.listFiles().orEmpty().forEach(pending::addLast)
            } else {
                total += current.length()
            }
        }
        return total
    }

    private fun safeChild(root: File, relative: String): File? = runCatching {
        require(relative.isNotBlank() && !relative.startsWith('/') && !relative.contains('\\'))
        val canonicalRoot = root.canonicalFile
        val child = File(canonicalRoot, relative).canonicalFile
        require(child.toPath().startsWith(canonicalRoot.toPath()))
        child
    }.getOrNull()

    private const val MaxVisitedEntries = 400_000
}
