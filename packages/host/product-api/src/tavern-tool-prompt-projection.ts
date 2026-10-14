import type { Agent } from '@deepseek-ai/dsh-agent'
import { RUN_CODE_NAME, renderToolsSdk, renderToolsSdkPy } from '@deepseek-ai/dsh-tools'
import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'

/**
 * DSH 0.2.0-rc.2 materializes tool providers before its asynchronous assembly
 * waterfall. Refresh this callback owner's declarations and the native generated
 * SDK after registering them, using only the public registry/codegen APIs.
 * The documented tools:ptc-only/tools:sdk sections retain the native mode choice.
 */
export function refreshTavernToolPrompt(agent: Agent, assembly: PromptAssembly,
  previous: ReadonlySet<string>, current: ReadonlySet<string>): void {
  const registry = agent.ctx.tools
  const visible = registry.schemas(agent)
  const ptcOnly = assembly.sections.some(section => section.name === 'tools:ptc-only' && section.text.length > 0)
  const declarations = ptcOnly ? [] : visible.filter(schema => current.has(schema.name))
  const replacements = new Map(declarations.map(schema => [schema.name, schema]))
  assembly.tools = assembly.tools.flatMap(schema => {
    const replacement = replacements.get(schema.name)
    replacements.delete(schema.name)
    return replacement ? [replacement] : previous.has(schema.name) ? [] : [schema]
  })
  assembly.tools.push(...replacements.values())

  const sdk = assembly.sections.find(section => section.name === 'tools:sdk' && section.text.length > 0)
  if (!sdk) return
  const schemas = visible.filter(schema => schema.name !== RUN_CODE_NAME).map(schema => {
    const definition = registry.get(schema.name, agent)
    if (!definition) throw new Error(`The native tool disappeared during SDK projection: ${schema.name}`)
    return { ...schema, output: structuredClone(definition.output.schema) }
  })
  const runtime = agent.ctx.get('ptcRuntime') as { language: string } | undefined
  if (runtime?.language === 'typescript') sdk.text = renderToolsSdk(schemas)
  else if (runtime?.language === 'python') sdk.text = renderToolsSdkPy(schemas)
  else throw new Error(`The native PTC SDK has no renderer for ${runtime?.language ?? 'an unmounted runtime'}.`)
  sdk.interpolate = false
}
