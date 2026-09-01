package com.eleckoi.android.engine.workspace.runtime.process

import java.io.InputStream
import java.io.InputStreamReader

/** Reads line-oriented process protocols without allowing an unterminated line to exhaust memory. */
internal fun InputStream.forEachBoundedUtf8Line(
    maxLineChars: Int,
    onLine: (String) -> Unit,
) {
    require(maxLineChars > 0) { "进程输出行上限无效" }
    InputStreamReader(this, Charsets.UTF_8).use { reader ->
        val buffer = CharArray(4 * 1024)
        val line = StringBuilder(minOf(maxLineChars, 16 * 1024))
        while (true) {
            val count = reader.read(buffer)
            if (count < 0) break
            repeat(count) { index ->
                when (val char = buffer[index]) {
                    '\n' -> {
                        onLine(line.toString())
                        line.setLength(0)
                    }
                    '\r' -> Unit
                    else -> {
                        require(line.length < maxLineChars) { "本地进程单行输出超过安全上限" }
                        line.append(char)
                    }
                }
            }
        }
        if (line.isNotEmpty()) onLine(line.toString())
    }
}
