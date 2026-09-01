package com.eleckoi.android.engine.workspace.runtime.process

import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import java.nio.file.attribute.BasicFileAttributes

internal fun interface ProcessResourceGuard {
    /** Returns a user-facing violation, or null while the process may continue. */
    fun violationOrNull(): String?
}

internal data class FileTreeQuota(
    val label: String,
    val maxFiles: Int,
    val maxEntries: Int,
    val maxDepth: Int,
    val maxSingleFileBytes: Long,
    val maxTotalBytes: Long,
)

/**
 * PRoot represents ordinary guest hard links as host symbolic links. A quota
 * walker is not a filesystem sandbox, so production scans count those entries
 * without following or interpreting their targets.
 */
internal enum class FileTreeSymbolicLinkPolicy {
    Reject,
    CountWithoutFollowing,
}

internal class FileTreeQuotaGuard(
    rootDirectory: File,
    private val quota: FileTreeQuota,
    private val symbolicLinkPolicy: FileTreeSymbolicLinkPolicy = FileTreeSymbolicLinkPolicy.Reject,
    private val ignoredRootDirectories: Set<String> = emptySet(),
    private val allowMissingRoot: Boolean = false,
) : ProcessResourceGuard {
    private val root = rootDirectory.toPath().toAbsolutePath().normalize()

    init {
        require(quota.maxFiles > 0 && quota.maxEntries >= quota.maxFiles) { "文件配额无效" }
        require(quota.maxDepth > 0 && quota.maxSingleFileBytes > 0 && quota.maxTotalBytes > 0) {
            "存储配额无效"
        }
        require(ignoredRootDirectories.all(::isSafeRootDirectoryName)) {
            "忽略的根目录名称无效"
        }
    }

    override fun violationOrNull(): String? = runCatching {
        if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) {
            return@runCatching if (allowMissingRoot) null else "${quota.label}目录无效"
        }
        if (!Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(root)) {
            return@runCatching "${quota.label}目录无效"
        }
        val counters = Counters()
        inspectDirectory(root, depth = 0, counters)
        null
    }.getOrElse { error ->
        if (error is QuotaViolation) error.message else "无法安全检查${quota.label}：${error.message.orEmpty()}"
    }

    private fun inspectDirectory(directory: Path, depth: Int, counters: Counters) {
        if (depth > quota.maxDepth) throw QuotaViolation("${quota.label}目录层级超过 ${quota.maxDepth}")
        val currentAttributes = try {
            Files.readAttributes(
                directory,
                BasicFileAttributes::class.java,
                LinkOption.NOFOLLOW_LINKS,
            )
        } catch (_: NoSuchFileException) {
            return
        }
        if (currentAttributes.isSymbolicLink) {
            inspectSymbolicLink()
            return
        }
        if (!currentAttributes.isDirectory) return
        val entries = try {
            Files.newDirectoryStream(directory)
        } catch (_: NoSuchFileException) {
            // Harness tools use atomic replace/cleanup operations. A vanished directory is
            // transient and will be examined again on the next supervisor scan.
            return
        }
        entries.use {
            for (child in entries) {
                counters.entries += 1
                if (counters.entries > quota.maxEntries) {
                    throw QuotaViolation("${quota.label}条目数超过 ${quota.maxEntries}")
                }
                val attributes = try {
                    Files.readAttributes(
                        child,
                        BasicFileAttributes::class.java,
                        LinkOption.NOFOLLOW_LINKS,
                    )
                } catch (_: NoSuchFileException) {
                    continue
                }
                if (
                    depth == 0 &&
                    attributes.isDirectory &&
                    !attributes.isSymbolicLink &&
                    child.fileName.toString() in ignoredRootDirectories
                ) {
                    // A second guard owns this subtree. The directory entry itself still counts
                    // against the parent, while its volatile contents use their own lifecycle-
                    // appropriate quota.
                    continue
                }
                when {
                    attributes.isSymbolicLink -> inspectSymbolicLink()
                    attributes.isDirectory -> inspectDirectory(child, depth + 1, counters)
                    attributes.isRegularFile -> {
                        counters.files += 1
                        if (counters.files > quota.maxFiles) {
                            throw QuotaViolation("${quota.label}文件数超过 ${quota.maxFiles}")
                        }
                        val size = attributes.size()
                        if (size > quota.maxSingleFileBytes) {
                            throw QuotaViolation("${quota.label}单个文件超过 ${formatMiB(quota.maxSingleFileBytes)} MiB")
                        }
                        if (Long.MAX_VALUE - counters.totalBytes < size) {
                            throw QuotaViolation("${quota.label}大小计算溢出")
                        }
                        counters.totalBytes += size
                        if (counters.totalBytes > quota.maxTotalBytes) {
                            throw QuotaViolation("${quota.label}总大小超过 ${formatMiB(quota.maxTotalBytes)} MiB")
                        }
                    }
                    else -> throw QuotaViolation("${quota.label}包含不支持的文件类型")
                }
            }
        }
    }

    private fun inspectSymbolicLink() {
        if (symbolicLinkPolicy == FileTreeSymbolicLinkPolicy.Reject) {
            throw QuotaViolation("${quota.label}不能包含符号链接")
        }
        // Deliberately do not read or follow the target. Every link still consumes an
        // entry from maxEntries, while Android's app UID and PRoot mounts remain the
        // actual process boundary.
    }

    private class Counters(var entries: Int = 0, var files: Int = 0, var totalBytes: Long = 0)
    private class QuotaViolation(message: String) : IllegalStateException(message)

    private companion object {
        fun isSafeRootDirectoryName(value: String): Boolean =
            value.isNotBlank() && value != "." && value != ".." &&
                '/' !in value && '\\' !in value && '\u0000' !in value
    }
}

internal class CompositeProcessResourceGuard(
    private vararg val guards: ProcessResourceGuard,
) : ProcessResourceGuard {
    override fun violationOrNull(): String? = guards.firstNotNullOfOrNull(ProcessResourceGuard::violationOrNull)
}

/** Runs an expensive audit once during ProcessSupervisor.start, then becomes a no-op. */
internal class StartupOnlyProcessResourceGuard(
    private val delegate: ProcessResourceGuard,
) : ProcessResourceGuard {
    private var inspected = false

    @Synchronized
    override fun violationOrNull(): String? {
        if (inspected) return null
        inspected = true
        return delegate.violationOrNull()
    }
}

internal class MinimumUsableSpaceGuard(
    rootDirectory: File,
    private val minimumUsableBytes: Long,
) : ProcessResourceGuard {
    private val root = rootDirectory.canonicalFile

    init {
        require(minimumUsableBytes > 0L) { "最低剩余空间必须大于 0" }
    }

    override fun violationOrNull(): String? {
        if (!root.isDirectory) return "本地运行时存储目录无效"
        return if (root.usableSpace < minimumUsableBytes) {
            "设备剩余空间不足 ${formatMiB(minimumUsableBytes)} MiB"
        } else {
            null
        }
    }
}

private fun formatMiB(bytes: Long): Long = bytes / (1024L * 1024L)
