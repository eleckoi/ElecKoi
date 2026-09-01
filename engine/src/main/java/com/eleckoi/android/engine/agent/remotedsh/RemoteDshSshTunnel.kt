package com.eleckoi.android.engine.agent.remotedsh

import com.jcraft.jsch.HostKey
import com.jcraft.jsch.HostKeyRepository
import com.jcraft.jsch.JSch
import com.jcraft.jsch.Session
import com.jcraft.jsch.UserInfo
import java.security.MessageDigest
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal class RemoteDshSshTunnel private constructor(
    private val session: Session,
    val localPort: Int,
) : AutoCloseable {
    override fun close() {
        runCatching { session.delPortForwardingL("127.0.0.1", localPort) }
        session.disconnect()
    }

    companion object {
        suspend fun open(config: RemoteDshConnectionConfig): RemoteDshSshTunnel =
            withContext(Dispatchers.IO) {
                require(config.host.isNotBlank()) { "电脑地址不能为空" }
                require(config.username.isNotBlank()) { "SSH 用户名不能为空" }
                require(config.privateKey.isNotBlank()) { "SSH 私钥不能为空" }
                require(config.sshPort in 1..65535) { "SSH 端口无效" }
                require(config.remoteDshPort in 1..65535) { "DSH Web 端口无效" }
                val expectedFingerprint = RemoteDshHostKeyPin.normalize(config.hostKeySha256)
                require(expectedFingerprint.isNotBlank()) { "必须填写电脑 SSH 主机指纹" }

                val privateKeyBytes = config.privateKey.toByteArray(Charsets.UTF_8)
                val passphraseBytes = config.privateKeyPassphrase
                    .takeIf(String::isNotEmpty)
                    ?.toByteArray(Charsets.UTF_8)
                RemoteDshEd25519Support.install()
                val jsch = JSch().apply {
                    hostKeyRepository = PinnedHostKeyRepository(expectedFingerprint)
                    try {
                        addIdentity("eleckoi-remote-dsh", privateKeyBytes, null, passphraseBytes)
                    } finally {
                        privateKeyBytes.fill(0)
                        passphraseBytes?.fill(0)
                    }
                }
                val ssh = jsch.getSession(config.username, config.host, config.sshPort).apply {
                    setConfig("StrictHostKeyChecking", "yes")
                    setConfig("PreferredAuthentications", "publickey")
                    setConfig("TCPKeepAlive", "yes")
                    serverAliveInterval = 15_000
                    serverAliveCountMax = 3
                    timeout = 20_000
                }
                try {
                    ssh.connect(20_000)
                    val localPort = ssh.setPortForwardingL(
                        "127.0.0.1",
                        0,
                        "127.0.0.1",
                        config.remoteDshPort,
                    )
                    RemoteDshSshTunnel(ssh, localPort)
                } catch (error: Throwable) {
                    ssh.disconnect()
                    throw error
                }
            }

        private class PinnedHostKeyRepository(
            private val expected: String,
        ) : HostKeyRepository {
            override fun check(host: String?, key: ByteArray?): Int {
                if (key == null) return HostKeyRepository.CHANGED
                return if (RemoteDshHostKeyPin.matches(key, expected)) {
                    HostKeyRepository.OK
                } else {
                    HostKeyRepository.CHANGED
                }
            }

            override fun add(hostkey: HostKey?, ui: UserInfo?) = Unit
            override fun remove(host: String?, type: String?) = Unit
            override fun remove(host: String?, type: String?, key: ByteArray?) = Unit
            override fun getKnownHostsRepositoryID(): String = "ElecKoi pinned SHA-256 host key"
            override fun getHostKey(): Array<HostKey> = emptyArray()
            override fun getHostKey(host: String?, type: String?): Array<HostKey> = emptyArray()
        }
    }
}

/**
 * Android packages the Java 8 view of JSch's multi-release JAR, so its Java 15 Ed25519 signer is
 * unavailable even on recent devices. JSch officially supports Bouncy Castle for this case.
 */
internal object RemoteDshEd25519Support {
    fun install() {
        JSch.setConfig("keypairgen.eddsa", "com.jcraft.jsch.bc.KeyPairGenEdDSA")
        JSch.setConfig("keypairgen_fromprivate.eddsa", "com.jcraft.jsch.bc.KeyPairGenEdDSA")
        JSch.setConfig("ssh-ed25519", "com.jcraft.jsch.bc.SignatureEd25519")
    }
}

internal object RemoteDshHostKeyPin {
    fun normalize(value: String): String = value
        .trim()
        .removePrefix("SHA256:")
        .trimEnd('=')

    fun fingerprint(key: ByteArray): String = Base64.getEncoder().withoutPadding().encodeToString(
        MessageDigest.getInstance("SHA-256").digest(key),
    )

    fun matches(key: ByteArray, expected: String): Boolean = MessageDigest.isEqual(
        fingerprint(key).toByteArray(Charsets.US_ASCII),
        normalize(expected).toByteArray(Charsets.US_ASCII),
    )
}
