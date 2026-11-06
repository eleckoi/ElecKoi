import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { OPTIONAL_BUNDLES } from '@deepseek-ai/dsh-official-bundles'
import { dshBundleAssets } from './dsh-bundle-assets.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, 'package.json'))
const desktop = readJson('apps/desktop/package.json')
const workspace = parseYaml(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8'))
const runtime = readJson('packages/host/runtime/package.json')
const manifest = readJson('apps/desktop/resources/dsh/runtime-manifest.json')
const builderConfig = readFileSync(resolve(root, 'apps/desktop/electron-builder.yml'), 'utf8')
const config = readFileSync(resolve(root, 'apps/desktop/resources/dsh', manifest.composition), 'utf8')
const presetConfig = readFileSync(resolve(root, 'apps/desktop/resources/dsh', manifest.presetComposition), 'utf8')
const packagedRuntimeProbe = readFileSync(resolve(root, 'scripts/verify-packaged-dsh-runtime.mjs'), 'utf8')
const sdkServerSource = readFileSync(require.resolve('@deepseek-ai/dsh-sdk-jsonrpc-server'), 'utf8')

for (const bundle of OPTIONAL_BUNDLES) {
  if (runtime.dependencies?.[bundle] !== manifest.upstream.version
    || desktop.dependencies?.[bundle] !== manifest.upstream.version) {
    throw new Error(`${bundle} 必须由桌面安装和 Host 以锁定版本携带。`)
  }
}

if (manifest.schemaVersion !== 1) throw new Error('DSH runtime manifest schemaVersion 必须为 1。')
if (manifest.transport !== 'authenticated-web-host') throw new Error('DSH 桌面对话必须使用当前 Web Host 运行路径。')
if (manifest.compositionRole !== 'sdk-compatibility') {
  throw new Error('cordis.yml 必须明确标为 SDK 兼容组合，不能冒充桌面对话主路径。')
}
if (manifest.desktopProfile?.name !== 'desktop' || manifest.desktopProfile.base !== 'web') {
  throw new Error('DSH 桌面 profile 必须基于官方 Web 组合。')
}
if (!manifest.desktopProfile.bundles?.includes('@eleckoi/dsh-client-roleplay')
  || !manifest.desktopProfile.bundles?.includes('@eleckoi/dsh-client-display-preferences')
  || !manifest.desktopProfile.bundles?.includes('@eleckoi/dsh-web-search-tavily')
  || !manifest.desktopProfile.bundles?.includes('@eleckoi/dsh-product-api')) {
  throw new Error('DSH 桌面 profile 缺少 ElecKoi 角色、产品 Remote 或联网搜索组合包。')
}
readFileSync(resolve(root, 'apps/desktop/resources/dsh', manifest.desktopProfile.agentPatch))
const developerInterfaceIds = new Set()
const developerInterfaceKinds = new Set(['ui-slot', 'service', 'event', 'contribution', 'remote'])
const developerInterfaceRelations = new Set(['provides', 'contributes'])
for (const bundle of manifest.desktopProfile.bundles) {
  if (desktop.dependencies?.[bundle] !== 'workspace:*'
    || (bundle !== runtime.name && runtime.dependencies?.[bundle] !== 'workspace:*')) {
    throw new Error(`${bundle} 必须由桌面运行时携带。`)
  }
  const bundleManifest = require(`${bundle}/package.json`)
  await dshBundleAssets(dirname(require.resolve(`${bundle}/package.json`)))
  if (!bundleManifest.dsh?.bundle?.patch) throw new Error(`${bundle} 未声明 DSH 组合包。`)
  const developerInterfaces = bundleManifest.eleckoi?.developerInterfaces
  if (!Array.isArray(developerInterfaces) || developerInterfaces.length === 0) {
    throw new Error(`${bundle} 未声明公开开发接口。`)
  }
  for (const contract of developerInterfaces) {
    if (!contract || typeof contract.id !== 'string' || !contract.id
      || typeof contract.title !== 'string' || !contract.title
      || typeof contract.description !== 'string' || !contract.description
      || typeof contract.mode !== 'string' || !contract.mode
      || typeof contract.scope !== 'string' || !contract.scope
      || !developerInterfaceKinds.has(contract.kind)
      || !developerInterfaceRelations.has(contract.relation)) {
      throw new Error(`${bundle} 含有无效的公开开发接口声明。`)
    }
    if (developerInterfaceIds.has(contract.id)) throw new Error(`公开开发接口 ID 重复：${contract.id}`)
    developerInterfaceIds.add(contract.id)
    if (contract.members !== undefined
      && (!Array.isArray(contract.members) || contract.members.some(member => typeof member !== 'string' || !member))) {
      throw new Error(`${bundle} 的开发接口 ${contract.id} 含有无效成员。`)
    }
    if (contract.relation === 'contributes' && (typeof contract.owner !== 'string' || !contract.owner)) {
      throw new Error(`${bundle} 的能力接入 ${contract.id} 未声明所属扩展点。`)
    }
  }
}
const productApiManifest = require('@eleckoi/dsh-product-api/package.json')
if (!productApiManifest.exports?.['./typert'] || !productApiManifest.exports?.['./remote']) {
  throw new Error('@eleckoi/dsh-product-api 必须同时导出 Host Typert 与 Remote Client contribution。')
}
if (!/^[0-9a-f]{40}$/.test(manifest.upstream.commit)) {
  throw new Error('DSH upstream commit 必须固定为完整的 40 位 Git commit。')
}
if (!builderConfig.includes("- '!node_modules/pnpm/**/*'")) {
  throw new Error('electron-builder 必须排除 app.asar 内重复的 pnpm Runtime。')
}
if (!/^\s*- from: node_modules\/pnpm\s*$[\s\S]*?^\s*to: dsh\/pnpm\s*$/m.test(builderConfig)) {
  throw new Error('electron-builder 必须把唯一的 pnpm Runtime 发布到 apps/desktop/resources/dsh/pnpm。')
}
for (const [option, leaf] of [
  ['productDatabasePath', 'product.sqlite'],
  ['productMediaRoot', 'media']
]) {
  const escapedLeaf = leaf.replace('.', '\\.')
  const pattern = new RegExp(`${option}\\s*:\\s*join\\(pluginRoot,\\s*['\"]${escapedLeaf}['\"]\\)`)
  if (!pattern.test(packagedRuntimeProbe)) {
    throw new Error(`打包态 DSH Host 探针必须提供 ${option}，避免安装包生成后才发现产品数据路径缺失。`)
  }
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
  readFileSync(resolve(root, 'apps/desktop/resources/dsh', specifier))
}

for (const specifier of manifest.localModules ?? []) {
  if (!specifier.startsWith('./')) throw new Error(`本地 DSH 支持模块必须使用相对路径：${specifier}`)
  readFileSync(resolve(root, 'apps/desktop/resources/dsh', specifier))
}

for (const specifier of manifest.presetLocalPlugins ?? []) {
  if (!specifier.startsWith('./')) throw new Error(`本地 DSH 预设插件必须使用相对路径：${specifier}`)
  readFileSync(resolve(root, 'apps/desktop/resources/dsh', specifier))
}

if (runtime.dependencies?.['@deepseek-ai/dsh-sdk-client'] !== manifest.upstream.version) {
  throw new Error('@eleckoi/dsh-runtime 必须固定与 Runtime 相同版本的 dsh-sdk-client。')
}

if (!sdkServerSource.includes('ctx.on("agent/assistant-stream"')
  || !sdkServerSource.includes('this.transport.notify("agent.assistant-stream"')) {
  throw new Error('DSH SDK Runtime 必须把官方 agent/assistant-stream 实时帧转发给 Desktop。')
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
  if (!workspace.onlyBuiltDependencies?.includes(nativeDependency)) {
    throw new Error(`DSH native runtime dependency 未允许执行构建脚本：${nativeDependency}`)
  }
}

console.log(
  `DSH desktop Web Host manifest check passed: ${manifest.desktopProfile.bundles.length} ElecKoi bundles; `
  + `SDK compatibility composition ${declaredPlugins.length} plugins; `
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
