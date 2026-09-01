package com.eleckoi.android.engine.workspace.runtime.service

import android.content.Context
import java.io.File
import java.util.UUID

/**
 * Moves large stdin lines between the UI and isolated runtime processes without putting the
 * payload in a Binder transaction. Both processes share the app UID and cache directory.
 */
internal class RuntimeInputSpool(
    private val rootDirectory: File,
    private val maxLineChars: Int = MaxLineChars,
    private val maxFileBytes: Long = MaxFileBytes,
) {
    fun write(line: String): String {
        require(line.length <= maxLineChars) { "输入内容过长" }
        require(rootDirectory.mkdirs() || rootDirectory.isDirectory) { "无法创建运行时输入缓存" }
        val name = "line_${UUID.randomUUID().toString().replace("-", "")}.jsonl"
        val file = File(rootDirectory, name)
        try {
            file.bufferedWriter(Charsets.UTF_8).use { it.write(line) }
            require(file.length() <= maxFileBytes) { "输入内容过长" }
            return name
        } catch (error: Throwable) {
            file.delete()
            throw error
        }
    }

    fun consume(name: String): String {
        val file = resolve(name)
        try {
            require(file.isFile) { "运行时输入缓存不存在" }
            require(file.length() <= maxFileBytes) { "输入内容过长" }
            return file.readText(Charsets.UTF_8).also { line ->
                require(line.length <= maxLineChars) { "输入内容过长" }
            }
        } finally {
            file.delete()
        }
    }

    fun discard(name: String) {
        runCatching { resolve(name).delete() }
    }

    fun cleanup() {
        rootDirectory.listFiles()
            ?.filter { SpoolName.matches(it.name) }
            ?.forEach(File::delete)
    }

    private fun resolve(name: String): File {
        require(SpoolName.matches(name)) { "运行时输入缓存名称无效" }
        val root = rootDirectory.canonicalFile
        return File(root, name).canonicalFile.also { file ->
            require(file.parentFile == root) { "运行时输入缓存路径无效" }
        }
    }

    companion object {
        const val InlineLineMaxChars: Int = 48 * 1024
        const val MaxLineChars: Int = 32 * 1024 * 1024
        private const val MaxFileBytes: Long = 64L * 1024L * 1024L
        private val SpoolName = Regex("line_[0-9a-f]{32}\\.jsonl")

        fun create(context: Context): RuntimeInputSpool = RuntimeInputSpool(
            File(context.cacheDir, "runtime-ipc/input-lines"),
        )
    }
}
