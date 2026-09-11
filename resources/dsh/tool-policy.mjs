/** Filters DSH request declarations with the character-scoped ElecKoi tool catalog. */

export const name = 'eleckoi-tool-policy'
export const inject = ['tools']

const disabled = new Set(parseStringArray(process.env.ELECKOI_DISABLED_TOOL_GROUPS))

export function apply(ctx) {
  if (disabled.size === 0) return
  return ctx.on('agent/created', ({ agent }) => applyDisabledPolicy(agent.ctx))
}

export function applyDisabledPolicy(agentCtx) {
  if (disabled.size === 0) return
  const deniedNames = agentCtx.tools.schemas()
    .filter((declaration) => !isEssential(declaration) && disabled.has(classify(declaration)))
    .map((declaration) => declaration.name)
  if (deniedNames.length > 0) agentCtx.tools.restrict({ deny: deniedNames })
}

export function filterDeclarations(tools, disabledGroupIds) {
  const blocked = disabledGroupIds instanceof Set ? disabledGroupIds : new Set(disabledGroupIds)
  return tools.filter((declaration) => isEssential(declaration) || !blocked.has(classify(declaration)))
}

export function classify(declaration) {
  if (!declaration || typeof declaration !== 'object') return 'builtin:other'
  const type = string(declaration.type)
  if (type === 'web_search') return 'builtin:web'
  if (type === 'namespace') {
    const namespace = string(declaration.name)
    if (namespace === 'collaboration') return 'builtin:collaboration'
    if (namespace === 'web') return 'builtin:web'
    if (namespace.startsWith('mcp__')) return `mcp:${namespace.slice(5)}`
    return `extension:${namespace}`
  }
  const toolName = declarationName(declaration)
  if (toolName === 'eleckoi_web_search' || toolName === 'eleckoi_native_web_search_bridge') return 'builtin:web'
  if (SETTING_LIBRARY_TOOLS.has(toolName)) return 'builtin:setting-library'
  if (VARIABLE_TOOLS.has(toolName)) return 'builtin:variables'
  if (CREATOR_TOOLS.has(toolName)) return 'builtin:creator'
  if (WORKSPACE_TOOLS.has(toolName)) return 'builtin:workspace'
  if (WORKFLOW_TOOLS.has(toolName)) return 'builtin:workflow'
  if (ROLEPLAY_TOOLS.has(toolName)) return 'builtin:roleplay-workflow'
  if (MCP_RESOURCE_TOOLS.has(toolName)) return 'builtin:mcp-resources'
  if (PLUGIN_DISCOVERY_TOOLS.has(toolName)) return 'builtin:plugin-discovery'
  if (COLLABORATION_TOOLS.has(toolName)) return 'builtin:collaboration'
  return 'builtin:other'
}

function isEssential(declaration) {
  const toolName = declarationName(declaration)
  return toolName === 'eleckoi_capability_probe' || toolName.startsWith('eleckoi_internal_')
}

function declarationName(declaration) {
  return string(declaration?.name) || string(declaration?.function?.name)
}

function parseStringArray(raw) {
  try {
    const value = JSON.parse(raw || '[]')
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

function string(value) {
  return typeof value === 'string' ? value : ''
}

const SETTING_LIBRARY_TOOLS = new Set([
  'eleckoi_glob_setting_files', 'eleckoi_grep_setting_files', 'eleckoi_read_setting_files',
  'eleckoi_apply_setting_patch', 'eleckoi_create_setting_file', 'eleckoi_update_setting_file',
  'eleckoi_delete_setting_file', 'eleckoi_move_setting_file'
])
const VARIABLE_TOOLS = new Set([
  'eleckoi_glob_variables', 'eleckoi_grep_variables', 'eleckoi_read_variables', 'eleckoi_apply_variable_patch'
])
const CREATOR_TOOLS = new Set(['eleckoi_list_toolsets', 'eleckoi_describe_toolset', 'eleckoi_call_capability'])
const WORKSPACE_TOOLS = new Set([
  'shell_command', 'bash', 'pwsh', 'read', 'edit', 'write', 'exec_command', 'write_stdin', 'apply_patch', 'request_permissions'
])
const WORKFLOW_TOOLS = new Set([
  'update_plan', 'todo_write', 'request_user_input', 'get_goal', 'create_goal', 'update_goal',
  'get_context_remaining', 'new_context_window', 'job_output', 'job_list', 'job_kill',
  'load_skill', 'skill', 'workflow'
])
const ROLEPLAY_TOOLS = new Set(['update_roleplay_plan'])
const MCP_RESOURCE_TOOLS = new Set(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'])
const PLUGIN_DISCOVERY_TOOLS = new Set(['request_plugin_install', 'list_available_plugins_to_install'])
const COLLABORATION_TOOLS = new Set([
  'subagent', 'subagent_fork', 'spawn_agent', 'send_input', 'resume_agent', 'wait_agent', 'close_agent',
  'send_message', 'followup_task', 'interrupt_agent', 'list_agents'
])
