package com.eleckoi.android.feature.chat.data

internal const val SettingMutationOperationArgument = "operation"
internal const val SettingMutationPathArgument = "path"
internal const val SettingMutationDestinationArgument = "destination"
internal const val SettingMutationContentArgument = "content"
internal const val SettingMutationSelectionHintArgument = "selection_hint"
internal const val SettingMutationOldStringArgument = "old_string"
internal const val SettingMutationNewStringArgument = "new_string"
internal const val SettingMutationReplaceAllArgument = "replace_all"
internal const val SettingMutationOverwriteArgument = "overwrite"
internal const val SettingMutationMaxSearchErrorCharacters = 2_000
internal const val SettingMutationMaxChangesPerCall = 24
internal const val SettingMutationWriteFileOperation = "write_file"
internal const val SettingMutationEditFileOperation = "edit_file"
internal const val SettingMutationMakeDirectoryOperation = "make_directory"
internal const val SettingMutationMoveFileOperation = "move_file"
internal const val SettingMutationMoveDirectoryOperation = "move_directory"
internal const val SettingMutationDeleteFileOperation = "delete_file"
internal const val SettingMutationDeleteDirectoryOperation = "delete_directory"
internal val SettingMutationOperations = listOf(
    SettingMutationWriteFileOperation,
    SettingMutationEditFileOperation,
    SettingMutationMakeDirectoryOperation,
    SettingMutationMoveFileOperation,
    SettingMutationMoveDirectoryOperation,
    SettingMutationDeleteFileOperation,
    SettingMutationDeleteDirectoryOperation,
)
