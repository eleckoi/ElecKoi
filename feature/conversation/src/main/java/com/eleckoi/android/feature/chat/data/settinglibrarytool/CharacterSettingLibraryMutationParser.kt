package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryAgentEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryAgentGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibrarySessionMutation
import kotlinx.serialization.json.JsonObject

internal fun JsonObject.toSettingFileMutations(
    index: Int,
    catalog: SettingLibraryToolCatalog,
): List<SettingLibrarySessionMutation> {
    fun required(name: String): String = settingStringAllowBlank(name)
        ?: throw IllegalArgumentException("第 ${index + 1} 项缺少 $name。")
    fun optional(name: String): String? = if (containsKey(name)) {
        settingStringAllowBlank(name)
            ?: throw IllegalArgumentException("第 ${index + 1} 项的 $name 必须是字符串。")
    } else {
        null
    }

    fun requiredPath(name: String): String {
        val raw = required(name)
        return normalizeSettingLibraryPath(raw, allowRoot = false)
            ?: throw IllegalArgumentException("第 ${index + 1} 项的 $name 不是有效的完整逻辑路径。")
    }

    fun target(path: String): Pair<String, String> =
        path.substringBeforeLast('/', "") to path.substringAfterLast('/')

    return when (val operation = required(SettingMutationOperationArgument)) {
        SettingMutationWriteFileOperation -> requiredPath(SettingMutationPathArgument).let { path ->
            val (parentPath, title) = target(path)
            val preparation = catalog.prepareDirectories(parentPath, index)
            val prepared = preparation.catalog
            if (prepared.group(path) != null) {
                throw IllegalArgumentException("第 ${index + 1} 项无法写入文件：$path 已是目录。")
            }
            val existing = prepared.entry(path)
            preparation.mutations + if (existing == null) {
                SettingLibrarySessionMutation.CreateEntry(
                    groupId = prepared.groupId(parentPath, index),
                    title = title,
                    content = required(SettingMutationContentArgument),
                    selectionHint = optional(SettingMutationSelectionHintArgument).orEmpty(),
                )
            } else {
                SettingLibrarySessionMutation.UpdateEntry(
                    entryId = existing.id,
                    groupId = null,
                    title = null,
                    content = required(SettingMutationContentArgument),
                    selectionHint = optional(SettingMutationSelectionHintArgument),
                )
            }
        }
        SettingMutationEditFileOperation -> requiredPath(SettingMutationPathArgument).let { path ->
            val existing = catalog.entry(path)
                ?: throw IllegalArgumentException("cannot edit \"$path\": not found")
            val oldString = required(SettingMutationOldStringArgument)
            val newString = required(SettingMutationNewStringArgument)
            if (oldString.isEmpty()) {
                throw IllegalArgumentException("old_string must be a non-empty string")
            }
            if (oldString == newString) {
                throw IllegalArgumentException("old_string and new_string must differ")
            }
            val replacements = existing.content.literalOccurrenceCount(oldString)
            if (replacements == 0) {
                throw IllegalArgumentException("old_string was not found in \"$path\"")
            }
            val replaceAll = settingBoolean(SettingMutationReplaceAllArgument)
            if (!replaceAll && replacements != 1) {
                throw IllegalArgumentException(
                    "old_string matched $replacements times in \"$path\"; " +
                        "provide a more specific old_string or set replace_all to true",
                )
            }
            SettingLibrarySessionMutation.UpdateEntry(
                entryId = existing.id,
                groupId = null,
                title = null,
                content = if (replaceAll) {
                    existing.content.replace(oldString, newString)
                } else {
                    existing.content.replaceFirst(oldString, newString)
                },
                selectionHint = null,
            ).let(::listOf)
        }
        SettingMutationMakeDirectoryOperation -> catalog.prepareDirectories(
            path = requiredPath(SettingMutationPathArgument),
            operationIndex = index,
        ).mutations
        SettingMutationMoveFileOperation -> requiredPath(SettingMutationPathArgument).let { sourcePath ->
            val source = catalog.entry(sourcePath)
                ?: throw IllegalArgumentException(
                    "第 ${index + 1} 项找不到源文件：$sourcePath，请先用 glob 查找真实路径。",
                )
            val destination = requiredPath(SettingMutationDestinationArgument)
            if (sourcePath == destination) return@let emptyList()
            val (parentPath, title) = target(destination)
            val preparation = catalog.prepareDirectories(parentPath, index)
            val prepared = preparation.catalog
            if (prepared.group(destination) != null) {
                throw IllegalArgumentException("第 ${index + 1} 项无法移动文件：目标 $destination 是目录。")
            }
            val targetFile = prepared.entry(destination)
            val overwrite = settingBoolean(SettingMutationOverwriteArgument, default = true)
            if (targetFile != null && !overwrite) {
                throw IllegalArgumentException("第 ${index + 1} 项目标文件已存在：$destination。")
            }
            buildList {
                addAll(preparation.mutations)
                if (targetFile != null && targetFile.id != source.id) {
                    add(SettingLibrarySessionMutation.DeleteEntry(targetFile.id))
                }
                add(
                    SettingLibrarySessionMutation.UpdateEntry(
                        entryId = source.id,
                        groupId = prepared.groupId(parentPath, index),
                        title = title,
                        content = null,
                        selectionHint = null,
                    ),
                )
            }
        }
        SettingMutationDeleteFileOperation -> requiredPath(SettingMutationPathArgument).let { path ->
            val file = catalog.entry(path)
                ?: throw IllegalArgumentException(
                    "第 ${index + 1} 项找不到文件：$path，请先用 glob 查找真实路径。",
                )
            listOf(SettingLibrarySessionMutation.DeleteEntry(file.id))
        }
        SettingMutationMoveDirectoryOperation -> requiredPath(SettingMutationPathArgument).let { sourcePath ->
            val source = catalog.group(sourcePath)
                ?: throw IllegalArgumentException(
                    "第 ${index + 1} 项找不到源目录：$sourcePath，请先用 glob 查找真实路径。",
                )
            val destination = requiredPath(SettingMutationDestinationArgument)
            if (sourcePath == destination) return@let emptyList()
            if (destination.startsWith("$sourcePath/")) {
                throw IllegalArgumentException(
                    "第 ${index + 1} 项不能把目录移动到自身内部：$destination。",
                )
            }
            if (catalog.entry(destination) != null || catalog.group(destination) != null) {
                throw IllegalArgumentException("第 ${index + 1} 项目标路径已存在：$destination。")
            }
            val (parentPath, name) = target(destination)
            val preparation = catalog.prepareDirectories(parentPath, index)
            preparation.mutations + SettingLibrarySessionMutation.UpdateGroup(
                groupId = source.id,
                parentId = preparation.catalog.groupId(parentPath, index),
                name = name,
            )
        }
        SettingMutationDeleteDirectoryOperation -> requiredPath(SettingMutationPathArgument).let { path ->
            val directory = catalog.group(path)
                ?: throw IllegalArgumentException(
                    "第 ${index + 1} 项找不到目录：$path，请先用 glob 查找真实路径。",
                )
            listOf(SettingLibrarySessionMutation.DeleteGroup(directory.id))
        }
        else -> throw IllegalArgumentException("第 ${index + 1} 项不支持 operation：$operation")
    }
}

private data class SettingDirectoryPreparation(
    val mutations: List<SettingLibrarySessionMutation.CreateGroup>,
    val catalog: SettingLibraryToolCatalog,
)

private fun SettingLibraryToolCatalog.prepareDirectories(
    path: String,
    operationIndex: Int,
): SettingDirectoryPreparation {
    if (path.isBlank()) return SettingDirectoryPreparation(emptyList(), this)
    var currentCatalog = this
    var currentPath = ""
    var parentId = ""
    val mutations = mutableListOf<SettingLibrarySessionMutation.CreateGroup>()
    path.split('/').forEach { segment ->
        currentPath = listOf(currentPath, segment).filter(String::isNotBlank).joinToString("/")
        if (currentCatalog.entry(currentPath) != null) {
            throw IllegalArgumentException(
                "第 ${operationIndex + 1} 项无法创建目录：$currentPath 已是文件。",
            )
        }
        val existing = currentCatalog.group(currentPath)
        if (existing != null) {
            parentId = existing.id
        } else {
            val mutation = SettingLibrarySessionMutation.CreateGroup(
                parentId = parentId,
                name = segment,
            )
            mutations += mutation
            currentCatalog = currentCatalog.after(mutation)
            parentId = mutation.groupId
        }
    }
    return SettingDirectoryPreparation(mutations, currentCatalog)
}

private fun SettingLibraryToolCatalog.entry(path: String): SettingLibraryAgentEntry? = entries
    .firstOrNull { entry -> entry.path.normalizedSettingPath() == path }

private fun SettingLibraryToolCatalog.group(path: String): SettingLibraryAgentGroup? = groups
    .firstOrNull { group -> group.path.normalizedSettingPath() == path }

private fun SettingLibraryToolCatalog.groupId(path: String, operationIndex: Int): String {
    if (path.isBlank()) return ""
    return group(path)?.id ?: throw IllegalArgumentException(
        "第 ${operationIndex + 1} 项无法解析目录：$path。",
    )
}
