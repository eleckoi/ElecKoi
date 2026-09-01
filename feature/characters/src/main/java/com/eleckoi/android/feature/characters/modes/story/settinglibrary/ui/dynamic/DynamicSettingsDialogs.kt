package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.AppInsetTextField
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryConversation
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorHeader
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.DialogConfirmButton
import com.eleckoi.android.foundation.design.components.DialogDismissButton
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.*

@Composable
internal fun DynamicSettingsStatusPage(
    text: String,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
) {
    PinnedStatusScaffold(appearance = appearance, imeAware = false, backgroundColor = appearance.mobileBg) {
        StoryEditorHeader(title = "动态设定", appearance = appearance, onBack = onBack)
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(text, color = appearance.mobileMuted, fontSize = 15.sp)
        }
    }
}

@Composable
internal fun DynamicSettingSaveVersionDialog(
    conversation: SettingLibraryConversation,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var name by remember(conversation.sessionId) {
        mutableStateOf(dynamicVersionName(conversation))
    }
    val normalizedName = name.trim()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("保存为设定版本", color = appearance.mobileText) },
        text = {
            Column {
                Text(
                    "版本名称",
                    modifier = Modifier.padding(bottom = 8.dp),
                    color = appearance.mobileText,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
                AppInsetTextField(
                    value = name,
                    onValueChange = { name = it.take(60) },
                    appearance = appearance,
                    modifier = Modifier
                        .height(46.dp),
                    textStyle = TextStyle(color = appearance.mobileText, fontSize = 16.sp),
                )
            }
        },
        confirmButton = {
            DialogConfirmButton(
                text = "保存",
                appearance = appearance,
                enabled = normalizedName.isNotBlank(),
                onClick = { onConfirm(normalizedName) },
            )
        },
        dismissButton = { DialogDismissButton("取消", appearance, onDismiss) },
        containerColor = appearance.mobileSurface,
    )
}

private fun dynamicVersionName(conversation: SettingLibraryConversation): String {
    val identity = conversation.summary.trim()
        .replace(Regex("\\s+"), " ")
        .take(18)
        .ifBlank { conversation.title.trim().ifBlank { "对话设定" } }
    return "$identity · ${dynamicConversationTime(conversation.updatedAt)}"
}

internal fun dynamicConversationListTime(value: String): String = runCatching {
    val parsed = OffsetDateTime.parse(value)
    if (parsed.toLocalDate() == LocalDate.now()) {
        parsed.format(DynamicConversationClockFormatter)
    } else {
        parsed.format(DynamicConversationTimeFormatter)
    }
}.getOrElse {
    value.substringAfter('T', value).take(5).ifBlank { "未知时间" }
}

private fun dynamicConversationTime(value: String): String = runCatching {
    OffsetDateTime.parse(value).format(DynamicConversationTimeFormatter)
}.getOrElse {
    value.replace('T', ' ').take(16).ifBlank { "未知时间" }
}

private val DynamicConversationClockFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val DynamicConversationTimeFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("M月d日 HH:mm")
