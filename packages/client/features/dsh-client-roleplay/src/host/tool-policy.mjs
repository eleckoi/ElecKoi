/** Restricts preset-owned tool groups; other tools retain their DSH registration policy. */

export const name = 'eleckoi-tool-policy'
export const inject = ['tools']
const activeRestrictions = new WeakMap()

export function apply(ctx) {
  return undefined
}

export function applyDisabledPolicy(agentCtx, disabledGroupIds = [], registryTools) {
  activeRestrictions.get(agentCtx)?.()
  activeRestrictions.delete(agentCtx)
  const disabled = new Set(disabledGroupIds)
  if (disabled.size === 0) return
  const initialNames = agentCtx.tools.schemas()
    .filter((declaration) => !isEssential(declaration) && disabled.has(classify(declaration)))
    .map((declaration) => declaration.name)
  const globalNames = new Set(registryTools?.schemas().map(declaration => declaration.name) ?? initialNames)
  const scopedNames = initialNames.filter(toolName => !globalNames.has(toolName))
  const releaseScoped = scopedNames.length ? agentCtx.tools.restrict({ deny: scopedNames }) : undefined
  let release, currentKey = '', updating = false
  const refresh = () => {
    if (updating) return
    const declarations = registryTools?.schemas()
    const names = declarations ? declarations
      .filter(declaration => !isEssential(declaration) && disabled.has(classify(declaration)))
      .map(declaration => declaration.name) : initialNames
    const key = JSON.stringify([...names].sort())
    if (key === currentKey) return
    currentKey = key
    updating = true
    try {
      release?.()
      release = names.length ? agentCtx.tools.restrict({ deny: names }) : undefined
    } finally { updating = false }
  }
  refresh()
  const stop = registryTools ? agentCtx.on('tools/change', refresh) : undefined
  activeRestrictions.set(agentCtx, () => { stop?.(); release?.(); releaseScoped?.() })
}

export function filterDeclarations(tools, disabledGroupIds) {
  const blocked = disabledGroupIds instanceof Set ? disabledGroupIds : new Set(disabledGroupIds)
  return tools.filter((declaration) => isEssential(declaration) || !blocked.has(classify(declaration)))
}

export function classify(declaration) {
  if (!declaration || typeof declaration !== 'object') return undefined
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
  if (toolName === 'web_search' || toolName === 'web_fetch' || toolName === 'eleckoi_web_search' || toolName === 'eleckoi_native_web_search_bridge') return 'builtin:web'
  if (SETTING_LIBRARY_TOOLS.has(toolName)) return 'builtin:setting-library'
  if (VARIABLE_TOOLS.has(toolName)) return 'builtin:variables'
  if (CREATOR_TOOLS.has(toolName)) return 'builtin:creator'
  if (WORKSPACE_TOOLS.has(toolName)) return 'builtin:workspace'
  if (WORKFLOW_TOOLS.has(toolName)) return 'builtin:workflow'
  if (ROLEPLAY_TOOLS.has(toolName)) return 'builtin:roleplay-workflow'
  if (MCP_RESOURCE_TOOLS.has(toolName)) return 'builtin:mcp-resources'
  if (PLUGIN_DISCOVERY_TOOLS.has(toolName)) return 'builtin:plugin-discovery'
  if (COLLABORATION_TOOLS.has(toolName)) return 'builtin:collaboration'
  return toolName ? `plugin-tool:${toolName}` : undefined
}

/** Registry metadata is runtime-only; the preset stores portable tool references. */
export function withPluginTools(preset, declarations, plugins = new Map()) {
  const referencedNames = new Set(preset.toolGroups.filter(group => group.included).flatMap(group => group.members.map(member => member.name)))
  const registered = new Map(declarations
    .filter(declaration => !isEssential(declaration) && classify(declaration)?.startsWith('plugin-tool:'))
    .map(declaration => [classify(declaration), declaration]))
  const groups = preset.toolGroups.map(group => {
    if (!group.id.startsWith('plugin-tool:')) return group
    const plugin = plugins.get(group.members[0]?.name)
    return { ...group, available: registered.has(group.id), ...(plugin ? { plugin } : {}) }
  })
  const extraToolGroups = []
  for (const [id, declaration] of registered) if (!referencedNames.has(declaration.name)) extraToolGroups.push({
    id, name: declaration.name, description: declaration.description || '', source: 'extension',
    members: [{ name: declaration.name, description: declaration.description || '' }],
    included: false, enabled: true, available: true,
    ...(plugins.has(declaration.name) ? { plugin: plugins.get(declaration.name) } : {})
  })
  return { ...preset, toolGroups: groups, extraToolGroups }
}

function isEssential(declaration) {
  const toolName = declarationName(declaration)
  return toolName === 'eleckoi_capability_probe'
    || toolName === 'run_code'
    || toolName === 'eleckoi_read_uploaded_file'
    || toolName.startsWith('eleckoi_internal_')
}

function declarationName(declaration) {
  return string(declaration?.name) || string(declaration?.function?.name)
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
  'shell_command', 'bash', 'pwsh', 'read', 'edit', 'write', 'exec_command', 'write_stdin', 'apply_patch', 'request_permissions', 'working_directory'
])
const WORKFLOW_TOOLS = new Set([
  'todo_write', 'get_goal', 'create_goal', 'update_goal',
  'job_output', 'job_list', 'job_kill', 'skill', 'workflow',
  'schedule_create', 'schedule_list', 'schedule_view', 'schedule_edit'
])
const ROLEPLAY_TOOLS = new Set(['update_roleplay_plan'])
const MCP_RESOURCE_TOOLS = new Set(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'])
const PLUGIN_DISCOVERY_TOOLS = new Set(['request_plugin_install', 'list_available_plugins_to_install'])
const COLLABORATION_TOOLS = new Set([
  'subagent', 'subagent_fork', 'send_message', 'interrupt_agent', 'list_agents'
])
