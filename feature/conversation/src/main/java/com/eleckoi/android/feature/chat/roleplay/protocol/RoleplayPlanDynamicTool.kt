package com.eleckoi.android.feature.chat.roleplay.protocol

import com.eleckoi.android.engine.agent.api.AgentDynamicTool
import com.eleckoi.android.engine.agent.api.AgentDynamicToolResult
import com.eleckoi.android.engine.agent.api.AgentToolDefinition
import com.eleckoi.android.engine.agent.api.AgentUpdateRoleplayPlanTool
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Host-owned roleplay plan tool used when a Harness does not provide a native plan extension. */
internal fun roleplayPlanDynamicTool(fixedItems: List<String>): AgentDynamicTool {
    val expected = fixedItems.map(String::trim).filter(String::isNotBlank)
    require(expected.isNotEmpty()) { "角色扮演计划必须包含固定任务项" }
    return AgentDynamicTool(
        definition = AgentToolDefinition(
            name = AgentUpdateRoleplayPlanTool,
            description =
                "更新本轮角色扮演计划。请复述完整任务列表并填写状态；" +
                    "应用会保留作者固定任务文字，不会因文字或数量差异拒绝本次更新。" +
                    "最后一项由应用在检测到 FINAL 正文后完成，模型不要主动将其标记为 completed。",
            parameters = buildJsonObject {
                put("type", "object")
                put("properties", buildJsonObject {
                    put("explanation", buildJsonObject {
                        put("type", "string")
                        put("description", "可选的简短进度说明。")
                    })
                    put("plan", buildJsonObject {
                        put("type", "array")
                        put("description", "完整角色扮演计划；每次调用会替换上一份状态。")
                        put("items", buildJsonObject {
                            put("type", "object")
                            put("properties", buildJsonObject {
                                put("step", buildJsonObject { put("type", "string") })
                                put("status", buildJsonObject {
                                    put("type", "string")
                                    put("description", "建议使用 pending、inProgress 或 completed。")
                                })
                            })
                        })
                    })
                })
            },
        ),
        handler = { arguments -> canonicalizeRoleplayPlan(arguments, expected) },
    )
}

private fun canonicalizeRoleplayPlan(
    arguments: JsonObject,
    expected: List<String>,
): AgentDynamicToolResult {
    val submitted = arguments["plan"] as? JsonArray ?: JsonArray(emptyList())
    val statuses = expected.indices.map { index ->
        val item = submitted.getOrNull(index) as? JsonObject
        (item?.get("status") as? JsonPrimitive)
            ?.contentOrNull
            ?.takeIf(ValidStatuses::contains)
            ?: "pending"
    }.toMutableList()
    val precedingTasksCompleted = statuses
        .dropLast(1)
        .all { status -> status == "completed" }
    // The structural final item is an output contract, not model-reported work. Keep accepting
    // imperfect status submissions without an error, but never let the plan claim the reply exists
    // before the host has actually detected and accepted its FINAL body.
    statuses[statuses.lastIndex] = when {
        precedingTasksCompleted -> "inProgress"
        statuses.last() == "completed" -> "pending"
        else -> statuses.last()
    }
    val explanation = (arguments["explanation"] as? JsonPrimitive)
        ?.contentOrNull
        ?.trim()
        .orEmpty()
    val counts = statuses.groupingBy { it }.eachCount()
    val message = if (precedingTasksCompleted) {
        "现在只剩最终输出项。直接输出 <FINAL> 正文，不要再次调用 update_roleplay_plan；" +
            "应用检测到正文后会自动完成最终项。"
    } else {
        "角色扮演计划已更新：${counts["completed"] ?: 0} 已完成，" +
            "${counts["inProgress"] ?: 0} 进行中，${counts["pending"] ?: 0} 待处理。" +
            "最终输出项由应用在检测到 <FINAL> 正文后自动完成；" +
            "不要主动将其标记为 completed。"
    }
    return AgentDynamicToolResult(
        buildJsonObject {
            put("status", "ok")
            put("message", message)
            if (explanation.isNotBlank()) put("explanation", explanation)
            put("plan", buildJsonArray {
                expected.forEachIndexed { index, step ->
                    add(buildJsonObject {
                        put("step", step)
                        put("status", statuses[index])
                    })
                }
            })
        }.toString(),
    )
}

private val ValidStatuses = setOf("pending", "inProgress", "completed")
