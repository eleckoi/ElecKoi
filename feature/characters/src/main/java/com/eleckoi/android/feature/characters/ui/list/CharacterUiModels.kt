package com.eleckoi.android.feature.characters.ui.list

import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.feature.characters.model.CharactersPayload
import com.eleckoi.android.feature.characters.model.CharacterMode

internal const val ALL_CHARACTERS = "全部角色"
internal const val DEFAULT_GROUP = ""

internal fun characterName(character: CharacterSlot): String {
    return character.persona.assistantName.ifBlank { character.name }.ifBlank { "未命名角色" }
}

internal fun characterAvatar(character: CharacterSlot): String {
    return character.persona.assistantAvatar.ifBlank { character.avatar }
}

internal fun characterSummary(character: CharacterSlot): String {
    return "${CharacterMode.fromStorage(character.characterMode).label}模式"
}

internal fun characterGroup(character: CharacterSlot): String {
    return character.group.trim()
}

internal fun buildCharacterGroups(characters: CharactersPayload?): List<String> {
    val names = characters?.groups.orEmpty()
        .map { it.trim() }
        .filter { it.isNotBlank() && it != ALL_CHARACTERS }
        .distinct()
        .toMutableList()
    characters?.items.orEmpty().forEach { character ->
        val group = characterGroup(character)
        if (group.isNotBlank() && !names.contains(group)) names += group
    }
    return names
}

internal fun sortedAllCharacters(characters: List<CharacterSlot>): List<CharacterSlot> {
    return characters.withIndex()
        .sortedByDescending { (index, character) -> character.order.takeIf { it > 0 } ?: (index + 1) }
        .map { it.value }
}

internal fun sortedCharactersForGroup(characters: List<CharacterSlot>, group: String): List<CharacterSlot> {
    return characters.withIndex()
        .filter { (_, character) -> characterGroup(character) == group }
        .sortedByDescending { (index, character) -> character.groupViewOrder.takeIf { it > 0 } ?: (index + 1) }
        .map { it.value }
}

internal fun characterOrderMap(displayCharacters: List<CharacterSlot>): Map<String, Int> {
    val size = displayCharacters.size
    return displayCharacters.mapIndexed { index, character -> character.id to (size - index) }.toMap()
}

internal fun filterCharacters(characters: List<CharacterSlot>, keyword: String): List<CharacterSlot> {
    val key = keyword.trim().lowercase()
    if (key.isBlank()) return characters
    return characters.filter { character ->
        listOf(
            character.name,
            character.persona.assistantName,
            character.persona.assistantPrompt,
            character.persona.opening,
            characterGroup(character),
        ).joinToString(" ").lowercase().contains(key)
    }
}
