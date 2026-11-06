import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { load, dump } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { describe, expect, it } from 'vitest'
import { creatorComposition } from '../../src/host/composition.mjs'
import { ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

const require = createRequire(import.meta.url)
const patch = load(readFileSync(require.resolve('@deepseek-ai/dsh-web-app/presets/cordis.patch.yml'), 'utf8'), { schema: entryListSchema })
const official = patch[0].insert[0].config.plugins
const document = { content: dump(official, { schema: entryListSchema, noRefs: true }) }
const product = [
  { id: 'compaction', name: 'cordis:group', config: [{ id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic', config: { retainTokens: 0 } }] },
  { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: Number.MAX_SAFE_INTEGER } },
  { id: 'creator-studio-agent', name: '@eleckoi/dsh-client-creator-studio/agent', config: { presetId: 'synthetic-global', creatorTools: true } },
  { id: 'uploaded-file-tools', name: 'eleckoi:agent-preset/uploaded-file-tools' },
]

describe('Creator composition', () => {
  it.each(['', 'plugins: {}'])('reports an invalid declared plugin list with a product code', content => {
    let failure
    try { creatorComposition({ content }, product, []) } catch (error) { failure = error }
    expect(failure).toMatchObject({ code: ELECKOI_FAILURE_CODES.dataShapeInvalid,
      message: 'Creator preset must declare a plugin list', details: { what: '创作预设的插件列表' } })
  })
  it.each(['compaction', 'agent-instructions'])('identifies the missing required product plugin %s', id => {
    let failure
    try { creatorComposition(document, product.filter(plugin => plugin.id !== id), []) } catch (error) { failure = error }
    expect(failure).toMatchObject({ code: ELECKOI_FAILURE_CODES.lookupNotFound,
      message: `Creator product composition is missing ${id}`, details: { what: `创作预设必需插件 ${id}` } })
  })
  it('retains the locked Creator development and skill capabilities beside product authoring', () => {
    const plugins = creatorComposition(document, product, [])
    const ids = plugins.map(row => row.id)
    for (const id of ['tool-cordis', 'tool-plugin-manager', 'tool-plugin-market', 'tool-fs', 'tool-fs-search', 'tool-pwsh', 'tool-bash', 'skill-filesystem', 'tool-skill', 'present', 'creator-studio-agent', 'uploaded-file-tools']) expect(ids).toContain(id)
    expect(ids).not.toContain('persona')
    expect(ids).toContain('tool-schedule')
    expect(plugins.find(row => row.id === 'skill-filesystem')).toEqual(official.find(row => row.id === 'skill-filesystem'))
    expect(plugins.find(row => row.id === 'tool-pwsh').disabled).toEqual(official.find(row => row.id === 'tool-pwsh').disabled)
    expect(plugins.find(row => row.id === 'compaction')).toEqual(product[0])
    expect(plugins.filter(row => row.id === 'creator-studio-agent')).toHaveLength(1)
  })
  it('honors independently disabled groups without removing plugin development or creator instructions', () => {
    const plugins = creatorComposition(document, product, ['builtin:workspace', 'builtin:collaboration', 'builtin:workflow', 'builtin:web'])
    const flattened = plugins.flatMap(row => [row.id, ...(Array.isArray(row.config) ? row.config.map(child => child.id) : [])])
    for (const id of ['tool-fs', 'tool-pwsh', 'tool-bash', 'tool-subagent', 'workflow-ptc', 'tool-web', 'tool-schedule']) expect(flattened).not.toContain(id)
    expect(flattened).toContain('tool-cordis')
    expect(flattened).toContain('creator-studio-agent')
  })
})
