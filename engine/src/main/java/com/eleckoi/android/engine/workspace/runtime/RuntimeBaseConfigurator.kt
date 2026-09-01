package com.eleckoi.android.engine.workspace.runtime

import android.system.Os
import java.io.File

/** Prepares a small, immediately bootable base while leaving language toolchains optional. */
internal object RuntimeBaseConfigurator {
    fun prepare(
        rootfs: File,
        chmod: (String, Int) -> Unit = { path, mode -> Os.chmod(path, mode) },
    ) {
        val policy = child(rootfs, "usr/sbin/policy-rc.d")
        policy.parentFile?.let { require(it.isDirectory || it.mkdirs()) { "无法创建 Ubuntu 策略目录" } }
        policy.writeText("#!/bin/sh\nexit 101\n", Charsets.UTF_8)
        chmod(policy.absolutePath, 0x1ed) // 0755

        listOf(
            "var/lib/apt/lists/partial",
            "var/cache/apt/archives/partial",
            "etc/apt/sources.list.d",
            "etc/apt/apt.conf.d",
        ).forEach { relative ->
            val directory = child(rootfs, relative)
            require(directory.isDirectory || directory.mkdirs()) { "无法创建 Ubuntu 包管理目录" }
        }

        child(rootfs, "etc/apt/sources.list").writeText("# Managed by ElecKoi\n", Charsets.UTF_8)
        child(rootfs, "etc/apt/sources.list.d/ubuntu.sources").writeText(
            """
                Types: deb
                URIs: http://mirrors.tuna.tsinghua.edu.cn/ubuntu-ports/
                Suites: noble noble-updates noble-security noble-backports
                Components: main universe restricted multiverse
                Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
            """.trimIndent() + "\n",
            Charsets.UTF_8,
        )
        child(rootfs, "etc/apt/apt.conf.d/80eleckoi").writeText(
            """
                Acquire::Retries "3";
                Acquire::Languages "none";
                APT::Install-Recommends "false";
                APT::Install-Suggests "false";
            """.trimIndent() + "\n",
            Charsets.UTF_8,
        )

        child(rootfs, "etc/pip.conf").writeText(
            """
                [global]
                index-url = https://pypi.tuna.tsinghua.edu.cn/simple
                trusted-host = pypi.tuna.tsinghua.edu.cn
            """.trimIndent() + "\n",
            Charsets.UTF_8,
        )
        child(rootfs, "etc/npmrc").writeText(
            "registry=https://registry.npmmirror.com\n",
            Charsets.UTF_8,
        )
    }

    private fun child(rootfs: File, relative: String): File {
        require(relative.isNotBlank() && !relative.startsWith('/') && !relative.contains('\\')) {
            "Ubuntu 内部路径无效"
        }
        val root = rootfs.canonicalFile
        val target = File(root, relative).canonicalFile
        require(target.toPath().startsWith(root.toPath()) && target != root) { "Ubuntu 内部路径越界" }
        return target
    }
}
