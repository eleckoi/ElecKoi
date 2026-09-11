import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, 'package.json'))
const desktop = readJson('package.json')
const runtime = readJson('packages/dsh-runtime/package.json')
const manifest = readJson('resources/dsh/runtime-manifest.json')
const config = readFileSync(resolve(root, 'resources/dsh', manifest.composition), 'utf8')
const presetConfig = readFileSync(resolve(root, 'resources/dsh', manifest.presetComposition), 'utf8')

if (manifest.schemaVersion !== 1) throw new Error('DSH runtime manifest schemaVersion 必须为 1。')
if (manifest.transport !== 'stdio-jsonrpc') throw new Error('DSH Runtime 必须使用 stdio JSON-RPC transport。')
if (!/^[0-9a-f]{40}$/.test(manifest.upstream.commit)) {
  throw new Error('DSH upstream commit 必须固定为完整的 40 位 Git commit。')
}

const configuredPlugins = [...new Set(
  [...config.matchAll(/^\s*name:\s*['"]([^'"]+)['"]\s*$/gm)].map((match) => match[1])
)].sort()
const declaredPlugins = [...manifest.plugins, ...(manifest.localPlugins ?? [])].sort()
if (JSON.stringify(configuredPlugins) !== JSON.stringify(declaredPlugins)) {
  throw new Error([
    'runtime-manifest.json 的 plugins 与 cordis.yml 不一致。',
    `manifest: ${declaredPlugins.join(', ')}`,
    `config: ${configuredPlugins.join(', ')}`
  ].join('\n'))
}

const configuredPresetPlugins = [...new Set(
  [...presetConfig.matchAll(/^\s*name:\s*['"]([^'"]+)['"]\s*$/gm)].map((match) => match[1])
)].filter((name) => name !== 'cordis:group').sort()
const declaredPresetPlugins = [...manifest.presetPlugins].sort()
if (JSON.stringify(configuredPresetPlugins) !== JSON.stringify(declaredPresetPlugins)) {
  throw new Error([
    'runtime-manifest.json 的 presetPlugins 与预设模板不一致。',
    `manifest: ${declaredPresetPlugins.join(', ')}`,
    `config: ${configuredPresetPlugins.join(', ')}`
  ].join('\n'))
}

const dependencies = desktop.dependencies ?? {}
const runtimeSpecifiers = [...manifest.plugins, ...manifest.presetPlugins, manifest.entrypoint, '@deepseek-ai/dsh-sdk-client']
const runtimePackages = [...new Set(runtimeSpecifiers.map(packageName))].sort()
for (const name of runtimePackages) {
  const version = dependencies[name]
  if (version !== manifest.upstream.version) {
    throw new Error(`${name} 必须在 Desktop dependencies 中固定为 ${manifest.upstream.version}，当前为 ${version ?? '未声明'}。`)
  }
  const installed = require(`${name}/package.json`)
  if (installed.version !== version) {
    throw new Error(`${name} 安装版本 ${installed.version} 与声明版本 ${version} 不一致。`)
  }
}

const productionClosure = collectProductionClosure(runtimePackages)
for (const name of productionClosure) {
  const declaredVersion = dependencies[name]
  if (!declaredVersion) {
    throw new Error(`${name} 是 DSH Runtime 的必要发布依赖，必须在 Desktop dependencies 中直接声明。`)
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(declaredVersion)) {
    throw new Error(`${name} 必须使用精确版本，当前为 ${declaredVersion}。`)
  }

  const installedVersion = require(`${name}/package.json`).version
  if (installedVersion !== declaredVersion) {
    throw new Error(`${name} 安装版本 ${installedVersion} 与声明版本 ${declaredVersion} 不一致。`)
  }
  if (name.startsWith('@deepseek-ai/dsh-') && declaredVersion !== manifest.upstream.version) {
    throw new Error(`${name} 必须与 DSH Runtime 批次 ${manifest.upstream.version} 对齐。`)
  }
}

for (const specifier of [...manifest.plugins, ...manifest.presetPlugins, manifest.entrypoint]) {
  require.resolve(specifier)
}

for (const specifier of manifest.localPlugins ?? []) {
  if (!specifier.startsWith('./')) throw new Error(`本地 DSH 插件必须使用相对路径：${specifier}`)
  readFileSync(resolve(root, 'resources/dsh', specifier))
}

for (const specifier of manifest.presetLocalPlugins ?? []) {
  if (!specifier.startsWith('./')) throw new Error(`本地 DSH 预设插件必须使用相对路径：${specifier}`)
  readFileSync(resolve(root, 'resources/dsh', specifier))
}

if (runtime.dependencies?.['@deepseek-ai/dsh-sdk-client'] !== manifest.upstream.version) {
  throw new Error('@eleckoi/dsh-runtime 必须固定与 Runtime 相同版本的 dsh-sdk-client。')
}

for (const capability of [
  'streaming', 'durableSessions', 'powershell', 'filesystem', 'skills',
  'jobs', 'goals', 'subagents', 'workflows', 'compaction', 'variables',
  'settingLibrary', 'conversationContext', 'approvalAudit', 'imageInput', 'agentPresets'
]) {
  if (manifest.capabilities?.[capability] !== true) {
    throw new Error(`DSH Runtime capability 未启用：${capability}`)
  }
}

for (const nativeDependency of ['@deepseek-ai/dsh-subprocess-local', 'koffi', 'node-pty', 'sharp']) {
  if (!desktop.pnpm?.onlyBuiltDependencies?.includes(nativeDependency)) {
    throw new Error(`DSH native runtime dependency 未允许执行构建脚本：${nativeDependency}`)
  }
}

console.log(
  `DSH runtime closure check passed: ${declaredPlugins.length} plugins, `
  + `${productionClosure.length} pinned production packages, upstream ${manifest.upstream.commit.slice(0, 12)}.`
)

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'))
}

function packageName(specifier) {
  const segments = specifier.split('/')
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
}

function collectProductionClosure(roots) {
  const queue = [...roots]
  const visited = new Set()
  const required = new Set(roots)

  while (queue.length > 0) {
    const name = queue.shift()
    if (visited.has(name)) continue
    visited.add(name)

    const installed = require(`${name}/package.json`)
    for (const dependency of Object.keys(installed.dependencies ?? {})) {
      if (!dependency.startsWith('@deepseek-ai/')) continue
      required.add(dependency)
      queue.push(dependency)
    }

    for (const peer of Object.keys(installed.peerDependencies ?? {})) {
      if (installed.peerDependenciesMeta?.[peer]?.optional === true) continue
      required.add(peer)
      queue.push(peer)
    }
  }

  return [...required].sort()
}
