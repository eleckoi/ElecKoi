import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import {
  WorkspaceAnalyzer, CordisCatalogProjector, TypeGraphRenderer,
  FaceModelEmitter, renderPageRegion
} from '@deepseek-ai/dsh-typert-generator'

const require = createRequire(import.meta.url)
const ts = createRequire(require.resolve('@deepseek-ai/dsh-typert-generator'))('typescript')

const foundationTypes = new Set([
  'Promise', 'AsyncIterable', 'AsyncIterator', 'Iterator', 'Array', 'ReadonlyArray',
  'Record', 'Readonly', 'Partial', 'Pick', 'Omit', 'Map', 'Set', 'Date', 'Error',
  'AbortSignal', 'File', 'Blob', 'T', 'K', 'V', 'U', 'S'
])
const privateHostServices = new Map([
  ['eleckoiProductData', 'SQLite 唯一写入者和内部准备数据。'],
  ['eleckoiConversationChanges', '产品 Remote 拥有的通知发布器。'],
  ['eleckoiCharacterConfigurationChanges', '产品 Remote 拥有的配置通知发布器。'],
  ['eleckoiProductRecordChanges', '产品 Remote 拥有的目录通知发布器。']
])

export function assertMembers(label, actual, expected) {
  const missing = expected.filter(name => !actual.includes(name))
  const unlisted = actual.filter(name => !expected.includes(name))
  if (missing.length || unlisted.length) {
    throw new Error(`${label} 成员不一致；缺少：${missing.join(', ') || '无'}；未登记：${unlisted.join(', ') || '无'}`)
  }
}

export async function generatePluginApiReference(root, { check = false } = {}) {
  const runtime = JSON.parse(await readFile(resolve(root, 'apps/desktop/resources/dsh/runtime-manifest.json'), 'utf8'))
  const upstream = `https://github.com/deepseek-ai/deepseek-harness/blob/${runtime.upstream.commit}`
  const manifests = []
  for (const entry of await readdir(resolve(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = resolve(root, 'packages', entry.name, 'package.json')
    const content = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (content === null) continue
    const manifest = JSON.parse(content)
    if (runtime.desktopProfile.bundles.includes(manifest.name)) {
      manifests.push({ root: `packages/${entry.name}`, ...manifest })
    }
  }
  const rows = manifests.flatMap(manifest => (manifest.eleckoi?.developerInterfaces ?? [])
    .map(row => ({ packageName: manifest.name, packageRoot: manifest.root, ...row })))
  const analyzer = new WorkspaceAnalyzer({ root, checkDiagnostics: false })
  const workspace = analyzer.analyze()
  const sources = analyzer.indexSourceDeclarations()
  const artifacts = new Map()
  const models = new Map()
  const selectedFaces = new Map()

  for (const original of workspace.faces) {
    const renderer = new TypeGraphRenderer(original.graph)
    const publicRows = rows.filter(row => row.kind === 'service' && row.scope === original.face)
    const services = original.packages.flatMap(pkg => pkg.services)
    for (const service of services) {
      if (!publicRows.some(row => row.id === service.key)
        && !original.packages.some(pkg => pkg.invocations.some(call => call.service === service.key))
        && !(original.face === 'host' && privateHostServices.has(service.key))) {
        throw new Error(`ctx.${service.key} 没有登记公开用途，也没有明确的内部服务归属`)
      }
    }
    for (const row of publicRows) {
      if (row.id === 'layout') continue
      const service = services.find(candidate => candidate.key === row.id)
      if (!service) throw new Error(`${row.packageName} 的 ctx.${row.id} 缺少公开 Cordis 类型声明`)
      const members = service.members.map(id => renderer.member(id))
        .filter(member => member.visibility === 'public' && !member.static && !internal(member))
      const callable = members.filter(member => member.kind === 'method')
      assertMembers(`ctx.${row.id}`, callable.map(member => member.name), row.members ?? [])
      if (original.face === 'client' && row.id !== 'layout') {
        await checkClientImplementation(root, row, callable)
      }
    }

    const selected = { ...original, packages: original.packages.map(pkg => ({ ...pkg,
      services: pkg.services.filter(service => original.face === 'client'
        ? publicRows.some(row => row.id === service.key)
        : pkg.invocations.some(call => call.service === service.key) || publicRows.some(row => row.id === service.key))
        .map(service => ({ ...service, members: service.members.filter(id => {
          const member = renderer.member(id)
          return !internal(member) && (original.face === 'client'
            ? true : pkg.invocations.some(call => call.service === service.key && call.method === member.name)
              || publicRows.some(row => row.id === service.key && row.members.includes(member.name)))
        }) })),
      events: []
    })) }
    selectedFaces.set(original.face, selected)
    const memberIds = selected.packages.flatMap(pkg => pkg.services.flatMap(service => service.members))
    const closure = renderer.declarationClosureForMembers(memberIds)
    const ownTypes = closure.filter(type => type.location.file.startsWith('packages/'))
    const typePage = `types-${original.face}.md`
    const links = Object.fromEntries(ownTypes.map(type => [type.name, `${typePage}#${type.name.toLowerCase()}`]))
    const exemptions = Object.fromEntries(closure.filter(type => !type.location.file.startsWith('packages/'))
      .map(type => [type.name, `${upstream}/docs/subsystems/README.zh.md`]))
    exemptions.Session = `${upstream}/packages/core/session/src/index.ts`
    exemptions.GenerateOptions = `${upstream}/packages/llm/llm/src/types.ts`
    const policy = { linkedTypePages: links, foundationTypeNames: foundationTypes,
      typeLinkExemptions: exemptions, inheritedServices: [], inheritedEvents: [] }
    const projector = new CordisCatalogProjector(selected, sources.filter(source => source.face === original.face), policy)
    const model = projector.project()
    models.set(original.face, model)
    const banner = `<!-- 由 pnpm generate:plugin-docs 使用锁定的 DSH 官方生成器生成，请勿手工修改。 -->\n\n`
    const header = `${banner}# ${original.face === 'host' ? 'Host' : 'Client'} 完整服务参考\n\nDSH 基准：\`${runtime.upstream.version}\`，提交 \`${runtime.upstream.commit}\`。\n\n`
    let region = renderPageRegion(`api-${original.face}.md`, model.services, [], policy)
    region = region.split('\n').map(line => line.startsWith('Generated from source by ')
      ? '由公开源码和 JSDoc 生成。用 `pnpm generate:plugin-docs` 更新，用 `pnpm check:plugin-docs` 核对。Cordis 生命周期和依赖用法见 [服务接口](services.md)。'
      : line).join('\n')
    const inherited = original.face === 'client'
      ? `\n\n## 官方布局服务\n\n\`ctx.layout\` 直接复用 [官方 ILayout 合同](${upstream}/packages/client/ui-layout/src/client/service.ts)，类型从 \`@eleckoi/dsh-client-shell/client\` 或 \`@deepseek-ai/dsh-client-ui-layout/client\` 导入。官方 Client 的 \`Service\` Inspect provider 已提供 \`api({ key: "layout" })\`，无需重复注册。桌面当前的 \`toggleSidebar\` 为空操作。\n`
      : ''
    artifacts.set(`docs/plugins/api-${original.face}.md`, header + region + inherited + '\n')
    const typeLines = [banner.trim(), '', `# ${original.face === 'host' ? 'Host' : 'Client'} 接口引用的数据类型`, '',
      '以下声明由官方 TypeGraphRenderer 从公开方法引用的类型生成。类型应从对应公开包入口导入，完整设定字段保留在原有结构中。', '']
    const seenTypes = new Map()
    for (const type of ownTypes.sort((a, b) => a.name.localeCompare(b.name))) {
      const declaration = renderer.renderDeclaration(type.id)
      if (seenTypes.has(type.name)) {
        if (seenTypes.get(type.name) !== declaration) throw new Error(`公开类型重名：${type.name}`)
        continue
      }
      seenTypes.set(type.name, declaration)
      typeLines.push(`## ${type.name}`, '', '```ts', declaration, '```', '',
        `源码：[${type.location.file}:${type.location.line}](../../${type.location.file}#L${type.location.line})`, '')
    }
    if (Object.keys(exemptions).length) {
      typeLines.push('## 官方和平台类型', '',
        '官方类型从其对应的 DSH 公开包入口导入；平台类型使用 TypeScript 标准库。', '',
        `[锁定版本的官方接口目录](${upstream}/docs/subsystems/README.zh.md)`, '',
        Object.keys(exemptions).sort().map(name => `\`${name}\``).join('、'), '')
    }
    artifacts.set(`docs/plugins/${typePage}`, typeLines.join('\n') + '\n')
    const runtimePath = original.face === 'host' ? 'src/cordisApi.generated.ts' : 'src/client/cordisApi.generated.ts'
    artifacts.set(`packages/dsh-product-api/${runtimePath}`, projector.renderRuntimeApi(model)
      .replace(/^\/\*\*[\s\S]*?\*\//, '/** 由 pnpm generate:plugin-docs 生成。公开服务的只读目录，与完整参考使用同一份源码分析结果。 */'))
  }

  const host = selectedFaces.get('host')
  const invocations = host.packages.flatMap(pkg => pkg.invocations)
  for (const namespace of new Set(invocations.map(call => call.namespace))) {
    const declared = rows.filter(row => row.kind === 'remote' && row.owner === namespace).flatMap(row => row.members ?? [])
    assertMembers(`ctx.remote.${namespace}`, invocations.filter(call => call.namespace === namespace).map(call => call.method), declared)
  }
  for (const row of rows.filter(row => row.kind === 'remote')) {
    if (!row.owner || !invocations.some(call => call.namespace === row.owner)) throw new Error(`${row.id} 缺少真实 Remote namespace`)
  }
  const remote = new FaceModelEmitter(host).emit('@eleckoi/dsh-product-api').remote
  if (!remote) throw new Error('官方生成器未生成产品 Remote 声明')
  const directory = [...new Set(invocations.map(call => call.namespace))].sort().map(namespace => ({
    namespace, hostService: invocations.find(call => call.namespace === namespace).service,
    methods: invocations.filter(call => call.namespace === namespace).map(call => ({ name: call.method, mode: call.mode }))
  }))
  artifacts.set('packages/dsh-product-api/src/client/remoteApi.generated.ts',
    '/** 由 pnpm generate:plugin-docs 生成。Remote 调用声明直接使用官方 Host-for-Client 生成结果。 */\n'
    + `export const REMOTE_API = ${JSON.stringify(directory, null, 2)} as const\n`
    + `export const REMOTE_DECLARATION = ${JSON.stringify(remote.dts)}\n`)
  artifacts.set('docs/plugins/api-remote.md',
    '<!-- 由 pnpm generate:plugin-docs 使用 DSH 官方 Host-for-Client 生成器生成，请勿手工修改。 -->\n\n'
    + '# 完整 Remote 调用声明\n\n从 `@eleckoi/dsh-product-api/remote` 导入类型贡献，在 Client 中通过 `ctx.remote` 调用；装配及错误处理见 [DSH Remote](remote.md)。下列声明直接由 Host 的 `@Remote` 生成，包含真实参数、`RemoteResult` 和 `RemoteStreamHandle`。\n\n'
    + directory.map(row => `- \`ctx.remote.${row.namespace}\`：${row.methods.map(method => `\`${method.name}\``).join('、')}`).join('\n')
    + '\n\n```ts\n' + remote.dts + '```\n\n数据字段见 [Host 数据类型](types-host.md)。\n')
  const stale = []
  for (const [path, content] of artifacts) {
    const normalized = content.replaceAll('\r\n', '\n')
    const generated = path.endsWith('.md') ? normalized.trimEnd() + '\n' : normalized
    const absolute = resolve(root, path)
    if (check) {
      const current = await readFile(absolute, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error })
      if (current !== generated) stale.push(path)
    } else await writeFile(absolute, generated, 'utf8')
  }
  if (stale.length) throw new Error(`完整插件 API 参考已过期，请运行 pnpm generate:plugin-docs：\n${stale.join('\n')}`)
  return { hostServices: models.get('host').services.length, clientServices: models.get('client').services.length,
    namespaces: directory.length, remoteMethods: invocations.length, files: artifacts.size }
}

function internal(member) {
  return member.tags?.some(tag => tag.name === 'internal') || /@internal\b/.test(member.jsDoc ?? '')
}

async function checkClientImplementation(root, row, members) {
  let plugin
  const services = new Map()
  const react = { lazy: () => () => null, createElement: () => null }
  const assetsBaseUrl = 'https://eleckoi.invalid/probe/'
  const document = { createElement: () => ({}), head: { appendChild: script => queueMicrotask(() => script.onload()) } }
  const window = { document, location: { href: assetsBaseUrl }, __ModuleLoader__: { load: entry => { plugin = entry.factory(name => {
    if (name === 'react') return react
    throw new Error(`接口探针不支持执行依赖：${name}`)
  }) } } }
  const source = ts.createSourceFile('client.js', await readFile(resolve(root, row.packageRoot, 'src/client.js'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const transformed = ts.transform(source, [context => {
    const visit = node => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      ? ts.factory.updateCallExpression(node, ts.factory.createIdentifier('__probeImport'), node.typeArguments, node.arguments)
      : ts.visitEachChild(node, visit, context)
    return node => ts.visitNode(node, visit)
  }])
  const probe = ts.createPrinter().printFile(transformed.transformed[0])
  transformed.dispose()
  vm.runInNewContext(probe, {
    window, document, URL, AbortController, AbortSignal, console,
    __probeImport: specifier => {
      if (row.packageName !== '@eleckoi/dsh-client-tavern-shared' || specifier !== assetsBaseUrl + 'client/runtime.js') {
        throw new Error(`接口探针没有登记浏览器模块：${specifier}`)
      }
      return import(pathToFileURL(resolve(root, row.packageRoot, 'src/runtime.js')).href)
    }
  }, { filename: `${row.packageRoot}/src/client.js`, timeout: 1000 })
  await plugin.apply({ remote: { eleckoiAuthorPlugins: { capabilities: async () => ({ ok: true, value: { assetsBaseUrl } }) } },
    eleckoiConversations: { getDetailsSnapshot: () => ({ id: null }) },
    provide: (key, value) => services.set(key, value), effect: () => {}, on: () => () => {},
    slots: { inject: () => {}, entriesOfSlot: () => [], subscribe: () => () => {} } })
  const service = services.get(row.id)
  if (!service) throw new Error(`实现没有提供 ctx.${row.id}`)
  for (const member of members) {
    if (typeof service[member.name] !== 'function') throw new Error(`实现没有提供 ctx.${row.id}.${member.name}`)
    if (service[member.name].length > member.signature.parameters.length) {
      throw new Error(`ctx.${row.id}.${member.name} 的声明缺少实现中的参数`)
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  console.log(await generatePluginApiReference(root, { check: process.argv.includes('--check') }))
}
