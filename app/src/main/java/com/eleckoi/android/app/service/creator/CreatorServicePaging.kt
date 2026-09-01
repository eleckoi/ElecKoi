package com.eleckoi.android.app.service

internal const val MaxCreatorPageSize = 50

internal fun encodeCreatorCursor(index: Int, id: String): String = "$index|$id"

internal fun decodeCreatorCursor(cursor: String): Pair<Int, String> {
    if (cursor.isBlank()) return -1 to ""
    val separator = cursor.indexOf('|')
    require(separator > 0) { "分页 cursor 无效" }
    val index = cursor.substring(0, separator).toIntOrNull()
        ?: error("分页 cursor 无效")
    val id = cursor.substring(separator + 1)
    require(id.isNotBlank()) { "分页 cursor 无效" }
    return index to id
}
