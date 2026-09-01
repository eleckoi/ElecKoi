package com.eleckoi.android.engine.workspace.runtime

import android.content.Context
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import java.net.URI
import java.security.MessageDigest
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

@Serializable
internal data class RuntimeDistributionCatalog(
    val schemaVersion: Int,
    val runtimeVersion: String,
    val architecture: String,
    val rootfs: RuntimeArchive,
    val harnesses: Map<String, HarnessRuntimeArchive>,
    val toolchain: RuntimeToolchainCatalog? = null,
) {
    fun validate() {
        require(schemaVersion == 5) { "不支持的本地运行时目录版本" }
        require(RuntimeVersion.matches(runtimeVersion)) { "本地运行时版本号无效" }
        require(architecture == "arm64-v8a") { "当前仅支持 arm64-v8a 本地运行时" }
        rootfs.validateArchive(AllowedRootfsHosts, requireEmbeddedAsset = schemaVersion >= 3)
        require(harnesses.size in 1..MaxHarnesses) { "Agent Harness 运行时数量无效" }
        require(harnesses.keys == RequiredHarnessIds) { "DSH-only 目录只能包含 DeepSeek Harness" }
        harnesses.forEach { (id, harness) ->
            require(HarnessId.matches(id)) { "Agent Harness 标识无效" }
            harness.validateArchive(AllowedHarnessHosts, requireEmbeddedAsset = schemaVersion >= 3)
            require(SourceCommit.matches(harness.sourceCommit)) { "$id Harness 源码提交编号无效" }
            require(SafeRelativePath.matches(harness.entrypoint)) { "$id Harness 入口路径无效" }
            harness.configPath?.let { configPath ->
                require(SafeRelativePath.matches(configPath)) { "$id Harness 配置路径无效" }
            }
            require(harness.healthCheckArgs.size <= MaxHealthCheckArgs) { "$id Harness 健康检查参数过多" }
            require(harness.healthCheckArgs.all(HealthCheckArg::matches)) { "$id Harness 健康检查参数无效" }
        }
        toolchain?.validate()
    }

    fun requireHarness(id: String): HarnessRuntimeArchive =
        requireNotNull(harnesses[id]) { "Agent Harness 运行时未声明：$id" }

    fun contentFingerprint(): String {
        validate()
        val canonical = buildString {
            appendLine(schemaVersion)
            appendLine(runtimeVersion)
            appendLine(architecture)
            appendLine(rootfs.sha256)
            appendLine(rootfs.assetPath.orEmpty())
            harnesses.toSortedMap().forEach { (id, harness) ->
                appendLine(id)
                appendLine(harness.version)
                appendLine(harness.sha256)
                appendLine(harness.assetPath.orEmpty())
                appendLine(harness.sourceCommit)
                appendLine(harness.entrypoint)
                appendLine(harness.configPath.orEmpty())
                appendLine(harness.healthCheckArgs.joinToString("\u0000"))
                appendLine(harness.embeddedOnly)
            }
            toolchain?.let { optional ->
                appendLine(optional.ubuntuSnapshot)
                appendLine(optional.ubuntuPackages.joinToString(","))
                appendLine(optional.node.sha256)
                appendLine(optional.node.archiveRoot)
                appendLine(optional.pnpm.sha256)
                appendLine(optional.pnpm.entrypoint)
            }
        }
        return MessageDigest.getInstance("SHA-256")
            .digest(canonical.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> (byte.toInt() and 0xff).toString(16).padStart(2, '0') }
    }

    companion object {
        fun load(context: Context): RuntimeDistributionCatalog {
            val encoded = context.assets.open("runtime-catalog.json").bufferedReader().use { it.readText() }
            return parse(encoded)
        }

        fun parse(encoded: String): RuntimeDistributionCatalog {
            require(encoded.length in 2..MaxCatalogChars) { "本地运行时目录大小无效" }
            val value = StrictRuntimeJson.decodeFromString<RuntimeDistributionCatalog>(encoded)
            value.validate()
            return value
        }

        private val RuntimeVersion = Regex("^[A-Za-z0-9._-]{1,120}$")
        private val SafeRelativePath = Regex("""^(?!/)(?!.*(?:^|/)\.\.(?:/|$))[A-Za-z0-9._/-]{1,240}$""")
        private val SourceCommit = Regex("^[a-f0-9]{40}$")
        private val AllowedRootfsHosts = setOf("cdimage.ubuntu.com")
        private val AllowedHarnessHosts = setOf("github.com")
        private val RequiredHarnessIds = setOf("deepseek")
        private val HarnessId = Regex("^[a-z][a-z0-9-]{0,39}$")
        private val HealthCheckArg = Regex("^[A-Za-z0-9._=:/-]{1,120}$")
        private const val MaxHarnesses = 8
        private const val MaxHealthCheckArgs = 8
        private const val MaxCatalogChars = 128 * 1024
    }
}

@Serializable
internal data class RuntimeToolchainCatalog(
    val ubuntuSnapshot: String,
    val ubuntuPackages: List<String>,
    val node: NodeRuntimeArchive,
    val pnpm: PnpmRuntimeArchive,
) {
    fun validate() {
        require(SnapshotId.matches(ubuntuSnapshot)) { "Ubuntu 软件快照编号无效" }
        require(ubuntuPackages.size in 1..MaxPackages) { "Ubuntu 工具包数量无效" }
        require(ubuntuPackages.distinct().size == ubuntuPackages.size) { "Ubuntu 工具包不能重复" }
        require(ubuntuPackages.all(PackageName::matches)) { "Ubuntu 工具包名称无效" }
        require("ca-certificates" in ubuntuPackages) { "Ubuntu 工具链必须包含 CA 证书" }
        node.validateArchive(setOf("nodejs.org"))
        pnpm.validateArchive(setOf("github.com"))
        require(SafeRelativePath.matches(node.archiveRoot)) { "Node 归档根目录无效" }
        require(!node.archiveRoot.contains('/')) { "Node 归档根目录必须是单层目录" }
        require(SafeRelativePath.matches(pnpm.entrypoint)) { "pnpm 入口路径无效" }
    }

    private companion object {
        const val MaxPackages = 40
        val SnapshotId = Regex("^20[2-9][0-9](?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]Z$")
        val PackageName = Regex("^[a-z0-9][a-z0-9+.-]{0,79}$")
        val SafeRelativePath = Regex("""^(?!/)(?!.*(?:^|/)\.\.(?:/|$))[A-Za-z0-9._/-]{1,240}$""")
    }
}

@Serializable
internal data class RuntimeArchive(
    override val kind: String,
    override val version: String,
    override val url: String,
    override val sha256: String,
    override val archiveBytesLimit: Long,
    override val assetPath: String? = null,
) : RuntimeArchiveSpec

@Serializable
internal data class HarnessRuntimeArchive(
    override val kind: String,
    override val version: String,
    override val url: String,
    override val sha256: String,
    override val archiveBytesLimit: Long,
    override val assetPath: String? = null,
    val sourceCommit: String,
    val entrypoint: String,
    val configPath: String? = null,
    val healthCheckArgs: List<String> = emptyList(),
    val embeddedOnly: Boolean = false,
) : RuntimeArchiveSpec

@Serializable
internal data class NodeRuntimeArchive(
    override val kind: String,
    override val version: String,
    override val url: String,
    override val sha256: String,
    override val archiveBytesLimit: Long,
    override val assetPath: String? = null,
    val archiveRoot: String,
) : RuntimeArchiveSpec

@Serializable
internal data class PnpmRuntimeArchive(
    override val kind: String,
    override val version: String,
    override val url: String,
    override val sha256: String,
    override val archiveBytesLimit: Long,
    override val assetPath: String? = null,
    val entrypoint: String,
) : RuntimeArchiveSpec

internal interface RuntimeArchiveSpec {
    val kind: String
    val version: String
    val url: String
    val sha256: String
    val archiveBytesLimit: Long
    val assetPath: String?
}

private fun RuntimeArchiveSpec.validateArchive(
    allowedHosts: Set<String>,
    requireEmbeddedAsset: Boolean = false,
) {
    require(version.isNotBlank()) { "运行时归档版本为空" }
    require(Sha256.matches(sha256)) { "运行时归档 SHA-256 无效" }
    require(archiveBytesLimit in MinArchiveBytes..MaxArchiveBytes) { "运行时归档大小上限无效" }
    val embeddedOnly = (this as? HarnessRuntimeArchive)?.embeddedOnly == true
    if (embeddedOnly) {
        require(url.isBlank()) { "仅内置的 Harness 运行时不能配置下载地址" }
        require(requireEmbeddedAsset) { "仅内置的 Harness 运行时需要新版目录" }
    } else {
        val uri = runCatching { URI(url) }.getOrElse { throw IllegalArgumentException("运行时下载地址无效", it) }
        require(uri.scheme == "https" && uri.host?.lowercase() in allowedHosts) { "运行时下载主机未授权" }
        require(uri.userInfo == null && uri.fragment == null) { "运行时下载地址包含非法字段" }
    }
    if (requireEmbeddedAsset) {
        require(SafeAssetPath.matches(assetPath.orEmpty())) { "内置运行时资源路径无效" }
    } else if (assetPath != null) {
        require(SafeAssetPath.matches(assetPath.orEmpty())) { "内置运行时资源路径无效" }
    }
}

private val Sha256 = Regex("^[a-f0-9]{64}$")
private val SafeAssetPath = Regex("""^(?!/)(?!.*(?:^|/)\.\.(?:/|$))[A-Za-z0-9._/-]{1,240}$""")
private const val MinArchiveBytes = 1_024L
private const val MaxArchiveBytes = 1_000_000_000L

@Serializable
internal data class RuntimeInstallationManifest(
    val schemaVersion: Int = 5,
    val runtimeVersion: String,
    val architecture: String,
    val installationDirectory: String,
    val rootfsArchiveSha256: String,
    val harnessEntrypoints: Map<String, String> = emptyMap(),
    val harnessArchiveSha256s: Map<String, String> = emptyMap(),
    val harnessConfigPaths: Map<String, String> = emptyMap(),
    val nodeArchiveSha256: String? = null,
    val pnpmArchiveSha256: String? = null,
    val ubuntuSnapshot: String? = null,
    val catalogFingerprint: String? = null,
    val installedAtEpochMillis: Long,
)

private val StrictRuntimeJson = Json(ElecKoiJson) {
    ignoreUnknownKeys = false
}
