package com.eleckoi.android.compatibility.mvu.display

import com.eleckoi.android.engine.display.MessageDisplayCompatibility
import org.json.JSONArray
import org.json.JSONObject

object MvuMessageDisplayAdapter : MessageDisplayCompatibility {
    /** Adds the MVU-owned marker only to the ephemeral, completed assistant display projection. */
    override fun prepareAssistantText(
        text: String,
        complete: Boolean,
        displayRulePatterns: Iterable<String>,
    ): String {
        if (!complete || StatusPlaceholder in text) return text
        if (displayRulePatterns.none(::referencesStatusPlaceholder)) return text
        return text + "\n\n" + StatusPlaceholder
    }

    override fun resolveVariableMacros(text: String, variableStateJson: String): String =
        text.resolveVariableMacros(variableStateJson)
            .injectMvuFrontendSnapshotBridge(variableStateJson)

    const val StatusPlaceholder = "<StatusPlaceHolderImpl/>"

    private fun referencesStatusPlaceholder(pattern: String): Boolean =
        StatusPlaceholder in pattern.replace("\\/", "/")
}

private fun String.resolveVariableMacros(variableStateJson: String): String {
    if (!contains("_message_variable::", ignoreCase = true)) return this
    val state = runCatching { JSONObject(variableStateJson.ifBlank { "{}" }) }
        .getOrElse { JSONObject() }
    var output = this
    output = GetMessageVariableMacro.replace(output) { match ->
        state.valueAtMessagePath(match.groupValues[1]).asMessageVariableJson()
    }
    while (true) {
        val match = FormatMessageVariableMacro.find(output) ?: break
        val lineStart = output.lastIndexOf('\n', startIndex = match.range.first - 1).plus(1)
        val prefixWidth = match.range.first - lineStart
        val formatted = state.valueAtMessagePath(match.groupValues[1]).asMessageVariableYaml()
            .replace("\n", "\n" + " ".repeat(prefixWidth))
        output = output.replaceRange(match.range, formatted)
    }
    return output
}

private fun JSONObject.valueAtMessagePath(rawPath: String): Any? {
    val path = rawPath.trim()
    val root = opt("stat_data")
        .takeIf { it is JSONObject }
        ?: this
    val relativePath = when {
        path == "stat_data" -> ""
        path.startsWith("stat_data.") -> path.removePrefix("stat_data.")
        else -> path
    }
    if (relativePath.isEmpty()) return root
    var current: Any? = root
    for (segment in relativePath.split('.').filter(String::isNotEmpty)) {
        current = when (current) {
            is JSONObject -> current.opt(segment)
            is JSONArray -> segment.toIntOrNull()?.let(current::opt)
            else -> null
        }
        if (current == null || current === JSONObject.NULL) return null
    }
    return current
}

private fun Any?.asMessageVariableJson(): String = when (this) {
    null, JSONObject.NULL -> "null"
    is String -> this
    is JSONObject, is JSONArray -> toString()
    else -> toString()
}

private fun Any?.asMessageVariableYaml(indent: Int = 0): String = when (this) {
    null, JSONObject.NULL -> "null"
    is JSONObject -> {
        val keys = keys().asSequence().filterNot { it.startsWith('$') }.toList()
        if (keys.isEmpty()) {
            "{}"
        } else {
            keys.joinToString("\n") { key ->
                val value = opt(key)
                if (value is JSONObject || value is JSONArray) {
                    "${yamlKey(key)}:\n${" ".repeat(indent + 2)}${value.asMessageVariableYaml(indent + 2)}"
                } else {
                    "${yamlKey(key)}: ${value.asMessageVariableYaml(indent)}"
                }
            }.replace("\n", "\n" + " ".repeat(indent))
        }
    }
    is JSONArray -> {
        if (length() == 0) {
            "[]"
        } else {
            (0 until length()).joinToString("\n") { index ->
                val value = opt(index)
                if (value is JSONObject || value is JSONArray) {
                    "-\n${" ".repeat(indent + 2)}${value.asMessageVariableYaml(indent + 2)}"
                } else {
                    "- ${value.asMessageVariableYaml(indent)}"
                }
            }.replace("\n", "\n" + " ".repeat(indent))
        }
    }
    is String -> yamlScalar(this)
    is Boolean, is Number -> toString()
    else -> yamlScalar(toString())
}

private fun yamlKey(value: String): String = if (PlainYamlKey.matches(value)) value else JSONObject.quote(value)

private fun yamlScalar(value: String): String {
    if (value.isEmpty()) return "\"\""
    val ambiguous = value != value.trim() ||
        value.contains('\n') ||
        value.contains(": ") ||
        value.startsWith('#') ||
        value.equals("null", ignoreCase = true) ||
        value.equals("true", ignoreCase = true) ||
        value.equals("false", ignoreCase = true) ||
        value.toDoubleOrNull() != null
    return if (ambiguous) JSONObject.quote(value) else value
}

private val GetMessageVariableMacro = Regex(
    pattern = """\{\{get_message_variable::(.*?)\}\}""",
    option = RegexOption.IGNORE_CASE,
)

private val FormatMessageVariableMacro = Regex(
    pattern = """\{\{format_message_variable::(.*?)\}\}""",
    option = RegexOption.IGNORE_CASE,
)

private val PlainYamlKey = Regex("""[\p{L}\p{N}_-]+""")
