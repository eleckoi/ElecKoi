package com.eleckoi.android.engine.workspace.runtime

import com.eleckoi.android.foundation.serialization.ElecKoiJson
import java.io.File
import kotlinx.serialization.decodeFromString

internal object RuntimeInstallationInspector {
    fun readActive(paths: RuntimePaths): RuntimeInstallationManifest? {
        val file = paths.activeRuntimeManifest
        if (!file.isFile || file.length() !in 1..MaxManifestBytes) return null
        return runCatching {
            ElecKoiJson.decodeFromString<RuntimeInstallationManifest>(file.readText(Charsets.UTF_8))
        }.getOrNull()
    }

    fun isUsable(paths: RuntimePaths, manifest: RuntimeInstallationManifest): Boolean {
        if (manifest.schemaVersion != 5 || manifest.architecture != "arm64-v8a") return false
        val installation = runCatching { paths.installation(manifest.installationDirectory) }.getOrNull() ?: return false
        val rootfs = File(installation, "rootfs")
        val tools = File(installation, "tools")
        if (manifest.harnessEntrypoints.keys != manifest.harnessArchiveSha256s.keys) return false
        if (!RequiredHarnessIds.all(manifest.harnessEntrypoints::containsKey)) return false
        if (!manifest.harnessEntrypoints.keys.containsAll(manifest.harnessConfigPaths.keys)) return false
        val entrypoints = manifest.harnessEntrypoints.mapValues { (_, relative) ->
            safeChild(tools, relative) ?: return false
        }
        val configs = manifest.harnessConfigPaths.mapValues { (_, relative) ->
            safeChild(tools, relative) ?: return false
        }
        val requiredHosts = listOf(
            paths.nativeHost("libeleckoi_proot.so"),
            paths.nativeHost("libeleckoi_proot_loader.so"),
            paths.nativeHost("libtalloc.so"),
            paths.nativeHost("libandroid-shmem.so"),
        )
        val baseUsable = rootfs.isDirectory &&
            File(rootfs, "bin/sh").let { it.isFile && it.canExecute() } &&
            File(rootfs, "usr/bin/env").let { it.isFile && it.canExecute() } &&
            File(rootfs, "etc/ssl/certs/ca-certificates.crt").let {
                it.isFile && it.canRead() && it.length() > 0L
            } &&
            RuntimeGuestLayout.isPrepared(rootfs) &&
            entrypoints.values.all { entrypoint -> entrypoint.isFile && entrypoint.canExecute() } &&
            File(tools, "bin/landlock-run").let { it.isFile && it.canExecute() } &&
            configs.values.all { config -> config.isFile && config.canRead() } &&
            requiredHosts.all(File::isFile)
        if (!baseUsable) return false
        if (!manifest.rootfsArchiveSha256.matches(Sha256) ||
            manifest.harnessArchiveSha256s.values.any { sha256 -> !sha256.matches(Sha256) } ||
            manifest.catalogFingerprint?.matches(Sha256) != true
        ) return false
        return true
    }

    fun activePaths(paths: RuntimePaths): ActiveRuntimePaths? {
        val manifest = readActive(paths) ?: return null
        if (!isUsable(paths, manifest)) return null
        val installation = paths.installation(manifest.installationDirectory)
        val tools = File(installation, "tools")
        val harnessEntrypoints = manifest.harnessEntrypoints.mapValues { (_, relative) ->
            safeChild(tools, relative) ?: return null
        }
        val harnessConfigs = manifest.harnessConfigPaths.mapValues { (_, relative) ->
            safeChild(tools, relative) ?: return null
        }
        return ActiveRuntimePaths(
            manifest = manifest,
            rootfs = File(installation, "rootfs"),
            tools = tools,
            harnessEntrypoints = harnessEntrypoints,
            harnessConfigs = harnessConfigs,
        )
    }

    private fun safeChild(root: File, relative: String): File? = runCatching {
        require(relative.isNotBlank() && !relative.startsWith('/') && !relative.contains('\\'))
        val canonicalRoot = root.canonicalFile
        val child = File(canonicalRoot, relative).canonicalFile
        require(child.toPath().startsWith(canonicalRoot.toPath()))
        child
    }.getOrNull()

    private const val MaxManifestBytes = 32 * 1024L
    private val Sha256 = Regex("^[a-f0-9]{64}$")
    private val RequiredHarnessIds = setOf("deepseek")
}

internal data class ActiveRuntimePaths(
    val manifest: RuntimeInstallationManifest,
    val rootfs: File,
    val tools: File,
    val harnessEntrypoints: Map<String, File>,
    val harnessConfigs: Map<String, File> = emptyMap(),
) {
    fun requireHarnessEntrypoint(id: String): File =
        requireNotNull(harnessEntrypoints[id]) { "Agent Harness 未安装：$id" }

    fun requireHarnessConfig(id: String): File =
        requireNotNull(harnessConfigs[id]) { "Agent Harness 配置未安装：$id" }
}
