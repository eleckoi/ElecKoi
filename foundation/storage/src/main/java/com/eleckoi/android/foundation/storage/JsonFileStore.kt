package com.eleckoi.android.foundation.storage

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

open class ElecKoiDataException(message: String, cause: Throwable? = null) : Exception(message, cause)

class JsonFileStore(context: Context) {
    val root: File = File(context.filesDir, "data")

    init {
        root.mkdirs()
    }

    fun dir(vararg segments: String): File {
        return segments.fold(root) { current, segment -> File(current, segment) }
            .also { it.mkdirs() }
    }

    fun file(vararg segments: String): File {
        return segments.fold(root) { current, segment -> File(current, segment) }
    }

    fun readObject(file: File, fallback: JSONObject = JSONObject()): JSONObject {
        if (!file.exists()) return fallback
        return runCatching { JSONObject(file.readText(Charsets.UTF_8)) }.getOrElse { fallback }
    }

    fun writeObject(file: File, value: JSONObject) {
        writeTextAtomic(file, value.toString(2))
    }

    private fun writeTextAtomic(file: File, text: String) {
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, ".${file.name}.tmp-${UUID.randomUUID().toString().replace("-", "")}")
        try {
            temp.writeText(text, Charsets.UTF_8)
            if (file.exists() && !file.delete()) {
                throw ElecKoiDataException("无法替换文件：${file.absolutePath}")
            }
            if (!temp.renameTo(file)) {
                throw ElecKoiDataException("无法写入文件：${file.absolutePath}")
            }
        } finally {
            if (temp.exists()) temp.delete()
        }
    }
}

fun nowIso(): String = OffsetDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

fun newId(length: Int): String = UUID.randomUUID().toString().replace("-", "").take(length)

fun safeId(value: String): String {
    val cleaned = value.asSequence()
        .filter { it.isLetterOrDigit() || it == '-' || it == '_' }
        .take(64)
        .joinToString("")
    return cleaned.ifBlank { newId(32) }
}

fun JSONObject.stringOrEmpty(name: String): String = optString(name, "")

fun JSONObject.booleanOrFalse(name: String): Boolean = optBoolean(name, false)

fun JSONArray.objects(): Sequence<JSONObject> = sequence {
    for (index in 0 until length()) {
        optJSONObject(index)?.let { yield(it) }
    }
}

fun JSONArray.strings(): List<String> {
    val result = mutableListOf<String>()
    for (index in 0 until length()) {
        val value = optString(index, "").trim()
        if (value.isNotEmpty() && !result.contains(value)) {
            result += value
        }
    }
    return result
}
