package com.eleckoi.android.feature.conversation.timeline.detail

import com.eleckoi.android.feature.conversation.timeline.*
import com.eleckoi.android.feature.conversation.timeline.components.*
import com.eleckoi.android.feature.conversation.timeline.results.GlobToolResultBlock
import com.eleckoi.android.feature.conversation.timeline.results.SettingEntriesResultBlock
import com.eleckoi.android.feature.conversation.timeline.results.VariableEntriesResultBlock

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import com.eleckoi.android.engine.agent.api.AgentReadSettingFilesTool
import com.eleckoi.android.engine.agent.api.AgentReadVariablesTool
import com.eleckoi.android.engine.agent.api.AgentApplySettingPatchTool
import com.eleckoi.android.engine.agent.api.AgentSettingFileMutationTools
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun OperationDetailItem(
    item: CreationTimelineItem,
    index: Int,
    animatePlanInProgress: Boolean,
    appearance: AppearanceTheme,
    onOpenItem: (CreationTimelineItem) -> Unit,
) {
    when (item.workItemType) {
        AgentWorkItemType.Request -> CreationRequestBoundary(item, appearance)
        AgentWorkItemType.Command -> {
            ToolInvocationDetail(item, appearance)
            DetailTextBlock(
                label = if (index == 0) "原始命令" else "原始命令 ${index + 1}",
                text = item.rawCommand.ifBlank { item.text },
                appearance = appearance,
                monospace = true,
            )
            val commandOutput = item.detail
            if (commandOutput.isNotBlank()) {
                DetailTextBlock(
                    label = "输出",
                    text = commandOutput,
                    appearance = appearance,
                    monospace = true,
                )
            }
        }
        AgentWorkItemType.FileChange -> {
            ToolInvocationDetail(item, appearance)
            val files = item.paths.ifEmpty {
                item.detail
                    .split(',')
                    .map(String::trim)
                    .filter(String::isNotBlank)
            }
            DetailTextBlock(
                label = if (files.size > 1) "文件" else "文件路径",
                text = files.joinToString("\n").ifBlank { item.text },
                appearance = appearance,
                monospace = true,
            )
            if (item.diff.isNotBlank()) {
                DetailTextBlock(
                    label = "变更差异",
                    text = item.diff,
                    appearance = appearance,
                    monospace = true,
                )
            }
        }
        AgentWorkItemType.Reasoning -> {
            val reasoning = item.detail.takeIf(String::hasMeaningfulProcessDetail)
                ?: item.text.takeIf { item.hasReasoningPhaseText() }
                ?: "当前模型没有提供可展示的详细思考内容"
            ReasoningDetailBlock(
                stateKey = item.id,
                label = if (item.running) "正在思考" else "思考过程",
                text = reasoning,
                appearance = appearance,
            )
        }
        AgentWorkItemType.ContextCompaction -> {
            DetailTextBlock(
                label = when {
                    item.running -> "正在自动压缩"
                    item.failed -> "上下文自动压缩失败"
                    else -> "上下文已自动压缩"
                },
                text = item.detail.ifBlank {
                    when {
                        item.running -> "Agent Harness 正在压缩当前对话上下文"
                        item.failed -> "自动压缩未完成"
                        else -> "压缩已完成"
                    }
                },
                appearance = appearance,
                monospace = false,
            )
        }
        AgentWorkItemType.Action -> {
            ActionInvocationDetail(item, appearance)
        }
        else -> {
            val subagent = remember(item.toolName, item.toolArguments) {
                item.subagentToolPresentation()
            }
            val planUpdate = remember(item.toolName, item.toolArguments, item.detail) {
                item.agentPlanUpdatePresentation()
            }
            if (subagent != null) {
                SubagentInvocationDetail(
                    item = item,
                    delegation = subagent,
                    appearance = appearance,
                    onOpenItem = onOpenItem,
                )
            } else if (planUpdate != null) {
                PlanUpdateDetail(
                    plan = planUpdate,
                    animateInProgress = animatePlanInProgress,
                    appearance = appearance,
                )
            } else {
                ToolInvocationDetail(item, appearance)
                val settingEntries = if (
                    item.toolName == AgentReadSettingFilesTool
                ) {
                    remember(item.detail) { parseSettingEntryToolResult(item.detail) }
                } else {
                    emptyList()
                }
                val variableEntries = if (item.toolName == AgentReadVariablesTool) {
                    remember(item.detail) { parseVariableEntryToolResult(item.detail) }
                } else {
                    emptyList()
                }
                val globResult = remember(item.toolName, item.detail) {
                    parseAgentGlobToolResult(item.toolName, item.detail)
                }
                val toolResult = item.detail
                if (settingEntries.isNotEmpty()) {
                    SettingEntriesResultBlock(
                        item = item,
                        entries = settingEntries,
                        appearance = appearance,
                    )
                } else if (variableEntries.isNotEmpty()) {
                    VariableEntriesResultBlock(
                        item = item,
                        entries = variableEntries,
                        appearance = appearance,
                    )
                } else if (globResult != null) {
                    GlobToolResultBlock(
                        result = globResult,
                        appearance = appearance,
                    )
                } else if (toolResult.isNotBlank() && !item.suppressesSuccessfulSettingMutationResult()) {
                    DetailTextBlock(
                        label = "工具结果",
                        text = toolResult,
                        appearance = appearance,
                        monospace = true,
                    )
                } else if (item.toolName.isBlank()) {
                    DetailTextBlock(
                        label = item.text.ifBlank { "工具记录" },
                        text = item.detail.ifBlank { "这条记录没有更多详情" },
                        appearance = appearance,
                        monospace = true,
                    )
                }
            }
        }
    }
}

private fun CreationTimelineItem.suppressesSuccessfulSettingMutationResult(): Boolean {
    if (failed || running) return false
    return toolName == AgentApplySettingPatchTool || toolName in AgentSettingFileMutationTools
}

@Composable
private fun ActionInvocationDetail(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
) {
    DetailTextBlock(
        label = "执行动作",
        text = item.text.ifBlank { item.toolName.ifBlank { "未命名动作" } },
        appearance = appearance,
        monospace = false,
    )
    if (item.toolArguments.isNotBlank()) {
        DetailTextBlock(
            label = "动作参数",
            text = item.toolArguments,
            appearance = appearance,
            monospace = true,
        )
    }
    DetailTextBlock(
        label = "执行状态",
        text = actionExecutionStatus(item),
        appearance = appearance,
        monospace = false,
    )
    if (item.failed && item.detail.isNotBlank()) {
        DetailTextBlock(
            label = "失败原因",
            text = item.detail,
            appearance = appearance,
            monospace = false,
        )
    }
}

fun actionExecutionStatus(item: CreationTimelineItem): String = when {
    item.toolName == "generate_image" && item.running -> "正在生成图片"
    item.toolName == "generate_image" && item.failed -> "图片生成失败"
    item.toolName == "generate_image" -> "图片已生成"
    item.running -> "正在执行"
    item.failed -> "执行失败"
    else -> "已执行"
}

@Composable
private fun ToolInvocationDetail(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
) {
    if (item.toolName.isBlank()) return
    val presentation = item.agentToolTimelinePresentation()
    val argumentSummary = remember(item.toolName, item.toolArguments) {
        item.agentToolArgumentsSummary()
    }
    Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
        DetailTextBlock(
            label = presentation?.title ?: "调用工具",
            text = presentation?.target?.takeIf(String::isNotBlank) ?: item.toolName,
            appearance = appearance,
            monospace = presentation == null,
        )
        if (!argumentSummary.isNullOrBlank()) {
            DetailTextBlock(
                label = "调用参数",
                text = argumentSummary,
                appearance = appearance,
                monospace = presentation == null,
            )
        }
    }
}
