import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { dshBundleAssets, verifyDshBundleAssets } from '../dsh-bundle-assets.mjs'

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'eleckoi-bundle-assets-'))
  try {
    const source = join(root, 'source'), packaged = join(root, 'packaged')
    for (const directory of [source, packaged]) {
      await mkdir(join(directory, 'lib'), { recursive: true })
      await writeFile(join(directory, 'package.json'), JSON.stringify({ name: '@test/author',
        exports: { './client': { default: './lib/client.js' } },
        dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } } }))
      await writeFile(join(directory, 'cordis.patch.yml'), 'plugins: {}')
      await writeFile(join(directory, 'lib/client.js'), 'export const inject = []')
    }
    await run(source, packaged)
  } finally { await rm(root, { recursive: true, force: true }) }
}

describe('packaged bundle assets', () => {
  it('accepts a native author bundle with no locale directory', async () => {
    await fixture(async (source, packaged) => {
      const assets = await dshBundleAssets(source)
      await expect(verifyDshBundleAssets(packaged, assets)).resolves.toBeUndefined()
    })
  })

  it('rejects a package that omits a source dictionary', async () => {
    await fixture(async (source, packaged) => {
      await mkdir(join(source, 'locale'))
      await writeFile(join(source, 'locale/zh.json'), '{}')
      await expect(verifyDshBundleAssets(packaged, await dshBundleAssets(source)))
        .rejects.toMatchObject({ code: 'ENOENT' })
    })
  })

  it('rejects a missing client entry before packaging', async () => {
    await fixture(async (source) => {
      await rm(join(source, 'lib/client.js'))
      await expect(dshBundleAssets(source)).rejects.toMatchObject({ code: 'ENOENT' })
    })
  })

  it('rejects a package that includes its skill but omits the nested development references', async () => {
    await fixture(async (source, packaged) => {
      for (const directory of [source, packaged]) {
        await mkdir(join(directory, 'skills/development/references'), { recursive: true })
        await writeFile(join(directory, 'skills/development/SKILL.md'), '# Development')
      }
      await writeFile(join(source, 'skills/development/references/api.md'), '# API')
      const assets = await dshBundleAssets(source)
      await expect(verifyDshBundleAssets(packaged, assets)).rejects.toMatchObject({ code: 'ENOENT' })
      await writeFile(join(packaged, 'skills/development/references/api.md'), '# API')
      await expect(verifyDshBundleAssets(packaged, assets)).resolves.toBeUndefined()
    })
  })
})
