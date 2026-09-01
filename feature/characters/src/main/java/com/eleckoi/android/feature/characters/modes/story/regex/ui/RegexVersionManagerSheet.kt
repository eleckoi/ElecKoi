package com.eleckoi.android.feature.characters.modes.story.regex.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AppInsetTextField
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleCollection
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleVersion
import com.eleckoi.android.feature.characters.modes.story.ui.shared.FeatureVersionManagerSheet
import com.eleckoi.android.feature.characters.modes.story.ui.shared.ManagedFeatureVersion
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger

private const val DefaultRegexVersionId = "__regex_default__"

@Composable
internal fun RegexVersionManagerSheet(
    collection: RegexRuleCollection,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onSave: (RegexRuleCollection) -> Unit,
) {
    var creating by remember { mutableStateOf(false) }
    var deletePickerOpen by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<RegexRuleVersion?>(null) }
    val versions = listOf(ManagedFeatureVersion(DefaultRegexVersionId, "默认")) +
        collection.versions.map { ManagedFeatureVersion(it.id, it.name) }
    val activeVersionId = collection.activeVersionId.ifBlank { DefaultRegexVersionId }

    FeatureVersionManagerSheet(
        title = "正则管理",
        showFeatureToggle = false,
        showNameField = false,
        showDeleteAction = true,
        showTransferActions = false,
        deleteActionEnabled = collection.versions.isNotEmpty(),
        featureTitle = "",
        featureDescription = "",
        namePlaceholder = "默认",
        versionSectionTitle = "正则版本",
        createActionTitle = "保存为新版本",
        deleteActionTitle = "删除版本",
        name = "",
        enabled = true,
        versions = versions,
        activeVersionId = activeVersionId,
        appearance = appearance,
        onNameChange = {},
        onEnabledChange = {},
        onDismiss = onDismiss,
        onCreateVersion = { creating = true },
        onSelectVersion = { selected ->
            if (selected.id == DefaultRegexVersionId) {
                onSave(collection.copy(activeVersionId = ""))
            } else {
                collection.versions.firstOrNull { it.id == selected.id }?.let { onSave(collection.applyVersion(it)) }
            }
        },
        onImport = {},
        onExport = {},
        onDeleteVersion = {
            when (collection.versions.size) {
                0 -> Unit
                1 -> pendingDelete = collection.versions.single()
                else -> deletePickerOpen = true
            }
        },
    )

    if (creating) {
        RegexVersionNameDialog(
            appearance = appearance,
            onDismiss = { creating = false },
            onConfirm = { name ->
                val version = collection.captureVersion(name)
                onSave(collection.copy(versions = collection.versions + version, activeVersionId = version.id))
                creating = false
            },
        )
    }

    if (deletePickerOpen) {
        RegexVersionDeletePickerDialog(
            versions = collection.versions,
            activeVersionId = collection.activeVersionId,
            appearance = appearance,
            onDismiss = { deletePickerOpen = false },
            onSelect = { version ->
                deletePickerOpen = false
                pendingDelete = version
            },
        )
    }

    pendingDelete?.let { version ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除“${version.name}”？") },
            text = { Text("删除后无法恢复。规则本身不会受影响。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        onSave(collection.deleteVersion(version))
                        pendingDelete = null
                    },
                ) { Text("删除", color = ElecKoiDanger) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("取消") }
            },
            containerColor = appearance.mobileSurface,
            titleContentColor = appearance.mobileText,
            textContentColor = appearance.mobileMuted,
        )
    }
}

@Composable
private fun RegexVersionDeletePickerDialog(
    versions: List<RegexRuleVersion>,
    activeVersionId: String,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onSelect: (RegexRuleVersion) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("删除版本") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                versions.forEach { version ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .noRippleClickable { onSelect(version) }
                            .padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            version.name,
                            modifier = Modifier.weight(1f),
                            color = appearance.mobileText,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (version.id == activeVersionId) {
                            Text("当前", color = appearance.mobileMuted, fontSize = 11.5.sp)
                            Spacer(Modifier.size(10.dp))
                        }
                        StrokeSvgIcon(AppIconPaths.Trash, ElecKoiDanger, iconSize = 18.dp, strokeWidth = 1.7f)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
        containerColor = appearance.mobileSurface,
        titleContentColor = appearance.mobileText,
        textContentColor = appearance.mobileMuted,
    )
}

@Composable
private fun RegexVersionNameDialog(
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("新建正则版本") },
        text = {
            AppInsetTextField(
                value = name,
                onValueChange = { name = it },
                appearance = appearance,
                modifier = Modifier.height(46.dp),
                placeholder = "版本名称",
                textStyle = TextStyle(color = appearance.mobileText, fontSize = 14.sp),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(name.trim().ifBlank { "未命名版本" }) }) {
                Text("创建", color = appearance.mobileBlue)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
        containerColor = appearance.mobileSurface,
        titleContentColor = appearance.mobileText,
    )
}
