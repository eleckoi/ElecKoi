package com.eleckoi.android.engine.workspace.runtime

import com.eleckoi.android.engine.workspace.runtime.process.RuntimeGuestCommand
import com.eleckoi.android.engine.workspace.runtime.process.RuntimeGuestCommandExecutor
import com.eleckoi.android.engine.workspace.runtime.process.RuntimeGuestCommandResult
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class RuntimeToolchainProvisionerTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun `provision bootstraps certificates before enabling the pinned snapshot`() = runBlocking {
        val rootfs = temporaryFolder.newFolder("rootfs")
        val tools = temporaryFolder.newFolder("tools")
        val resolver = temporaryFolder.newFile("resolv.conf").apply { writeText("nameserver 1.1.1.1\n") }
        val commands = mutableListOf<RuntimeGuestCommand>()
        val executor = RuntimeGuestCommandExecutor { command ->
            commands += command
            RuntimeGuestCommandResult(0, "", "")
        }
        val catalog = validCatalog()
        RuntimeToolchainProvisioner(executor, chmod = { _, _ -> }).provision(
            rootfs = rootfs,
            tools = tools,
            resolverConfig = resolver,
            catalog = catalog,
        )

        assertEquals(2, commands.size)
        assertTrue(commands[0].arguments.last().contains("ca-certificates"))
        assertFalse(commands[0].arguments.last().contains("--allow-unauthenticated"))
        assertTrue(commands[1].arguments.last().contains("python3"))
        assertFalse(commands[1].arguments.last().contains("trusted=yes"))
        assertEquals(
            "APT::Snapshot \"20260710T000000Z\";",
            File(rootfs, "etc/apt/apt.conf.d/50eleckoi-snapshot")
                .readLines()
                .first { it.startsWith("APT::Snapshot") },
        )
        assertTrue(File(rootfs, "usr/sbin/policy-rc.d").isFile)
        val sources = File(rootfs, "etc/apt/sources.list.d/ubuntu.sources").readText()
        assertEquals(2, Regex("Snapshot: 20260710T000000Z").findAll(sources).count())
        assertFalse(sources.contains("trusted=yes"))
    }

    @Test
    fun `health verification parses every required real tool version`() = runBlocking {
        val rootfs = temporaryFolder.newFolder("health-rootfs")
        val tools = temporaryFolder.newFolder("health-tools")
        val resolver = temporaryFolder.newFile("health-resolv.conf")
        val output = """
            deepseek=0.1.1-rc.2
            landlock=full
            node=v24.18.0
            npm=11.11.0
            pnpm=11.4.0
            python=Python 3.12.3
            git=git version 2.43.0
            curl=curl 8.5.0
            rg=ripgrep 14.1.0
            cc=gcc 13.3.0
            python_modules=ok
        """.trimIndent()
        val provisioner = RuntimeToolchainProvisioner(
            RuntimeGuestCommandExecutor { RuntimeGuestCommandResult(0, output, "") },
            chmod = { _, _ -> },
        )

        val report = provisioner.verify(rootfs, tools, resolver, validCatalog())

        assertEquals("v24.18.0", report.versions.getValue("node"))
        assertEquals("full", report.versions.getValue("landlock"))
        assertTrue(report.summary.contains("python Python 3.12.3"))
    }

    @Test
    fun `health verification requires the trusted CA bundle`() {
        val script = RuntimeHealthCommand.script(validCatalog())

        assertTrue(script.contains("test -s /etc/ssl/certs/ca-certificates.crt"))
        assertTrue(script.contains("landlock_launcher=/run/eleckoi/landlock-run"))
        assertTrue(script.contains("\"\$landlock_launcher\" --probe"))
        assertTrue(script.contains("test ! -e \"\$probe_root/outside/outside\""))
    }

    @Test
    fun `health parser fails closed when fields are missing or duplicated`() {
        assertThrows(IllegalArgumentException::class.java) {
            RuntimeHealthCommand.parse(RuntimeGuestCommandResult(0, "node=v24.18.0", ""))
        }
        val duplicate = RuntimeHealthReport.RequiredHealthKeys.joinToString("\n") { "$it=ok" } + "\ndeepseek=again"
        assertThrows(IllegalArgumentException::class.java) {
            RuntimeHealthCommand.parse(RuntimeGuestCommandResult(0, duplicate, ""))
        }
    }

    private fun validCatalog() = RuntimeDistributionCatalog(
        schemaVersion = 5,
        runtimeVersion = "test-toolchain-arm64",
        architecture = "arm64-v8a",
        rootfs = RuntimeArchive(
            kind = "ubuntu-base",
            version = "24.04.4",
            url = "https://cdimage.ubuntu.com/rootfs.tar.gz",
            sha256 = "a".repeat(64),
            archiveBytesLimit = 10_000,
            assetPath = "rootfs.egruntime",
        ),
        harnesses = mapOf(
            "deepseek" to HarnessRuntimeArchive(
                kind = "deepseek-harness-single-executable",
                version = "0.1.1-rc.2",
                url = "",
                sha256 = "b".repeat(64),
                archiveBytesLimit = 10_000,
                assetPath = "deepseek.egruntime",
                sourceCommit = "c".repeat(40),
                entrypoint = "bin/dsh-jsonrpc-agent",
                configPath = "etc/deepseek/cordis.yml",
                embeddedOnly = true,
            ),
        ),
        toolchain = RuntimeToolchainCatalog(
            ubuntuSnapshot = "20260710T000000Z",
            ubuntuPackages = listOf("ca-certificates", "curl", "git", "python3"),
            node = NodeRuntimeArchive(
                kind = "official-node-linux-arm64",
                version = "24.18.0",
                url = "https://nodejs.org/node.tar.gz",
                sha256 = "c".repeat(64),
                archiveBytesLimit = 10_000,
                archiveRoot = "node-v24.18.0-linux-arm64",
            ),
            pnpm = PnpmRuntimeArchive(
                kind = "official-pnpm-linux-arm64",
                version = "11.4.0",
                url = "https://github.com/pnpm.tar.gz",
                sha256 = "d".repeat(64),
                archiveBytesLimit = 10_000,
                entrypoint = "pnpm",
            ),
        ),
    )
}
