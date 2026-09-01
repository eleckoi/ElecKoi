package com.eleckoi.android.engine.workspace.model

/** Shared limits enforced by both repository APIs and the out-of-process Harness watchdog. */
object CreatorWorkspaceLimits {
    const val MaxFileCount = 1_024
    const val MaxSingleFileBytes = 16L * 1024L * 1024L
    const val MaxTotalBytes = 64L * 1024L * 1024L
    const val MaxDirectoryDepth = 32
    const val MaxFilesystemEntries = 4_096
}
