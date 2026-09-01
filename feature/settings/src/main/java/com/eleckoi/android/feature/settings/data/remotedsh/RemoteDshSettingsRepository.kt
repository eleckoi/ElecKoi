package com.eleckoi.android.feature.settings.data.remotedsh

import android.content.Context
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshConnectionConfig
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshRoleBinding
import com.eleckoi.android.engine.generation.config.AndroidKeystoreModelSecretCodec
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class RemoteDshSettings(
    val enabled: Boolean = false,
    val computerName: String = "",
    val host: String = "",
    val sshPort: Int = 22,
    val username: String = "",
    val hostKeySha256: String = "",
    val remoteDshPort: Int = 3080,
    val privateKeyConfigured: Boolean = false,
    val passphraseConfigured: Boolean = false,
)

/** Persists the optional Remote DSH plugin without exposing its SSH secrets in observable state. */
class RemoteDshSettingsRepository(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        "eleckoi.remote-dsh.v1",
        Context.MODE_PRIVATE,
    )
    private val secrets = AndroidKeystoreModelSecretCodec()
    private val _settings = MutableStateFlow(readSettings())
    val settings: StateFlow<RemoteDshSettings> = _settings.asStateFlow()

    fun setEnabled(enabled: Boolean) {
        preferences.edit().putBoolean(KeyEnabled, enabled).apply()
        _settings.value = readSettings()
    }

    fun save(
        value: RemoteDshSettings,
        privateKey: String,
        passphrase: String,
    ) {
        val editor = preferences.edit()
            .putBoolean(KeyEnabled, value.enabled)
            .putString(KeyComputerName, value.computerName.trim())
            .putString(KeyHost, value.host.trim())
            .putInt(KeySshPort, value.sshPort)
            .putString(KeyUsername, value.username.trim())
            .putString(KeyHostFingerprint, value.hostKeySha256.trim())
            .putInt(KeyDshPort, value.remoteDshPort)
        if (privateKey.isNotBlank()) {
            editor.putString(
                KeyPrivateKey,
                secrets.protect(PrivateKeySecretId, privateKey.trim()),
            )
        }
        if (passphrase.isNotEmpty()) {
            editor.putString(
                KeyPassphrase,
                secrets.protect(PassphraseSecretId, passphrase),
            )
        }
        editor.apply()
        _settings.value = readSettings()
    }

    fun clearSecrets() {
        preferences.edit().remove(KeyPrivateKey).remove(KeyPassphrase).apply()
        _settings.value = readSettings()
    }

    fun connectionConfig(): RemoteDshConnectionConfig {
        val settings = readSettings()
        val storedPrivateKey = preferences.getString(KeyPrivateKey, "").orEmpty()
        require(storedPrivateKey.isNotBlank()) { "请先保存 SSH 私钥" }
        return RemoteDshConnectionConfig(
            name = settings.computerName,
            host = settings.host,
            sshPort = settings.sshPort,
            username = settings.username,
            privateKey = secrets.reveal(PrivateKeySecretId, storedPrivateKey),
            privateKeyPassphrase = preferences.getString(KeyPassphrase, "")
                .orEmpty()
                .takeIf(String::isNotBlank)
                ?.let { secrets.reveal(PassphraseSecretId, it) }
                .orEmpty(),
            hostKeySha256 = settings.hostKeySha256,
            remoteDshPort = settings.remoteDshPort,
        )
    }

    fun roleBinding(toolScopeId: String): RemoteDshRoleBinding? {
        if (toolScopeId.isBlank()) return null
        val prefix = bindingPrefix(toolScopeId)
        val workspaceId = preferences.getString("${prefix}workspace_id", "").orEmpty()
        val sessionId = preferences.getString("${prefix}session_id", "").orEmpty()
        if (workspaceId.isBlank() || sessionId.isBlank()) return null
        return RemoteDshRoleBinding(
            workspaceId = workspaceId,
            workspaceTitle = preferences.getString("${prefix}workspace_title", "").orEmpty(),
            workspacePath = preferences.getString("${prefix}workspace_path", "").orEmpty(),
            sessionId = sessionId,
            sessionTitle = preferences.getString("${prefix}session_title", "").orEmpty(),
        )
    }

    fun saveRoleBinding(toolScopeId: String, binding: RemoteDshRoleBinding) {
        require(toolScopeId.isNotBlank()) { "缺少角色工具范围" }
        val prefix = bindingPrefix(toolScopeId)
        preferences.edit()
            .putString("${prefix}workspace_id", binding.workspaceId)
            .putString("${prefix}workspace_title", binding.workspaceTitle)
            .putString("${prefix}workspace_path", binding.workspacePath)
            .putString("${prefix}session_id", binding.sessionId)
            .putString("${prefix}session_title", binding.sessionTitle)
            .apply()
    }

    fun clearRoleBinding(toolScopeId: String) {
        if (toolScopeId.isBlank()) return
        val prefix = bindingPrefix(toolScopeId)
        preferences.edit()
            .remove("${prefix}workspace_id")
            .remove("${prefix}workspace_title")
            .remove("${prefix}workspace_path")
            .remove("${prefix}session_id")
            .remove("${prefix}session_title")
            .apply()
    }

    private fun readSettings() = RemoteDshSettings(
        enabled = preferences.getBoolean(KeyEnabled, false),
        computerName = preferences.getString(KeyComputerName, "").orEmpty(),
        host = preferences.getString(KeyHost, "").orEmpty(),
        sshPort = preferences.getInt(KeySshPort, 22),
        username = preferences.getString(KeyUsername, "").orEmpty(),
        hostKeySha256 = preferences.getString(KeyHostFingerprint, "").orEmpty(),
        remoteDshPort = preferences.getInt(KeyDshPort, 3080),
        privateKeyConfigured = preferences.getString(KeyPrivateKey, "").orEmpty().isNotBlank(),
        passphraseConfigured = preferences.getString(KeyPassphrase, "").orEmpty().isNotBlank(),
    )

    private fun bindingPrefix(toolScopeId: String): String = "binding.$toolScopeId."

    private companion object {
        const val KeyEnabled = "enabled"
        const val KeyComputerName = "computer_name"
        const val KeyHost = "host"
        const val KeySshPort = "ssh_port"
        const val KeyUsername = "username"
        const val KeyHostFingerprint = "host_key_sha256"
        const val KeyDshPort = "dsh_port"
        const val KeyPrivateKey = "private_key"
        const val KeyPassphrase = "private_key_passphrase"
        const val PrivateKeySecretId = "remote-dsh.ssh-private-key"
        const val PassphraseSecretId = "remote-dsh.ssh-private-key-passphrase"
    }
}
