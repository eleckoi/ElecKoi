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
  included: z.boolean().optional()
})

export const agentToolCatalogSchema = z.object({
  characterId: z.string().min(1),
  scopeId: z.string().min(1),
  groups: z.array(agentToolGroupSchema)
})

export type AgentToolGroup = z.infer<typeof agentToolGroupSchema>
export type AgentToolCatalog = z.infer<typeof agentToolCatalogSchema>
