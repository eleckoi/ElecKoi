package com.eleckoi.android.feature.characters.data

import com.eleckoi.android.feature.characters.model.AppDefaultChatBackground
import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.feature.characters.model.CharactersPayload
import com.eleckoi.android.feature.characters.model.CustomChatBackground
import com.eleckoi.android.feature.characters.model.GlobalChatBackground
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import java.io.File

/** Applies explicit background choices and owns their stored custom-image lifecycle. */
internal class CharacterChatBackgroundCoordinator(
    private val mediaStore: CharacterMediaStore,
    private val loadCharacters: () -> CharactersPayload,
    private val saveCharacters: (CharactersPayload) -> CharactersPayload,
) {
    fun saveCustomImage(
        characterId: String,
        backgroundFile: File?,
        opacity: Float,
        blur: Float,
        scrim: Float,
    ): CharacterSlot {
        val (current, target) = loadTarget(characterId)
        val existing = target.persona.chatBackground
            .takeIf { it.isNotBlank() }
            ?.let(::File)
            ?.takeIf(File::exists)
        val cardImage = target.persona.defaultChatBackground
            .takeIf(String::isNotBlank)
            ?.let(::File)
            ?.takeIf(File::exists)
        val background = when {
            backgroundFile == null -> existing
            cardImage != null && backgroundFile.canonicalPath == cardImage.canonicalPath -> cardImage
            existing != null && backgroundFile.canonicalPath == existing.canonicalPath -> existing
            else -> mediaStore.storeChatBackground(target.folder, backgroundFile)
        } ?: throw ElecKoiDataException("请先选择角色聊天背景")
        val updated = target.copy(
            persona = target.persona.copy(
                chatBackground = background.absolutePath,
                chatBackgroundOpacity = opacity.coerceIn(0f, 1f),
                chatBackgroundBlur = blur.coerceIn(0f, 24f),
                chatBackgroundScrim = scrim.coerceIn(0f, 1f),
            ),
        )
        persist(current, updated)
        mediaStore.cleanupChatBackgrounds(target.folder, background)
        return updated
    }

    fun useAppDefault(characterId: String): CharacterSlot {
        // The explicit sentinel suppresses character-card and global image fallbacks.
        return useSelection(characterId, AppDefaultChatBackground)
    }

    fun useCharacterCard(characterId: String): CharacterSlot {
        val (current, target) = loadTarget(characterId)
        // Persisting the resolved card path makes this an explicit per-character choice.
        return persistSelection(current, target, target.persona.defaultChatBackground)
    }

    fun useCustomChoice(characterId: String): CharacterSlot {
        return useSelection(characterId, CustomChatBackground)
    }

    fun useGlobalChoice(characterId: String): CharacterSlot {
        return useSelection(characterId, GlobalChatBackground)
    }

    fun applyGlobal(sourceCharacterId: String): CharacterSlot {
        val current = loadCharacters()
        val target = current.items.firstOrNull { it.id == sourceCharacterId }
            ?: throw ElecKoiDataException("角色不存在")
        val updatedItems = CharacterChatBackgroundPolicy.applyGlobal(
            items = current.items,
            sourceCharacterId = sourceCharacterId,
        )
        saveCharacters(current.copy(items = updatedItems))
        mediaStore.cleanupChatBackgrounds(target.folder, keep = null)
        return updatedItems.first { it.id == sourceCharacterId }
    }

    private fun useSelection(characterId: String, selection: String): CharacterSlot {
        val (current, target) = loadTarget(characterId)
        return persistSelection(current, target, selection)
    }

    private fun persistSelection(
        current: CharactersPayload,
        target: CharacterSlot,
        selection: String,
    ): CharacterSlot {
        val updated = CharacterChatBackgroundPolicy.withSelection(target, selection)
        persist(current, updated)
        mediaStore.cleanupChatBackgrounds(target.folder, keep = null)
        return updated
    }

    private fun loadTarget(characterId: String): Pair<CharactersPayload, CharacterSlot> {
        val current = loadCharacters()
        val target = current.items.firstOrNull { it.id == characterId }
            ?: throw ElecKoiDataException("角色不存在")
        return current to target
    }

    private fun persist(current: CharactersPayload, updated: CharacterSlot) {
        saveCharacters(
            current.copy(items = current.items.map { slot ->
                if (slot.id == updated.id) updated else slot
            }),
        )
    }
}

internal object CharacterChatBackgroundPolicy {
    fun withSelection(target: CharacterSlot, selection: String): CharacterSlot {
        return target.copy(
            persona = target.persona.copy(
                chatBackground = selection,
                chatBackgroundOpacity = DefaultChatBackgroundOpacity,
                chatBackgroundBlur = DefaultChatBackgroundBlur,
                chatBackgroundScrim = DefaultChatBackgroundScrim,
            ),
        )
    }

    /**
     * Promoting an image updates only the source and characters still using their automatic blank
     * choice. Existing app-colour, custom, card-art and global choices remain explicit.
     */
    fun applyGlobal(
        items: List<CharacterSlot>,
        sourceCharacterId: String,
    ): List<CharacterSlot> {
        return items.map { slot ->
            if (slot.id == sourceCharacterId || slot.persona.chatBackground.isBlank()) {
                withSelection(slot, GlobalChatBackground)
            } else {
                slot
            }
        }
    }
}

private const val DefaultChatBackgroundOpacity = 0.72f
private const val DefaultChatBackgroundBlur = 0f
private const val DefaultChatBackgroundScrim = 0.22f
