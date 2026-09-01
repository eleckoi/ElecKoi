package com.eleckoi.android.feature.conversation.timeline.overview

import com.eleckoi.android.feature.conversation.timeline.*
import com.eleckoi.android.feature.conversation.timeline.components.*

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.agent.api.AgentCommandActionType
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.engine.agent.api.primaryTarget
import com.eleckoi.android.engine.agent.api.singleTypeOrNull
import com.eleckoi.android.feature.chat.ui.blocks.reasoning.ReasoningIdeaCat
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.markdown.CreationMarkdownText
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun ReasoningOverviewItem(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
) {
    val body = item.detail.takeIf(String::hasMeaningfulProcessDetail)
        ?: item.text.takeIf(String::isNotBlank)
        ?: return
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            ReasoningIdeaCat(
                coverColor = appearance.mobileChatMessageBg,
                surfaceVisible = false,
                animated = item.running,
                modifier = Modifier.offset(y = (-4).dp),
            )
            Text(
                text = if (item.running) "正在思考" else "思考过程",
                color = appearance.mobileText,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        ExpandableReasoningText(
            stateKey = item.id,
            text = body,
            appearance = appearance,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 33.dp),
        )
    }
}

@Composable
fun ReadOperationOverviewItem(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    val paths = remember(item.text, item.commandActions) { item.readOperationPaths() }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.Visibility,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = if (item.failed) DiffDeletionColor else appearance.mobileMuted,
            )
            Text(
                text = when {
                    item.failed -> "读取失败"
                    paths.size <= 1 -> "已读取 1 个文件"
                    else -> "已读取 ${paths.size} 个文件"
                },
                modifier = Modifier.weight(1f),
                color = if (item.failed) DiffDeletionColor else appearance.mobileText,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            Icon(
                imageVector = Icons.Rounded.ExpandMore,
                contentDescription = "查看读取详情",
                modifier = Modifier
                    .size(17.dp)
                    .graphicsLayer { rotationZ = -90f },
                tint = appearance.mobileMuted.copy(alpha = 0.72f),
            )
        }
        paths.take(MaxVisibleFileStats).forEach { path ->
            Row(
                modifier = Modifier.padding(start = 27.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                CreationFileTypeBadge(path)
                Text(
                    text = path,
                    modifier = Modifier.weight(1f),
                    color = appearance.mobileMuted,
                    fontSize = 12.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
fun CompactOperationOverviewItem(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    val isCommand = item.workItemType == AgentWorkItemType.Command
    val agentToolPresentation = item.agentToolTimelinePresentation()
    val commandActionType = item.commandActions.singleTypeOrNull()
    val commandTitle = when {
        item.failed -> when (commandActionType) {
            AgentCommandActionType.Search -> "搜索失败"
            AgentCommandActionType.ListFiles -> "查看目录失败"
            AgentCommandActionType.Read -> "读取失败"
            AgentCommandActionType.Unknown -> "运行失败"
            null -> if (item.commandActions.isEmpty()) "运行失败" else "执行失败"
        }
        item.running -> when (commandActionType) {
            AgentCommandActionType.Search -> "正在搜索"
            AgentCommandActionType.ListFiles -> "正在查看目录"
            AgentCommandActionType.Unknown -> "正在运行"
            AgentCommandActionType.Read -> "正在读取"
            null -> if (item.commandActions.isEmpty()) "正在运行" else "正在执行"
        }
        else -> when (commandActionType) {
            AgentCommandActionType.Search -> "已搜索"
            AgentCommandActionType.ListFiles -> "已查看目录"
            AgentCommandActionType.Unknown -> "已运行"
            AgentCommandActionType.Read -> "已读取"
            null -> if (item.commandActions.isEmpty()) "已运行" else "已执行"
        }
    }
    val commandBody = item.commandActions
        .primaryTarget(item.rawCommand.ifBlank { item.text })
        .ifBlank { item.text }
    val primaryText = when {
        isCommand -> commandTitle
        item.running -> runningOperationLabel(item, hasStreamingAnswer = false)
        else -> operationSummary(listOf(item))
    }
    val supportingText = when {
        isCommand -> commandBody
        agentToolPresentation != null -> agentToolPresentation.target
        else -> item.text
    }.takeUnless { text -> text == primaryText }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        TimelineOperationGlyph(
            imageVector = creationOperationIcon(listOf(item)),
            size = 18.dp,
            tint = if (item.failed) DiffDeletionColor else appearance.mobileMuted,
        )
        Text(
            text = primaryText,
            color = if (item.failed) DiffDeletionColor else appearance.mobileText,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
        )
        if (supportingText != null) {
            Text(
                text = supportingText,
                modifier = Modifier.weight(1f),
                color = appearance.mobileMuted,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        } else {
            Spacer(modifier = Modifier.weight(1f))
        }
        Icon(
            imageVector = Icons.Rounded.ExpandMore,
            contentDescription = "查看单条详情",
            modifier = Modifier
                .size(17.dp)
                .graphicsLayer { rotationZ = -90f },
            tint = appearance.mobileMuted.copy(alpha = 0.72f),
        )
    }
}

@Composable
fun FileChangeOverviewItem(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    val stats = remember(item.fileChanges, item.diff, item.paths) {
        val parsed = creationFileDiffStats(
            fileChanges = item.fileChanges,
            fallbackDiff = item.diff,
            fallbackPaths = item.paths,
        )
        if (item.fileChanges.isNotEmpty() || item.paths.isEmpty()) {
            parsed
        } else {
            parsed.filter { stat ->
                item.paths.any { path -> stat.path.matchesDiffPath(path) }
            }.ifEmpty {
                item.paths.distinct().map {
                    CreationFileDiffStat(
                        it,
                        additions = 0,
                        deletions = 0,
                        countsKnown = false,
                    )
                }
            }
        }
    }
    val fileCount = stats.size.takeIf { it > 0 } ?: item.paths.distinct().size.coerceAtLeast(1)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.Edit,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = if (item.failed) DiffDeletionColor else appearance.mobileMuted,
            )
            Text(
                text = when {
                    item.failed -> "编辑失败"
                    item.running -> "正在编辑文件"
                    else -> "已编辑 $fileCount 个文件"
                },
                modifier = Modifier.weight(1f),
                color = if (item.failed) DiffDeletionColor else appearance.mobileText,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            Icon(
                imageVector = Icons.Rounded.ExpandMore,
                contentDescription = "查看文件变更详情",
                modifier = Modifier
                    .size(17.dp)
                    .graphicsLayer { rotationZ = -90f },
                tint = appearance.mobileMuted.copy(alpha = 0.72f),
            )
        }
        stats.take(MaxVisibleFileStats).forEach { stat ->
            Row(
                modifier = Modifier.padding(start = 27.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                CreationFileTypeBadge(stat.path)
                Text(
                    text = stat.path.substringAfterLast('/'),
                    modifier = Modifier.weight(1f, fill = false),
                    color = appearance.mobileMuted,
                    fontSize = 12.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (stat.countsKnown && stat.additions > 0) {
                    Text("+${stat.additions}", color = DiffAdditionColor, fontSize = 12.sp)
                }
                if (stat.countsKnown && stat.deletions > 0) {
                    Text("-${stat.deletions}", color = DiffDeletionColor, fontSize = 12.sp)
                }
            }
        }
    }
}

private fun String.matchesDiffPath(other: String): Boolean {
    val left = replace('\\', '/').removePrefix("./").removePrefix("a/").removePrefix("b/")
    val right = other.replace('\\', '/').removePrefix("./").removePrefix("a/").removePrefix("b/")
    return left == right || left.endsWith("/$right") || right.endsWith("/$left")
}

@Composable
fun ChildAssistantOverviewItem(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(
            modifier = Modifier.padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.Groups,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = appearance.mobileMuted,
            )
            Text(
                text = if (item.running) "子 Agent 正在回复" else "子 Agent 回复",
                color = appearance.mobileText,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        CreationMarkdownText(
            item = item,
            appearance = appearance,
        )
    }
}
