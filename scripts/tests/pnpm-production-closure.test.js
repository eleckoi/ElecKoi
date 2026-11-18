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

it.each(['x64', 'arm64'])('filters installed optional binaries for the actual Windows %s target', async cpu => {
  const root = await mkdtemp(join(tmpdir(), 'eleckoi-production-target-'))
  try {
    const manifests = {
      'synthetic-win-x64': { os: ['win32'], cpu: ['x64'] },
      'synthetic-win-arm64': { os: ['win32'], cpu: ['arm64'] },
      'synthetic-linux-x64': { os: ['linux'], cpu: ['x64'] },
      'synthetic-linux-arm64': { os: ['linux'], cpu: ['arm64'] },
      'synthetic-js': {},
      'synthetic-negated': { os: ['!darwin'], cpu: ['!ia32'] },
    }
    const dependencies = Object.fromEntries(Object.keys(manifests).map(name => [name, '1.0.0']))
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'synthetic-app', version: '1.0.0', dependencies }))
    const tree = { name: 'synthetic-app', version: '1.0.0', path: root, dependencies: {} }
    for (const [name, fields] of Object.entries(manifests)) {
      const path = join(root, 'node_modules', name)
      await mkdir(path, { recursive: true })
      await writeFile(join(path, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...fields }))
      tree.dependencies[name] = { name, version: '1.0.0', path }
    }
    const collector = new PnpmNodeModulesCollector(root, {})
    collector.getDependenciesTree = async () => { collector._allWorkspacePackages = [tree]; return tree }
    const { nodeModules, logSummary } = await collector.getNodeModules({ packageName: tree.name, archFilter: { cpu, os: 'win32' } })
    expect(nodeModules.map(module => module.name).sort()).toEqual(['synthetic-js', 'synthetic-negated', `synthetic-win-${cpu}`])
    expect(logSummary['dependencies excluded for incompatible target cpu/os']).toHaveLength(3)
    expect(logSummary['dependency not found on disk']).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
