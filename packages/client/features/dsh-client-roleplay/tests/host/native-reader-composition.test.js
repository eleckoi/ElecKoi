import { describe, expect, it } from 'vitest'
import { runtimePresetDefinition } from '../../src/host/preset-definition.mjs'
import { filterDeclarations } from '../../src/host/tool-policy.mjs'

describe('native reader ownership', () => {
  it('replaces a retired generated reader before plugin resolution without loading its removed module', () => {
    const definition = { id: 'eleckoi-active', plugins: [{ id: 'uploaded-file-tools', name: 'file:///old-install/uploaded-file-tools.mjs' }] }
    const next = runtimePresetDefinition(definition)
    expect(next.plugins).toEqual([{ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config: { read: true, readImage: true, write: false, edit: false, applyPatch: false } }])
    expect(definition.plugins).toHaveLength(1)
    expect(definition.plugins[0].id).toBe('uploaded-file-tools')
  })
  it('keeps a configured native reader once and preserves explicit native write configuration', () => {
    const native = { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config: { write: true, edit: true, applyPatch: true } }
    expect(runtimePresetDefinition({ id: 'eleckoi-creator-active', plugins: [native] }).plugins).toEqual([native])
  })
  it('keeps native readers visible while disabling command and mutation tools', () => {
    const declarations = ['read', 'read_image', 'write', 'edit', 'apply_patch', 'pwsh', 'bash'].map(name => ({ name }))
    expect(filterDeclarations(declarations, ['builtin:workspace'])).toEqual([{ name: 'read' }, { name: 'read_image' }])
  })
})
