import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { isDshRuntimeImport, isForbiddenRendererDshImport, moduleImports } from './architecture-imports.mjs'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '..')
const failures = []
const reviewNotices = []
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])
const nativeSourceManifest = JSON.parse(readFileSync(join(root, 'apps/desktop/src/main/platform/electron/dsh/capabilities.provenance.json'), 'utf8'))
const nativeSources = new Set(nativeSourceManifest.files.map(file => resolve(root, file.path)))
for (const file of nativeSourceManifest.files) {
  const contents = readFileSync(resolve(root, file.path), 'utf8').replaceAll('\r\n', '\n')
  if (createHash('sha256').update(contents).digest('hex') !== file.localSha256) {
    failures.push(`原生桌面来源记录与实现不一致：${file.path}`)
  }
}
const pureDesktopProtocols = new Set([
  '@deepseek-ai/dsh-client-shortcuts/protocol', '@deepseek-ai/dsh-client-ui-file-actions/types',
  '@deepseek-ai/dsh-client-ui-sidebar-browser/types', '@deepseek-ai/dsh-util-file-drag'
])
function withoutDesktopTypeImports(content) {
  return content.replace(/^import\s+type\s+[^;]*?\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    (declaration, name) => pureDesktopProtocols.has(name) ? '' : declaration)
}

function sourceFiles(path) {
  const absolute = join(root, path)
  if (!existsSync(absolute)) return []
  const result = []
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(absolute, entry.name)
    if (entry.isDirectory() && !['node_modules', 'dist', 'lib', 'out'].includes(entry.name)) result.push(...sourceFiles(relative(root, child)))
    else if (sourceExtensions.has(extname(entry.name))) result.push(child)
  }
  return result
}

function assertClosedSet(path, allowedDirectories, allowedFiles) {
  const absolute = join(root, path)
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && !allowedDirectories.has(entry.name)) {
      failures.push(`${path} 出现未授权顶层目录：${entry.name}`)
    }
    if (entry.isFile() && !allowedFiles.has(entry.name)) {
      failures.push(`${path} 出现未授权顶层文件：${entry.name}`)
    }
  }
}

function forbidImports(path, patterns, description) {
  for (const file of sourceFiles(path)) {
    const content = withoutDesktopTypeImports(readFileSync(file, 'utf8'))
    if (patterns.some((pattern) => pattern.test(content))) {
      failures.push(`${relative(root, file)} ${description}`)
    }
  }
}

for (const path of ['apps', 'packages']) {
  forbidImports(path, [/['"]react-markdown(?:\/[^'"]*)?['"]/, /\bReactMarkdown\b/],
    '禁止恢复 ReactMarkdown；文字渲染必须使用 Client 装配的官方组件。')
}
const rendererDependencies = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  if (Object.hasOwn(rendererDependencies[key] ?? {}, 'react-markdown')) {
    failures.push('package.json 禁止恢复 react-markdown 依赖。')
  }
}

assertClosedSet(
  'apps/desktop/src/main',
  new Set(['host', 'i18n', 'modules', 'platform']),
  new Set(['main.ts'])
)
assertClosedSet('packages/shared/src', new Set(['contracts', 'foundation']), new Set())
assertClosedSet('packages', new Set(['client', 'host', 'shared', 'sdk', 'compatibility', 'examples']), new Set(['README.md']))
assertClosedSet('packages/client', new Set(['features', 'mobile']), new Set())
assertClosedSet('packages/host', new Set(['product-api', 'product-data', 'runtime', 'web-search-tavily', 'web-deepseek']), new Set())
assertClosedSet('apps/desktop/src/preload', new Set(), new Set(['preload.ts', 'windowsMenu.ts', 'windowsAppearance.ts', 'nativeCapabilities.ts', 'updateDialog.ts']))
assertClosedSet(
  'apps/web/src',
  new Set(['app', 'assets', 'mobile', 'modules', 'ui', 'utils']),
  new Set(['main.jsx', 'env.d.ts'])
)

forbidImports(
  'apps/web/src',
  [
    /from\s+['"]electron['"]/,
    /from\s+['"]node:/,
    /from\s+['"]better-sqlite3['"]/,
    /from\s+['"]drizzle-orm/,
    /from\s+['"]@eleckoi\/(?:dsh-runtime|desktop-host)['"]/
  ],
  '违反 Renderer 只能通过 DSH Client 服务或明确的 Electron 壳适配访问桌面能力的边界。'
)
for (const file of sourceFiles('apps/web/src')) {
  if (moduleImports(readFileSync(file, 'utf8'), file).some(isForbiddenRendererDshImport)) {
    failures.push(`${relative(root, file)} 直接依赖了非公开 Renderer UI 包；Host 与 SDK 能力必须通过 DSH Client 服务调用。`)
  }
}
forbidImports(
  'apps/desktop/src/main',
  [/from\s+['"]@renderer(?:\/|['"])/, /from\s+['"][^'"]*renderer\//],
  '违反 Main 不得导入 Renderer 的边界。'
)
forbidImports(
  'apps/desktop/src/preload',
  [
    /from\s+['"]@renderer(?:\/|['"])/,
    /from\s+['"][^'"]*renderer\//,
    /from\s+['"]@main(?:\/|['"])/,
    /from\s+['"][^'"]*main\//,
    /from\s+['"]@deepseek-ai\//,
    /from\s+['"]@eleckoi\/(?:dsh-runtime|desktop-host)['"]/
  ],
  '违反 Preload 只能依赖 Electron 与 Shared Contract 的边界。'
)
forbidImports(
  'packages/shared/src',
  [
    /from\s+['"]electron['"]/,
    /from\s+['"]node:/,
    /from\s+['"]better-sqlite3['"]/,
    /from\s+['"]drizzle-orm/,
    /from\s+['"]@deepseek-ai\//,
    /from\s+['"]@eleckoi\//
  ],
  '违反 Shared 只能保存跨进程合同与纯逻辑的边界。'
)
forbidImports(
  'apps/desktop/src/main/platform',
  [/from\s+['"]@main\/modules(?:\/|['"])/],
  '违反 Platform Adapter 不得反向依赖业务模块的边界。'
)

const mainModulesRoot = join(root, 'apps/desktop/src/main/modules')
const mainModuleDependencies = new Map()
for (const entry of readdirSync(mainModulesRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !existsSync(join(mainModulesRoot, entry.name, 'index.ts'))) {
    failures.push(`apps/desktop/src/main/modules/${entry.name} 缺少唯一公开入口 index.ts。`)
  }
}
for (const file of sourceFiles('apps/desktop/src/main/modules')) {
  const normalized = relative(mainModulesRoot, file).split(sep).join('/')
  const ownModule = normalized.split('/')[0]
  const content = readFileSync(file, 'utf8')
  const dependencies = mainModuleDependencies.get(ownModule) ?? new Set()
  mainModuleDependencies.set(ownModule, dependencies)
  for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1]
    let importedPath
    if (specifier.startsWith('@main/modules/')) {
      importedPath = specifier.slice('@main/modules/'.length)
    } else if (specifier.startsWith('.')) {
      const targetRelative = relative(mainModulesRoot, resolve(dirname(file), specifier))
      if (targetRelative.startsWith(`..${sep}`) || targetRelative === '..') continue
      importedPath = targetRelative.split(sep).join('/')
    } else {
      continue
    }
    const [importedModule, ...insideModule] = importedPath.split('/')
    if (!importedModule || importedModule === ownModule) continue
    dependencies.add(importedModule)
    if (insideModule.length > 0 && !/^index(?:\.[a-z]+)?$/i.test(insideModule.join('/'))) {
      failures.push(`${relative(root, file)} 必须通过 ${importedModule}/index.ts 使用跨模块公开接口。`)
    }
  }
}

function assertAcyclicModules(dependencies, label) {
  const visiting = new Set()
  const visited = new Set()
  function visit(moduleName, path = []) {
    if (visiting.has(moduleName)) {
      const start = path.indexOf(moduleName)
      failures.push(`${label} 出现循环依赖：${[...path.slice(start), moduleName].join(' -> ')}`)
      return
    }
    if (visited.has(moduleName)) return
    visiting.add(moduleName)
    for (const dependency of dependencies.get(moduleName) ?? []) visit(dependency, [...path, moduleName])
    visiting.delete(moduleName)
    visited.add(moduleName)
  }
  for (const moduleName of dependencies.keys()) visit(moduleName)
}
assertAcyclicModules(mainModuleDependencies, 'Main 业务模块')

const productDataDomainRoot = join(root, 'packages/host/product-data/src/domain')
const productDataDependencies = new Map()
for (const entry of readdirSync(productDataDomainRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !existsSync(join(productDataDomainRoot, entry.name, 'index.ts'))) {
    failures.push(`packages/host/product-data/src/domain/${entry.name} 缺少唯一公开入口 index.ts。`)
  }
}
for (const file of sourceFiles('packages/host/product-data/src/domain')) {
  const normalized = relative(productDataDomainRoot, file).split(sep).join('/')
  const ownModule = normalized.split('/')[0]
  const content = readFileSync(file, 'utf8')
  const dependencies = productDataDependencies.get(ownModule) ?? new Set()
  productDataDependencies.set(ownModule, dependencies)
  for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1]
    let importedPath
    if (specifier.startsWith('@product-data/domain/')) {
      importedPath = specifier.slice('@product-data/domain/'.length)
    } else if (specifier.startsWith('.')) {
      const targetRelative = relative(productDataDomainRoot, resolve(dirname(file), specifier))
      if (targetRelative.startsWith(`..${sep}`) || targetRelative === '..') continue
      importedPath = targetRelative.split(sep).join('/')
    } else {
      continue
    }
    const [importedModule, ...insideModule] = importedPath.split('/')
    if (!importedModule || importedModule === ownModule) continue
    dependencies.add(importedModule)
    if (insideModule.length > 0 && !/^index(?:\.[a-z]+)?$/i.test(insideModule.join('/'))) {
      failures.push(`${relative(root, file)} 必须通过 ${importedModule}/index.ts 使用跨领域公开接口。`)
    }
  }
}
assertAcyclicModules(productDataDependencies, 'DSH Host 产品数据领域')

const exclusiveTableOwners = new Map([
  ['chatSessions', 'conversations'],
  ['chatSessionCharacterSnapshots', 'conversations'],
  ['chatSessionModelSettings', 'conversations'],
  ['agentConversations', 'conversations'],
  ['agentBranches', 'conversations'],
  ['agentBranchTurns', 'conversations'],
  ['agentTurns', 'conversations'],
  ['agentResponses', 'conversations'],
  ['agentContentParts', 'conversations'],
  ['conversationSpeakers', 'conversations'],
  ['chatSessionVariableStates', 'conversations'],
  ['conversationSettingChanges', 'settingLibraries'],
  ['agentPresetState', 'agentPresets'],
  ['agentPresetLibraryGroups', 'agentPresets'],
  ['agentPresets', 'agentPresets'],
  ['agentPresetContents', 'agentPresets'],
  ['agentPresetGroups', 'agentPresets'],
  ['agentPresetEntries', 'agentPresets'],
  ['agentPresetVersions', 'agentPresets'],
  ['agentPresetVersionContents', 'agentPresets'],
  ['agentPresetVersionGroups', 'agentPresets'],
  ['agentPresetVersionEntries', 'agentPresets']
])
const exclusiveSqlTableOwners = new Map([
  ['chat_sessions', 'conversations'],
  ['chat_session_character_snapshots', 'conversations'],
  ['chat_session_model_settings', 'conversations'],
  ['agent_conversations', 'conversations'],
  ['agent_branches', 'conversations'],
  ['agent_branch_turns', 'conversations'],
  ['agent_turns', 'conversations'],
  ['agent_responses', 'conversations'],
  ['conversation_state_snapshots', 'conversations'],
  ['conversation_speakers', 'conversations'],
  ['chat_session_variable_states', 'conversations'],
  ['conversation_setting_changes', 'settingLibraries'],
  ['agent_preset_state', 'agentPresets'],
  ['agent_preset_library_groups', 'agentPresets'],
  ['agent_presets', 'agentPresets'],
  ['agent_preset_contents', 'agentPresets'],
  ['agent_preset_groups', 'agentPresets'],
  ['agent_preset_entries', 'agentPresets'],
  ['agent_preset_versions', 'agentPresets'],
  ['agent_preset_version_contents', 'agentPresets'],
  ['agent_preset_version_groups', 'agentPresets'],
  ['agent_preset_version_entries', 'agentPresets']
])

for (const file of sourceFiles('packages/host/product-data/src/domain')) {
  const normalized = relative(productDataDomainRoot, file).split(sep).join('/')
  const ownModule = normalized.split('/')[0]
  const content = readFileSync(file, 'utf8')
  for (const match of content.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]@product-data\/storage\/sqlite\/schema\/common['"]/g)) {
    const importedNames = match[1].split(',').map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean)
    for (const importedName of importedNames) {
      const owner = exclusiveTableOwners.get(importedName)
      if (owner && owner !== ownModule) {
        failures.push(`${relative(root, file)} 直接访问了 ${owner} 模块拥有的数据表 ${importedName}；请通过该模块的 index.ts 公开窄接口。`)
      }
    }
  }
  for (const [tableName, owner] of exclusiveSqlTableOwners) {
    if (owner !== ownModule && new RegExp(`\\b${tableName}\\b`, 'i').test(content)) {
      failures.push(`${relative(root, file)} 直接使用了 ${owner} 模块拥有的 SQL 表 ${tableName}；请通过该模块公开窄接口。`)
    }
  }
}

const rendererModulesRoot = join(root, 'apps/web/src/modules')
const rendererModuleDependencies = new Map()
for (const entry of readdirSync(rendererModulesRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !existsSync(join(rendererModulesRoot, entry.name, 'index.js'))) {
    failures.push(`apps/web/src/modules/${entry.name} 缺少唯一公开入口 index.js。`)
  }
}
for (const file of sourceFiles('apps/web/src/modules')) {
  const normalized = relative(rendererModulesRoot, file).split(sep).join('/')
  const ownModule = normalized.split('/')[0]
  const content = readFileSync(file, 'utf8')
  const dependencies = rendererModuleDependencies.get(ownModule) ?? new Set()
  rendererModuleDependencies.set(ownModule, dependencies)

  for (const match of content.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const specifier = match[1]
    let importedPath
    if (specifier.startsWith('@renderer/modules/')) {
      importedPath = specifier.slice('@renderer/modules/'.length)
    } else if (specifier.startsWith('.')) {
      const target = resolve(dirname(file), specifier)
      const targetRelative = relative(rendererModulesRoot, target)
      if (targetRelative.startsWith(`..${sep}`) || targetRelative === '..') continue
      importedPath = targetRelative.split(sep).join('/')
    } else {
      continue
    }

    const [importedModule, ...insideModule] = importedPath.split('/')
    if (!importedModule || importedModule === ownModule) continue
    dependencies.add(importedModule)
    if (!/^index(?:\.[a-z]+)?$/i.test(insideModule.join('/'))) {
      failures.push(`${relative(root, file)} 必须通过 ${importedModule}/index 使用跨 Renderer 业务模块的公开接口。`)
    }
  }
}

assertAcyclicModules(rendererModuleDependencies, 'Renderer 业务模块')

for (const file of sourceFiles('apps/web/src/app')) {
  const content = readFileSync(file, 'utf8')
  for (const match of content.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const specifier = match[1]
    if (!specifier.startsWith('.')) continue
    const target = resolve(dirname(file), specifier)
    const targetRelative = relative(rendererModulesRoot, target)
    if (targetRelative.startsWith(`..${sep}`) || targetRelative === '..') continue
    const [, ...insideModule] = targetRelative.split(sep)
    if (!/^index(?:\.[a-z]+)?$/i.test(insideModule.join('/'))) {
      failures.push(`${relative(root, file)} 必须通过业务模块的 index 公开入口进行组合。`)
    }
  }
}

for (const file of [...sourceFiles('apps/web/src/app'), ...sourceFiles('apps/web/src/modules')]) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).length
  if (lines > 600) {
    reviewNotices.push(`${relative(root, file)} 达到 ${lines} 行；请人工确认它仍围绕单一职责保持高内聚。行数本身不要求拆分。`)
  }
}

const productSources = ['apps/desktop/src', 'apps/web/src', 'packages/shared/src'].flatMap(sourceFiles)
for (const file of productSources) {
  const content = readFileSync(file, 'utf8')
  if (/\bDesktopGateway\b|\bdesktopGateway\b|\bwindow\.eleckoi\b|eleckoi\.desktop\.request|DESKTOP_REQUEST_CHANNEL/.test(content)) {
    failures.push(`${relative(root, file)} 恢复了已删除的 Desktop Gateway 业务桥；跨 Host/Client 产品调用必须使用 DSH Remote。`)
  }
  if (!file.startsWith(join(root, 'apps/desktop/src/preload') + sep) && /\bipcRenderer\b/.test(content)) {
    failures.push(`${relative(root, file)} 在 Preload 之外直接使用 ipcRenderer。`)
  }
  if (/\blocalStorage\b|\bsessionStorage\b/.test(content)) {
    failures.push(`${relative(root, file)} 使用浏览器临时存储；产品状态必须由 DSH Host 所有的正式存储合同持久化。`)
  }
}

const dshHostComposition = join(root, 'apps/desktop/src/main/host/dshHostPlugin.ts')
for (const file of productSources) {
  const content = readFileSync(file, 'utf8')
  if (moduleImports(withoutDesktopTypeImports(content), file).some(isDshRuntimeImport)
    && file !== dshHostComposition && !nativeSources.has(file)) {
    failures.push(`${relative(root, file)} 绕过了 Desktop Host 组合根；产品侧不得直接依赖 DSH Runtime。`)
  }
}
const dshRuntimeExports = JSON.parse(readFileSync(join(root, 'packages/host/runtime/package.json'), 'utf8')).exports
for (const file of [...sourceFiles('packages/host/runtime/src'), ...sourceFiles('apps/desktop-host/src')]) {
  const content = readFileSync(file, 'utf8')
  const invalidSubpath = [...content.matchAll(/['"]@eleckoi\/dsh-runtime\/([^'"\s]+)['"]/g)]
    .some(([, name]) => !Object.hasOwn(dshRuntimeExports, `./${name}`))
  if (/packages[\\/]dsh-runtime[\\/]src/.test(content) || invalidSubpath) {
    failures.push(`${relative(root, file)} 绕过了 @eleckoi/dsh-runtime 的公开入口。`)
  }
}

for (const obsolete of ['src', 'resources', 'electron.vite.config.ts', 'electron-builder.yml', 'vite.dsh.config.mjs']) {
  if (existsSync(join(root, obsolete))) failures.push(obsolete + ' 不得恢复为根目录桌面工程；应用入口和资源必须由 apps 下的应用拥有。')
}
const desktopManifest = JSON.parse(readFileSync(join(root, 'apps/desktop/package.json'), 'utf8'))
if (desktopManifest.name !== 'eleckoi-desktop' || desktopManifest.version !== rendererDependencies.version) {
  failures.push('桌面应用必须保持既有名称和版本身份，工作区与桌面版本必须一致。')
}
if (reviewNotices.length > 0) {
  console.warn(reviewNotices.map((notice) => `- 架构复核提示：${notice}`).join('\n'))
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('Architecture check passed: DSH Remote is enforced and the legacy Desktop Gateway remains removed.')
}
