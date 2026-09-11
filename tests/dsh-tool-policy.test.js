import { describe, expect, it } from 'vitest'
import { classify, filterDeclarations } from '../resources/dsh/tool-policy.mjs'

describe('DSH character tool policy', () => {
  it('classifies Android tool groups and keeps internal probes', () => {
    expect(classify({ type: 'function', function: { name: 'eleckoi_read_variables' } })).toBe('builtin:variables')
    expect(classify({ type: 'function', function: { name: 'pwsh' } })).toBe('builtin:workspace')
    expect(classify({ type: 'function', function: { name: 'skill' } })).toBe('builtin:workflow')
    expect(classify({ type: 'function', function: { name: 'workflow' } })).toBe('builtin:workflow')
    expect(classify({ type: 'namespace', name: 'collaboration', tools: [] })).toBe('builtin:collaboration')
    expect(classify({ type: 'web_search' })).toBe('builtin:web')
    expect(classify({ type: 'function', function: { name: 'future_tool' } })).toBe('builtin:other')

    expect(filterDeclarations([
      { type: 'function', function: { name: 'eleckoi_read_variables' } },
      { type: 'function', function: { name: 'eleckoi_read_setting_files' } },
      { type: 'function', function: { name: 'future_tool' } },
      { type: 'function', function: { name: 'eleckoi_internal_probe' } }
    ], new Set(['builtin:variables', 'builtin:other']))).toEqual([
      { type: 'function', function: { name: 'eleckoi_read_setting_files' } },
      { type: 'function', function: { name: 'eleckoi_internal_probe' } }
    ])
  })
})
