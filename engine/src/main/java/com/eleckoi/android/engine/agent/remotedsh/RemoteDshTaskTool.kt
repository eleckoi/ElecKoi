package com.eleckoi.android.engine.agent.remotedsh

import com.eleckoi.android.engine.agent.api.AgentDynamicTool
import com.eleckoi.android.engine.agent.api.AgentDynamicToolResult
import com.eleckoi.android.engine.agent.api.AgentInputImage
import com.eleckoi.android.engine.agent.api.AgentRemoteDshTaskTool
import com.eleckoi.android.engine.agent.api.AgentToolDefinition
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * One role-chat tool that delegates computer work to a durable PC-side DSH session.
 *
 * The Android role Agent stays the conversation owner. The PC session is an execution worker and
 * its final answer is returned as an ordinary tool result, so the role can continue in the same
 * ElecKoi timeline.
 */
fun remoteDshTaskTool(
    plugin: RemoteDshPlugin,
    roleBinding: () -> RemoteDshRoleBinding?,
    ensureConnected: suspend () -> Unit,
    currentTurnImages: () -> List<AgentInputImage> = { emptyList() },
): AgentDynamicTool {
    val configuredTarget = roleBinding()
    val targetDescription = configuredTarget?.let { binding ->
        "The selected PC workspace is '${binding.workspaceTitle}' at " +
            "'${binding.workspacePath}', using DSH session '${binding.sessionTitle}'. " +
            "Treat that PC workspace as the current project."
    } ?: "No PC workspace/session is selected yet; calling the tool will return a configuration error."
    return AgentDynamicTool(
        definition = AgentToolDefinition(
        name = AgentRemoteDshTaskTool,
        description = """
            Delegate a task that genuinely needs the user's computer to the DSH Agent running on
            that computer. Use it for reading or changing computer files, running builds and tests,
            inspecting repositories, or other computer-side work. Do not use it for ordinary
            conversation. Give the remote Agent a self-contained task with paths and the expected
            outcome. Its result returns here; summarize it naturally for the user. Images attached
            to the current user message are forwarded automatically when this tool is called.
            $targetDescription
        """.trimIndent().replace("\n", " "),
        parameters = buildJsonObject {
            put("type", "object")
            put("properties", buildJsonObject {
                put("task", buildJsonObject {
                    put("type", "string")
                    put("description", "给电脑 DSH 的完整任务说明，包括目标、路径和期望结果")
                })
            })
            put("required", kotlinx.serialization.json.buildJsonArray { add(JsonPrimitive("task")) })
            put("additionalProperties", false)
        },
        ),
    ) { arguments: JsonObject ->
        val task = arguments["task"]?.jsonPrimitive?.contentOrNull.orEmpty().trim()
        if (task.isBlank()) {
            return@AgentDynamicTool AgentDynamicToolResult("task 不能为空。", success = false)
        }
        runCatching {
            ensureConnected()
            val binding = roleBinding()
                ?: error("当前角色尚未绑定电脑 DSH 工作区和会话；请从这个角色的工具页进入远端 DSH 配置")
            plugin.runRoleplayTask(
                binding = binding,
                task = task,
                images = currentTurnImages(),
            )
        }.fold(
            onSuccess = { result ->
                AgentDynamicToolResult(
                    buildJsonObject {
                        put("status", "completed")
                        put("remote_session_id", result.sessionId)
                        put("response", result.response)
                    }.toString(),
                )
            },
            onFailure = { error ->
                AgentDynamicToolResult(
                    buildJsonObject {
                        put("status", "failed")
                        put("message", error.message ?: "电脑 DSH 执行失败")
                    }.toString(),
                    success = false,
                )
            },
        )
    }
}
