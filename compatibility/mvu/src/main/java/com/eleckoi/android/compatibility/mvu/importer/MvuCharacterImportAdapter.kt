package com.eleckoi.android.compatibility.mvu.importer

import com.eleckoi.android.engine.story.variables.model.VariableConfig
import org.json.JSONArray
import org.json.JSONObject

data class MvuVariableConversion(
    val config: VariableConfig?,
    val openingStates: List<String>,
)

object MvuCharacterImportAdapter {
    fun isInfrastructureEntry(entry: JSONObject, title: String): Boolean {
        val normalized = title.trim()
        if (normalized.startsWith("[initvar]", ignoreCase = true)) return true
        if (normalized.startsWith("[mvu_update]", ignoreCase = true)) return true
        return normalized == "变量列表" &&
            entry.optString("content").contains("format_message_variable", ignoreCase = true)
    }

    fun convert(
        extensions: JSONObject?,
        worldBook: JSONObject?,
        openings: List<String>,
    ): MvuVariableConversion {
        val helper = extensions?.optJSONObject("tavern_helper")
        val explicitState = helper?.optJSONObject("variables")?.takeIf { it.length() > 0 }
        val infrastructure = worldBook?.optJSONArray("entries").objects()
        val initialSource = infrastructure.firstOrNull { it.entryTitle().startsWith("[initvar]", true) }
            ?.optString("content")
            .orEmpty()
        val initialState = explicitState ?: parseStateObject(initialSource) ?: JSONObject()
        val ruleSource = infrastructure.firstOrNull {
            val title = it.entryTitle()
            title.startsWith("[mvu_update]", true) && title.contains("更新规则")
        }?.optString("content").orEmpty()
        val rules = parseUpdateRules(ruleSource)
        val schema = helper?.optJSONArray("scripts")
            .objects()
            .asSequence()
            .filter { it.optBoolean("enabled", true) }
            .map { it.optString("content") }
            .mapNotNull(::parseSchema)
            .lastOrNull()

        val config = when {
            schema != null -> schema.toConfig(initialState, rules)
            initialState.length() > 0 -> stateConfig(initialState, rules)
            else -> null
        }
        val baseState = config?.initialStateJson?.ifBlank { initialState.toString(2) }
            ?: initialState.toString(2)
        return MvuVariableConversion(
            config = config,
            openingStates = openings.map { opening -> patchedOpeningState(baseState, opening) },
        )
    }

    private fun JSONArray?.objects(): List<JSONObject> = buildList {
        val source = this@objects ?: return@buildList
        for (index in 0 until source.length()) source.optJSONObject(index)?.let(::add)
    }

    private fun JSONObject.entryTitle(): String = optString("name").ifBlank { optString("comment") }
}
