package com.eleckoi.android.feature.studio.ui.assistant.approval

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.agent.api.AgentApprovalDecision
import com.eleckoi.android.engine.agent.api.AgentApprovalKind
import com.eleckoi.android.engine.agent.api.AgentCommandActionType
import com.eleckoi.android.engine.agent.api.commandActionSummary
import com.eleckoi.android.engine.agent.api.singleTypeOrNull
import com.eleckoi.android.feature.studio.ui.assistant.CreationApprovalRequest
import com.eleckoi.android.feature.studio.ui.assistant.components.CreationAction
import com.eleckoi.android.feature.conversation.timeline.CreationFileDiffStat
import com.eleckoi.android.feature.conversation.timeline.creationFileDiffStats
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun CreationApprovalCard(
    approval: CreationApprovalRequest,
    pendingCount: Int,
    appearance: AppearanceTheme,
    onDecision: (AgentApprovalDecision) -> Unit,
) {
    var expanded by rememberSaveable(approval.requestId) { mutableStateOf(false) }
    val scrollState = rememberScrollState()
    val fullReview = buildString {
        append(approval.detail)
        if (approval.reviewContent.isNotBlank()) {
            if (isNotEmpty()) append("\n\n")
            append("文件修改前后对比\n")
            append(approval.reviewContent)
        }
    }
    val fileReviewMissing =
        approval.kind == AgentApprovalKind.FileChange && approval.reviewContent.isBlank()
    val commandSummary = if (approval.kind == AgentApprovalKind.Command) {
        commandActionSummary(
            actions = approval.commandActions,
            rawCommand = approval.rawCommand,
        )
    } else {
        ""
    }
    val fileStats = androidx.compose.runtime.remember(approval.reviewContent) {
        if (approval.kind == AgentApprovalKind.FileChange) {
            creationFileDiffStats(approval.reviewContent)
        } else {
            emptyList()
        }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(appearance.mobileSurface)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                approval.title,
                color = appearance.mobileText,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            if (pendingCount > 1) {
                Text("待确认 $pendingCount", color = appearance.mobileMuted, fontSize = 11.sp)
            }
        }
        if (commandSummary.isNotBlank()) {
            ApprovalCommandSummary(
                summary = commandSummary,
                actionType = approval.commandActions.singleTypeOrNull(),
                appearance = appearance,
            )
        }
        if (fullReview.isNotBlank()) {
            if (fileStats.isNotEmpty()) {
                ApprovalFileChangeSummary(
                    stats = fileStats,
                    appearance = appearance,
                )
            }
            if (expanded) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 280.dp)
                        .verticalScroll(scrollState),
                ) {
                    Text(
                        fullReview,
                        color = appearance.mobileMuted,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            } else if (approval.kind != AgentApprovalKind.Command) {
                Text(
                    fullReview,
                    color = appearance.mobileMuted,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    maxLines = 6,
                    overflow = TextOverflow.Ellipsis,
                    fontFamily = FontFamily.Monospace,
                )
            }
            Text(
                if (expanded) {
                    "收起完整内容"
                } else if (approval.kind == AgentApprovalKind.Command) {
                    "查看完整命令与权限"
                } else {
                    "展开完整命令与修改内容"
                },
                modifier = Modifier.clickable { expanded = !expanded },
                color = appearance.mobileBlue,
                fontSize = 11.sp,
            )
        }
        if (fileReviewMissing) {
            Text(
                "Agent Harness 尚未提供可审阅的文件差异，请谨慎确认。",
                color = Color(0xFFD07A23),
                fontSize = 11.sp,
                lineHeight = 16.sp,
            )
        }
        if (AgentApprovalDecision.AcceptForSession in approval.availableDecisions) {
            Text(
                if (approval.kind == AgentApprovalKind.FileChange) {
                    "“仅允许本次修改”只批准眼前这一批改动；“对这些文件不再询问”会在本次 Agent 会话中记住这些文件。"
                } else {
                    "“仅允许本次执行”只批准眼前这条操作；“本会话内不再询问”会采用 Harness 返回的会话级授权。"
                },
                color = appearance.mobileMuted,
                fontSize = 11.sp,
                lineHeight = 16.sp,
            )
        }
        approval.availableDecisions.chunked(2).forEach { decisions ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                decisions.forEach { decision ->
                    CreationAction(
                        label = creationApprovalDecisionLabel(approval, decision),
                        appearance = appearance,
                        emphasized = decision == AgentApprovalDecision.Accept,
                        enabled = true,
                        modifier = Modifier.weight(1f),
                        onClick = { onDecision(decision) },
                    )
                }
                if (decisions.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ApprovalCommandSummary(
    summary: String,
    actionType: AgentCommandActionType?,
    appearance: AppearanceTheme,
) {
    val icon = when (actionType) {
        AgentCommandActionType.Read -> Icons.Rounded.Visibility
        AgentCommandActionType.ListFiles -> Icons.Rounded.FolderOpen
        AgentCommandActionType.Search -> Icons.Rounded.Search
        AgentCommandActionType.Unknown, null -> Icons.Rounded.Terminal
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(appearance.mobileMuted.copy(alpha = 0.06f))
            .padding(horizontal = 11.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = appearance.mobileMuted,
        )
        Text(
            text = summary,
            modifier = Modifier.weight(1f),
            color = appearance.mobileText,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ApprovalFileChangeSummary(
    stats: List<CreationFileDiffStat>,
    appearance: AppearanceTheme,
) {
    val additions = stats.sumOf(CreationFileDiffStat::additions)
    val deletions = stats.sumOf(CreationFileDiffStat::deletions)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(appearance.mobileMuted.copy(alpha = 0.06f))
            .padding(horizontal = 11.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "将修改 ${stats.size} 个文件",
                modifier = Modifier.weight(1f),
                color = appearance.mobileText,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
            )
            if (additions > 0) Text("+$additions", color = DiffAdditionColor, fontSize = 12.sp)
            if (deletions > 0) Text("-$deletions", color = DiffDeletionColor, fontSize = 12.sp)
        }
        stats.take(MaxVisibleFileStats).forEach { stat ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Text(
                    text = stat.path,
                    modifier = Modifier.weight(1f),
                    color = appearance.mobileMuted,
                    fontSize = 11.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (stat.additions > 0) {
                    Text("+${stat.additions}", color = DiffAdditionColor, fontSize = 11.5.sp)
                }
                if (stat.deletions > 0) {
                    Text("-${stat.deletions}", color = DiffDeletionColor, fontSize = 11.5.sp)
                }
            }
        }
    }
}

private val DiffAdditionColor = Color(0xFF079447)
private val DiffDeletionColor = Color(0xFFD94A4A)
private const val MaxVisibleFileStats = 5
