package com.eleckoi.android.engine.workspace.runtime

import android.content.Context
import android.os.StatFs
import android.util.AtomicFile
import com.eleckoi.android.engine.workspace.runtime.process.ProotRuntimeGuestCommandExecutor
import com.eleckoi.android.engine.workspace.runtime.process.RuntimeGuestProcessSpecFactory
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeMaintenanceOperation
import java.io.File
import java.nio.file.Files
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlin.coroutines.coroutineContext

internal enum class RuntimeInstallStage {
    Checking,
    DownloadingRootfs,
    DownloadingHarness,
    DownloadingNode,
    DownloadingPnpm,
    ExtractingRootfs,
    ExtractingHarness,
    ExtractingNode,
    ExtractingPnpm,
    ProvisioningPackages,
    Verifying,
    Activating,
    Removing,
    Cleaning,
}

internal data class RuntimeInstallProgress(
    val stage: RuntimeInstallStage,
    val completedBytes: Long = 0,
    val totalBytes: Long? = null,
    val processedEntries: Int = 0,
    val componentId: String? = null,
)

internal class RuntimeBundleInstaller(
    context: Context,
    private val paths: RuntimePaths = RuntimePaths(context.applicationContext),
    private val catalog: RuntimeDistributionCatalog = RuntimeDistributionCatalog.load(context.applicationContext),
    private val embeddedArchives: RuntimeEmbeddedArchiveSource = RuntimeEmbeddedArchiveSource(context.applicationContext),
    private val extractor: SafeTarGzExtractor = SafeTarGzExtractor(),
    toolchainProvisioner: RuntimeToolchainProvisioner? = null,
    private val dnsConfigWriter: AndroidDnsConfigWriter = AndroidDnsConfigWriter(
        context.applicationContext,
        paths.hostResolverConfig,
    ),
) {
    private val toolchainProvisioner = toolchainProvisioner ?: RuntimeToolchainProvisioner(
        ProotRuntimeGuestCommandExecutor(
            RuntimeGuestProcessSpecFactory(
                nativeLibraryDirectory = paths.nativeLibraryRoot,
                hostTempDirectory = paths.hostTemp,
            ),
        ),
    )

    suspend fun install(
        operation: RuntimeMaintenanceOperation = RuntimeMaintenanceOperation.Install,
        onProgress: (RuntimeInstallProgress) -> Unit,
    ): RuntimeInstallationManifest =
        withContext(Dispatchers.IO) {
            require(operation != RuntimeMaintenanceOperation.Uninstall) { "卸载不能走安装流程" }
            onProgress(RuntimeInstallProgress(RuntimeInstallStage.Checking))
            reconcileInterruptedInstallation()
            require(StatFs(paths.runtimeRoot.absolutePath).availableBytes >= MinimumFreeBytes) {
                "准备本地创作环境至少需要 768 MiB 可用空间"
            }
            val existing = RuntimeInstallationInspector.readActive(paths)
            if (existing?.runtimeVersion == catalog.runtimeVersion &&
                existing.catalogFingerprint == catalog.contentFingerprint() &&
                RuntimeInstallationInspector.isUsable(paths, existing) &&
                operation != RuntimeMaintenanceOperation.Repair
            ) {
                return@withContext existing
            }

            embeddedArchives.verify(catalog.rootfs) { current, total ->
                onProgress(
                    RuntimeInstallProgress(
                        stage = RuntimeInstallStage.DownloadingRootfs,
                        completedBytes = current,
                        totalBytes = total,
                    ),
                )
            }
            catalog.harnesses.toSortedMap().forEach { (id, harness) ->
                embeddedArchives.verify(harness) { current, total ->
                    onProgress(
                        RuntimeInstallProgress(
                            stage = RuntimeInstallStage.DownloadingHarness,
                            componentId = id,
                            completedBytes = current,
                            totalBytes = total,
                        ),
                    )
                }
            }
            coroutineContext.ensureActive()

            val installationDirectory = "${catalog.runtimeVersion}--${UUID.randomUUID()}"
            val finalDirectory = paths.installation(installationDirectory)
            val staging = File(
                paths.installationsRoot,
                ".staging-$installationDirectory",
            )
            require(staging.mkdirs()) { "无法创建运行时安装暂存目录" }
            var promoted = false
            var activated = false
            try {
                val rootfs = File(staging, "rootfs").apply { mkdirs() }
                val tools = File(staging, "tools").apply { mkdirs() }
                extractor.extract(
                    openArchive = { embeddedArchives.open(catalog.rootfs) },
                    destination = rootfs,
                    maxExpandedBytes = MaxRootfsExpandedBytes,
                    maxEntries = MaxRootfsEntries,
                    label = "Ubuntu",
                ) { entries, bytes ->
                    onProgress(
                        RuntimeInstallProgress(
                            RuntimeInstallStage.ExtractingRootfs,
                            completedBytes = bytes,
                            processedEntries = entries,
                        ),
                    )
                }
                catalog.harnesses.toSortedMap().forEach { (id, harness) ->
                    extractor.extract(
                        openArchive = { embeddedArchives.open(harness) },
                        destination = tools,
                        maxExpandedBytes = MaxHarnessExpandedBytes,
                        maxEntries = MaxHarnessEntries,
                        label = "$id Harness",
                    ) { entries, bytes ->
                        onProgress(
                            RuntimeInstallProgress(
                                stage = RuntimeInstallStage.ExtractingHarness,
                                componentId = id,
                                completedBytes = bytes,
                                processedEntries = entries,
                            ),
                        )
                    }
                }
                RuntimeGuestLayout.prepare(rootfs)
                RuntimeBaseConfigurator.prepare(rootfs)
                RuntimeOfflineCaCertificates.install(rootfs, tools)
                val shell = File(rootfs, "bin/sh")
                require(shell.isFile && shell.canExecute()) { "Ubuntu rootfs 缺少可执行的 /bin/sh" }
                val env = File(rootfs, "usr/bin/env")
                require(env.isFile && env.canExecute()) { "Ubuntu rootfs 缺少可执行的 /usr/bin/env" }
                catalog.harnesses.forEach { (id, harness) ->
                    val entrypoint = File(tools, harness.entrypoint)
                    require(entrypoint.isFile && entrypoint.canExecute()) {
                        "$id Harness 入口不存在或不可执行"
                    }
                    harness.configPath?.let { configPath ->
                        require(File(tools, configPath).isFile) { "$id Harness 配置不存在" }
                    }
                }

                val resolverConfig = dnsConfigWriter.refresh()
                onProgress(RuntimeInstallProgress(RuntimeInstallStage.Verifying))
                toolchainProvisioner.verify(rootfs, tools, resolverConfig, catalog)

                val manifest = RuntimeInstallationManifest(
                    runtimeVersion = catalog.runtimeVersion,
                    architecture = catalog.architecture,
                    installationDirectory = installationDirectory,
                    rootfsArchiveSha256 = catalog.rootfs.sha256,
                    harnessEntrypoints = catalog.harnesses.mapValues { (_, harness) -> harness.entrypoint },
                    harnessArchiveSha256s = catalog.harnesses.mapValues { (_, harness) -> harness.sha256 },
                    harnessConfigPaths = catalog.harnesses.mapNotNull { (id, harness) ->
                        harness.configPath?.let { id to it }
                    }.toMap(),
                    catalogFingerprint = catalog.contentFingerprint(),
                    installedAtEpochMillis = System.currentTimeMillis(),
                )
                writeManifest(File(staging, "installation.json"), manifest)
                onProgress(RuntimeInstallProgress(RuntimeInstallStage.Activating))
                require(staging.renameTo(finalDirectory)) { "无法原子提交本地运行时目录" }
                promoted = true
                require(RuntimeInstallationInspector.isUsable(paths, manifest)) { "本地运行时安装后结构校验失败" }
                writeManifest(paths.activeRuntimeManifest, manifest)
                activated = true
                onProgress(RuntimeInstallProgress(RuntimeInstallStage.Cleaning))
                runCatching { cleanupObsoleteInstallations(manifest.installationDirectory) }
                runCatching { cleanupObsoleteDownloads() }
                manifest
            } finally {
                if (staging.exists()) staging.deleteRecursively()
                if (promoted && !activated && finalDirectory.exists()) finalDirectory.deleteRecursively()
            }
        }

    suspend fun uninstall(onProgress: (RuntimeInstallProgress) -> Unit) = withContext(Dispatchers.IO) {
        onProgress(RuntimeInstallProgress(RuntimeInstallStage.Checking))
        val manifest = RuntimeInstallationInspector.readActive(paths)
        if (manifest == null) {
            onProgress(RuntimeInstallProgress(RuntimeInstallStage.Cleaning))
            cleanupObsoleteInstallations(activeDirectory = null)
            return@withContext
        }
        val installation = paths.installation(manifest.installationDirectory)
        val removal = File(paths.installationsRoot, ".removing-${UUID.randomUUID()}")
        val manifestRemoval = File(paths.activeRuntimeManifest.parentFile, ".manifest-removing-${UUID.randomUUID()}")
        onProgress(RuntimeInstallProgress(RuntimeInstallStage.Removing))
        if (installation.exists()) {
            require(installation.renameTo(removal)) { "无法隔离待卸载的本地运行时" }
        }
        try {
            if (paths.activeRuntimeManifest.exists()) {
                require(paths.activeRuntimeManifest.renameTo(manifestRemoval)) { "无法停用本地运行时" }
            }
        } catch (error: Throwable) {
            if (removal.exists()) removal.renameTo(installation)
            throw error
        }
        onProgress(RuntimeInstallProgress(RuntimeInstallStage.Cleaning))
        if (removal.exists()) require(removal.deleteRecursively()) { "无法删除本地运行时文件" }
        if (manifestRemoval.exists()) require(manifestRemoval.delete()) { "无法删除本地运行时清单" }
        cleanupObsoleteInstallations(activeDirectory = null)
        cleanupObsoleteDownloads()
    }

    private fun cleanupObsoleteInstallations(activeDirectory: String?) {
        val root = paths.installationsRoot.canonicalFile
        root.listFiles().orEmpty().forEach { candidate ->
            if (candidate.name == activeDirectory) return@forEach
            val canonical = runCatching { candidate.canonicalFile }.getOrNull() ?: return@forEach
            if (!canonical.toPath().startsWith(root.toPath()) || Files.isSymbolicLink(candidate.toPath())) return@forEach
            if (candidate.isDirectory) candidate.deleteRecursively() else candidate.delete()
        }
    }

    private fun cleanupObsoleteDownloads() {
        val root = paths.downloadsRoot.canonicalFile
        root.listFiles().orEmpty().forEach { candidate ->
            val canonical = runCatching { candidate.canonicalFile }.getOrNull() ?: return@forEach
            if (!canonical.toPath().startsWith(root.toPath()) || Files.isSymbolicLink(candidate.toPath())) return@forEach
            if (candidate.isDirectory) candidate.deleteRecursively() else candidate.delete()
        }
    }

    private fun reconcileInterruptedInstallation() {
        val activeDirectory = RuntimeInstallationInspector.readActive(paths)?.installationDirectory
        cleanupObsoleteInstallations(activeDirectory)
        cleanupObsoleteDownloads()
    }

    private fun writeManifest(target: File, manifest: RuntimeInstallationManifest) {
        target.parentFile?.mkdirs()
        val atomic = AtomicFile(target)
        val stream = atomic.startWrite()
        try {
            stream.write(ElecKoiJson.encodeToString(manifest).toByteArray(Charsets.UTF_8))
            stream.fd.sync()
            atomic.finishWrite(stream)
        } catch (error: Throwable) {
            atomic.failWrite(stream)
            throw error
        }
    }

    private companion object {
        const val MinimumFreeBytes = 768L * 1024L * 1024L
        const val MaxRootfsExpandedBytes = 600_000_000L
        const val MaxRootfsEntries = 120_000
        const val MaxHarnessExpandedBytes = 1_200_000_000L
        const val MaxHarnessEntries = 80_000
    }
}
