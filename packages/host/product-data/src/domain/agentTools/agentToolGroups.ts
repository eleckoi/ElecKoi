import type { AgentToolGroup } from '@shared/contracts/agent/tools'

const memberDescriptions: Record<string, string> = {
  eleckoi_read_setting_files: '读取设定正文，并续读或搜索本组的完整工具结果',
  eleckoi_read_variables: '读取变量，并续读或搜索本组的完整工具结果',
  eleckoi_call_capability: '执行创作操作，并续读或搜索创作能力的完整工具结果',
}

export const AGENT_TOOL_GROUPS: ReadonlyArray<Omit<AgentToolGroup, 'enabled' | 'included'>> = [
  group('builtin:mcp-resources', 'MCP 资源读取', '列出并读取 MCP 服务器提供的资源和资源模板', [
    'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'
  ]),
  group('builtin:workflow', '任务与工作流', '维护任务、目标和后台作业，并编排大规模子代理工作流', [
    'todo_write', 'get_goal', 'create_goal', 'update_goal',
    'job_output', 'job_list', 'job_kill', 'skill', 'workflow'
  ]),
  group('builtin:creator', '创作能力', '按需发现并调用角色资料、设定库与变量的创作能力', [
    'eleckoi_list_toolsets', 'eleckoi_describe_toolset', 'eleckoi_call_capability'
  ]),
  group('builtin:variables', '剧情变量', '按路径模式查找或按内容搜索剧情变量，并通过校验后的补丁更新状态', [
    'eleckoi_glob_variables', 'eleckoi_grep_variables', 'eleckoi_read_variables', 'eleckoi_apply_variable_patch'
  ]),
  group('builtin:collaboration', '多代理协作', '创建和管理并行子任务；普通角色通常不需要', [
    'subagent', 'subagent_fork', 'send_message', 'interrupt_agent', 'list_agents'
  ]),
  group('builtin:plugin-discovery', '插件发现', '发现并请求安装当前尚未启用的插件', [
    'request_plugin_install', 'list_available_plugins_to_install'
  ]),
  group('builtin:workspace', '本地工作区', '执行命令并修改角色或创作工作区中的文件', [
    'shell_command', 'bash', 'pwsh', 'read', 'edit', 'write', 'exec_command', 'write_stdin', 'apply_patch',
    'request_permissions', 'working_directory'
  ]),
  group('builtin:web', '联网搜索', '使用 DeepSeek 或 Tavily 搜索网页并读取内容', [
    'web_search', 'web_fetch'
  ]),
  group('builtin:roleplay-workflow', '角色扮演计划', '维护角色扮演专用任务计划', [
    'update_roleplay_plan'
  ]),
  group('builtin:setting-library', '角色设定库', '按需读取角色设定，并把运行时修改保存为当前对话差异', [
    'eleckoi_glob_setting_files', 'eleckoi_grep_setting_files', 'eleckoi_read_setting_files',
    'eleckoi_apply_setting_patch'
  ])
]

export const AGENT_TOOL_GROUP_IDS = new Set(AGENT_TOOL_GROUPS.map((item) => item.id))
export const AGENT_TOOL_EXPLICIT_OPT_IN = new Set(['builtin:creator'])
export const DEFAULT_AGENT_TOOL_GROUP_IDS = new Set(['builtin:variables', 'builtin:setting-library'])
export const CREATOR_AGENT_TOOL_GROUP_IDS = new Set(['builtin:creator', 'builtin:workspace', 'builtin:workflow', 'builtin:collaboration', 'builtin:web', 'builtin:plugin-discovery'])

export function agentToolGroups(enabledIds: ReadonlySet<string> = DEFAULT_AGENT_TOOL_GROUP_IDS): AgentToolGroup[] {
  return AGENT_TOOL_GROUPS.map((item) => ({
    ...item,
    members: item.members.map((member) => ({ ...member })),
    enabled: enabledIds.has(item.id),
    included: enabledIds.has(item.id)
  }))
}

function group(id: string, name: string, description: string, members: string[]): Omit<AgentToolGroup, 'enabled' | 'included'> {
  return { id, name, description, source: 'built_in', members: members.map((member) => ({ name: member, description: memberDescriptions[member] || '' })) }
}
