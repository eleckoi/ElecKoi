package com.eleckoi.android.feature.characters.data

import com.eleckoi.android.feature.characters.model.AvatarSlot
import com.eleckoi.android.feature.characters.model.CharacterCard
import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.feature.characters.model.CharactersPayload
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import java.io.File

/** Owns character image file lifecycle while CharacterRepository remains the persistence owner. */
internal class CharacterMediaCoordinator(
    private val mediaStore: CharacterMediaStore,
    private val loadCharacters: () -> CharactersPayload,
    private val saveCharacters: (CharactersPayload) -> CharactersPayload,
) {
    fun deleteCharacterFolder(folder: String) {
        mediaStore.deleteCharacterFolder(folder)
    }

    /** Each avatar slot is independent; callers may replace one slot or all three at once. */
    fun saveAvatars(
        characterId: String,
        files: Map<AvatarSlot, File>,
    ): CharacterSlot {
        if (files.isEmpty()) throw ElecKoiDataException("没有要保存的头像")
        val (current, target) = loadTarget(characterId)
        val stored = mutableMapOf<AvatarSlot, File>()
        try {
            files.forEach { (slot, source) ->
                stored[slot] = mediaStore.storeAvatar(target.folder, slot, source)
            }
            val circle = stored[AvatarSlot.Circle]?.absolutePath ?: target.avatar
            val square = stored[AvatarSlot.Square]?.absolutePath ?: target.squareImage
            val portrait = stored[AvatarSlot.Portrait]?.absolutePath ?: target.coverImage
            val updatedPersona = target.persona.copy(
                assistantAvatar = circle,
                assistantSquare = square,
                assistantCover = portrait,
            )
            val updated = target.copy(
                avatar = circle,
                squareImage = square,
                coverImage = portrait,
                persona = updatedPersona.followUpdatedCardBackground(target),
            )
            persist(current, updated)
            stored.forEach { (slot, file) ->
                mediaStore.cleanupAvatarSlot(target.folder, slot, file)
            }
            return updated
        } catch (error: Throwable) {
            stored.values.forEach { it.delete() }
            throw error
        }
    }

    fun clearAvatarSlots(
        characterId: String,
        slots: Set<AvatarSlot>,
    ): CharacterSlot {
        if (slots.isEmpty()) throw ElecKoiDataException("没有要删除的角色图片")
        val (current, target) = loadTarget(characterId)
        val circle = target.avatar.takeUnless { AvatarSlot.Circle in slots }.orEmpty()
        val square = target.squareImage.takeUnless { AvatarSlot.Square in slots }.orEmpty()
        val portrait = target.coverImage.takeUnless { AvatarSlot.Portrait in slots }.orEmpty()
        val updatedPersona = target.persona.copy(
            assistantAvatar = circle,
            assistantSquare = square,
            assistantCover = portrait,
        )
        val updated = target.copy(
            avatar = circle,
            squareImage = square,
            coverImage = portrait,
            persona = updatedPersona.followUpdatedCardBackground(target),
        )
        persist(current, updated)
        slots.forEach { slot -> mediaStore.cleanupAvatarSlot(target.folder, slot, keep = null) }
        return updated
    }

    fun saveCover(characterId: String, coverFile: File): CharacterSlot {
        val (current, target) = loadTarget(characterId)
        val cover = mediaStore.storeCover(target.folder, coverFile)
        val updatedPersona = target.persona.copy(assistantCover = cover.absolutePath)
        val updated = target.copy(
            coverImage = cover.absolutePath,
            persona = updatedPersona.followUpdatedCardBackground(target),
        )
        return try {
            persist(current, updated)
            mediaStore.cleanupCovers(target.folder, cover)
            updated
        } catch (error: Throwable) {
            cover.delete()
            throw error
        }
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

private fun CharacterCard.followUpdatedCardBackground(
    previous: CharacterSlot,
): CharacterCard {
    val wasUsingCardBackground = previous.persona.chatBackground.isNotBlank() &&
        previous.persona.chatBackground == previous.persona.defaultChatBackground
    return if (wasUsingCardBackground) {
        copy(chatBackground = defaultChatBackground)
    } else {
        this
    }
}
