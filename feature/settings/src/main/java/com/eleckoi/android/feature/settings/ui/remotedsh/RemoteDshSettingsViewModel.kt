package com.eleckoi.android.feature.settings.ui.remotedsh

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshConnectionState
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshPlugin
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshRoleBinding
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshSessionSummary
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshWorkspaceSummary
import com.eleckoi.android.feature.settings.data.remotedsh.RemoteDshSettings
import com.eleckoi.android.feature.settings.data.remotedsh.RemoteDshSettingsRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal data class RemoteDshSettingsUiState(
    val enabled: Boolean = false,
    val computerName: String = "",
    val host: String = "",
    val sshPort: String = "22",
    val username: String = "",
    val hostKeySha256: String = "",
    val remoteDshPort: String = "3080",
    val privateKeyDraft: String = "",
    val passphraseDraft: String = "",
    val privateKeyConfigured: Boolean = false,
    val passphraseConfigured: Boolean = false,
    val connectionState: RemoteDshConnectionState = RemoteDshConnectionState.Disabled,
    val sessions: List<RemoteDshSessionSummary> = emptyList(),
    val workspaces: List<RemoteDshWorkspaceSummary> = emptyList(),
    val toolScopeId: String = "",
    val roleBinding: RemoteDshRoleBinding? = null,
    val saving: Boolean = false,
    val mutatingSessionId: String = "",
    val notice: String = "",
    val errorMessage: String = "",
)

internal sealed interface RemoteDshSettingsIntent {
    data class SetEnabled(val value: Boolean) : RemoteDshSettingsIntent
    data class SetComputerName(val value: String) : RemoteDshSettingsIntent
    data class SetHost(val value: String) : RemoteDshSettingsIntent
    data class SetSshPort(val value: String) : RemoteDshSettingsIntent
    data class SetUsername(val value: String) : RemoteDshSettingsIntent
    data class SetHostKeySha256(val value: String) : RemoteDshSettingsIntent
    data class SetRemoteDshPort(val value: String) : RemoteDshSettingsIntent
    data class SetPrivateKey(val value: String) : RemoteDshSettingsIntent
    data class SetPassphrase(val value: String) : RemoteDshSettingsIntent
    data object SaveAndConnect : RemoteDshSettingsIntent
    data object Refresh : RemoteDshSettingsIntent
    data object Disconnect : RemoteDshSettingsIntent
    data object ClearSecrets : RemoteDshSettingsIntent
    data class BindSession(val sessionId: String) : RemoteDshSettingsIntent
    data class CreateSession(val workspaceId: String, val title: String) : RemoteDshSettingsIntent
    data class RenameSession(val sessionId: String, val title: String) : RemoteDshSettingsIntent
    data class ArchiveSession(val sessionId: String) : RemoteDshSettingsIntent
}

class RemoteDshSettingsViewModel(
    private val repository: RemoteDshSettingsRepository,
    private val plugin: RemoteDshPlugin,
) : ViewModel() {
    private val _uiState = MutableStateFlow(repository.settings.value.toUiState())
    internal val uiState: StateFlow<RemoteDshSettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.settings.collect { settings ->
                _uiState.update {
                    it.copy(
                        enabled = settings.enabled,
                        privateKeyConfigured = settings.privateKeyConfigured,
                        passphraseConfigured = settings.passphraseConfigured,
                    )
                }
            }
        }
        viewModelScope.launch {
            plugin.state.collect { state -> _uiState.update { it.copy(connectionState = state) } }
        }
        viewModelScope.launch {
            plugin.sessions.collect { sessions -> _uiState.update { it.copy(sessions = sessions) } }
        }
        viewModelScope.launch {
            plugin.workspaces.collect { workspaces -> _uiState.update { it.copy(workspaces = workspaces) } }
        }
        if (repository.settings.value.enabled) connectSaved(silent = true)
    }

    internal fun bindToolScope(toolScopeId: String) {
        _uiState.update {
            it.copy(
                toolScopeId = toolScopeId,
                roleBinding = repository.roleBinding(toolScopeId),
                notice = "",
                errorMessage = "",
            )
        }
    }

    internal fun onIntent(intent: RemoteDshSettingsIntent) {
        when (intent) {
            is RemoteDshSettingsIntent.SetEnabled -> setEnabled(intent.value)
            is RemoteDshSettingsIntent.SetComputerName -> edit { copy(computerName = intent.value.take(80)) }
            is RemoteDshSettingsIntent.SetHost -> edit { copy(host = intent.value.take(255)) }
            is RemoteDshSettingsIntent.SetSshPort -> edit { copy(sshPort = intent.value.filter(Char::isDigit).take(5)) }
            is RemoteDshSettingsIntent.SetUsername -> edit { copy(username = intent.value.take(128)) }
            is RemoteDshSettingsIntent.SetHostKeySha256 -> edit { copy(hostKeySha256 = intent.value.take(160)) }
            is RemoteDshSettingsIntent.SetRemoteDshPort -> edit {
                copy(remoteDshPort = intent.value.filter(Char::isDigit).take(5))
            }
            is RemoteDshSettingsIntent.SetPrivateKey -> edit { copy(privateKeyDraft = intent.value.take(16_384)) }
            is RemoteDshSettingsIntent.SetPassphrase -> edit { copy(passphraseDraft = intent.value.take(4_096)) }
            RemoteDshSettingsIntent.SaveAndConnect -> saveAndConnect()
            RemoteDshSettingsIntent.Refresh -> refresh()
            RemoteDshSettingsIntent.Disconnect -> {
                plugin.disconnect()
                _uiState.update { it.copy(notice = "已断开电脑 DSH", errorMessage = "") }
            }
            RemoteDshSettingsIntent.ClearSecrets -> {
                repository.clearSecrets()
                plugin.disconnect()
                _uiState.update {
                    it.copy(
                        privateKeyDraft = "",
                        passphraseDraft = "",
                        notice = "已移除 SSH 私钥",
                        errorMessage = "",
                    )
                }
            }
            is RemoteDshSettingsIntent.BindSession -> bindSession(intent.sessionId)
            is RemoteDshSettingsIntent.CreateSession -> createSession(intent.workspaceId, intent.title)
            is RemoteDshSettingsIntent.RenameSession -> renameSession(intent.sessionId, intent.title)
            is RemoteDshSettingsIntent.ArchiveSession -> archiveSession(intent.sessionId)
        }
    }

    private fun bindSession(sessionId: String) {
        val state = _uiState.value
        val session = state.sessions.firstOrNull { it.sessionId == sessionId }
            ?: return _uiState.update { it.copy(errorMessage = "找不到这个电脑 DSH 会话") }
        val workspace = state.workspaces.firstOrNull { it.workspaceId == session.workspaceId }
            ?: return _uiState.update { it.copy(errorMessage = "该会话未归入电脑工作区，不能绑定给角色") }
        val binding = RemoteDshRoleBinding(
            workspaceId = workspace.workspaceId,
            workspaceTitle = workspace.title,
            workspacePath = workspace.path,
            sessionId = session.sessionId,
            sessionTitle = session.title,
        )
        repository.saveRoleBinding(state.toolScopeId, binding)
        _uiState.update {
            it.copy(roleBinding = binding, notice = "当前角色已绑定“${session.title}”", errorMessage = "")
        }
    }

    private fun createSession(workspaceId: String, title: String) {
        mutateSession("new:$workspaceId") {
            val session = plugin.createSession(workspaceId, title)
            withContext(Dispatchers.Main) { bindSession(session.sessionId) }
        }
    }

    private fun renameSession(sessionId: String, title: String) {
        mutateSession(sessionId) {
            val renamed = plugin.renameSession(sessionId, title)
            val current = _uiState.value
            if (current.roleBinding?.sessionId == sessionId) {
                val updated = current.roleBinding.copy(sessionTitle = renamed.title)
                repository.saveRoleBinding(current.toolScopeId, updated)
                _uiState.update { it.copy(roleBinding = updated) }
            }
        }
    }

    private fun archiveSession(sessionId: String) {
        mutateSession(sessionId) {
            plugin.archiveSession(sessionId)
            val current = _uiState.value
            if (current.roleBinding?.sessionId == sessionId) {
                repository.clearRoleBinding(current.toolScopeId)
                _uiState.update { it.copy(roleBinding = null) }
            }
        }
    }

    private fun mutateSession(id: String, block: suspend () -> Unit) {
        if (_uiState.value.mutatingSessionId.isNotBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(mutatingSessionId = id, notice = "", errorMessage = "") }
            runCatching { withContext(Dispatchers.IO) { block() } }
                .onSuccess {
                    _uiState.update { it.copy(mutatingSessionId = "", notice = it.notice.ifBlank { "已更新电脑会话" }) }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(mutatingSessionId = "", errorMessage = error.message ?: "电脑会话操作失败")
                    }
                }
        }
    }

    private fun setEnabled(enabled: Boolean) {
        repository.setEnabled(enabled)
        if (!enabled) {
            plugin.disconnect()
            _uiState.update { it.copy(enabled = false, notice = "电脑 DSH 自动连接已关闭", errorMessage = "") }
        } else if (repository.settings.value.privateKeyConfigured) {
            connectSaved(silent = false)
        } else {
            _uiState.update {
                it.copy(enabled = true, notice = "填写连接信息并保存后才会连接电脑", errorMessage = "")
            }
        }
    }

    private fun saveAndConnect() {
        if (_uiState.value.saving) return
        viewModelScope.launch {
            _uiState.update { it.copy(saving = true, notice = "", errorMessage = "") }
            runCatching {
                val draft = _uiState.value
                val sshPort = draft.sshPort.toIntOrNull()?.takeIf { it in 1..65535 }
                    ?: error("SSH 端口无效")
                val dshPort = draft.remoteDshPort.toIntOrNull()?.takeIf { it in 1..65535 }
                    ?: error("DSH Web 端口无效")
                require(draft.host.isNotBlank()) { "请填写 Tailscale 地址或电脑 IP" }
                require(draft.username.isNotBlank()) { "请填写 SSH 用户名" }
                require(draft.hostKeySha256.isNotBlank()) { "请填写 SSH 主机 SHA-256 指纹" }
                require(draft.privateKeyConfigured || draft.privateKeyDraft.isNotBlank()) {
                    "请粘贴 SSH 私钥"
                }
                withContext(Dispatchers.IO) {
                    repository.save(
                        RemoteDshSettings(
                            enabled = draft.enabled,
                            computerName = draft.computerName,
                            host = draft.host,
                            sshPort = sshPort,
                            username = draft.username,
                            hostKeySha256 = draft.hostKeySha256,
                            remoteDshPort = dshPort,
                            privateKeyConfigured = draft.privateKeyConfigured,
                            passphraseConfigured = draft.passphraseConfigured,
                        ),
                        privateKey = draft.privateKeyDraft,
                        passphrase = draft.passphraseDraft,
                    )
                    if (draft.enabled) plugin.connect(repository.connectionConfig())
                }
            }.onSuccess {
                _uiState.update {
                    it.copy(
                        saving = false,
                        privateKeyDraft = "",
                        passphraseDraft = "",
                        privateKeyConfigured = repository.settings.value.privateKeyConfigured,
                        passphraseConfigured = repository.settings.value.passphraseConfigured,
                        notice = if (it.enabled) "连接成功，已发现 ${plugin.sessions.value.size} 个电脑 DSH 会话" else "配置已保存",
                        errorMessage = "",
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        saving = false,
                        errorMessage = error.message ?: "远端 DSH 连接失败",
                    )
                }
            }
        }
    }

    private fun connectSaved(silent: Boolean) {
        viewModelScope.launch {
            if (!silent) _uiState.update { it.copy(saving = true, notice = "", errorMessage = "") }
            runCatching { withContext(Dispatchers.IO) { plugin.connect(repository.connectionConfig()) } }
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            saving = false,
                            notice = if (silent) it.notice else "已连接电脑 DSH",
                            errorMessage = "",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(saving = false, errorMessage = error.message ?: "远端 DSH 连接失败")
                    }
                }
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            runCatching { withContext(Dispatchers.IO) { plugin.refreshSessions() } }
                .onSuccess { sessions ->
                    _uiState.update { it.copy(notice = "已刷新 ${sessions.size} 个会话", errorMessage = "") }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(errorMessage = error.message ?: "刷新失败") }
                }
        }
    }

    private inline fun edit(transform: RemoteDshSettingsUiState.() -> RemoteDshSettingsUiState) {
        _uiState.update { it.transform().copy(notice = "", errorMessage = "") }
    }

    companion object {
        fun factory(
            repository: RemoteDshSettingsRepository,
            plugin: RemoteDshPlugin,
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                RemoteDshSettingsViewModel(repository, plugin) as T
        }
    }
}

private fun RemoteDshSettings.toUiState() = RemoteDshSettingsUiState(
    enabled = enabled,
    computerName = computerName,
    host = host,
    sshPort = sshPort.toString(),
    username = username,
    hostKeySha256 = hostKeySha256,
    remoteDshPort = remoteDshPort.toString(),
    privateKeyConfigured = privateKeyConfigured,
    passphraseConfigured = passphraseConfigured,
)
