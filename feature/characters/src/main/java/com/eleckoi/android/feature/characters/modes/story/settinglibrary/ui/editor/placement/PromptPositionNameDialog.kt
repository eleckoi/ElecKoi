package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryPromptPosition
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.AppInsetTextField
import com.eleckoi.android.foundation.design.components.noRippleClickable

internal sealed interface PositionNameDialog {
    data object Create : PositionNameDialog
    data class Rename(val position: SettingLibraryPromptPosition) : PositionNameDialog
}

@Composable
internal fun PromptPositionNameDialog(
    dialog: PositionNameDialog,
    existingNames: Set<String>,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var value by remember(dialog) {
        mutableStateOf((dialog as? PositionNameDialog.Rename)?.position?.name.orEmpty())
    }
    val name = value.trim()
    val unchanged = (dialog as? PositionNameDialog.Rename)?.position?.name?.trim()
    val duplicate = name.isNotBlank() && name != unchanged && name in existingNames
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                if (dialog is PositionNameDialog.Create) "新建提示词位置" else "重命名提示词位置",
                color = appearance.mobileText,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AppInsetTextField(
                    value = value,
                    onValueChange = { value = it.take(40) },
                    appearance = appearance,
                    textStyle = TextStyle(color = appearance.mobileText, fontSize = 16.sp),
                )
                if (duplicate) Text("名称已存在", color = ElecKoiDanger, fontSize = 12.sp)
            }
        },
        confirmButton = {
            DialogAction(
                if (dialog is PositionNameDialog.Create) "创建" else "保存",
                appearance,
                enabled = name.isNotBlank() && !duplicate,
            ) { onConfirm(name) }
        },
        dismissButton = { DialogAction("取消", appearance, onClick = onDismiss) },
        containerColor = appearance.mobileSurface,
    )
}

@Composable
private fun DialogAction(
    text: String,
    appearance: AppearanceTheme,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Text(
        text,
        color = if (enabled) appearance.mobileBlue else appearance.mobileSoft,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(9.dp))
            .noRippleClickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 9.dp),
    )
}

