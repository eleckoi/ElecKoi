import { describe, expect, it } from 'vitest'
import { decodePortableScriptLibrary } from '../src/domain/scripts/scriptLibraryImport'

const trees = [{ type: 'script', id: 'synthetic-script', name: 'Synthetic script', enabled: true,
  content: 'export default () => {};', data: {}, button: { enabled: false, buttons: [] } }]

describe('portable script library switches', () => {
  it.each([true, false])('preserves the explicitly saved library switch: %s', enabled => {
    expect(decodePortableScriptLibrary({ trees, variables: {}, enabled })).toMatchObject({ enabled, trees })
  })

  it('enables the imported library when its container omits the switch, preserving authored item switches', () => {
    const mixed = [...trees, { ...trees[0], id: 'synthetic-disabled-script', enabled: false }]
    expect(decodePortableScriptLibrary({ trees: mixed })).toMatchObject({ enabled: true, trees: mixed })
  })

  it.each([null, 0, 1, 'true', 'false'])('rejects malformed switches instead of silently changing them: %j', enabled => {
    expect(() => decodePortableScriptLibrary({ trees, enabled })).toThrow()
  })
})
