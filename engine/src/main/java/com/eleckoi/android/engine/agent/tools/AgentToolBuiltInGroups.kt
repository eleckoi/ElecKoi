package com.eleckoi.android.engine.agent.tools

import com.eleckoi.android.engine.agent.api.AgentApplyVariablePatchTool
import com.eleckoi.android.engine.agent.api.AgentSettingLibraryTools
import com.eleckoi.android.engine.agent.api.AgentGlobSettingFilesTool
import com.eleckoi.android.engine.agent.api.AgentGlobVariablesTool
import com.eleckoi.android.engine.agent.api.AgentGrepSettingFilesTool
import com.eleckoi.android.engine.agent.api.AgentGrepVariablesTool
import com.eleckoi.android.engine.agent.api.AgentReadSettingFilesTool
import com.eleckoi.android.engine.agent.api.AgentReadVariablesTool
import com.eleckoi.android.engine.agent.api.AgentRemoteDshTaskTool
import com.eleckoi.android.engine.agent.api.AgentToolContextBlock
import com.eleckoi.android.engine.agent.api.AgentUpdateRoleplayPlanTool
import com.eleckoi.android.engine.agent.api.AgentWebSearchTool
import com.eleckoi.android.engine.agent.api.AgentCreatorMetaTools
import com.eleckoi.android.engine.agent.api.AgentListCreatorToolsetsTool
import com.eleckoi.android.engine.agent.api.AgentDescribeCreatorToolsetTool
import com.eleckoi.android.engine.agent.api.AgentCallCreatorCapabilityTool

/** Static catalog shown even before a Harness/provider declaration has been observed. */
internal fun builtInAgentToolGroups(): List<AgentToolGroupSnapshot> = listOf(
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInWorkspace,
        name = "本地工作区",
        description = "执行命令并修改角色或创作工作区中的文件",
        members = emptyList(),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInVisual,
        name = "图片读取",
        description = "查看工作区或设备提供的本地图片",
        members = listOf("view_image"),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInWorkflow,
        name = "任务与交互",
        description = "维护任务计划，并在确有必要时向用户提问",
        members = emptyList(),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInRoleplayWorkflow,
        name = "角色扮演计划",
        description = "维护角色扮演专用任务计划",
        members = listOf(AgentUpdateRoleplayPlanTool),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInAutoIllustration,
        name = "角色自动配图",
        description = "只为当前角色的回复自动生成剧情分镜；不影响其他角色或创作助手按需生图。",
        members = emptyList(),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInCollaboration,
        name = "多代理协作",
        description = "创建和管理并行子任务；普通角色通常不需要",
        members = emptyList(),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInMcpResources,
        name = "MCP 资源读取",
        description = "列出并读取 MCP 服务器提供的资源和资源模板",
        members = listOf(
            "list_mcp_resources",
            "list_mcp_resource_templates",
            "read_mcp_resource",
        ),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInPluginDiscovery,
        name = "插件发现",
        description = "发现并请求安装当前尚未启用的插件",
        members = listOf("request_plugin_install"),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInWeb,
        name = "联网搜索",
        description = "搜索公开互联网，获取最新事实和可引用来源",
        members = listOf(AgentWebSearchTool, "web_search"),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInRemoteDsh,
        name = "远端 DSH",
        description = "把需要操作电脑的任务交给电脑上的 DSH，并把执行结果带回当前角色对话",
        members = listOf(AgentRemoteDshTaskTool),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInCreator,
        name = "创作能力",
        description = "按需发现并调用角色创作与设定库能力",
        members = AgentCreatorMetaTools.toList(),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInSettingLibrary,
        name = "角色设定库",
        description = "用独立的 Glob、Grep、Read 和文件修改工具访问角色基础设定，并把修改保存为当前对话差异",
        members = AgentSettingLibraryTools.toList(),
    ),
    builtInToolGroupWithNames(
        id = AgentToolRequestPolicy.BuiltInVariables,
        name = "剧情变量",
        description = "按路径模式查找或按内容搜索剧情变量，并通过校验后的补丁更新状态",
        members = listOf(
            AgentGlobVariablesTool,
            AgentGrepVariablesTool,
            AgentReadVariablesTool,
            AgentApplyVariablePatchTool,
        ),
    ),
)
