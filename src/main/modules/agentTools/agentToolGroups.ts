import type { AgentToolGroup } from '@shared/contracts/agent/tools'

export const AGENT_TOOL_GROUPS: ReadonlyArray<Omit<AgentToolGroup, 'enabled'>> = [
  group('builtin:mcp-resources', 'MCP 资源读取', '列出并读取 MCP 服务器提供的资源和资源模板', [
    'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'
  ]),
  group('builtin:workflow', '任务与交互', '维护任务计划，并在确有必要时向用户提问', [
    'update_plan', 'todo_write', 'request_user_input', 'get_goal', 'create_goal', 'update_goal',
    'get_context_remaining', 'new_context_window', 'job_output', 'job_list', 'job_kill', 'skill', 'workflow'
  ]),
  group('builtin:creator', '创作能力', '按需发现并调用角色创作、设定库与图片生成能力', [
    'eleckoi_list_toolsets', 'eleckoi_describe_toolset', 'eleckoi_call_capability'
  ]),
  group('builtin:variables', '剧情变量', '按路径模式查找或按内容搜索剧情变量，并通过校验后的补丁更新状态', [
    'eleckoi_glob_variables', 'eleckoi_grep_variables', 'eleckoi_read_variables', 'eleckoi_apply_variable_patch'
  ]),
  group('builtin:collaboration', '多代理协作', '创建和管理并行子任务；普通角色通常不需要', [
    'subagent', 'spawn_agent', 'send_input', 'resume_agent', 'wait_agent', 'close_agent',
    'send_message', 'followup_task', 'interrupt_agent', 'list_agents'
  ]),
  group('builtin:plugin-discovery', '插件发现', '发现并请求安装当前尚未启用的插件', [
    'request_plugin_install', 'list_available_plugins_to_install'
  ]),
  group('builtin:workspace', '本地工作区', '执行命令并修改角色或创作工作区中的文件', [
    'shell_command', 'bash', 'pwsh', 'read', 'edit', 'write', 'exec_command', 'write_stdin', 'apply_patch',
    'request_permissions'
  ]),
  group('builtin:web', '联网搜索', '使用模型原生搜索或 Tavily 外接搜索获取最新信息', [
    'web_search'
  ]),
  group('builtin:roleplay-workflow', '角色扮演计划', '维护角色扮演专用任务计划', [
    'update_roleplay_plan'
  ]),
  group('builtin:auto-illustration', '角色自动配图', '只为当前角色的回复自动生成剧情分镜', []),
  group('builtin:setting-library', '角色设定库', '按需读取角色设定，并把运行时修改保存为当前对话差异', [
    'eleckoi_glob_setting_files', 'eleckoi_grep_setting_files', 'eleckoi_read_setting_files',
    'eleckoi_apply_setting_patch'
  ])
]

export const AGENT_TOOL_GROUP_IDS = new Set(AGENT_TOOL_GROUPS.map((item) => item.id))
export const AGENT_TOOL_EXPLICIT_OPT_IN = new Set(['builtin:auto-illustration', 'builtin:creator'])
export const DEFAULT_AGENT_TOOL_GROUP_IDS = new Set(['builtin:variables', 'builtin:setting-library'])
export const ALWAYS_DISABLED_AGENT_TOOL_GROUP_IDS = ['builtin:other', 'builtin:remote-dsh']

export function agentToolGroups(enabledIds: ReadonlySet<string> = DEFAULT_AGENT_TOOL_GROUP_IDS): AgentToolGroup[] {
  return AGENT_TOOL_GROUPS.map((item) => ({
    ...item,
    members: item.members.map((member) => ({ ...member })),
    enabled: enabledIds.has(item.id)
  }))
}

function group(id: string, name: string, description: string, members: string[]): Omit<AgentToolGroup, 'enabled'> {
  return { id, name, description, source: 'built_in', members: members.map((member) => ({ name: member, description: '' })) }
}
