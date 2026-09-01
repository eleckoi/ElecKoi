package com.eleckoi.android.engine.workspace.runtime

import android.content.Context
import com.eleckoi.android.engine.workspace.runtime.process.ProotRuntimeGuestCommandExecutor
import com.eleckoi.android.engine.workspace.runtime.process.RuntimeGuestProcessSpecFactory
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeCapabilities
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth

internal class RuntimeHealthInspector(
    context: Context,
    private val paths: RuntimePaths,
    private val catalog: RuntimeDistributionCatalog,
    private val dnsConfigWriter: AndroidDnsConfigWriter = AndroidDnsConfigWriter(
        context.applicationContext,
        paths.hostResolverConfig,
    ),
    provisioner: RuntimeToolchainProvisioner? = null,
) {
    private val provisioner = provisioner ?: RuntimeToolchainProvisioner(
        ProotRuntimeGuestCommandExecutor(
            RuntimeGuestProcessSpecFactory(
                nativeLibraryDirectory = paths.nativeLibraryRoot,
                hostTempDirectory = paths.hostTemp,
            ),
        ),
    )

    suspend fun inspect(): LocalRuntimeCapabilities {
        val structural = AndroidRuntimeCapabilityProbe.inspect(paths, catalog)
        if (structural.health != LocalRuntimeHealth.Checking) return structural
        val active = RuntimeInstallationInspector.activePaths(paths)
            ?: return structural.copy(
                health = LocalRuntimeHealth.NeedsRepair,
                healthMessage = "本地创作环境文件不完整",
            )
        return runCatching {
            val report = provisioner.verify(
                rootfs = active.rootfs,
                tools = active.tools,
                resolverConfig = dnsConfigWriter.refresh(),
                catalog = catalog,
            )
            structural.copy(
                health = LocalRuntimeHealth.Healthy,
                healthMessage = report.summary,
            )
        }.getOrElse { error ->
            structural.copy(
                health = LocalRuntimeHealth.NeedsRepair,
                healthMessage = error.message?.take(MaxHealthMessageChars)
                    ?.ifBlank { null }
                    ?: "本地创作环境健康检查失败",
            )
        }
    }

    private companion object {
        const val MaxHealthMessageChars = 1_000
    }
}
