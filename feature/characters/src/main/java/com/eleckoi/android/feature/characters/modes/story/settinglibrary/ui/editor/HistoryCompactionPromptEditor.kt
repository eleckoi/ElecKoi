package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.characters.modes.story.ui.shared.PlainInput
import com.eleckoi.android.foundation.design.AppearanceTheme

/** Editor surface for the preset-owned DSH compaction directive. */
@Composable
internal fun HistoryCompactionPromptEditor(
    value: String,
    appearance: AppearanceTheme,
    scrollState: ScrollState,
    imeBottomPx: Int,
    onChange: (String) -> Unit,
) {
    Column {
        Text(
            text = "仅在 DSH 自动压缩历史对话时使用，不会进入普通角色提示词；关闭条目后恢复 DSH 默认摘要指令。",
            color = appearance.mobileSoft,
            fontSize = 12.sp,
            lineHeight = 18.sp,
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 10.dp),
        )
        PlainInput(
            label = "摘要模板正文",
            value = value,
            appearance = appearance,
            scrollState = scrollState,
            imeBottomPx = imeBottomPx,
            minHeight = 300,
            placeholder = "输入用于延续角色关系、剧情状态与未完事项的摘要要求。",
            immersiveTitle = "自动压缩摘要模板",
            groupedStyle = true,
            onChange = onChange,
        )
    }
}
