package com.eleckoi.android.feature.conversation.timeline

import com.eleckoi.android.engine.agent.api.AgentApplyVariablePatchTool
import com.eleckoi.android.engine.agent.api.AgentApplySettingPatchTool
import com.eleckoi.android.engine.agent.api.AgentDeleteSettingDirectoryTool
import com.eleckoi.android.engine.agent.api.AgentDeleteSettingFileTool
import com.eleckoi.android.engine.agent.api.AgentEditSettingFileTool
import com.eleckoi.android.engine.agent.api.AgentGlobSettingFilesTool
import com.eleckoi.android.engine.agent.api.AgentGlobVariablesTool
import com.eleckoi.android.engine.agent.api.AgentGrepSettingFilesTool
import com.eleckoi.android.engine.agent.api.AgentGrepVariablesTool
import com.eleckoi.android.engine.agent.api.AgentMakeSettingDirectoryTool
import com.eleckoi.android.engine.agent.api.AgentMoveSettingDirectoryTool
import com.eleckoi.android.engine.agent.api.AgentMoveSettingFileTool
import com.eleckoi.android.engine.agent.api.AgentReadSettingFilesTool
import com.eleckoi.android.engine.agent.api.AgentReadVariablesTool
import com.eleckoi.android.engine.agent.api.AgentRemoteDshTaskTool
import com.eleckoi.android.engine.agent.api.AgentSubagentTool
import com.eleckoi.android.engine.agent.api.AgentTodoWriteTool
import com.eleckoi.android.engine.agent.api.AgentUpdatePlanTool
import com.eleckoi.android.engine.agent.api.AgentUpdateRoleplayPlanTool
import com.eleckoi.android.engine.agent.api.AgentWriteSettingFileTool
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull

fun CreationTimelineItem.agentToolArgumentsSummary(): String? {
    val payload = toolArguments.jsonObjectOrNull() ?: return toolArguments
        .trim()
        .takeIf(String::isNotBlank)
    return when (toolName) {
        AgentGlobSettingFilesTool,
        AgentGlobVariablesTool,
        -> buildList {
            payload.string("pattern")?.takeIf(String::isNotBlank)?.let { add("路径模式：$it") }
            payload.string("path")?.takeIf(String::isNotBlank)?.let { add("范围：$it") }
        }.joinToString("\n")
        AgentGrepSettingFilesTool,
        AgentGrepVariablesTool,
        -> buildList {
            payload.string("pattern")?.takeIf(String::isNotBlank)?.let { add("正则：$it") }
            payload.string("path")?.takeIf(String::isNotBlank)?.let { add("范围：$it") }
            payload.string("glob")?.takeIf(String::isNotBlank)?.let { add("文件过滤：$it") }
            payload.string("output_mode")?.takeIf(String::isNotBlank)?.let { add("结果：$it") }
        }.joinToString("\n")
        AgentReadSettingFilesTool -> payload.pathsFromStrings("paths")
            .joinToString("\n", prefix = "文件：\n")
            .takeIf { it != "文件：\n" }
        AgentReadVariablesTool -> payload.pathsFromStrings("paths")
            .joinToString("\n", prefix = "变量：\n")
            .takeIf { it != "变量：\n" }
        AgentApplyVariablePatchTool -> (payload["operations"] as? JsonArray)
            .orEmpty()
            .mapNotNull { element ->
                val operation = element as? JsonObject ?: return@mapNotNull null
                val path = operation.string("path")?.takeIf(String::isNotBlank)
                    ?: return@mapNotNull null
                val action = operation.string("op").orEmpty().ifBlank { "replace" }
                "$action $path"
            }
            .joinToString("\n")
            .takeIf(String::isNotBlank)
        AgentApplySettingPatchTool -> buildList {
            payload.string("operation")?.takeIf(String::isNotBlank)?.let { add("操作：$it") }
            payload.string("path")?.takeIf(String::isNotBlank)?.let { add("路径：$it") }
            payload.string("destination")?.takeIf(String::isNotBlank)?.let { add("目标：$it") }
        }.joinToString("\n").takeIf(String::isNotBlank)
        AgentRemoteDshTaskTool -> payload.string("task")
            ?.takeIf(String::isNotBlank)
            ?.let { "电脑任务：$it" }
        AgentWriteSettingFileTool -> payload.string("path")?.let { "write_file $it" }
        AgentEditSettingFileTool -> payload.string("path")?.let { "edit_file $it" }
        AgentMakeSettingDirectoryTool -> payload.string("path")?.let { "make_directory $it" }
        AgentMoveSettingFileTool -> payload.string("destination")?.let { "move_file $it" }
        AgentMoveSettingDirectoryTool -> payload.string("destination")?.let { "move_directory $it" }
        AgentDeleteSettingFileTool -> payload.string("path")?.let { "delete_file $it" }
        AgentDeleteSettingDirectoryTool -> payload.string("path")?.let { "delete_directory $it" }
        AgentUpdateRoleplayPlanTool -> agentPlanUpdatePresentation()?.readableChecklist()
        AgentUpdatePlanTool,
        AgentTodoWriteTool,
        -> payload.toPlanUpdatePresentation()?.readableChecklist()
        AgentSubagentTool -> buildList {
            payload.string("description")
                ?.takeIf(String::isNotBlank)
                ?.let { add("任务：$it") }
            payload.string("prompt")
                ?.takeIf(String::isNotBlank)
                ?.let { add("委派指令：$it") }
            if (payload.primitive("run_in_background")?.contentOrNull == "true") {
                add("执行方式：后台运行")
            }
        }.joinToString("\n")
        else -> toolArguments.trim().takeIf(String::isNotBlank)
    }
}

fun CreationTimelineItem.subagentToolPresentation(): SubagentToolPresentation? {
    if (toolName != AgentSubagentTool) return null
    val payload = toolArguments.jsonObjectOrNull()
    return SubagentToolPresentation(
        description = payload?.string("description").orEmpty().trim().ifBlank { "独立任务" },
        prompt = payload?.string("prompt").orEmpty().trim(),
        background = payload?.primitive("run_in_background")?.contentOrNull == "true",
    )
}

fun CreationTimelineItem.agentPlanUpdatePresentation(): AgentPlanUpdatePresentation? {
    return parseAgentPlanUpdatePresentation(
        toolName = toolName,
        toolArguments = toolArguments,
        toolResult = detail,
    )
}

fun parseAgentPlanUpdatePresentation(
    toolName: String,
    toolArguments: String,
    toolResult: String = "",
): AgentPlanUpdatePresentation? {
    if (toolName !in AgentPlanToolNames) return null
    if (toolName == AgentUpdateRoleplayPlanTool) {
        toolResult.jsonObjectOrNull()
            ?.takeIf { result -> result.string("status") == "ok" }
            ?.toPlanUpdatePresentation()
            ?.let { return it }
    }
    return toolArguments.jsonObjectOrNull()?.toPlanUpdatePresentation()
}

private fun AgentPlanUpdatePresentation.readableChecklist(): String = buildList {
    explanation.takeIf(String::isNotBlank)?.let(::add)
    steps.forEach { step ->
        val marker = when (step.status) {
            AgentPlanStepStatus.Completed -> "✓"
            AgentPlanStepStatus.InProgress -> "•"
            AgentPlanStepStatus.Pending -> "○"
        }
        add("$marker ${step.text}")
    }
}.joinToString("\n")


private fun JsonObject.toPlanUpdatePresentation(): AgentPlanUpdatePresentation? {
    val steps = ((get("plan") ?: get("todos")) as? JsonArray)
        .orEmpty()
        .mapNotNull { element ->
            val step = element as? JsonObject ?: return@mapNotNull null
            val text = (step.string("step") ?: step.string("content"))
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: return@mapNotNull null
            AgentPlanStepPresentation(
                text = text,
                status = when (step.string("status")) {
                    "completed" -> AgentPlanStepStatus.Completed
                    "inProgress", "in_progress" -> AgentPlanStepStatus.InProgress
                    else -> AgentPlanStepStatus.Pending
                },
            )
        }
    val explanation = string("explanation").orEmpty().trim()
    return AgentPlanUpdatePresentation(
        explanation = explanation,
        steps = steps,
    )
}


internal val AgentPlanToolNames = setOf(
    AgentUpdatePlanTool,
    AgentUpdateRoleplayPlanTool,
    AgentTodoWriteTool,
)
