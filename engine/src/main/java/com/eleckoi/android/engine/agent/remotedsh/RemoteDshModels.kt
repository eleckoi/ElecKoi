package com.eleckoi.android.engine.agent.remotedsh

import com.eleckoi.android.engine.agent.api.AgentSessionEvent

/** Connection details for one optional PC-hosted DSH Web instance. */
data class RemoteDshConnectionConfig(
    val name: String,
    val host: String,
    val sshPort: Int = 22,
    val username: String,
    val privateKey: String,
    val privateKeyPassphrase: String = "",
    /** OpenSSH SHA-256 host-key fingerprint, with or without the `SHA256:` prefix. */
    val hostKeySha256: String,
    val remoteDshPort: Int = 3080,
)

data class RemoteDshHostDescription(
    val version: String,
    val cwd: String,
    val provider: String = "",
    val model: String = "",
)

data class RemoteDshSessionSummary(
    val sessionId: String,
    val title: String,
    val cwd: String,
    val running: Boolean,
    val updatedAtMillis: Long,
    val agentPreset: String = "",
    val workspaceId: String = "",
    val blank: Boolean = false,
    val origin: String = "",
)

data class RemoteDshWorkspaceSummary(
    val workspaceId: String,
    val title: String,
    val path: String,
    val sessionIds: List<String>,
)

/** Durable selection that tells one ElecKoi character exactly where computer tasks run. */
data class RemoteDshRoleBinding(
    val workspaceId: String,
    val workspaceTitle: String,
    val workspacePath: String,
    val sessionId: String,
    val sessionTitle: String,
)

sealed interface RemoteDshConnectionState {
    data object Disabled : RemoteDshConnectionState
    data object Connecting : RemoteDshConnectionState
    data class Connected(
        val host: RemoteDshHostDescription,
        val computerName: String,
    ) : RemoteDshConnectionState
    data class Failed(val message: String) : RemoteDshConnectionState
}

data class RemoteDshEvent(
    val sessionId: String,
    val sequence: Long?,
    val event: AgentSessionEvent,
)

data class RemoteDshTaskResult(
    val sessionId: String,
    val response: String,
)
