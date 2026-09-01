package com.eleckoi.android.engine.workspace.runtime

import android.system.Os
import com.eleckoi.android.engine.workspace.runtime.process.RuntimeGuestCommand
import com.eleckoi.android.engine.workspace.runtime.process.RuntimeGuestCommandExecutor
import com.eleckoi.android.engine.workspace.runtime.process.RuntimeGuestCommandResult
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext

internal data class RuntimeHealthReport(
    val versions: Map<String, String>,
) {
    val summary: String
        get() = KnownHealthKeys.mapNotNull { key -> versions[key]?.let { "$key $it" } }.joinToString(" · ")

    companion object {
        val RequiredHealthKeys = listOf("deepseek", "landlock", "rg")
        val KnownHealthKeys = listOf(
            "deepseek",
            "landlock",
            "node",
            "npm",
            "pnpm",
            "python",
            "git",
            "curl",
            "rg",
            "cc",
        )
    }
}

internal class RuntimeToolchainProvisioner(
    private val commandExecutor: RuntimeGuestCommandExecutor,
    private val chmod: (String, Int) -> Unit = { path, mode -> Os.chmod(path, mode) },
) {
    suspend fun provision(
        rootfs: File,
        tools: File,
        resolverConfig: File,
        catalog: RuntimeDistributionCatalog,
    ) = withContext(Dispatchers.IO) {
        val toolchain = requireNotNull(catalog.toolchain) { "当前运行时没有声明整套工具链" }
        preparePackageManager(rootfs)
        installCaCertificates(rootfs, tools, resolverConfig)

        writeSnapshotConfiguration(rootfs, toolchain.ubuntuSnapshot)
        clearDirectoryContents(safeRootChild(rootfs, "var/lib/apt/lists"))
        val packages = toolchain.ubuntuPackages.joinToString(" ") { packageName ->
            require(PackageName.matches(packageName)) { "Ubuntu 工具包名称无效" }
            packageName
        }
        commandExecutor.execute(
            command(
                id = "runtime_packages",
                rootfs = rootfs,
                tools = tools,
                resolverConfig = resolverConfig,
                script = """
                    set -eu
                    export DEBIAN_FRONTEND=noninteractive
                    export APT_LISTCHANGES_FRONTEND=none
                    apt-get -o Acquire::Retries=3 update
                    apt-get -o Acquire::Retries=3 install -y --no-install-recommends $packages
                    dpkg --audit
                """.trimIndent(),
                timeoutMillis = PackageProvisionTimeoutMillis,
            ),
        ).requireSuccess("安装 Ubuntu 创作工具链")
        cleanupPackageCache(rootfs)
    }

    private suspend fun installCaCertificates(
        rootfs: File,
        tools: File,
        resolverConfig: File,
    ) {
        commandExecutor.execute(
            command(
                id = "runtime_ca_bootstrap",
                rootfs = rootfs,
                tools = tools,
                resolverConfig = resolverConfig,
                script = CaBootstrapScript,
                timeoutMillis = PackageProvisionTimeoutMillis,
            ),
        ).requireSuccess("安装 Ubuntu CA 证书")
    }

    suspend fun verify(
        rootfs: File,
        tools: File,
        resolverConfig: File,
        catalog: RuntimeDistributionCatalog,
        commandId: String = "runtime_health",
    ): RuntimeHealthReport {
        val result = commandExecutor.execute(
            command(
                id = commandId,
                rootfs = rootfs,
                tools = tools,
                resolverConfig = resolverConfig,
                script = RuntimeHealthCommand.script(catalog),
                timeoutMillis = HealthCheckTimeoutMillis,
            ),
        ).requireSuccess("校验本地创作环境")
        return RuntimeHealthCommand.parse(result)
    }

    private fun preparePackageManager(rootfs: File) {
        val policy = safeRootChild(rootfs, "usr/sbin/policy-rc.d")
        policy.parentFile?.let { require(it.isDirectory || it.mkdirs()) { "无法创建 Ubuntu 策略目录" } }
        policy.writeText("#!/bin/sh\nexit 101\n", Charsets.UTF_8)
        chmod(policy.absolutePath, 0x1ed) // 0755
        listOf(
            "var/lib/apt/lists/partial",
            "var/cache/apt/archives/partial",
            "var/lib/dpkg",
        ).forEach { relative ->
            val directory = safeRootChild(rootfs, relative)
            require(directory.isDirectory || directory.mkdirs()) { "无法创建 Ubuntu 包管理目录" }
        }
        writeUbuntuSources(rootfs, snapshotId = null)
    }

    private fun writeSnapshotConfiguration(rootfs: File, snapshotId: String) {
        require(SnapshotId.matches(snapshotId)) { "Ubuntu 软件快照编号无效" }
        val target = safeRootChild(rootfs, "etc/apt/apt.conf.d/50eleckoi-snapshot")
        target.parentFile?.let { require(it.isDirectory || it.mkdirs()) { "无法创建 Ubuntu APT 配置目录" } }
        target.writeText(
            """
                // Managed by ElecKoi. Keep package installs reproducible.
                APT::Snapshot "$snapshotId";
                Acquire::Retries "3";
            """.trimIndent() + "\n",
            Charsets.UTF_8,
        )
        writeUbuntuSources(rootfs, snapshotId)
    }

    private fun writeUbuntuSources(rootfs: File, snapshotId: String?) {
        snapshotId?.let { require(SnapshotId.matches(it)) { "Ubuntu 软件快照编号无效" } }
        val target = safeRootChild(rootfs, "etc/apt/sources.list.d/ubuntu.sources")
        target.parentFile?.let { require(it.isDirectory || it.mkdirs()) { "无法创建 Ubuntu 软件源目录" } }
        val snapshotLine = snapshotId?.let { "\nSnapshot: $it" }.orEmpty()
        val suites = if (snapshotId == null) "noble" else "noble noble-updates"
        val security = if (snapshotId == null) "" else "\n\n" + """
            Types: deb
            URIs: http://ports.ubuntu.com/ubuntu-ports/
            Suites: noble-security
            Components: main universe
            Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
            Snapshot: $snapshotId
        """.trimIndent()
        target.writeText(
            """
                Types: deb
                URIs: http://ports.ubuntu.com/ubuntu-ports/
                Suites: $suites
                Components: main universe
                Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg$snapshotLine
            """.trimIndent() + security + "\n",
            Charsets.UTF_8,
        )
    }

    private suspend fun cleanupPackageCache(rootfs: File) = withContext(Dispatchers.IO) {
        clearDirectoryContents(safeRootChild(rootfs, "var/lib/apt/lists"))
        clearDirectoryContents(safeRootChild(rootfs, "var/cache/apt/archives"), keepDirectoryName = "partial")
    }

    private suspend fun clearDirectoryContents(directory: File, keepDirectoryName: String? = null) {
        if (!directory.exists()) return
        require(directory.isDirectory && !Files.isSymbolicLink(directory.toPath())) { "Ubuntu 缓存路径无效" }
        directory.listFiles().orEmpty().forEach { child ->
            coroutineContext.ensureActive()
            if (child.name == keepDirectoryName) return@forEach
            require(child.canonicalFile.toPath().startsWith(directory.canonicalFile.toPath())) {
                "Ubuntu 缓存路径越界"
            }
            require(!Files.isSymbolicLink(child.toPath())) { "Ubuntu 缓存中包含不安全的符号链接" }
            require(child.deleteRecursively()) { "无法清理 Ubuntu 包缓存" }
        }
    }

    private fun command(
        id: String,
        rootfs: File,
        tools: File,
        resolverConfig: File,
        script: String,
        timeoutMillis: Long,
    ) = RuntimeGuestCommand(
        commandId = id,
        rootfs = rootfs,
        tools = tools,
        hostResolverConfig = resolverConfig,
        arguments = listOf("/bin/sh", "-c", script),
        environment = mapOf(
            "DEBIAN_FRONTEND" to "noninteractive",
            "APT_LISTCHANGES_FRONTEND" to "none",
        ),
        timeoutMillis = timeoutMillis,
    )

    private fun safeRootChild(rootfs: File, relative: String): File {
        require(relative.isNotBlank() && !relative.startsWith('/') && !relative.contains('\\')) {
            "Ubuntu 内部路径无效"
        }
        val root = rootfs.canonicalFile
        val child = File(root, relative).canonicalFile
        require(child.toPath().startsWith(root.toPath()) && child != root) { "Ubuntu 内部路径越界" }
        return child
    }

    private companion object {
        val SnapshotId = Regex("^20[2-9][0-9][0-1][0-9][0-3][0-9]T[0-2][0-9][0-5][0-9][0-5][0-9]Z$")
        val PackageName = Regex("^[a-z0-9][a-z0-9+.-]{0,79}$")
        const val PackageProvisionTimeoutMillis = 30 * 60 * 1_000L
        const val HealthCheckTimeoutMillis = 45_000L
        val CaBootstrapScript = """
            set -eu
            export DEBIAN_FRONTEND=noninteractive
            export APT_LISTCHANGES_FRONTEND=none
            apt-get -o Acquire::Retries=3 update
            apt-get -o Acquire::Retries=3 install -y --no-install-recommends ca-certificates
        """.trimIndent()
    }
}

internal object RuntimeHealthCommand {
    fun script(catalog: RuntimeDistributionCatalog): String {
        val harnessChecks = catalog.harnesses.toSortedMap().map { (id, harness) ->
            require(Version.matches(harness.version)) { "$id Harness 版本信息无效" }
            require(SafeRelativePath.matches(harness.entrypoint)) { "$id Harness 入口路径无效" }
            val guestEntrypoint = "/opt/eleckoi/${harness.entrypoint}"
            val versionVariable = "${id.replace('-', '_')}_version"
            buildString {
                appendLine("test -x $guestEntrypoint")
                if (harness.healthCheckArgs.isNotEmpty()) {
                    val arguments = harness.healthCheckArgs.joinToString(" ")
                    appendLine("$versionVariable=\"${'$'}($guestEntrypoint $arguments | head -n 1)\"")
                    appendLine("case \"${'$'}$versionVariable\" in *\"${harness.version}\"*) ;; *) exit 22 ;; esac")
                    appendLine("printf '$id=%s\\n' \"${'$'}$versionVariable\"")
                } else {
                    appendLine("printf '$id=%s\\n' '${harness.version}'")
                }
            }.trimEnd()
        }.joinToString("\n")
        return """
            set -eu
            $harnessChecks
            landlock_launcher=/opt/eleckoi/bin/landlock-run
            test -x "${'$'}landlock_launcher"
            landlock_report="${'$'}("${'$'}landlock_launcher" --probe 2>&1 || true)"
            case "${'$'}landlock_report" in
              *"fully enforced"*) landlock=full ;;
              *"partially enforced"*) landlock=partial ;;
              *) landlock=unavailable ;;
            esac
            if [ "${'$'}landlock" != unavailable ]; then
              probe_root="/tmp/eleckoi-landlock-probe-${'$'}${'$'}"
              mkdir -p "${'$'}probe_root/workspace" "${'$'}probe_root/outside"
              trap 'rm -f "${'$'}probe_root/workspace/inside" "${'$'}probe_root/outside/outside"; rmdir "${'$'}probe_root/workspace" "${'$'}probe_root/outside" "${'$'}probe_root" 2>/dev/null || true' EXIT
              "${'$'}landlock_launcher" --ro / --rw "${'$'}probe_root/workspace" -- /bin/sh -c \
                'printf inside > "${'$'}1/workspace/inside"; if printf outside > "${'$'}1/outside/outside" 2>/dev/null; then exit 41; fi' \
                sh "${'$'}probe_root"
              test -f "${'$'}probe_root/workspace/inside"
              test ! -e "${'$'}probe_root/outside/outside"
              rm -f "${'$'}probe_root/workspace/inside"
              rmdir "${'$'}probe_root/workspace" "${'$'}probe_root/outside" "${'$'}probe_root"
              trap - EXIT
            fi
            printf 'landlock=%s\n' "${'$'}landlock"
            test -s /etc/ssl/certs/ca-certificates.crt
            command -v node >/dev/null 2>&1 && printf 'node=%s\n' "${'$'}(node --version)" || true
            command -v npm >/dev/null 2>&1 && printf 'npm=%s\n' "${'$'}(npm --version)" || true
            command -v pnpm >/dev/null 2>&1 && printf 'pnpm=%s\n' "${'$'}(pnpm --version)" || true
            command -v python3 >/dev/null 2>&1 && printf 'python=%s\n' "${'$'}(python3 --version 2>&1)" || true
            command -v git >/dev/null 2>&1 && printf 'git=%s\n' "${'$'}(git --version)" || true
            command -v curl >/dev/null 2>&1 && printf 'curl=%s\n' "${'$'}(curl --version | head -n 1)" || true
            command -v rg >/dev/null 2>&1 && printf 'rg=%s\n' "${'$'}(rg --version | head -n 1)" || true
            command -v cc >/dev/null 2>&1 && printf 'cc=%s\n' "${'$'}(cc --version | head -n 1)" || true
        """.trimIndent()
    }

    fun parse(result: RuntimeGuestCommandResult): RuntimeHealthReport {
        val values = linkedMapOf<String, String>()
        result.stdout.lineSequence().forEach { line ->
            val separator = line.indexOf('=')
            if (separator <= 0) return@forEach
            val key = line.substring(0, separator)
            val value = line.substring(separator + 1).trim()
            if (key in RuntimeHealthReport.KnownHealthKeys) {
                require(key !in values) { "本地环境健康信息包含重复字段" }
                require(value.isNotBlank() && value.length <= MaxVersionValueChars) {
                    "本地环境健康信息无效"
                }
                values[key] = value
            }
        }
        require(values.keys.containsAll(RuntimeHealthReport.RequiredHealthKeys)) {
            "本地环境健康信息不完整"
        }
        return RuntimeHealthReport(values)
    }

    private val Version = Regex("^[A-Za-z0-9._+-]{1,80}$")
    private val SafeRelativePath = Regex("""^(?!/)(?!.*(?:^|/)\.\.(?:/|$))[A-Za-z0-9._/-]{1,240}$""")
    private const val MaxVersionValueChars = 240
}
