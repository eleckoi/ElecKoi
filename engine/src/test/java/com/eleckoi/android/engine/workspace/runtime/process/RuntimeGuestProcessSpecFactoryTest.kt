package com.eleckoi.android.engine.workspace.runtime.process

import com.eleckoi.android.engine.workspace.runtime.RuntimeGuestLayout
import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class RuntimeGuestProcessSpecFactoryTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun `maintenance guest exposes tools but never workspace DSH state or secrets`() {
        val fixture = Fixture(temporaryFolder)
        val script = "node --version"
        val spec = fixture.factory.create(
            RuntimeGuestCommand(
                commandId = "health_1",
                rootfs = fixture.rootfs,
                tools = fixture.tools,
                hostResolverConfig = fixture.resolver,
                arguments = listOf("/bin/sh", "-c", script),
            ),
        )
        val joined = spec.arguments.joinToString(" ")

        assertTrue(joined.contains(":/opt/eleckoi"))
        assertTrue(joined.contains(":/run/eleckoi/proot-loader"))
        assertTrue(joined.contains("/opt/eleckoi/toolchain/node/bin"))
        assertFalse(joined.contains("/workspace"))
        assertFalse(joined.contains("/workspace-dsh-home"))
        assertFalse(joined.contains("api_key", ignoreCase = true))
        assertTrue(spec.arguments.takeLast(3) == listOf("/bin/sh", "-c", script))
    }

    @Test
    fun `rejects unsafe guest environment and working paths`() {
        val fixture = Fixture(temporaryFolder)
        assertThrows(IllegalArgumentException::class.java) {
            fixture.factory.create(
                RuntimeGuestCommand(
                    commandId = "bad",
                    rootfs = fixture.rootfs,
                    tools = fixture.tools,
                    hostResolverConfig = fixture.resolver,
                    arguments = listOf("/bin/true"),
                    guestWorkingDirectory = "../../data",
                ),
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            fixture.factory.create(
                RuntimeGuestCommand(
                    commandId = "bad_env",
                    rootfs = fixture.rootfs,
                    tools = fixture.tools,
                    hostResolverConfig = fixture.resolver,
                    arguments = listOf("/bin/true"),
                    environment = mapOf("API-KEY" to "secret"),
                ),
            )
        }
    }

    private class Fixture(folder: TemporaryFolder) {
        val native = folder.newFolder("native")
        val temp = folder.newFolder("tmp")
        val proc = folder.newFolder("proc")
        val dev = folder.newFolder("dev")
        val rootfs = folder.newFolder("rootfs")
        val tools = folder.newFolder("tools")
        val resolver = folder.newFile("resolv.conf").apply { writeText("nameserver 1.1.1.1\n") }
        val factory: RuntimeGuestProcessSpecFactory

        init {
            listOf(
                "libeleckoi_proot.so",
                "libeleckoi_proot_loader.so",
                "libtalloc.so",
                "libandroid-shmem.so",
            ).forEach { File(native, it).writeText("binary") }
            listOf("null", "zero", "random", "urandom").forEach { File(dev, it).writeText("") }
            File(rootfs, "bin").mkdirs()
            File(rootfs, "bin/sh").writeText("shell")
            File(rootfs, "usr/bin").mkdirs()
            File(rootfs, "usr/bin/env").writeText("env")
            RuntimeGuestLayout.prepare(rootfs, chmod = { _, _ -> })
            factory = RuntimeGuestProcessSpecFactory(native, temp, proc, dev)
        }
    }
}
