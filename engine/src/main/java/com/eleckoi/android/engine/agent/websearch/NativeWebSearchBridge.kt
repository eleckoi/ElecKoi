package com.eleckoi.android.engine.agent.websearch

import com.eleckoi.android.engine.agent.api.AgentDynamicTool
import com.eleckoi.android.engine.agent.api.AgentDynamicToolResult
import com.eleckoi.android.engine.agent.api.AgentNativeWebSearchBridgeTool
import com.eleckoi.android.engine.agent.api.AgentToolDefinition
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Stable DSH-visible capability marker for provider-native web search.
 *
 * DSH's LLM seam and pi-ai 0.82.1 only accept named function schemas. The Android provider
 * bridge removes this function from every outgoing request and, for the official DeepSeek
 * Responses endpoint, replaces it with the server-side `web_search` declaration. The handler is
 * deliberately fail-closed in case a future wire serializer bypasses that boundary.
 */
fun nativeWebSearchBridgeTool(): AgentDynamicTool = AgentDynamicTool(
    definition = AgentToolDefinition(
        name = AgentNativeWebSearchBridgeTool,
        description = "允许当前模型使用其官方服务端联网搜索能力。",
        parameters = buildJsonObject {
            put("type", "object")
            put("additionalProperties", false)
        },
    ),
    handler = {
        AgentDynamicToolResult(
            content = "原生联网搜索没有在 Provider 请求边界完成转换。",
            success = false,
        )
    },
)
