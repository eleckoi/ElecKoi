package com.eleckoi.android.feature.conversation.composer

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.compose.ui.platform.LocalDensity
import com.eleckoi.android.foundation.design.components.AboveAnchorPopupPositionProvider
import com.eleckoi.android.engine.agent.api.AgentPermissionMode
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.DshPermissionIcons

/** The shared permission selector used by both creator and role Agent composers. */
@Composable
fun AgentPermissionModeControl(
    permissionMode: AgentPermissionMode,
    appearance: AppearanceTheme,
    enabled: Boolean,
    onPermissionModeChange: (AgentPermissionMode) -> Unit,
    modifier: Modifier = Modifier,
    showLabel: Boolean = true,
    contentColor: Color? = null,
    fillWidth: Boolean = false,
    /** Matches Material menu-item icon and text columns when embedded as a menu row. */
    menuRowLayout: Boolean = false,
    onSelectionComplete: () -> Unit = {},
) {
    var expanded by remember { mutableStateOf(false) }
    var confirmFullAccess by remember { mutableStateOf(false) }
    var fullAccessAcknowledged by remember { mutableStateOf(false) }
    LaunchedEffect(enabled) {
        if (!enabled) {
            expanded = false
            confirmFullAccess = false
            fullAccessAcknowledged = false
        }
    }
    Box(modifier = modifier) {
        Row(
            modifier = Modifier
                .then(if (fillWidth) Modifier.fillMaxWidth() else Modifier)
                .height(if (menuRowLayout) 44.dp else if (showLabel) 36.dp else 31.dp)
                .clickable(enabled = enabled) { expanded = true }
                .padding(horizontal = if (menuRowLayout) 10.dp else if (showLabel) 8.dp else 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                permissionMode.icon(),
                contentDescription = "Agent 权限",
                modifier = Modifier.size(if (showLabel) 17.dp else 23.dp),
                tint = contentColor ?: appearance.mobileMuted,
            )
            if (showLabel) {
                Text(
                    permissionMode.productLabel(),
                    modifier = Modifier.padding(start = if (menuRowLayout) 8.dp else 5.dp),
                    color = contentColor ?: appearance.mobileMuted,
                    fontSize = if (menuRowLayout) 14.sp else 12.sp,
                    fontWeight = if (menuRowLayout) FontWeight.Normal else FontWeight.Medium,
                    maxLines = 1,
                )
            }
        }
        PermissionModeMenu(
            expanded = expanded,
            selectedMode = permissionMode,
            appearance = appearance,
            onDismissRequest = { expanded = false },
            onSelect = { mode ->
                expanded = false
                if (mode == AgentPermissionMode.FullAccess && permissionMode != mode) {
                    fullAccessAcknowledged = false
                    confirmFullAccess = true
                } else {
                    onPermissionModeChange(mode)
                    onSelectionComplete()
                }
            },
        )
    }
    if (confirmFullAccess) {
        FullAccessConfirmation(
            appearance = appearance,
            acknowledged = fullAccessAcknowledged,
            onAcknowledgedChange = { fullAccessAcknowledged = it },
            onDismiss = {
                confirmFullAccess = false
                fullAccessAcknowledged = false
            },
            onConfirm = {
                if (fullAccessAcknowledged) {
                    confirmFullAccess = false
                    fullAccessAcknowledged = false
                    onPermissionModeChange(AgentPermissionMode.FullAccess)
                    onSelectionComplete()
                }
            },
        )
    }
}

@Composable
private fun PermissionModeMenu(
    expanded: Boolean,
    selectedMode: AgentPermissionMode,
    appearance: AppearanceTheme,
    onDismissRequest: () -> Unit,
    onSelect: (AgentPermissionMode) -> Unit,
) {
    if (!expanded) return
    val density = LocalDensity.current
    val positionProvider = remember(density) {
        AboveAnchorPopupPositionProvider(
            windowMarginPx = with(density) { 8.dp.roundToPx() },
            anchorGapPx = with(density) { 4.dp.roundToPx() },
            anchorInsetPx = with(density) { 8.dp.roundToPx() },
        )
    }
    Popup(
        popupPositionProvider = positionProvider,
        onDismissRequest = onDismissRequest,
        properties = PopupProperties(focusable = false),
    ) {
        Surface(
            modifier = Modifier.width(218.dp),
            shape = RoundedCornerShape(12.dp),
            color = appearance.mobileSurface,
            tonalElevation = 0.dp,
            shadowElevation = 10.dp,
            border = BorderStroke(1.dp, appearance.mobileLine),
        ) {
            Column(modifier = Modifier.padding(4.dp)) {
                AgentPermissionMode.entries.forEach { mode ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(40.dp)
                            .background(Color.Transparent, RoundedCornerShape(10.dp))
                            .clickable { onSelect(mode) }
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            mode.icon(),
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = appearance.mobileMuted,
                        )
                        Text(
                            mode.productLabel(),
                            modifier = Modifier.weight(1f).padding(start = 8.dp, end = 8.dp),
                            color = appearance.mobileText,
                            fontSize = 14.sp,
                            lineHeight = 22.sp,
                            fontWeight = FontWeight.Normal,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (mode == selectedMode) {
                            Icon(
                                Icons.Rounded.Check,
                                contentDescription = "当前模式",
                                modifier = Modifier.size(16.dp),
                                tint = appearance.mobileText,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FullAccessConfirmation(
    appearance: AppearanceTheme,
    acknowledged: Boolean,
    onAcknowledgedChange: (Boolean) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("确认启用 Full access？") },
        text = {
            Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(14.dp)) {
                Text(
                    "启用 Full access 后，agent 将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。",
                    color = appearance.mobileMuted,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .toggleable(
                            value = acknowledged,
                            role = Role.Checkbox,
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onValueChange = onAcknowledgedChange,
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = acknowledged,
                        onCheckedChange = null,
                        colors = CheckboxDefaults.colors(
                            checkedColor = appearance.mobileText,
                            checkmarkColor = appearance.mobileSurface,
                            uncheckedColor = appearance.mobileMuted,
                        ),
                    )
                    Text(
                        "我已了解风险，并愿意继续",
                        modifier = Modifier.padding(start = 8.dp),
                        color = appearance.mobileText,
                        fontSize = 13.sp,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = acknowledged) {
                Text("启用 Full access")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        },
        containerColor = appearance.mobileSurface,
        titleContentColor = appearance.mobileText,
        textContentColor = appearance.mobileMuted,
    )
}

private fun AgentPermissionMode.productLabel(): String = when (this) {
    AgentPermissionMode.AskForApproval -> "Read Only"
    AgentPermissionMode.ApproveForMe -> "Workspace Write"
    AgentPermissionMode.FullAccess -> "Full access"
}

private fun AgentPermissionMode.icon(): ImageVector = when (this) {
    AgentPermissionMode.AskForApproval -> DshPermissionIcons.ReadOnly
    AgentPermissionMode.ApproveForMe -> DshPermissionIcons.WorkspaceWrite
    AgentPermissionMode.FullAccess -> DshPermissionIcons.FullAccess
}
