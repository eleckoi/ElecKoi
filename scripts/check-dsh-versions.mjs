import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifests = [
  ['desktop', readManifest('package.json')],
  ['@eleckoi/dsh-runtime', readManifest('packages/dsh-runtime/package.json')]
]
const packages = new Map()

for (const [owner, manifest] of manifests) {
  for (const section of ['dependencies', 'devDependencies']) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (!name.startsWith('@deepseek-ai/')) continue
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
        throw new Error(`${owner} 的 ${name} 必须使用精确版本，当前为 ${version}。`)
      }
      const occurrences = packages.get(name) ?? []
      occurrences.push({ owner, version })
      packages.set(name, occurrences)
    }
  }
}

const dshPackages = [...packages.entries()].filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
const batchVersions = new Set(dshPackages.flatMap(([, values]) => values.map((item) => item.version)))
if (batchVersions.size !== 1) {
  const matrix = dshPackages
    .flatMap(([name, values]) => values.map(({ owner, version }) => `${owner}: ${name}@${version}`))
    .join('\n')
  throw new Error(`DSH 包版本没有形成单一兼容批次：\n${matrix}`)
}

for (const [name, bridgeEntries] of packages) {
  const declaredVersions = new Set(bridgeEntries.map((entry) => entry.version))
  if (declaredVersions.size > 1) {
    throw new Error(`${name} 被多个 workspace package 声明时必须锁定相同版本。`)
  }
}

const [batchVersion] = batchVersions
console.log(`DSH compatibility batch is pinned and aligned: ${dshPackages.length} DSH packages @ ${batchVersion}; ${packages.size} DeepSeek packages checked.`)

function readManifest(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'))
}
