package com.eleckoi.android.engine.workspace.runtime.process

import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assume.assumeNoException
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FileTreeQuotaGuardTest {
    @Test
    fun `accepts a bounded regular file tree`() {
        withRoot { root ->
            File(root, "src").mkdirs()
            File(root, "src/index.html").writeText("hello")

            assertNull(guard(root).violationOrNull())
        }
    }

    @Test
    fun `rejects total bytes file count and depth`() {
        withRoot { root ->
            File(root, "one").writeBytes(ByteArray(6))
            File(root, "two").writeBytes(ByteArray(6))
            assertTrue(guard(root).violationOrNull().orEmpty().contains("总大小"))

            File(root, "two").delete()
            File(root, "three").writeText("x")
            assertTrue(guard(root, maxFiles = 1, maxTotalBytes = 100).violationOrNull().orEmpty().contains("文件数"))

            File(root, "three").delete()
            File(root, "a/b/c").mkdirs()
            assertTrue(guard(root, maxDepth = 1, maxTotalBytes = 100).violationOrNull().orEmpty().contains("层级"))

        }
    }

    @Test
    fun `reject policy still rejects an internal symbolic link`() {
        withRoot { root ->
            File(root, "target").writeText("x")
            createSymbolicLinkOrSkip(File(root, "link").toPath(), Path.of("target"))

            assertTrue(guard(root, maxTotalBytes = 100).violationOrNull().orEmpty().contains("符号链接"))
        }
    }

    @Test
    fun `count only policy accepts internal relative absolute and dangling links`() {
        withRoot { root ->
            val finalTarget = File(root, ".l2s.data.0001").apply { writeText("payload") }
            createSymbolicLinkOrSkip(File(root, "relative").toPath(), Path.of(finalTarget.name))
            createSymbolicLinkOrSkip(
                File(root, "absolute").toPath(),
                finalTarget.toPath().toAbsolutePath(),
            )
            createSymbolicLinkOrSkip(File(root, "building").toPath(), Path.of(".l2s.pending"))

            assertNull(
                guard(
                    root,
                    maxTotalBytes = 100,
                    symbolicLinkPolicy = FileTreeSymbolicLinkPolicy.CountWithoutFollowing,
                ).violationOrNull(),
            )
        }
    }

    @Test
    fun `count only policy accepts a PRoot style link chain without following it`() {
        withRoot { root ->
            val finalTarget = File(root, ".l2s.state.0001.0001").apply { writeText("payload") }
            val middle = File(root, ".l2s.state.0001")
            createSymbolicLinkOrSkip(middle.toPath(), finalTarget.toPath().toAbsolutePath())
            createSymbolicLinkOrSkip(
                File(root, "state").toPath(),
                middle.toPath().toAbsolutePath(),
            )

            assertNull(
                guard(
                    root,
                    maxTotalBytes = finalTarget.length(),
                    symbolicLinkPolicy = FileTreeSymbolicLinkPolicy.CountWithoutFollowing,
                ).violationOrNull(),
            )
        }
    }

    @Test
    fun `count only policy does not interpret external link targets`() {
        withRoot { root ->
            val outside = Files.createTempFile("quota-guard-outside", ".txt").toFile()
            try {
                createSymbolicLinkOrSkip(
                    File(root, "relative-outside").toPath(),
                    root.toPath().relativize(outside.toPath()),
                )
                val relativeViolation = guard(
                    root,
                    maxTotalBytes = 100,
                    symbolicLinkPolicy = FileTreeSymbolicLinkPolicy.CountWithoutFollowing,
                ).violationOrNull()
                assertNull(relativeViolation)

                Files.delete(File(root, "relative-outside").toPath())
                createSymbolicLinkOrSkip(
                    File(root, "absolute-outside").toPath(),
                    outside.toPath().toAbsolutePath(),
                )
                val absoluteViolation = guard(
                    root,
                    maxTotalBytes = 100,
                    symbolicLinkPolicy = FileTreeSymbolicLinkPolicy.CountWithoutFollowing,
                ).violationOrNull()
                assertNull(absoluteViolation)
            } finally {
                outside.delete()
            }
        }
    }

    @Test
    fun `parent can delegate one volatile root while child guard still enforces its quota`() {
        withRoot { root ->
            File(root, "state.json").writeText("ok")
            val volatile = File(root, ".tmp").apply { mkdir() }
            File(volatile, "one").writeText("1")
            File(volatile, "two").writeText("2")

            assertNull(
                guard(
                    root = root,
                    maxFiles = 1,
                    maxTotalBytes = 10,
                    ignoredRootDirectories = setOf(".tmp"),
                ).violationOrNull(),
            )
            assertTrue(
                guard(
                    root = volatile,
                    maxFiles = 1,
                    maxTotalBytes = 10,
                ).violationOrNull().orEmpty().contains("文件数"),
            )
        }
    }

    @Test
    fun `optional volatile root may disappear between atomic Harness operations`() {
        withRoot { root ->
            val missing = File(root, ".tmp")

            assertNull(guard(missing, allowMissingRoot = true).violationOrNull())
            assertTrue(guard(missing).violationOrNull().orEmpty().contains("目录无效"))
        }
    }

    @Test
    fun `rejects launch when minimum free space is unavailable`() {
        withRoot { root ->
            val violation = MinimumUsableSpaceGuard(root, Long.MAX_VALUE).violationOrNull()
            assertTrue(violation.orEmpty().contains("剩余空间不足"))
        }
    }

    @Test
    fun `startup only guard audits once and then becomes a no-op`() {
        var checks = 0
        val startupOnly = StartupOnlyProcessResourceGuard(
            delegate = ProcessResourceGuard {
                checks += 1
                if (checks == 1) null else "blocked"
            },
        )

        assertNull(startupOnly.violationOrNull())
        assertNull(startupOnly.violationOrNull())
        assertTrue(checks == 1)
    }

    private fun guard(
        root: File,
        maxFiles: Int = 10,
        maxDepth: Int = 8,
        maxTotalBytes: Long = 10,
        symbolicLinkPolicy: FileTreeSymbolicLinkPolicy = FileTreeSymbolicLinkPolicy.Reject,
        ignoredRootDirectories: Set<String> = emptySet(),
        allowMissingRoot: Boolean = false,
    ) = FileTreeQuotaGuard(
        root,
        FileTreeQuota(
            label = "测试工作区",
            maxFiles = maxFiles,
            maxEntries = 20,
            maxDepth = maxDepth,
            maxSingleFileBytes = 10,
            maxTotalBytes = maxTotalBytes,
        ),
        symbolicLinkPolicy = symbolicLinkPolicy,
        ignoredRootDirectories = ignoredRootDirectories,
        allowMissingRoot = allowMissingRoot,
    )

    private fun createSymbolicLinkOrSkip(link: Path, target: Path) {
        try {
            Files.createSymbolicLink(link, target)
        } catch (error: Exception) {
            assumeNoException("当前平台不能创建测试符号链接", error)
        }
    }

    private fun withRoot(block: (File) -> Unit) {
        val root = Files.createTempDirectory("quota-guard").toFile()
        try {
            block(root)
        } finally {
            root.deleteRecursively()
        }
    }
}
