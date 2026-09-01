package com.eleckoi.android.feature.characters.ui.list

import com.eleckoi.android.feature.characters.model.CharacterSlot

internal const val AllCharacterDragPrefix = "all-character-"
internal const val GroupCharacterDragPrefix = "group-character-"
internal const val CharacterGroupHeaderTargetPrefix = "character-group-header-"
internal const val CharacterGroupEmptyTargetPrefix = "character-group-empty-"

internal data class PendingCharacterGroupDrop(
    val characterId: String,
    val group: String,
    val targetCharacterId: String? = null,
)

internal fun characterIdFromDragKey(key: String): String? {
    return when {
        key.startsWith(AllCharacterDragPrefix) -> key.removePrefix(AllCharacterDragPrefix)
        key.startsWith(GroupCharacterDragPrefix) -> key.removePrefix(GroupCharacterDragPrefix)
        else -> null
    }.takeIf { !it.isNullOrBlank() }
}

internal fun groupTargetFromCharacterKey(
    key: String,
    characters: List<CharacterSlot>,
): Pair<String, String?>? {
    return when {
        key.startsWith(CharacterGroupHeaderTargetPrefix) -> {
            key.removePrefix(CharacterGroupHeaderTargetPrefix)
                .takeIf(String::isNotBlank)
                ?.let { it to null }
        }
        key.startsWith(CharacterGroupEmptyTargetPrefix) -> {
            key.removePrefix(CharacterGroupEmptyTargetPrefix)
                .takeIf(String::isNotBlank)
                ?.let { it to null }
        }
        key.startsWith(GroupCharacterDragPrefix) -> {
            val characterId = key.removePrefix(GroupCharacterDragPrefix)
            val character = characters.firstOrNull { it.id == characterId } ?: return null
            characterGroup(character).takeIf(String::isNotBlank)?.let { it to characterId }
        }
        else -> null
    }
}

internal fun moveCharacterToGroup(
    characters: List<CharacterSlot>,
    groups: List<String>,
    characterId: String,
    targetGroup: String,
    targetCharacterId: String? = null,
): List<CharacterSlot>? {
    if (targetGroup.isBlank() || targetGroup !in groups || targetCharacterId == characterId) return null
    val movingCharacter = characters.firstOrNull { it.id == characterId } ?: return null
    val sourceGroup = characterGroup(movingCharacter)
    val targetCharacters = sortedCharactersForGroup(characters, targetGroup)
        .filterNot { it.id == characterId }
        .toMutableList()
    val targetIndex = targetCharacterId
        ?.let { id -> targetCharacters.indexOfFirst { it.id == id } }
        ?.takeIf { it >= 0 }
        ?: 0
    targetCharacters.add(targetIndex, movingCharacter.copy(group = targetGroup))

    val targetOrders = characterOrderMap(targetCharacters)
    val sourceOrders = sourceGroup
        .takeIf { it.isNotBlank() && it != targetGroup }
        ?.let { group ->
            characterOrderMap(
                sortedCharactersForGroup(
                    characters.filterNot { it.id == characterId },
                    group,
                ),
            )
        }
        .orEmpty()

    return characters.map { character ->
        when {
            character.id == characterId -> character.copy(
                group = targetGroup,
                groupViewOrder = targetOrders[character.id] ?: 1,
            )
            characterGroup(character) == targetGroup -> {
                targetOrders[character.id]?.let { character.copy(groupViewOrder = it) } ?: character
            }
            characterGroup(character) == sourceGroup && sourceOrders.containsKey(character.id) -> {
                character.copy(groupViewOrder = sourceOrders.getValue(character.id))
            }
            else -> character
        }
    }
}

internal fun reorderAllCharacters(
    characters: List<CharacterSlot>,
    fromId: String,
    toId: String,
): List<CharacterSlot>? {
    val display = sortedAllCharacters(characters).toMutableList()
    if (!display.move(fromId, toId)) return null
    val orders = characterOrderMap(display)
    return characters.map { character ->
        orders[character.id]?.let { character.copy(order = it) } ?: character
    }
}

internal fun reorderCharactersInGroup(
    characters: List<CharacterSlot>,
    group: String,
    fromId: String,
    toId: String,
): List<CharacterSlot>? {
    if (group.isBlank()) return null
    val display = sortedCharactersForGroup(characters, group).toMutableList()
    if (!display.move(fromId, toId)) return null
    val orders = characterOrderMap(display)
    return characters.map { character ->
        if (characterGroup(character) == group) {
            orders[character.id]?.let { character.copy(groupViewOrder = it) } ?: character
        } else {
            character
        }
    }
}

private fun MutableList<CharacterSlot>.move(fromId: String, toId: String): Boolean {
    val fromIndex = indexOfFirst { it.id == fromId }
    val toIndex = indexOfFirst { it.id == toId }
    if (fromIndex !in indices || toIndex !in indices || fromIndex == toIndex) return false
    add(toIndex, removeAt(fromIndex))
    return true
}
