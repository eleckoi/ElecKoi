import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

/** Assemble the declared Creator composition with product data access and policies. */
export function creatorComposition(document, product, disabledIds) {
  const declared = load(document.content, { schema: entryListSchema })
  if (!Array.isArray(declared)) throw new Error('Creator preset must declare a plugin list')
  const disabled = new Set(disabledIds)
  const additions = new Map(product.map(plugin => [plugin.id, plugin]))
  const groups = new Map([
    ['tool-bash', 'builtin:workspace'], ['tool-pwsh', 'builtin:workspace'],
    ['tool-fs', 'builtin:workspace'], ['tool-fs-search', 'builtin:workspace'],
    ['tool-plugin-manager', 'builtin:plugin-discovery'], ['tool-plugin-market', 'builtin:plugin-discovery'],
    ['tool-web', 'builtin:web'], ['tool-subagent-control', 'builtin:collaboration'],
    ['tool-subagent-list-agents', 'builtin:collaboration'], ['tool-subagent', 'builtin:collaboration'],
    ['tool-subagent-fork', 'builtin:collaboration'], ['workflow-ptc', 'builtin:workflow'],
    ['tool-workflow', 'builtin:workflow'], ['tool-todo', 'builtin:workflow'],
    ['tool-jobs', 'builtin:workflow'], ['command-goal', 'builtin:workflow'], ['tool-goal', 'builtin:workflow'],
  ])
  const visit = plugins => plugins.flatMap(plugin => {
    if (plugin.id === 'persona' || plugin.id === 'tool-schedule') return []
    if (disabled.has(groups.get(plugin.id))) return []
    if (plugin.id === 'compaction' || plugin.id === 'agent-instructions') {
      const replacement = additions.get(plugin.id)
      if (!replacement) throw new Error(`Creator product composition is missing ${plugin.id}`)
      return [replacement]
    }
    return [{ ...plugin, ...(Array.isArray(plugin.config) ? { config: visit(plugin.config) } : {}) }]
  })
  return [...visit(declared), ...product.filter(plugin => ['uploaded-file-tools', 'fs-observation-policy', 'creator-studio-agent'].includes(plugin.id))]
}
