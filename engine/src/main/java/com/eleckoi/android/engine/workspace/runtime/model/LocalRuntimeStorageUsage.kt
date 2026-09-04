package com.eleckoi.android.engine.workspace.runtime.model

/** Runtime disk usage measured from the active installation rather than estimated. */
data class LocalRuntimeStorageUsage(
    val ubuntuBytes: Long,
    val harnessBytes: Long,
    val toolchainBytes: Long,
) {
    val totalBytes: Long
        get() = ubuntuBytes + harnessBytes + toolchainBytes

    val measured: Boolean
        get() = totalBytes > 0L

    companion object {
        val Unknown = LocalRuntimeStorageUsage(
            ubuntuBytes = 0L,
            harnessBytes = 0L,
            toolchainBytes = 0L,
        )
    }
}
