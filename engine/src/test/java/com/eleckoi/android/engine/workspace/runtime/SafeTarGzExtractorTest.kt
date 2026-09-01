package com.eleckoi.android.engine.workspace.runtime

import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import kotlinx.coroutines.runBlocking
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.archivers.tar.TarConstants
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SafeTarGzExtractorTest {
    @Test
    fun `extracts bounded regular files`() = runBlocking {
        val temp = Files.createTempDirectory("runtime-extract-test").toFile()
        try {
            val archive = File(temp, "valid.tar.gz")
            createArchive(archive, mapOf("usr/bin/tool" to "hello"))
            val destination = File(temp, "out")

            SafeTarGzExtractor(chmod = { _, _ -> }).extract(
                archive = archive,
                destination = destination,
                maxExpandedBytes = 1_024,
                maxEntries = 10,
            )

            assertEquals("hello", File(destination, "usr/bin/tool").readText())
        } finally {
            temp.deleteRecursively()
        }
    }

    @Test
    fun `accepts a harmless archive root directory entry`() = runBlocking {
        val temp = Files.createTempDirectory("runtime-root-entry-test").toFile()
        try {
            val archive = File(temp, "root-entry.tar.gz")
            TarArchiveOutputStream(GzipCompressorOutputStream(FileOutputStream(archive))).use { tar ->
                tar.putArchiveEntry(TarArchiveEntry("./").apply { mode = 0b111101101 })
                tar.closeArchiveEntry()
                val bytes = "hello".toByteArray()
                tar.putArchiveEntry(TarArchiveEntry("./bin/tool").apply {
                    size = bytes.size.toLong()
                    mode = 0b110100100
                })
                tar.write(bytes)
                tar.closeArchiveEntry()
                tar.finish()
            }

            val destination = File(temp, "out")
            SafeTarGzExtractor(chmod = { _, _ -> }).extract(
                archive = archive,
                destination = destination,
                maxExpandedBytes = 1_024,
                maxEntries = 10,
            )

            assertEquals("hello", File(destination, "bin/tool").readText())
        } finally {
            temp.deleteRecursively()
        }
    }

    @Test
    fun `rejects a non-directory archive root entry`() {
        val temp = Files.createTempDirectory("runtime-root-file-test").toFile()
        try {
            val archive = File(temp, "root-file.tar.gz")
            createArchive(archive, mapOf("." to "bad"))

            assertThrows(IllegalArgumentException::class.java) {
                runBlocking {
                    SafeTarGzExtractor(chmod = { _, _ -> }).extract(
                        archive = archive,
                        destination = File(temp, "out"),
                        maxExpandedBytes = 1_024,
                        maxEntries = 10,
                    )
                }
            }
        } finally {
            temp.deleteRecursively()
        }
    }

    @Test
    fun `rejects tar path traversal`() {
        val temp = Files.createTempDirectory("runtime-traversal-test").toFile()
        try {
            val archive = File(temp, "invalid.tar.gz")
            createArchive(archive, mapOf("../escape" to "bad"))
            assertThrows(IllegalArgumentException::class.java) {
                runBlocking {
                    SafeTarGzExtractor(chmod = { _, _ -> }).extract(
                        archive = archive,
                        destination = File(temp, "out"),
                        maxExpandedBytes = 1_024,
                        maxEntries = 10,
                    )
                }
            }
        } finally {
            temp.deleteRecursively()
        }
    }

    @Test
    fun `materializes hard links when Android sandbox forbids link syscall`() = runBlocking {
        val temp = Files.createTempDirectory("runtime-hard-link-test").toFile()
        try {
            val archive = File(temp, "hard-link.tar.gz")
            TarArchiveOutputStream(GzipCompressorOutputStream(FileOutputStream(archive))).use { tar ->
                val bytes = "hello".toByteArray()
                tar.putArchiveEntry(TarArchiveEntry("usr/bin/tool").apply {
                    size = bytes.size.toLong()
                    mode = 0b111101101
                })
                tar.write(bytes)
                tar.closeArchiveEntry()
                tar.putArchiveEntry(TarArchiveEntry("usr/bin/tool-copy", TarConstants.LF_LINK).apply {
                    linkName = "usr/bin/tool"
                    size = 0
                    mode = 0b111101101
                })
                tar.closeArchiveEntry()
                tar.finish()
            }

            val destination = File(temp, "out")
            SafeTarGzExtractor(chmod = { _, _ -> }).extract(
                archive = archive,
                destination = destination,
                maxExpandedBytes = 10,
                maxEntries = 2,
            )

            assertEquals("hello", File(destination, "usr/bin/tool-copy").readText())
        } finally {
            temp.deleteRecursively()
        }
    }

    private fun createArchive(file: File, entries: Map<String, String>) {
        TarArchiveOutputStream(GzipCompressorOutputStream(FileOutputStream(file))).use { tar ->
            tar.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX)
            entries.forEach { (name, content) ->
                val bytes = content.toByteArray()
                val entry = TarArchiveEntry(name).apply {
                    size = bytes.size.toLong()
                    mode = 0b110100100
                }
                tar.putArchiveEntry(entry)
                tar.write(bytes)
                tar.closeArchiveEntry()
            }
            tar.finish()
        }
    }
}
