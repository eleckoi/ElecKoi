package com.eleckoi.android.feature.conversation.timeline.reducer

import com.eleckoi.android.engine.agent.api.AgentFileChange
import com.eleckoi.android.engine.agent.api.AgentSessionEvent
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.normalizeCreationWorkspacePath
import com.eleckoi.android.feature.conversation.timeline.normalizeCreationWorkspacePaths

internal const val MaxDetailLength = 200_000
internal const val MaxCommandOutputDetailLength = 16_000

internal fun defaultTimelineLabel(type: AgentWorkItemType): String = when (type) {
    AgentWorkItemType.Request -> "模型请求"
    AgentWorkItemType.Reasoning -> "分析任务"
    AgentWorkItemType.Command -> "执行命令"
    AgentWorkItemType.FileChange -> "修改文件"
    AgentWorkItemType.Tool -> "调用工具"
    AgentWorkItemType.Action -> "执行动作"
    AgentWorkItemType.ContextCompaction -> "自动压缩上下文"
    AgentWorkItemType.Unknown -> "处理项目"
    AgentWorkItemType.AssistantMessage -> "生成回复"
    AgentWorkItemType.UserMessage -> "用户消息"
}

internal fun normalizeTimelineFileChanges(changes: List<AgentFileChange>): List<AgentFileChange> =
    changes.mapNotNull { change ->
        val path = normalizeCreationWorkspacePath(change.path)
        if (path.isBlank()) {
            null
        } else {
            change.copy(
                path = path,
                movePath = change.movePath
                    ?.let(::normalizeCreationWorkspacePath)
                    ?.takeIf(String::isNotBlank),
            )
        }
    }

internal fun latestTimelineFileChanges(
    current: List<AgentFileChange>,
    incoming: List<AgentFileChange>,
): List<AgentFileChange> = if (incoming.isEmpty()) current else normalizeTimelineFileChanges(incoming)

internal fun AgentSessionEvent.WorkItemStarted.normalizedFileChangePaths(): List<String> =
    normalizeCreationWorkspacePaths(paths + fileChanges.map(AgentFileChange::path))

internal fun AgentSessionEvent.WorkItemCompleted.normalizedFileChangePaths(): List<String> =
    normalizeCreationWorkspacePaths(paths + fileChanges.map(AgentFileChange::path))

internal fun mergeFallbackDetail(current: String, fallback: String): String = when {
    current.isNotBlank() -> current
    fallback.isNotBlank() -> fallback.takeLast(MaxDetailLength)
    else -> ""
}

internal fun appendUniqueDetail(current: String, additions: List<String>): String = additions.fold(current) {
        detail, addition ->
    if (addition.isBlank() || detail.contains(addition)) detail else appendDetailLine(detail, addition)
}

private fun appendDetailLine(current: String, addition: String): String {
    if (addition.isEmpty()) return current
    val combined = if (current.isBlank()) addition else "$current\n$addition"
    return if (combined.length <= MaxDetailLength) combined else combined.takeLast(MaxDetailLength)
}

internal fun appendTimelineStream(
    current: String,
    delta: String,
    maxLength: Int = MaxDetailLength,
): String {
    if (delta.isEmpty()) return current
    val combined = current + delta
    return if (combined.length <= maxLength) combined else combined.takeLast(maxLength)
}

internal inline fun List<CreationTimelineItem>.replaceTimelineItemAt(
    index: Int,
    transform: (CreationTimelineItem) -> CreationTimelineItem,
): List<CreationTimelineItem> = mapIndexed { itemIndex, item ->
    if (itemIndex == index) transform(item) else item
}

internal fun Long.orCurrentTime(): Long = takeIf { it > 0L } ?: System.currentTimeMillis()
