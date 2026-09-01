package com.eleckoi.android.engine.immersive.project

import com.eleckoi.android.engine.workspace.model.CreatorWorkspaceLimits
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.zip.ZipInputStream

internal data class ImportedFrontendFiles(
    val entryFile: String,
    val files: List<String>,
)

internal object FrontendProjectImporter {
    const val MaxFileCount = CreatorWorkspaceLimits.MaxFileCount
    const val MaxExpandedBytes = CreatorWorkspaceLimits.MaxTotalBytes
    private const val Megabyte = 1024L * 1024L

    fun import(source: File, originalName: String, destination: File): ImportedFrontendFiles {
        destination.mkdirs()
        return when {
            originalName.endsWith(".html", ignoreCase = true) ||
                originalName.endsWith(".htm", ignoreCase = true) -> importSingleHtml(source, destination)
            isZip(source) -> importZip(source, destination)
            else -> error("请选择 HTML 文件或包含 index.html 的 ZIP 项目")
        }
    }

    fun importDirectory(
        source: File,
        destination: File,
        requestedEntryFile: String = "index.html",
    ): ImportedFrontendFiles {
        require(source.isDirectory) { "创作工作区不存在" }
        val sourceRoot = source.canonicalFile
        val destinationRoot = destination.canonicalFile
        val files = sourceRoot.walkTopDown()
            .filter(File::isFile)
            .toList()
        require(files.isNotEmpty()) { "创作工作区还是空的" }
        require(files.size <= MaxFileCount) { "前端项目最多包含 $MaxFileCount 个文件" }

        var copiedBytes = 0L
        val copiedFiles = files.map { file ->
            val canonical = file.canonicalFile
            require(canonical.path.startsWith(sourceRoot.path + File.separator)) {
                "工作区包含不安全路径"
            }
            val relativePath = canonical.relativeTo(sourceRoot).invariantSeparatorsPath
            require(relativePath.isNotBlank() && !relativePath.startsWith("../")) {
                "工作区包含不安全路径"
            }
            copiedBytes += canonical.length()
            require(copiedBytes <= MaxExpandedBytes) {
                "前端项目不能超过 ${MaxExpandedBytes / Megabyte} MB"
            }
            val target = File(destinationRoot, relativePath).canonicalFile
            require(target.path.startsWith(destinationRoot.path + File.separator)) {
                "工作区包含不安全路径：$relativePath"
            }
            target.parentFile?.mkdirs()
            canonical.copyTo(target, overwrite = true)
            relativePath
        }.sorted()

        val normalizedEntry = requestedEntryFile.replace('\\', '/').trimStart('/')
        val entryFile = copiedFiles.firstOrNull { it == normalizedEntry }
            ?: copiedFiles
                .filter { it.substringAfterLast('/').equals("index.html", ignoreCase = true) }
                .minByOrNull { it.count { char -> char == '/' } }
            ?: error("前端项目中没有找到 index.html")
        return ImportedFrontendFiles(entryFile = entryFile, files = copiedFiles)
    }

    private fun importSingleHtml(source: File, destination: File): ImportedFrontendFiles {
        require(source.length() <= MaxExpandedBytes) {
            "前端文件不能超过 ${MaxExpandedBytes / Megabyte} MB"
        }
        val target = File(destination, "index.html")
        source.copyTo(target, overwrite = true)
        return ImportedFrontendFiles(entryFile = "index.html", files = listOf("index.html"))
    }

    private fun importZip(source: File, destination: File): ImportedFrontendFiles {
        val root = destination.canonicalFile
        val files = mutableListOf<String>()
        var expandedBytes = 0L
        ZipInputStream(FileInputStream(source).buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val normalized = entry.name.replace('\\', '/').trimStart('/')
                if (normalized.isBlank()) continue
                require(!entry.name.startsWith('/') && !entry.name.startsWith('\\')) {
                    "压缩包包含绝对路径"
                }
                val target = File(root, normalized).canonicalFile
                require(target.path.startsWith(root.path + File.separator)) {
                    "压缩包包含不安全路径：${entry.name}"
                }
                if (entry.isDirectory) {
                    target.mkdirs()
                } else {
                    require(files.size < MaxFileCount) { "前端项目最多包含 $MaxFileCount 个文件" }
                    target.parentFile?.mkdirs()
                    FileOutputStream(target).buffered().use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val read = zip.read(buffer)
                            if (read <= 0) break
                            expandedBytes += read
                            require(expandedBytes <= MaxExpandedBytes) {
                                "前端项目解压后不能超过 ${MaxExpandedBytes / Megabyte} MB"
                            }
                            output.write(buffer, 0, read)
                        }
                    }
                    files += target.relativeTo(root).invariantSeparatorsPath
                }
                zip.closeEntry()
            }
        }
        val entryFile = files
            .filter { it.substringAfterLast('/').equals("index.html", ignoreCase = true) }
            .minByOrNull { it.count { char -> char == '/' } }
            ?: error("前端项目中没有找到 index.html")
        return ImportedFrontendFiles(entryFile = entryFile, files = files.sorted())
    }

    private fun isZip(file: File): Boolean {
        if (file.length() < 4) return false
        return FileInputStream(file).use { input ->
            input.read() == 0x50 && input.read() == 0x4B && input.read() in setOf(0x03, 0x05, 0x07) &&
                input.read() in setOf(0x04, 0x06, 0x08)
        }
    }
}
