package com.eleckoi.android.engine.workspace.runtime

import android.system.Os
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

internal object RuntimeOfflineCaCertificates {
    fun install(
        rootfs: File,
        tools: File,
        chmod: (String, Int) -> Unit = { path, mode -> Os.chmod(path, mode) },
    ) {
        val sourceDirectory = safeChild(tools, SourceDirectory)
        val sourceBundle = safeChild(sourceDirectory, BundleFileName)
        val copyright = safeChild(sourceDirectory, "copyright")
        val provenance = safeChild(sourceDirectory, "source.json")
        require(sourceBundle.isFile && sourceBundle.length() in MinBundleBytes..MaxBundleBytes) {
            "离线 CA 证书包缺失或大小无效"
        }
        require(copyright.isFile && copyright.length() > 0L) { "离线 CA 证书缺少版权说明" }
        require(provenance.isFile && provenance.length() > 0L) { "离线 CA 证书缺少来源信息" }
        val certificateCount = sourceBundle.bufferedReader(Charsets.US_ASCII).useLines { lines ->
            lines.count { it == BeginCertificate }
        }
        require(certificateCount >= MinCertificateCount) { "离线 CA 证书数量无效" }

        val targetDirectory = safeChild(rootfs, TargetDirectory)
        require(targetDirectory.isDirectory || targetDirectory.mkdirs()) { "无法创建 Ubuntu CA 证书目录" }
        val targetBundle = safeChild(targetDirectory, BundleFileName)
        Files.copy(
            sourceBundle.toPath(),
            targetBundle.toPath(),
            StandardCopyOption.REPLACE_EXISTING,
        )
        chmod(targetBundle.absolutePath, 0x1a4) // 0644
        require(targetBundle.isFile && targetBundle.length() == sourceBundle.length()) {
            "离线 CA 证书写入不完整"
        }
    }

    private fun safeChild(root: File, relative: String): File {
        require(relative.isNotBlank() && !relative.startsWith('/') && !relative.contains('\\'))
        val canonicalRoot = root.canonicalFile
        val child = File(canonicalRoot, relative).canonicalFile
        require(child.toPath().startsWith(canonicalRoot.toPath())) { "离线 CA 路径越界" }
        return child
    }

    private const val SourceDirectory = "runtime-resources/ca-certificates"
    private const val TargetDirectory = "etc/ssl/certs"
    private const val BundleFileName = "ca-certificates.crt"
    private const val BeginCertificate = "-----BEGIN CERTIFICATE-----"
    private const val MinCertificateCount = 100
    private const val MinBundleBytes = 64L * 1024L
    private const val MaxBundleBytes = 2L * 1024L * 1024L
}
