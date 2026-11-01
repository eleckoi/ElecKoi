import { z } from 'zod'

export const agentToolGroupSourceSchema = z.enum(['built_in', 'mcp', 'extension'])

export const agentToolMemberSchema = z.object({
  name: z.string().min(1),
  description: z.string()
})

export const agentToolGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  source: agentToolGroupSourceSchema,
  members: z.array(agentToolMemberSchema),
  enabled: z.boolean(),
  included: z.boolean(),
  available: z.boolean().optional(),
  plugin: z.object({ id: z.string().min(1), name: z.string().min(1) }).optional()
})

/** Portable references use the exact public DSH tool name, independent of display labels. */
export const pluginToolGroupSchema = agentToolGroupSchema.refine(group => group.source === 'extension'
  && group.members.length === 1 && group.id === `plugin-tool:${group.members[0]!.name}`)

export function isPluginToolGroup(group: AgentToolGroup): boolean {
  return pluginToolGroupSchema.safeParse(group).success
}

export function portablePluginToolGroups(groups: AgentToolGroup[]): AgentToolGroup[] {
  return groups.filter(group => group.included && isPluginToolGroup(group)).map(({ available: _available, ...group }) => group)
}

export const agentToolCatalogSchema = z.object({
  characterId: z.string().min(1),
  scopeId: z.string().min(1),
  groups: z.array(agentToolGroupSchema)
})

export type AgentToolGroup = z.infer<typeof agentToolGroupSchema>
export type AgentToolCatalog = z.infer<typeof agentToolCatalogSchema>
