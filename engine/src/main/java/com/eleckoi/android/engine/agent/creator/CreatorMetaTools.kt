package com.eleckoi.android.engine.agent.creator

import com.eleckoi.android.engine.agent.api.AgentCallCreatorCapabilityTool
import com.eleckoi.android.engine.agent.api.AgentDescribeCreatorToolsetTool
import com.eleckoi.android.engine.agent.api.AgentDynamicTool
import com.eleckoi.android.engine.agent.api.AgentDynamicToolResult
import com.eleckoi.android.engine.agent.api.AgentListCreatorToolsetsTool
import com.eleckoi.android.engine.agent.api.AgentToolDefinition
import com.eleckoi.android.engine.creator.capability.CreatorCapabilityException
import com.eleckoi.android.engine.creator.capability.CreatorOperationDefinition
import com.eleckoi.android.engine.creator.capability.CreatorToolsetCatalog
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

object CreatorMetaTools {
    fun <Context> create(
        context: Context,
        catalog: CreatorToolsetCatalog<Context>,
    ): List<AgentDynamicTool> = listOf(
        listToolsetsTool(catalog),
        describeToolsetTool(catalog),
        callCapabilityTool(context, catalog),
    )

    private fun <Context> listToolsetsTool(catalog: CreatorToolsetCatalog<Context>) = AgentDynamicTool(
        definition = AgentToolDefinition(
            name = AgentListCreatorToolsetsTool,
            description = "列出当前 ElecKoi 创作工作区可用的能力组。只返回摘要，不展开大量操作 Schema。",
            parameters = objectSchema {
                put("query", stringSchema("可选的自然语言筛选词。"))
            },
        ),
        handler = { arguments ->
            val query = arguments.string("query").trim().lowercase()
            val toolsets = catalog.toolsetDefinitions.filter { toolset ->
                if (query.isBlank()) true else {
                    val searchable = buildString {
                        append(toolset.id).append(' ')
                        append(toolset.title).append(' ')
                        append(toolset.description).append(' ')
                        catalog.operations(toolset.id).forEach { operation ->
                            append(operation.capabilityId).append(' ')
                            append(operation.title).append(' ')
                            append(operation.description).append(' ')
                        }
                    }.lowercase()
                    query.split(Regex("\\s+")).all(searchable::contains)
                }
            }
            AgentDynamicToolResult(
                buildJsonObject {
                    put("toolsets", buildJsonArray {
                        toolsets.forEach { toolset ->
                            add(buildJsonObject {
                                put("id", toolset.id)
                                put("title", toolset.title)
                                put("description", toolset.description)
                                put("operationCount", catalog.operations(toolset.id).size)
                            })
                        }
                    })
                }.toString(),
            )
        },
    )

    private fun <Context> describeToolsetTool(catalog: CreatorToolsetCatalog<Context>) = AgentDynamicTool(
        definition = AgentToolDefinition(
            name = AgentDescribeCreatorToolsetTool,
            description = "按需描述一个创作能力组；默认只返回操作摘要，可只为选中的操作加载完整输入 Schema。",
            parameters = objectSchema(
                required = listOf("toolset_id"),
            ) {
                put("toolset_id", stringSchema("eleckoi_list_toolsets 返回的能力组 id。"))
                put("operation_ids", buildJsonObject {
                    put("type", "array")
                    put("items", stringSchema("要展开的操作 id。"))
                    put("maxItems", 12)
                })
                put("include_schema", buildJsonObject {
                    put("type", "boolean")
                    put("description", "是否返回所选操作的完整输入 Schema。")
                })
            },
        ),
        handler = { arguments ->
            val toolsetId = arguments.string("toolset_id")
            val toolset = catalog.toolset(toolsetId)
                ?: return@AgentDynamicTool failure("UNKNOWN_TOOLSET", "没有找到创作能力组：$toolsetId")
            val selectedIds = (arguments["operation_ids"] as? JsonArray)
                .orEmpty()
                .mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                .filter(String::isNotBlank)
                .distinct()
            if (selectedIds.size > MaxDescribedOperations) {
                return@AgentDynamicTool failure(
                    "TOO_MANY_OPERATIONS",
                    "一次最多展开 $MaxDescribedOperations 个操作，请只选择当前任务需要的能力",
                )
            }
            val allOperations = catalog.operations(toolsetId)
            val operations = if (selectedIds.isEmpty()) allOperations else allOperations.filter {
                it.capabilityId in selectedIds
            }
            if (selectedIds.isNotEmpty() && operations.size != selectedIds.size) {
                return@AgentDynamicTool failure("UNKNOWN_CAPABILITY", "所选能力不属于 $toolsetId")
            }
            val includeSchema = (arguments["include_schema"] as? JsonPrimitive)?.booleanOrNull == true
            if (includeSchema && selectedIds.isEmpty()) {
                return@AgentDynamicTool failure(
                    "OPERATION_SELECTION_REQUIRED",
                    "展开 Schema 时必须明确提供 operation_ids，不能一次加载整个工具组",
                )
            }
            AgentDynamicToolResult(
                buildJsonObject {
                    put("toolset", buildJsonObject {
                        put("id", toolset.id)
                        put("title", toolset.title)
                        put("description", toolset.description)
                    })
                    put("operations", buildJsonArray {
                        operations.forEach { operation -> add(operation.toJson(includeSchema)) }
                    })
                }.toString(),
            )
        },
    )

    private fun <Context> callCapabilityTool(
        context: Context,
        catalog: CreatorToolsetCatalog<Context>,
    ) = AgentDynamicTool(
        definition = AgentToolDefinition(
            name = AgentCallCreatorCapabilityTool,
            description = "调用已通过能力组发现的一个 ElecKoi 创作操作。宿主仍会执行作用域、权限和数据校验。",
            parameters = objectSchema(
                required = listOf("capability_id", "arguments"),
            ) {
                put("capability_id", stringSchema("eleckoi_describe_toolset 返回的操作 id。"))
                put("arguments", buildJsonObject {
                    put("type", "object")
                    put("description", "严格遵循该操作输入 Schema 的参数。")
                })
            },
        ),
        handler = { arguments ->
            val capabilityId = arguments.string("capability_id")
            val capabilityArguments = arguments["arguments"] as? JsonObject
                ?: return@AgentDynamicTool failure("INVALID_ARGUMENTS", "arguments 必须是 JSON object")
            val capability = catalog.registry.find(capabilityId)
                ?: return@AgentDynamicTool failure("UNKNOWN_CAPABILITY", "没有找到创作能力：$capabilityId")
            try {
                AgentDynamicToolResult(capability.handler(context, capabilityArguments).toString())
            } catch (error: CreatorCapabilityException) {
                failure(error.code, error.message)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                failure("INTERNAL_ERROR", "创作能力调用失败")
            }
        },
    )

    private fun CreatorOperationDefinition.toJson(includeSchema: Boolean) = buildJsonObject {
        put("id", capabilityId)
        put("title", title)
        put("description", description)
        put("effect", effect.name.lowercase())
        if (includeSchema) put("inputSchema", inputSchema)
    }

    private fun failure(code: String, message: String) = AgentDynamicToolResult(
        content = buildJsonObject {
            put("status", "error")
            put("code", code)
            put("message", message)
        }.toString(),
        success = false,
    )

    private fun objectSchema(
        required: List<String> = emptyList(),
        properties: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit,
    ) = buildJsonObject {
        put("type", "object")
        put("additionalProperties", false)
        put("properties", buildJsonObject(properties))
        if (required.isNotEmpty()) {
            put("required", buildJsonArray { required.forEach { add(JsonPrimitive(it)) } })
        }
    }

    private fun stringSchema(description: String) = buildJsonObject {
        put("type", "string")
        put("description", description)
    }

    private fun JsonObject.string(name: String): String =
        (get(name) as? JsonPrimitive)?.contentOrNull.orEmpty().trim()

    private const val MaxDescribedOperations = 12
}
