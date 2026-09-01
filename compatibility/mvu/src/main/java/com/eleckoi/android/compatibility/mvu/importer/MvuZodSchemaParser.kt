package com.eleckoi.android.compatibility.mvu.importer

import com.eleckoi.android.engine.story.variables.model.VariableValueType
import org.json.JSONArray
import org.json.JSONObject

internal data class ParsedSchema(val root: SchemaNode)

internal sealed interface SchemaNode {
    val description: String
    fun schemaCode(): String

    data class ObjectNode(
        val fields: LinkedHashMap<String, SchemaNode>,
        override val description: String = "",
    ) : SchemaNode {
        override fun schemaCode(): String = fields.entries.joinToString(
            prefix = "z.object({",
            postfix = "})",
        ) { (key, value) -> "${JSONObject.quote(key)}:${value.schemaCode()}" }
    }

    data class RecordNode(
        val value: SchemaNode,
        override val description: String = "",
    ) : SchemaNode {
        override fun schemaCode(): String = "z.record(z.string(),${value.schemaCode()})"
    }

    data class ValueNode(
        val type: String,
        val defaultValue: Any? = null,
        val enumValues: List<String> = emptyList(),
        val minimum: Double? = null,
        val maximum: Double? = null,
        val integer: Boolean = false,
        override val description: String = "",
    ) : SchemaNode {
        fun fallbackDefault(): String = when (type) {
            VariableValueType.Number.raw -> "0"
            VariableValueType.Boolean.raw -> "false"
            VariableValueType.Array.raw -> "[]"
            else -> ""
        }

        fun jsonDefault(): Any = defaultValue ?: when (type) {
            VariableValueType.Number.raw -> 0
            VariableValueType.Boolean.raw -> false
            VariableValueType.Array.raw -> JSONArray()
            else -> enumValues.firstOrNull().orEmpty()
        }

        override fun schemaCode(): String {
            var code = when {
                enumValues.isNotEmpty() -> "z.enum(${JSONArray(enumValues)})"
                type == VariableValueType.Number.raw -> "z.coerce.number()"
                type == VariableValueType.Boolean.raw -> "z.boolean()"
                type == VariableValueType.Array.raw -> "z.array(z.unknown())"
                else -> "z.string()"
            }
            if (integer) code += ".int()"
            minimum?.let { code += ".min(${it.cleanNumber()})" }
            maximum?.let { code += ".max(${it.cleanNumber()})" }
            if (description.isNotBlank()) code += ".describe(${JSONObject.quote(description)})"
            defaultValue?.let { code += ".prefault(${jsonLiteral(it)})" }
            return code
        }
    }
}

internal fun parseSchema(source: String): ParsedSchema? = ZodSourceParser(source).parse()

private class ZodSourceParser(source: String) {
    private val text = source
        .withoutJavaScriptComments()
        .replace(Regex("\\b([A-Za-z_$][\\w$]*)\\.z\\."), "z.")
    private val schemas = linkedMapOf<String, SchemaNode>()

    fun parse(): ParsedSchema? {
        declarationBlocks().forEach { block ->
            splitTopLevel(block, ',').forEach { declaration ->
                val equal = topLevelIndexOf(declaration, '=')
                if (equal <= 0) return@forEach
                val name = declaration.substring(0, equal).trim().substringAfterLast(' ')
                val expression = declaration.substring(equal + 1).trim()
                ExpressionParser(expression, schemas).parse()?.let { schemas[name] = it }
            }
        }
        return schemas.values.lastOrNull()?.let(::ParsedSchema)
    }

    private fun declarationBlocks(): List<String> = buildList {
        val matcher = Regex("\\b(?:const|let|var)\\s+").findAll(text)
        matcher.forEach { match ->
            var index = match.range.last + 1
            val start = index
            var depth = 0
            var quote = '\u0000'
            var escaped = false
            while (index < text.length) {
                val char = text[index]
                if (quote != '\u0000') {
                    if (escaped) {
                        escaped = false
                    } else if (char == '\\') {
                        escaped = true
                    } else if (char == quote) {
                        quote = '\u0000'
                    }
                } else {
                    when (char) {
                        '\'', '"', '`' -> quote = char
                        '(', '[', '{' -> depth++
                        ')', ']', '}' -> depth--
                        ';' -> if (depth == 0) break
                    }
                }
                index++
            }
            add(text.substring(start, index))
        }
    }
}

/**
 * Removes JavaScript comments before the lightweight Zod parser sees the source.
 *
 * Keeping newlines (and replacing the remaining comment characters with spaces)
 * prevents a comment placed above an object property from becoming part of that
 * property's name. Comment-like text inside quoted strings and template literals
 * is deliberately preserved.
 */
private fun String.withoutJavaScriptComments(): String {
    val result = StringBuilder(length)
    var index = 0
    var quote = '\u0000'
    var escaped = false

    while (index < length) {
        val char = this[index]
        if (quote != '\u0000') {
            result.append(char)
            when {
                escaped -> escaped = false
                char == '\\' -> escaped = true
                char == quote -> quote = '\u0000'
            }
            index++
            continue
        }

        if (char == '\'' || char == '"' || char == '`') {
            quote = char
            result.append(char)
            index++
            continue
        }

        if (char == '/' && getOrNull(index + 1) == '/') {
            result.append("  ")
            index += 2
            while (index < length && this[index] != '\n' && this[index] != '\r') {
                result.append(' ')
                index++
            }
            continue
        }

        if (char == '/' && getOrNull(index + 1) == '*') {
            result.append("  ")
            index += 2
            while (index < length) {
                if (this[index] == '*' && getOrNull(index + 1) == '/') {
                    result.append("  ")
                    index += 2
                    break
                }
                result.append(if (this[index] == '\n' || this[index] == '\r') this[index] else ' ')
                index++
            }
            continue
        }

        result.append(char)
        index++
    }

    return result.toString()
}

private class ExpressionParser(
    private val source: String,
    private val environment: Map<String, SchemaNode>,
) {
    fun parse(): SchemaNode? {
        val value = source.trim()
        environment[value]?.let { return it }
        val base = when {
            value.startsWith("z.object(") -> parseObject(value)
            value.startsWith("z.record(") -> parseRecord(value)
            value.startsWith("z.enum(") -> SchemaNode.ValueNode(
                type = VariableValueType.String.raw,
                enumValues = firstArray(value)?.let { array ->
                    (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) }
                }.orEmpty(),
            )

            value.startsWith("z.coerce.number(") || value.startsWith("z.number(") ->
                SchemaNode.ValueNode(VariableValueType.Number.raw)

            value.startsWith("z.boolean(") || value.startsWith("z.coerce.boolean(") ->
                SchemaNode.ValueNode(VariableValueType.Boolean.raw)

            value.startsWith("z.array(") -> SchemaNode.ValueNode(VariableValueType.Array.raw)
            value.startsWith("z.string(") || value.startsWith("z.coerce.string(") ->
                SchemaNode.ValueNode(VariableValueType.String.raw)

            else -> return environment[value.substringBefore('.')]
        }
        return applyChains(base ?: return null, value)
    }

    private fun parseObject(value: String): SchemaNode.ObjectNode? {
        val body = callArguments(value)?.firstOrNull()?.trim()?.removeSurrounding("{", "}") ?: return null
        val fields = linkedMapOf<String, SchemaNode>()
        splitTopLevel(body, ',').forEach { field ->
            val colon = topLevelIndexOf(field, ':')
            if (colon <= 0) return@forEach
            val key = field.substring(0, colon).trim().trim('"', '\'')
            ExpressionParser(field.substring(colon + 1), environment).parse()?.let { fields[key] = it }
        }
        return SchemaNode.ObjectNode(fields)
    }

    private fun parseRecord(value: String): SchemaNode.RecordNode? {
        val arguments = callArguments(value).orEmpty()
        val expression = arguments.lastOrNull()?.trim() ?: return null
        val child = environment[expression] ?: ExpressionParser(expression, environment).parse() ?: return null
        return SchemaNode.RecordNode(child)
    }

    private fun applyChains(node: SchemaNode, source: String): SchemaNode {
        var value = node
        val default = Regex("\\.(?:prefault|default|catch)\\(([^)]*)\\)").find(source)
            ?.groupValues?.getOrNull(1)?.let(::parseLiteral)
        val description = Regex("\\.describe\\((['\"])(.*?)\\1\\)").find(source)
            ?.groupValues?.getOrNull(2).orEmpty()
        if (value is SchemaNode.ValueNode) {
            val clamp = Regex("clamp\\([^,]+,\\s*(-?\\d+(?:\\.\\d+)?),\\s*(-?\\d+(?:\\.\\d+)?)\\)")
                .find(source)
            val min = Regex("\\.(?:min|gte)\\((-?\\d+(?:\\.\\d+)?)").find(source)
                ?.groupValues?.getOrNull(1)?.toDoubleOrNull()
                ?: clamp?.groupValues?.getOrNull(1)?.toDoubleOrNull()
            val max = Regex("\\.(?:max|lte)\\((-?\\d+(?:\\.\\d+)?)").find(source)
                ?.groupValues?.getOrNull(1)?.toDoubleOrNull()
                ?: clamp?.groupValues?.getOrNull(2)?.toDoubleOrNull()
            value = value.copy(
                defaultValue = default ?: value.defaultValue,
                description = description.ifBlank { value.description },
                minimum = min,
                maximum = max,
                integer = ".int(" in source,
            )
        }
        return value
    }

    private fun callArguments(value: String): List<String>? {
        val open = value.indexOf('(')
        if (open < 0) return null
        val close = matchingClose(value, open, '(', ')') ?: return null
        return splitTopLevel(value.substring(open + 1, close), ',')
    }

    private fun firstArray(value: String): JSONArray? {
        val start = value.indexOf('[')
        val end = matchingClose(value, start, '[', ']') ?: return null
        return runCatching { JSONArray(value.substring(start, end + 1).replace('\'', '"')) }.getOrNull()
    }
}

private fun splitTopLevel(source: String, separator: Char): List<String> {
    val result = mutableListOf<String>()
    var start = 0
    var depth = 0
    var quote = '\u0000'
    var escaped = false
    source.forEachIndexed { index, char ->
        if (quote != '\u0000') {
            if (escaped) {
                escaped = false
            } else if (char == '\\') {
                escaped = true
            } else if (char == quote) {
                quote = '\u0000'
            }
        } else {
            when (char) {
                '\'', '"', '`' -> quote = char
                '(', '[', '{' -> depth++
                ')', ']', '}' -> depth--
                separator -> if (depth == 0) {
                    result += source.substring(start, index).trim()
                    start = index + 1
                }
            }
        }
    }
    result += source.substring(start).trim()
    return result.filter(String::isNotBlank)
}

private fun topLevelIndexOf(source: String, target: Char): Int {
    var depth = 0
    var quote = '\u0000'
    var escaped = false
    source.forEachIndexed { index, char ->
        if (quote != '\u0000') {
            if (escaped) {
                escaped = false
            } else if (char == '\\') {
                escaped = true
            } else if (char == quote) {
                quote = '\u0000'
            }
        } else {
            when (char) {
                '\'', '"', '`' -> quote = char
                '(', '[', '{' -> depth++
                ')', ']', '}' -> depth--
                target -> if (depth == 0) return index
            }
        }
    }
    return -1
}

private fun matchingClose(source: String, start: Int, open: Char, close: Char): Int? {
    if (start !in source.indices || source[start] != open) return null
    var depth = 0
    var quote = '\u0000'
    var escaped = false
    for (index in start until source.length) {
        val char = source[index]
        if (quote != '\u0000') {
            if (escaped) {
                escaped = false
            } else if (char == '\\') {
                escaped = true
            } else if (char == quote) {
                quote = '\u0000'
            }
            continue
        }
        when (char) {
            '\'', '"', '`' -> quote = char
            open -> depth++
            close -> if (--depth == 0) return index
        }
    }
    return null
}

private fun parseLiteral(source: String): Any? {
    val value = source.trim()
    if (value.startsWith("'") || value.startsWith("\"")) return value.trim('"', '\'')
    if (value == "true") return true
    if (value == "false") return false
    if (value == "[]") return JSONArray()
    if (value == "{}") return JSONObject()
    return value.toLongOrNull() ?: value.toDoubleOrNull()
}

private fun jsonLiteral(value: Any): String = when (value) {
    is String -> JSONObject.quote(value)
    else -> value.toString()
}

private fun Double.cleanNumber(): String = if (this % 1.0 == 0.0) toLong().toString() else toString()
