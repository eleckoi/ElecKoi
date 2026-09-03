package com.eleckoi.android.engine.workspace.runtime

import android.system.Os
import java.io.File
import java.nio.file.Files

/**
 * Creates only the guest-side mount targets required by the PRoot launcher.
 * Device nodes are deliberately not extracted from archives; Android's real
 * nodes are bound onto these empty regular files when the process starts.
 */
internal object RuntimeGuestLayout {
    private val directories = listOf(
        "proc",
        "dev",
        "etc",
        "root",
        "tmp",
        "var/tmp",
        "workspace",
        "opt/eleckoi",
        "run/eleckoi",
    )
    private val devicePlaceholders = listOf(
        "dev/null",
        "dev/zero",
        "dev/random",
        "dev/urandom",
    )
    private const val ResolverPlaceholder = "etc/resolv.conf"
    private const val ProotLoaderPlaceholder = "run/eleckoi/proot-loader"
    private const val LandlockLauncher = "run/eleckoi/landlock-run"
    internal const val ProotLoaderGuestPath = "/run/eleckoi/proot-loader"
    internal const val LandlockLauncherGuestPath = "/run/eleckoi/landlock-run"
    private val LandlockLauncherScript = """
        #!/bin/sh
        if [ "${'$'}#" -eq 1 ] && [ "${'$'}1" = "--probe" ]; then
          exec /opt/eleckoi/bin/landlock-run --probe
        fi
        exec /opt/eleckoi/bin/landlock-run --ro $ProotLoaderGuestPath "${'$'}@"
    """.trimIndent() + "\n"

    fun prepare(
        rootfs: File,
        chmod: (String, Int) -> Unit = { path, mode -> Os.chmod(path, mode) },
    ) {
        require(rootfs.isDirectory) { "Ubuntu rootfs 不存在" }
        // Android exposes the same private directory through aliases such as /data/user/0 and
        // /data/data. Compare canonical paths consistently or a valid target looks out-of-root.
        val root = rootfs.canonicalFile.toPath().toAbsolutePath().normalize()

        directories.forEach { relative ->
            val target = safeTarget(rootfs, relative)
            require(!Files.isSymbolicLink(target.toPath())) { "运行时挂载目录不能是符号链接: $relative" }
            require(target.isDirectory || target.mkdirs()) { "无法创建运行时挂载目录: $relative" }
        }
        chmod(safeTarget(rootfs, "tmp").absolutePath, 0x3ff) // 01777

        devicePlaceholders.forEach { relative ->
            val target = safeTarget(rootfs, relative)
            require(!Files.isSymbolicLink(target.toPath())) { "设备挂载目标不能是符号链接: $relative" }
            if (!target.exists()) {
                target.parentFile?.let { parent ->
                    require(parent.isDirectory || parent.mkdirs()) { "无法创建设备挂载目录" }
                }
                require(target.createNewFile()) { "无法创建设备挂载目标: $relative" }
            }
            require(target.isFile) { "设备挂载目标不是普通文件: $relative" }
        }

        val resolver = safeTarget(rootfs, ResolverPlaceholder, allowFinalSymlink = true)
        if (Files.isSymbolicLink(resolver.toPath())) Files.delete(resolver.toPath())
        if (!resolver.exists()) {
            require(resolver.createNewFile()) { "无法创建 DNS 挂载目标" }
        }
        require(resolver.isFile && !Files.isSymbolicLink(resolver.toPath())) {
            "DNS 挂载目标不是安全的普通文件"
        }

        val prootLoader = prepareRegularFile(rootfs, ProotLoaderPlaceholder, "PRoot loader 挂载目标")
        require(prootLoader.length() == 0L) { "PRoot loader 挂载目标必须为空" }
        val landlockLauncher = prepareRegularFile(rootfs, LandlockLauncher, "Landlock 兼容启动器")
        landlockLauncher.writeText(LandlockLauncherScript, Charsets.UTF_8)
        chmod(landlockLauncher.absolutePath, 0x1ed) // 0755

        directories.forEach { relative ->
            val target = safeTarget(rootfs, relative).toPath().toAbsolutePath().normalize()
            require(target.startsWith(root)) { "运行时挂载目录越界" }
        }
    }

    fun isPrepared(rootfs: File): Boolean = runCatching {
        rootfs.isDirectory &&
            directories.all { relative ->
                val target = safeTarget(rootfs, relative)
                target.isDirectory && !Files.isSymbolicLink(target.toPath())
            } &&
            devicePlaceholders.all { relative ->
                val target = safeTarget(rootfs, relative)
                target.isFile && !Files.isSymbolicLink(target.toPath())
            } && safeTarget(rootfs, ResolverPlaceholder).let { target ->
                target.isFile && !Files.isSymbolicLink(target.toPath())
            } && safeTarget(rootfs, ProotLoaderPlaceholder).let { target ->
                target.isFile && !Files.isSymbolicLink(target.toPath()) && target.length() == 0L
            } && safeTarget(rootfs, LandlockLauncher).let { target ->
                target.isFile && !Files.isSymbolicLink(target.toPath()) &&
                    target.readText(Charsets.UTF_8) == LandlockLauncherScript
            }
    }.getOrDefault(false)

    private fun prepareRegularFile(rootfs: File, relative: String, label: String): File {
        val target = safeTarget(rootfs, relative)
        require(!Files.isSymbolicLink(target.toPath())) { "${label}不能是符号链接" }
        target.parentFile?.let { parent ->
            require(parent.isDirectory || parent.mkdirs()) { "无法创建${label}目录" }
        }
        if (!target.exists()) require(target.createNewFile()) { "无法创建$label" }
        require(target.isFile) { "${label}不是普通文件" }
        return target
    }

    private fun safeTarget(
        rootfs: File,
        relative: String,
        allowFinalSymlink: Boolean = false,
    ): File {
        require(relative.isNotBlank() && !relative.startsWith('/') && !relative.contains('\\')) {
            "运行时挂载路径无效"
        }
        val root = rootfs.canonicalFile.toPath().toAbsolutePath().normalize()
        val target = root.resolve(relative).normalize()
        require(target.startsWith(root) && target != root) { "运行时挂载路径越界" }
        var current = if (allowFinalSymlink) target.parent else target
        requireNotNull(current) { "运行时挂载路径无效" }
        while (current != root) {
            require(!Files.isSymbolicLink(current)) { "运行时挂载路径不能穿过符号链接" }
            current = current.parent ?: error("运行时挂载路径无效")
        }
        return target.toFile()
    }
}
