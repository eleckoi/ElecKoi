package com.eleckoi.android.engine.workspace.runtime

import android.system.Os
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import kotlin.coroutines.coroutineContext

internal class SafeTarGzExtractor(
    private val chmod: (String, Int) -> Unit = { path, mode -> Os.chmod(path, mode) },
) {
    suspend fun extract(
        archive: File,
        destination: File,
        maxExpandedBytes: Long,
        maxEntries: Int,
        label: String = "运行时归档",
        onEntry: (processedEntries: Int, expandedBytes: Long) -> Unit = { _, _ -> },
    ) = extract(
        openArchive = { FileInputStream(archive) },
        destination = destination,
        maxExpandedBytes = maxExpandedBytes,
        maxEntries = maxEntries,
        label = label,
        onEntry = onEntry,
    )

    suspend fun extract(
        openArchive: () -> InputStream,
        destination: File,
        maxExpandedBytes: Long,
        maxEntries: Int,
        label: String = "运行时归档",
        onEntry: (processedEntries: Int, expandedBytes: Long) -> Unit = { _, _ -> },
    ) = withContext(Dispatchers.IO) {
        require(maxExpandedBytes > 0 && maxEntries > 0) { "解压安全上限无效" }
        require(destination.isDirectory || destination.mkdirs()) { "无法创建运行时解压目录" }
        val root = destination.toPath().toAbsolutePath().normalize()
        val pendingHardLinks = mutableListOf<PendingHardLink>()
        var entryCount = 0
        var expandedBytes = 0L
        TarArchiveInputStream(
            GzipCompressorInputStream(BufferedInputStream(openArchive())),
        ).use { tar ->
            while (true) {
                coroutineContext.ensureActive()
                val entry: TarArchiveEntry = tar.nextEntry ?: break
                entryCount++
                require(entryCount <= maxEntries) { "运行时归档文件数量超过安全上限" }
                require(entry.size >= 0) { "运行时归档包含无效文件大小" }
                expandedBytes += entry.size
                require(expandedBytes <= maxExpandedBytes) {
                    "$label 解压体积超过安全上限（$expandedBytes / $maxExpandedBytes 字节，${entry.name}）"
                }
                val target = resolveSafeTarget(root, entry.name)
                if (target == root) {
                    require(entry.isDirectory) { "归档根条目必须是目录" }
                    onEntry(entryCount, expandedBytes)
                    continue
                }
                ensureNoSymlinkParents(root, target.parent)
                when {
                    entry.isDirectory -> {
                        require(!Files.isSymbolicLink(target)) { "归档试图用目录覆盖符号链接" }
                        Files.createDirectories(target)
                    }
                    entry.isSymbolicLink -> createSymlink(target, entry.linkName)
                    entry.isLink -> pendingHardLinks += PendingHardLink(
                        target = target,
                        linkName = entry.linkName,
                        mode = entry.mode and 0x1ff,
                    )
                    entry.isFile -> writeFile(tar, target, entry)
                    else -> Unit // Device nodes and FIFOs are supplied by narrow PRoot binds, never materialized.
                }
                onEntry(entryCount, expandedBytes)
            }
        }
        pendingHardLinks.forEach { hardLink ->
            coroutineContext.ensureActive()
            val target = hardLink.target
            ensureNoSymlinkParents(root, target.parent)
            val source = safeTarget(root, hardLink.linkName)
            ensureNoSymlinkParents(root, source.parent)
            require(Files.isRegularFile(source) && !Files.isSymbolicLink(source)) { "硬链接来源无效" }
            expandedBytes = Math.addExact(expandedBytes, Files.size(source))
            require(expandedBytes <= maxExpandedBytes) {
                "$label 解压体积超过安全上限（$expandedBytes / $maxExpandedBytes 字节，${hardLink.target}）"
            }
            target.parent?.let(Files::createDirectories)
            Files.deleteIfExists(target)
            // Android vendors may deny link(2) inside an app sandbox even when both files share
            // the same filesystem. Materialising the same bytes is portable and keeps the guest
            // filesystem semantics required by Ubuntu packages.
            BufferedInputStream(FileInputStream(source.toFile())).use { input ->
                BufferedOutputStream(FileOutputStream(target.toFile(), false)).use { output ->
                    input.copyTo(output, 64 * 1024)
                }
            }
            chmod(target.toString(), hardLink.mode)
            onEntry(entryCount, expandedBytes)
        }
    }

    private fun writeFile(tar: TarArchiveInputStream, target: Path, entry: TarArchiveEntry) {
        target.parent?.let(Files::createDirectories)
        require(!Files.isSymbolicLink(target)) { "归档试图覆盖符号链接" }
        BufferedOutputStream(FileOutputStream(target.toFile(), false)).use { output ->
            val buffer = ByteArray(64 * 1024)
            var remaining = entry.size
            while (remaining > 0) {
                val count = tar.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                require(count > 0) { "归档文件内容提前结束" }
                output.write(buffer, 0, count)
                remaining -= count
            }
        }
        chmod(target.toString(), entry.mode and 0x1ff)
    }

    private fun createSymlink(target: Path, rawLinkName: String) {
        require(rawLinkName.isNotBlank() && rawLinkName.indexOf('\u0000') < 0) { "符号链接目标无效" }
        target.parent?.let(Files::createDirectories)
        Files.deleteIfExists(target)
        Files.createSymbolicLink(target, Paths.get(rawLinkName))
    }

    private fun safeTarget(root: Path, rawName: String): Path {
        val target = resolveSafeTarget(root, rawName)
        require(target != root) { "归档路径越界" }
        return target
    }

    private fun resolveSafeTarget(root: Path, rawName: String): Path {
        val name = rawName.replace('\\', '/')
        require(name.isNotBlank() && !name.startsWith('/') && !DrivePath.containsMatchIn(name)) {
            "归档包含绝对路径"
        }
        val target = root.resolve(name).normalize()
        require(target.startsWith(root)) { "归档路径越界" }
        return target
    }

    private fun ensureNoSymlinkParents(root: Path, rawParent: Path?) {
        var current = rawParent ?: return
        val parents = ArrayDeque<Path>()
        while (current != root) {
            require(current.startsWith(root)) { "归档父路径越界" }
            parents.addFirst(current)
            current = current.parent ?: error("归档父路径无效")
        }
        parents.forEach { path ->
            require(!Files.isSymbolicLink(path)) { "归档路径穿过符号链接" }
            if (Files.exists(path)) require(Files.isDirectory(path)) { "归档父路径不是目录" }
        }
    }

    private companion object {
        val DrivePath = Regex("^[A-Za-z]:")
    }

    private data class PendingHardLink(
        val target: Path,
        val linkName: String,
        val mode: Int,
    )
}
