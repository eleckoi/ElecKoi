package com.eleckoi.android.feature.characters.modes.story.regex.ui.components

import androidx.compose.foundation.layout.RowScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppFloatingBottomAction
import com.eleckoi.android.foundation.design.components.AppFloatingBottomActionBar
import com.eleckoi.android.foundation.design.components.AppIconPaths

@Composable
internal fun RegexRulesBottomBar(
    batchEditing: Boolean,
    selectedIds: Set<String>,
    hasRules: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onToggleBatch: () -> Unit,
    onCopy: () -> Unit,
    onDelete: () -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
) {
    val canAct = batchEditing && selectedIds.isNotEmpty()
    AppFloatingBottomActionBar(appearance = appearance, modifier = modifier) {
        if (batchEditing) {
            RegexBottomAction("完成", AppIconPaths.Check, appearance, onClick = onToggleBatch)
            RegexBottomAction("复制", AppIconPaths.Copy, appearance, canAct, onClick = onCopy)
            RegexBottomAction(
                label = "删除",
                icon = AppIconPaths.Trash,
                appearance = appearance,
                enabled = canAct,
                danger = true,
                onClick = onDelete,
            )
            RegexBottomAction("导出", AppIconPaths.Export, appearance, canAct, onClick = onExport)
        } else {
            RegexBottomAction(
                label = "批量编辑",
                icon = AppIconPaths.EditSquare,
                appearance = appearance,
                enabled = hasRules,
                onClick = onToggleBatch,
            )
            RegexBottomAction("导入", AppIconPaths.Import, appearance, onClick = onImport)
        }
    }
}

@Composable
private fun RowScope.RegexBottomAction(
    label: String,
    icon: List<String>,
    appearance: AppearanceTheme,
    enabled: Boolean = true,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    AppFloatingBottomAction(
        label = label,
        icon = icon,
        appearance = appearance,
        modifier = Modifier.weight(1f),
        enabled = enabled,
        danger = danger,
        onClick = onClick,
    )
}
