package com.eleckoi.android.engine.workspace.runtime

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RuntimeGuestLayoutTest {
    @Test
    fun `creates only required guest mount targets`() {
        val temp = Files.createTempDirectory("runtime-guest-layout").toFile()
        try {
            val rootfs = File(temp, "rootfs").apply { mkdirs() }
            val chmodCalls = mutableListOf<Pair<String, Int>>()

            RuntimeGuestLayout.prepare(rootfs) { path, mode -> chmodCalls += path to mode }

            listOf("proc", "dev", "etc", "root", "tmp", "workspace", "opt/eleckoi", "run/eleckoi").forEach {
                assertTrue(File(rootfs, it).isDirectory)
            }
            listOf("dev/null", "dev/zero", "dev/random", "dev/urandom").forEach {
                assertTrue(File(rootfs, it).isFile)
            }
            assertTrue(File(rootfs, "etc/resolv.conf").isFile)
            assertTrue(File(rootfs, "run/eleckoi/proot-loader").isFile)
            assertTrue(
                File(rootfs, "run/eleckoi/landlock-run").readText()
                    .contains("--ro /run/eleckoi/proot-loader"),
            )
            assertTrue(RuntimeGuestLayout.isPrepared(rootfs))
            assertEquals(
                listOf(
                    File(rootfs, "tmp").absolutePath to 0x3ff,
                    File(rootfs, "run/eleckoi/landlock-run").absolutePath to 0x1ed,
                ),
                chmodCalls,
            )
        } finally {
            temp.deleteRecursively()
        }
    }
}
