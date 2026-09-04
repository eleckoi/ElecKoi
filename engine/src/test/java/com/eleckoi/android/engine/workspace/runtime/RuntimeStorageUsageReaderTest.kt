package com.eleckoi.android.engine.workspace.runtime

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class RuntimeStorageUsageReaderTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun `splits installation into ubuntu harness and remaining tools`() {
        val installation = temporaryFolder.newFolder("installation")
        write(File(installation, "rootfs/bin/sh"), 400)
        write(File(installation, "rootfs/usr/lib/libc.so"), 600)
        write(File(installation, "tools/bin/deepseek"), 900)
        write(File(installation, "tools/etc/cordis.yml"), 100)
        write(File(installation, "tools/bin/landlock-run"), 250)
        write(File(installation, "tools/bin/rg"), 50)

        val usage = RuntimeStorageUsageReader.measure(
            installation,
            listOf("bin/deepseek", "etc/cordis.yml"),
        )

        assertEquals(1_000L, usage.ubuntuBytes)
        assertEquals(1_000L, usage.harnessBytes)
        assertEquals(300L, usage.toolchainBytes)
        assertEquals(2_300L, usage.totalBytes)
        assertTrue(usage.measured)
    }

    @Test
    fun `missing installation reports unknown usage`() {
        val usage = RuntimeStorageUsageReader.measure(
            File(temporaryFolder.root, "missing"),
            listOf("bin/deepseek"),
        )

        assertEquals(0L, usage.totalBytes)
        assertFalse(usage.measured)
    }

    @Test
    fun `harness path cannot escape tools directory`() {
        val installation = temporaryFolder.newFolder("escaping")
        write(File(installation, "tools/bin/deepseek"), 700)
        write(File(installation, "rootfs/secret"), 4_000)

        val usage = RuntimeStorageUsageReader.measure(
            installation,
            listOf("../rootfs/secret", "bin/deepseek"),
        )

        assertEquals(700L, usage.harnessBytes)
        assertEquals(0L, usage.toolchainBytes)
    }

    private fun write(target: File, bytes: Int) {
        target.parentFile?.mkdirs()
        target.writeBytes(ByteArray(bytes))
    }
}
