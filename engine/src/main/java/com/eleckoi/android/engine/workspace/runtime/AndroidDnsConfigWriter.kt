package com.eleckoi.android.engine.workspace.runtime

import android.content.Context
import android.net.ConnectivityManager
import java.io.File
import java.io.FileOutputStream
import java.net.InetAddress
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.StandardCopyOption

/**
 * Mirrors Android's currently active DNS servers into an app-private
 * resolv.conf that can be mounted read-only in spirit (narrowly) into PRoot.
 *
 * No public resolver is invented when Android reports no active DNS server.
 * That state is represented by comments only, so guest resolution fails
 * honestly instead of silently sending queries to an unrelated provider.
 */
internal class AndroidDnsConfigWriter(
    private val resolverFile: File,
    private val dnsServers: () -> List<InetAddress>,
) {
    constructor(context: Context, resolverFile: File) : this(
        resolverFile = resolverFile,
        dnsServers = activeNetworkDnsServers(context.applicationContext),
    )

    fun refresh(): File {
        val contents = render(dnsServers())
        val target = resolverFile.toPath().toAbsolutePath().normalize()
        val parent = requireNotNull(target.parent) { "DNS 配置文件缺少父目录" }
        Files.createDirectories(parent)
        require(!Files.isSymbolicLink(parent)) { "DNS 配置目录不能是符号链接" }
        require(!Files.isSymbolicLink(target)) { "DNS 配置文件不能是符号链接" }

        val temporary = Files.createTempFile(parent, ".resolv-conf-", ".tmp")
        try {
            val bytes = contents.toByteArray(StandardCharsets.UTF_8)
            FileOutputStream(temporary.toFile()).channel.use { channel ->
                var buffer = ByteBuffer.wrap(bytes)
                while (buffer.hasRemaining()) channel.write(buffer)
                channel.force(true)
            }
            Files.move(
                temporary,
                target,
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING,
            )
        } finally {
            Files.deleteIfExists(temporary)
        }

        require(Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS)) {
            "DNS 配置没有写成安全的普通文件"
        }
        return target.toFile().canonicalFile
    }

    internal companion object {
        private const val Header = "# Generated from Android active-network LinkProperties.\n"
        private const val NoDns =
            "# Android currently reports no DNS servers; ElecKoi did not invent a fallback.\n"

        fun render(servers: List<InetAddress>): String {
            val addresses = servers.asSequence()
                .mapNotNull(InetAddress::getHostAddress)
                .map { it.substringBefore('%') }
                .filter(String::isNotBlank)
                .distinct()
                .toList()
            return buildString {
                append(Header)
                if (addresses.isEmpty()) {
                    append(NoDns)
                } else {
                    addresses.forEach { address -> append("nameserver ").append(address).append('\n') }
                }
            }
        }

        private fun activeNetworkDnsServers(context: Context): () -> List<InetAddress> {
            val connectivity = requireNotNull(context.getSystemService(ConnectivityManager::class.java)) {
                "系统网络服务不可用"
            }
            return {
                connectivity.activeNetwork
                    ?.let(connectivity::getLinkProperties)
                    ?.dnsServers
                    ?.toList()
                    .orEmpty()
            }
        }
    }
}
