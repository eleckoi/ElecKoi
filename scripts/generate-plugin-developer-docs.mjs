import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generatePluginApiReference } from './generate-plugin-api-reference.mjs'
import { readWorkspacePackages } from './workspace-packages.mjs'
import { normalizeLineEndings } from './lib/normalize-line-endings.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(root, 'docs', 'plugins', 'api-reference.md')
const checkOnly = process.argv.includes('--check')
const allowedKinds = new Set(['ui-slot', 'service', 'event', 'contribution', 'remote'])
const allowedRelations = new Set(['provides', 'contributes'])

const runtimeManifest = JSON.parse(await readFile(join(root, 'apps', 'desktop', 'resources', 'dsh', 'runtime-manifest.json'), 'utf8'))
const manifests = new Map()

for (const { manifest, packagePath } of readWorkspacePackages(root)) {
  if (Array.isArray(manifest.eleckoi?.developerInterfaces)) {
    manifests.set(manifest.name, { manifest, packagePath })
  }
}

const bundles = runtimeManifest.desktopProfile?.bundles
const androidBundles = JSON.parse(await readFile(join(root, 'apps/android-host/src/androidPluginBundleManifest.json'), 'utf8'))
if (!Array.isArray(bundles) || bundles.length === 0) {
  throw new Error('apps/desktop/resources/dsh/runtime-manifest.json 没有 desktopProfile.bundles')
}

const rows = []
const seenIds = new Set()
for (const packageName of bundles) {
  const found = manifests.get(packageName)
  if (!found) throw new Error(`桌面 bundle ${packageName} 缺少 eleckoi.developerInterfaces`)
  for (const value of found.manifest.eleckoi.developerInterfaces) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${packageName} 包含无效开发接口条目`)
    }
    for (const field of ['id', 'kind', 'title', 'description', 'mode', 'scope', 'relation']) {
      if (typeof value[field] !== 'string' || value[field].length === 0) {
        throw new Error(`${packageName} 的开发接口缺少 ${field}`)
      }
    }
    if (!allowedKinds.has(value.kind)) throw new Error(`${value.id} 使用未知 kind: ${value.kind}`)
    if (!allowedRelations.has(value.relation)) throw new Error(`${value.id} 使用未知 relation: ${value.relation}`)
    if (seenIds.has(value.id)) throw new Error(`开发接口 ID 重复: ${value.id}`)
    seenIds.add(value.id)
    rows.push({ packageName, packagePath: found.packagePath, packageDescription: found.manifest.description ?? '', ...value })
  }
}

for (const packageName of manifests.keys()) {
  if (!bundles.includes(packageName) && !androidBundles.includes(packageName)) {
    throw new Error(`${packageName} 声明了开发接口，但不在任何应用的正式 bundle 清单中`)
  }
}

const counts = Object.fromEntries([...allowedKinds].map(kind => [kind, rows.filter(row => row.kind === kind).length]))
const lines = [
  '<!-- 此文件由 scripts/generate-plugin-developer-docs.mjs 生成，请勿手工编辑。 -->',
  '',
  '# ElecKoi 插件开发接口总表',
  '',
  `本表从桌面运行清单与各 bundle 的 \`package.json.eleckoi.developerInterfaces\` 生成。DSH 基准为 \`${runtimeManifest.upstream.version}\`，提交 \`${runtimeManifest.upstream.commit}\`。`,
  '',
  `当前共 **${bundles.length} 个 bundle、${rows.length} 个开发接口**：${counts['ui-slot']} 个界面插槽、${counts.service} 个服务、${counts.event} 个事件、${counts.contribution} 个贡献点、${counts.remote} 个 Remote 合同。`,
  '',
  '接口标题和说明用于插件中心展示；真实调用合同以对应类型导出和实现为准。完整参数、返回值和数据字段见 [Client 参考](api-client.md)、[Host 参考](api-host.md) 与 [Remote 调用声明](api-remote.md)。使用方法见 [界面插槽](ui-slots.md)、[服务接口](services.md) 与 [能力贡献](contributions.md)。',
  '',
  '## 汇总',
  '',
  '| Bundle | 界面插槽 | 服务 | 事件 | 贡献点 | Remote | 合计 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'
]

for (const packageName of bundles) {
  const own = rows.filter(row => row.packageName === packageName)
  const count = kind => own.filter(row => row.kind === kind).length
  lines.push(`| \`${packageName}\` | ${count('ui-slot')} | ${count('service')} | ${count('event')} | ${count('contribution')} | ${count('remote')} | ${own.length} |`)
}

const kindNames = {
  'ui-slot': '界面插槽',
  service: '服务',
  event: '事件',
  contribution: '贡献点',
  remote: 'Remote 合同'
}
const relationNames = { provides: '提供', contributes: '接入' }

for (const packageName of bundles) {
  const own = rows.filter(row => row.packageName === packageName)
  const packageInfo = manifests.get(packageName)
  lines.push('', `## \`${packageName}\``, '')
  if (own[0]?.packageDescription) lines.push(own[0].packageDescription, '')
  lines.push(`来源：\`${slash(relative(root, packageInfo.packagePath))}\``, '')
  lines.push('| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const row of own) {
    const detail = row.members?.length
      ? row.members.map(member => `\`${member}\``).join('、')
      : row.owner ? `所属：\`${row.owner}\`` : '—'
    lines.push(`| \`${escapeCell(row.id)}\` | ${escapeCell(row.title)} | ${kindNames[row.kind]} | ${relationNames[row.relation]} | \`${escapeCell(row.mode)}\` | \`${escapeCell(row.scope)}\` | ${escapeCell(row.description)} | ${detail} |`)
  }
}

const mobileOnly = androidBundles.filter(name => !bundles.includes(name))
if (mobileOnly.length) {
  lines.push('', '## Android 专用装配', '',
    'Android 组合清单为 `apps/android-host/src/androidPluginBundleManifest.json`。共享 bundle 使用上述相同合同，下列专用 bundle 不进入桌面运行组合。', '',
    '| Bundle | ID | 类型 | 关系 | 所属合同 |', '| --- | --- | --- | --- | --- |')
  for (const name of mobileOnly) {
    const info = manifests.get(name)
    if (!info) throw new Error(`Android bundle ${name} 缺少开发接口声明`)
    for (const row of info.manifest.eleckoi.developerInterfaces) {
      for (const field of ['id', 'kind', 'title', 'description', 'mode', 'scope', 'relation']) {
        if (typeof row[field] !== 'string' || !row[field]) throw new Error(`${name} 的开发接口缺少 ${field}`)
      }
      if (!allowedKinds.has(row.kind) || !allowedRelations.has(row.relation)) throw new Error(`${name} 的开发接口类别或关系无效`)
      lines.push(`| \`${name}\` | \`${escapeCell(row.id)}\` | ${kindNames[row.kind]} | ${relationNames[row.relation]} | \`${row.owner ?? name}\` |`)
    }
  }
}

lines.push('', '## 完整性规则', '',
  '- 桌面清单中的每个 ElecKoi bundle 必须声明 `eleckoi.developerInterfaces`。',
  '- 接口 ID 在整个桌面组合内必须唯一。',
  '- manifest 变化后必须运行 `pnpm generate:plugin-docs` 更新本表。',
  '- `pnpm check:plugin-docs` 与 `pnpm build` 会拒绝过期或不完整的总表。', '')

const generated = `${lines.join('\n').trimEnd()}\n`
const reference = await generatePluginApiReference(root, { check: checkOnly })
if (checkOnly) {
  let current = ''
  try {
    current = await readFile(outputPath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (normalizeLineEndings(current) !== generated) {
    throw new Error('插件开发接口文档已过期，请运行 pnpm generate:plugin-docs')
  }
  console.log(`Plugin developer API documentation is current: ${bundles.length} bundles, ${rows.length} interfaces, ${reference.remoteMethods} Remote methods.`)
} else {
  await writeFile(outputPath, generated, 'utf8')
  console.log(`Generated ${slash(relative(root, outputPath))}: ${bundles.length} bundles, ${rows.length} interfaces.`)
}

const references = join(root, 'packages/client/features/dsh-client-shell/skills/eleckoi-plugin-development/references')
const pluginDocs = join(root, 'docs/plugins')
const documents = (await readdir(pluginDocs)).filter(file => file.endsWith('.md')).sort()
if (!checkOnly) await mkdir(references, { recursive: true })
for (const file of documents) {
  const source = normalizeLineEndings(await readFile(join(pluginDocs, file), 'utf8'))
  const expected = `<!-- Generated from docs/plugins/${file}; run pnpm generate:plugin-docs. -->\n\n${source}`
  if (checkOnly) {
    const current = await readFile(join(references, file), 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error
      return ''
    })
    if (normalizeLineEndings(current) !== expected) throw new Error(`随包插件开发文档 ${file} 已过期，请运行 pnpm generate:plugin-docs`)
  } else {
    await writeFile(join(references, file), expected, 'utf8')
  }
}
const extras = (await readdir(references)).filter(file => !documents.includes(file))
if (extras.length) throw new Error(`随包插件开发文档包含无来源的旧文件：${extras.join(', ')}`)
console.log(`Bundled ElecKoi plugin development references are current: ${documents.length} documents.`)

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>')
}

function slash(value) {
  return value.replaceAll('\\', '/')
}
