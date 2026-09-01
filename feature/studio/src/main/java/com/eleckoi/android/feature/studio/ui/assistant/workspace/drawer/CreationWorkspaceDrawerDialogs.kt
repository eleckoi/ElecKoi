package com.eleckoi.android.feature.studio.ui.assistant.workspace.drawer

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.workspace.model.CreatorWorkspace
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppInsetTextField

@Composable
internal fun CreationWorkspaceDrawerDialogs(
    workspaces: List<CreatorWorkspace>,
    createDialogVisible: Boolean,
    renameProjectId: String?,
    renameConversationTarget: String?,
    deleteProjectId: String?,
    deleteConversationTarget: String?,
    appearance: AppearanceTheme,
    onCreateDialogDismissed: () -> Unit,
    onRenameProjectDismissed: () -> Unit,
    onRenameConversationDismissed: () -> Unit,
    onDeleteProjectDismissed: () -> Unit,
    onDeleteConversationDismissed: () -> Unit,
    onCreateWorkspace: (String) -> Unit,
    onRenameWorkspace: (String, String) -> Unit,
    onRenameConversation: (String, String, String) -> Unit,
    onDeleteWorkspace: (String) -> Unit,
    onDeleteConversation: (String, String) -> Unit,
) {
    if (createDialogVisible) {
        WorkspaceNameDialog(
            title = "新建空白项目",
            initialValue = "",
            confirmLabel = "新建",
            appearance = appearance,
            onDismiss = onCreateDialogDismissed,
            onConfirm = { name ->
                onCreateDialogDismissed()
                onCreateWorkspace(name)
            },
        )
    }
    renameProjectId?.let { workspaceId ->
        workspaces.firstOrNull { it.id == workspaceId }?.let { workspace ->
            WorkspaceNameDialog(
                title = "重命名项目",
                initialValue = workspace.name,
                confirmLabel = "保存",
                appearance = appearance,
                onDismiss = onRenameProjectDismissed,
                onConfirm = { name ->
                    onRenameProjectDismissed()
                    onRenameWorkspace(workspace.id, name)
                },
            )
        }
    }
    renameConversationTarget?.parseConversationTarget()?.let { (workspaceId, conversationId) ->
        workspaces.findConversation(workspaceId, conversationId)?.let { conversation ->
            WorkspaceNameDialog(
                title = "重命名对话",
                initialValue = conversation.title,
                confirmLabel = "保存",
                appearance = appearance,
                onDismiss = onRenameConversationDismissed,
                onConfirm = { title ->
                    onRenameConversationDismissed()
                    onRenameConversation(workspaceId, conversationId, title)
                },
            )
        }
    }
    deleteProjectId?.let { workspaceId ->
        val name = workspaces.firstOrNull { it.id == workspaceId }?.name.orEmpty()
        DeleteConfirmDialog(
            title = "删除项目？",
            message = "“$name”及其中的本地文件和对话将被删除。",
            onDismiss = onDeleteProjectDismissed,
            onConfirm = {
                onDeleteProjectDismissed()
                onDeleteWorkspace(workspaceId)
            },
        )
    }
    deleteConversationTarget?.parseConversationTarget()?.let { (workspaceId, conversationId) ->
        val title = workspaces.findConversation(workspaceId, conversationId)?.title.orEmpty()
        DeleteConfirmDialog(
            title = "删除对话？",
            message = "“$title”将从这个项目中移除。",
            onDismiss = onDeleteConversationDismissed,
            onConfirm = {
                onDeleteConversationDismissed()
                onDeleteConversation(workspaceId, conversationId)
            },
        )
    }
}

@Composable
internal fun WorkspaceNameDialog(
    title: String,
    initialValue: String,
    confirmLabel: String,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var name by rememberSaveable(title, initialValue) { mutableStateOf(initialValue) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            AppInsetTextField(
                value = name,
                onValueChange = { name = it.take(80) },
                appearance = appearance,
                shape = RoundedCornerShape(14.dp),
                textStyle = TextStyle(color = appearance.mobileText, fontSize = 15.sp),
            )
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank(), onClick = { onConfirm(name.trim()) }) {
                Text(confirmLabel)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
internal fun DeleteConfirmDialog(
    title: String,
    message: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("删除", color = Color(0xFFD84A4A))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
