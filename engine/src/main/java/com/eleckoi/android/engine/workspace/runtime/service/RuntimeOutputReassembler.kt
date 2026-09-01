package com.eleckoi.android.engine.workspace.runtime.service

import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeStream

/** Reassembles bounded process-output fragments after they cross Android Messenger IPC. */
internal class RuntimeOutputReassembler(
    private val maxLineChars: Int = DefaultMaxLineChars,
) {
    private val pending = mutableMapOf<OutputKey, StringBuilder>()

    fun accept(
        commandId: String,
        stream: LocalRuntimeStream,
        fragment: String,
        endOfLine: Boolean,
    ): String? {
        val key = OutputKey(commandId, stream)
        if (endOfLine && key !in pending) {
            require(fragment.length <= maxLineChars) { "本地运行时单行输出超过安全上限" }
            return fragment
        }
        val buffer = pending.getOrPut(key) { StringBuilder() }
        require(buffer.length.toLong() + fragment.length.toLong() <= maxLineChars.toLong()) {
            pending.remove(key)
            "本地运行时单行输出超过安全上限"
        }
        buffer.append(fragment)
        if (!endOfLine) return null
        pending.remove(key)
        return buffer.toString()
    }

    fun clear(commandId: String) {
        pending.keys.removeAll { it.commandId == commandId }
    }

    fun clear() = pending.clear()

    private data class OutputKey(
        val commandId: String,
        val stream: LocalRuntimeStream,
    )

    private companion object {
        const val DefaultMaxLineChars = 4 * 1024 * 1024
    }
}
