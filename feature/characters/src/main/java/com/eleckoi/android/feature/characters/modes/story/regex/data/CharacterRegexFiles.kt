package com.eleckoi.android.feature.characters.modes.story.regex.data

import com.eleckoi.android.foundation.storage.deleteOwnedFile
import com.eleckoi.android.foundation.storage.safeId
import java.io.File

/** Owns only character-scoped files; shared rules and preset versions live elsewhere. */
internal class CharacterRegexFiles(private val directory: File) {
    fun delete(characterIds: Collection<String>) {
        characterIds.map(String::trim).filter(String::isNotBlank).distinct().forEach {
            deleteOwnedFile(directory, File(directory, "${safeId(it)}.json"))
        }
    }

    fun retain(characterIds: Collection<String>) {
        if (!directory.exists()) return
        val retained = characterIds.map(String::trim).filter(String::isNotBlank)
            .map { "${safeId(it)}.json" }.toSet()
        val files = requireNotNull(directory.listFiles()) { "无法读取角色正则目录" }
        files.filter { it.extension == "json" && it.name !in retained }
            .forEach { deleteOwnedFile(directory, it) }
    }
}
