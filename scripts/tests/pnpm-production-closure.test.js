import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder'))
const { PnpmNodeModulesCollector } = builderRequire('app-builder-lib/out/node-module-collector/pnpmNodeModulesCollector')

it('collects a deduplicated production stub and its unprinted transitive dependency', async () => {
  const root = await mkdtemp(join(tmpdir(), 'eleckoi-production-closure-'))
  try {
    const stub = join(root, 'node_modules', 'synthetic-stub')
    const leaf = join(root, 'node_modules', 'synthetic-leaf')
    for (const [path, manifest] of [[root, { name: 'synthetic-app', version: '1.0.0', dependencies: { 'synthetic-stub': '1.0.0' } }],
      [stub, { name: 'synthetic-stub', version: '1.0.0', dependencies: { 'synthetic-leaf': '^1.0.0' } }],
      [leaf, { name: 'synthetic-leaf', version: '1.0.0' }]]) {
      await mkdir(path, { recursive: true })
      await writeFile(join(path, 'package.json'), JSON.stringify(manifest))
    }
    const tree = { name: 'synthetic-app', version: '1.0.0', path: root, dependencies: {
      'synthetic-stub': { name: 'synthetic-stub', version: '1.0.0', path: stub, deduped: true, dedupedDependenciesCount: 1 }
    } }
    const collector = new PnpmNodeModulesCollector(root, {})
    collector.getDependenciesTree = async () => { collector._allWorkspacePackages = [tree]; return tree }
    const { nodeModules, logSummary } = await collector.getNodeModules({ packageName: tree.name })
    expect(nodeModules.map(module => module.name).sort()).toEqual(['synthetic-leaf', 'synthetic-stub'])
    expect(logSummary['unresolved duplicate dependency references']).toEqual([])
    expect(logSummary['cannot find path for dependency']).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
