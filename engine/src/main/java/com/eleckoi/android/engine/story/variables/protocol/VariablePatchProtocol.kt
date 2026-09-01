package com.eleckoi.android.engine.story.variables.protocol

import com.eleckoi.android.foundation.storage.ElecKoiDataException
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal

object VariablePatchProtocol {
    fun applyPatch(currentStateJson: String, patchJson: String): String {
        val patch = parseArray(patchJson, "JSONPatch 必须是合法 JSON array")
        val currentState = parseObject(currentStateJson, "当前变量状态不是合法 JSON object")
        return applyPatch(currentState, patch).toString(2)
    }

    private fun applyPatch(currentState: JSONObject, patch: JSONArray): JSONObject {
        if (patch.length() > MaxPatchOperations) {
            throw ElecKoiDataException("变量更新命令过多，单次最多允许 $MaxPatchOperations 项")
        }
        val state = JSONObject(currentState.toString())
        repeat(patch.length()) { index ->
            val operation = patch.optJSONObject(index)
                ?: patchError(index, "每项必须是 JSON object")
            val op = requiredString(operation, "op", index)
            val pointer = requiredString(operation, "path", index)
            val path = parsePointer(pointer, index)
            if (path.any { it.startsWith("*") }) {
                patchError(index, "不能修改以 * 开头的只读变量")
            }
            when (op) {
                "replace" -> replace(state, path, requiredValue(operation, index), index)
                "delta" -> delta(state, path, requiredValue(operation, index), index)
                "insert" -> insert(state, path, requiredValue(operation, index), index)
                "remove" -> remove(state, path, index)
                else -> patchError(index, "不支持的 op：$op")
            }
        }
        return state
    }

    private fun replace(root: JSONObject, path: List<String>, value: Any, operationIndex: Int) {
        val target = resolveTarget(root, path, operationIndex)
        when (val parent = target.parent) {
            is JSONObject -> {
                if (!parent.has(target.key)) patchError(operationIndex, "replace 的目标不存在")
                parent.put(target.key, value)
            }
            is JSONArray -> parent.put(existingArrayIndex(parent, target.key, operationIndex), value)
            else -> patchError(operationIndex, "replace 的父级不是 object 或 array")
        }
    }

    private fun delta(root: JSONObject, path: List<String>, value: Any, operationIndex: Int) {
        val change = value as? Number ?: patchError(operationIndex, "delta 的 value 必须是数字")
        val target = resolveTarget(root, path, operationIndex)
        when (val parent = target.parent) {
            is JSONObject -> {
                if (!parent.has(target.key)) patchError(operationIndex, "delta 的目标不存在")
                val current = parent.get(target.key) as? Number
                    ?: patchError(operationIndex, "delta 的目标必须是数字")
                parent.put(target.key, addNumbers(current, change, operationIndex))
            }
            is JSONArray -> {
                val arrayIndex = existingArrayIndex(parent, target.key, operationIndex)
                val current = parent.get(arrayIndex) as? Number
                    ?: patchError(operationIndex, "delta 的目标必须是数字")
                parent.put(arrayIndex, addNumbers(current, change, operationIndex))
            }
            else -> patchError(operationIndex, "delta 的父级不是 object 或 array")
        }
    }

    private fun insert(root: JSONObject, path: List<String>, value: Any, operationIndex: Int) {
        val target = resolveTarget(
            root = root,
            path = path,
            operationIndex = operationIndex,
            createMissingObjectParents = true,
        )
        when (val parent = target.parent) {
            is JSONObject -> {
                if (parent.has(target.key)) patchError(operationIndex, "insert 的对象字段已经存在")
                parent.put(target.key, value)
            }
            is JSONArray -> {
                val arrayIndex = if (target.key == "-") {
                    parent.length()
                } else {
                    insertArrayIndex(parent, target.key, operationIndex)
                }
                if (arrayIndex == parent.length()) {
                    parent.put(value)
                } else {
                    for (index in parent.length() downTo arrayIndex + 1) {
                        parent.put(index, parent.get(index - 1))
                    }
                    parent.put(arrayIndex, value)
                }
            }
            else -> patchError(operationIndex, "insert 的父级不是 object 或 array")
        }
    }

    private fun remove(root: JSONObject, path: List<String>, operationIndex: Int) {
        val target = resolveTarget(root, path, operationIndex)
        when (val parent = target.parent) {
            is JSONObject -> {
                if (!parent.has(target.key)) patchError(operationIndex, "remove 的目标不存在")
                parent.remove(target.key)
            }
            is JSONArray -> parent.remove(existingArrayIndex(parent, target.key, operationIndex))
            else -> patchError(operationIndex, "remove 的父级不是 object 或 array")
        }
    }

    private fun resolveTarget(
        root: JSONObject,
        path: List<String>,
        operationIndex: Int,
        createMissingObjectParents: Boolean = false,
    ): PatchTarget {
        if (path.isEmpty()) patchError(operationIndex, "不允许直接替换变量状态根对象")
        var current: Any = root
        path.dropLast(1).forEach { segment ->
            current = when (current) {
                is JSONObject -> {
                    if (!current.has(segment)) {
                        if (!createMissingObjectParents) {
                            patchError(operationIndex, "路径中的对象字段不存在：$segment")
                        }
                        current.put(segment, JSONObject())
                    }
                    current.get(segment)
                }
                is JSONArray -> current.get(existingArrayIndex(current, segment, operationIndex))
                else -> patchError(operationIndex, "路径经过了不能包含子项的值：$segment")
            }
        }
        return PatchTarget(current, path.last())
    }

    private fun parsePointer(pointer: String, operationIndex: Int): List<String> {
        if (!pointer.startsWith('/')) patchError(operationIndex, "path 必须使用以 / 开头的 JSON Pointer")
        return pointer.drop(1).split('/').map { token -> decodePointerToken(token, operationIndex) }
    }

    private fun decodePointerToken(token: String, operationIndex: Int): String {
        val decoded = StringBuilder(token.length)
        var index = 0
        while (index < token.length) {
            if (token[index] != '~') {
                decoded.append(token[index++])
                continue
            }
            if (index + 1 >= token.length) patchError(operationIndex, "path 包含无效的 JSON Pointer 转义")
            decoded.append(
                when (token[index + 1]) {
                    '0' -> '~'
                    '1' -> '/'
                    else -> patchError(operationIndex, "path 包含无效的 JSON Pointer 转义")
                },
            )
            index += 2
        }
        return decoded.toString()
    }

    private fun existingArrayIndex(array: JSONArray, token: String, operationIndex: Int): Int {
        val index = parseArrayIndex(token, operationIndex)
        if (index !in 0 until array.length()) patchError(operationIndex, "数组索引超出范围：$token")
        return index
    }

    private fun insertArrayIndex(array: JSONArray, token: String, operationIndex: Int): Int {
        val index = parseArrayIndex(token, operationIndex)
        if (index !in 0..array.length()) patchError(operationIndex, "数组插入索引超出范围：$token")
        return index
    }

    private fun parseArrayIndex(token: String, operationIndex: Int): Int {
        if (!ArrayIndexPattern.matches(token)) patchError(operationIndex, "无效的数组索引：$token")
        return token.toIntOrNull() ?: patchError(operationIndex, "数组索引过大：$token")
    }

    private fun addNumbers(current: Number, change: Number, operationIndex: Int): Number {
        val result = runCatching {
            BigDecimal(current.toString()).add(BigDecimal(change.toString())).stripTrailingZeros()
        }.getOrElse { patchError(operationIndex, "delta 数值无法计算") }
        return runCatching { result.longValueExact() }.getOrElse { result }
    }

    private fun requiredString(operation: JSONObject, key: String, operationIndex: Int): String {
        return (operation.opt(key) as? String)?.takeIf { it.isNotBlank() }
            ?: patchError(operationIndex, "$key 必须是非空字符串")
    }

    private fun requiredValue(operation: JSONObject, operationIndex: Int): Any {
        if (!operation.has("value")) patchError(operationIndex, "缺少 value")
        return operation.get("value")
    }

    private fun parseObject(raw: String, message: String): JSONObject {
        return runCatching { JSONObject(raw) }
            .getOrElse { throw ElecKoiDataException("$message：${it.message}") }
    }

    private fun parseArray(raw: String, message: String): JSONArray {
        return runCatching { JSONArray(raw) }
            .getOrElse { throw ElecKoiDataException("$message：${it.message}") }
    }

    private fun patchError(operationIndex: Int, message: String): Nothing {
        throw ElecKoiDataException("变量更新命令第 ${operationIndex + 1} 项无效：$message")
    }

    private data class PatchTarget(
        val parent: Any,
        val key: String,
    )

    private val ArrayIndexPattern = Regex("0|[1-9]\\d*")
    private const val MaxPatchOperations = 200
}
