interface ToolReference {
  id: string
  name: string
  description: string
  source: 'built_in' | 'mcp' | 'extension'
  members: Array<{ name: string; description: string }>
  included: boolean
  enabled: boolean
  available?: boolean
  plugin?: { id: string; name: string }
}
interface ToolDeclaration {
  name?: string
  description?: string
  type?: string
  function?: { name?: string }
}
interface ToolPolicyContext {
  tools: { schemas(): ToolDeclaration[]; restrict(filter: { deny: string[] }): () => void }
  on(event: 'tools/change', listener: () => void): () => void
}
export function applyDisabledPolicy(agentCtx: ToolPolicyContext, disabledGroupIds?: string[], registryTools?: Pick<ToolPolicyContext['tools'], 'schemas'>): void
export function classify(declaration: ToolDeclaration): string | undefined
export function filterDeclarations<T extends ToolDeclaration>(tools: T[], disabledGroupIds: string[] | Set<string>): T[]
export function withPluginTools<T extends { toolGroups: ToolReference[] }>(preset: T, declarations: ToolDeclaration[], plugins?: Map<string, { id: string; name: string }>): T & { extraToolGroups: ToolReference[] }
