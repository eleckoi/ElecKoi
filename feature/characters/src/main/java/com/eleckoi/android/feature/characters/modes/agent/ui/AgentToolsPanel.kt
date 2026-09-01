package com.eleckoi.android.feature.characters.modes.agent.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.characters.ui.settings.characterSettingsTrayColor

@Composable
internal fun AgentToolsPanel(
    appearance: AppearanceTheme,
    layoutScale: Float = 1f,
    onOpenAgentTools: () -> Unit,
) {
    val typeScale = layoutScale / LocalDensity.current.fontScale
    val trayColor = characterSettingsTrayColor(appearance)
    val sectionShape = RoundedCornerShape((16f * layoutScale).dp)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = (8f * layoutScale).dp)
            .background(trayColor, sectionShape)
            .padding(horizontal = (12f * layoutScale).dp, vertical = (12f * layoutScale).dp),
    ) {
        Text(
            text = "智能体模式",
            color = appearance.mobileText.copy(alpha = 0.90f),
            fontSize = (16f * typeScale).sp,
            lineHeight = (24f * typeScale).sp,
            fontWeight = FontWeight.Medium,
        )
        AgentToolRow(layoutScale) {
            AgentToolCard("记忆", "长期记录", AgentToolIcons.Memory, appearance, Modifier.weight(1f), layoutScale = layoutScale)
            AgentToolCard(
                "工具调用",
                "本地能力",
                AgentToolIcons.ToolCall,
                appearance,
                Modifier.weight(1f),
                layoutScale = layoutScale,
                onClick = onOpenAgentTools,
            )
        }
        AgentToolRow(layoutScale) {
            AgentToolCard("知识库", "检索资料", AgentToolIcons.Knowledge, appearance, Modifier.weight(1f), layoutScale = layoutScale)
            AgentToolCard("状态记录", "动态变量", AgentToolIcons.State, appearance, Modifier.weight(1f), layoutScale = layoutScale)
        }
        AgentToolRow(layoutScale) {
            AgentToolCard("快捷动作", "操作入口", AgentToolIcons.Actions, appearance, Modifier.weight(1f), layoutScale = layoutScale)
            AgentToolCard("界面美化", "交互外观", AgentToolIcons.Interface, appearance, Modifier.weight(1f), layoutScale = layoutScale)
        }
    }
}

@Composable
private fun AgentToolRow(
    layoutScale: Float,
    content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = (12f * layoutScale).dp),
        horizontalArrangement = Arrangement.spacedBy((8f * layoutScale).dp),
        content = content,
    )
}

private object AgentToolIcons {
    val Memory = listOf(
        "M4 5h7a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 2Z",
        "M14 8h6v11h-6",
        "M8 8h3",
        "M8 12h3",
    )
    val ToolCall = listOf(
        "M7 7l-4 5 4 5",
        "M17 7l4 5-4 5",
        "M14 4l-4 16",
    )
    val Knowledge = listOf(
        "M4 6h7l2 2h7v11H4Z",
        "M8 12h8",
        "M8 16h5",
    )
    val State = listOf(
        "M9 4H7V9L4 12L7 15V20H9",
        "M15 4H17V9L20 12L17 15V20H15",
    )
    val Actions = listOf("m13 2-9 12h7l-1 8 9-12h-7Z")
    val Interface = listOf(
        "M3 4h18v16H3Z",
        "M3 9h18",
        "M8 9v11",
    )
}
