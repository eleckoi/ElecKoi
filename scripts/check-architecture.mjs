import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const failures = []
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

function sourceFiles(path) {
  const absolute = join(root, path)
  if (!existsSync(absolute)) return []
  const result = []
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(absolute, entry.name)
    if (entry.isDirectory()) result.push(...sourceFiles(relative(root, child)))
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
    const content = readFileSync(file, 'utf8')
    if (patterns.some((pattern) => pattern.test(content))) {
      failures.push(`${relative(root, file)} ${description}`)
    }
  }
}

assertClosedSet(
  'src/main',
  new Set(['gateway', 'host', 'i18n', 'modules', 'platform']),
  new Set(['main.ts'])
)
assertClosedSet('src/shared', new Set(['contracts', 'foundation']), new Set())
assertClosedSet('src/preload', new Set(), new Set(['preload.ts']))
assertClosedSet(
  'src/renderer/src',
  new Set(['app', 'assets', 'bridge', 'modules', 'ui', 'utils']),
  new Set(['main.jsx', 'env.d.ts'])
)

forbidImports(
  'src/renderer',
  [
    /from\s+['"]electron['"]/,
    /from\s+['"]node:/,
    /from\s+['"]better-sqlite3['"]/,
    /from\s+['"]drizzle-orm/,
    /from\s+['"]@deepseek-ai\//,
    /from\s+['"]@eleckoi\/dsh-runtime['"]/
  ],
  '违反 Renderer 只能通过 Desktop Gateway 访问桌面能力的边界。'
)
forbidImports(
  'src/main',
  [/from\s+['"]@renderer(?:\/|['"])/, /from\s+['"][^'"]*renderer\//],
  '违反 Main 不得导入 Renderer 的边界。'
)
forbidImports(
  'src/preload',
  [
    /from\s+['"]@renderer(?:\/|['"])/,
    /from\s+['"][^'"]*renderer\//,
    /from\s+['"]@main(?:\/|['"])/,
    /from\s+['"][^'"]*main\//,
    /from\s+['"]@deepseek-ai\//,
    /from\s+['"]@eleckoi\/dsh-runtime['"]/
  ],
  '违反 Preload 只能依赖 Electron 与 Shared Contract 的边界。'
)
forbidImports(
  'src/shared',
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
  'src/main/platform',
  [/from\s+['"]@main\/modules(?:\/|['"])/],
  '违反 Platform Adapter 不得反向依赖业务模块的边界。'
)

const mainModulesRoot = join(root, 'src/main/modules')
const mainModuleDependencies = new Map()
for (const entry of readdirSync(mainModulesRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !existsSync(join(mainModulesRoot, entry.name, 'index.ts'))) {
    failures.push(`src/main/modules/${entry.name} 缺少唯一公开入口 index.ts。`)
  }
}
for (const file of sourceFiles('src/main/modules')) {
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
  ['roleplayRichHeights', 'conversations'],
  ['generationAttempts', 'agent'],
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
  ['agent_content_parts', 'conversations'],
  ['conversation_speakers', 'conversations'],
  ['roleplay_rich_heights', 'conversations'],
  ['generation_attempts', 'agent'],
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

for (const file of sourceFiles('src/main/modules')) {
  const normalized = relative(mainModulesRoot, file).split(sep).join('/')
  const ownModule = normalized.split('/')[0]
  const content = readFileSync(file, 'utf8')
  for (const match of content.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]@main\/platform\/sqlite\/schema\/common['"]/g)) {
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

const rendererModulesRoot = join(root, 'src/renderer/src/modules')
const rendererModuleDependencies = new Map()
for (const entry of readdirSync(rendererModulesRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !existsSync(join(rendererModulesRoot, entry.name, 'index.js'))) {
    failures.push(`src/renderer/src/modules/${entry.name} 缺少唯一公开入口 index.js。`)
  }
}
for (const file of sourceFiles('src/renderer/src/modules')) {
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

for (const file of sourceFiles('src/renderer/src/app')) {
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

for (const file of [...sourceFiles('src/renderer/src/app'), ...sourceFiles('src/renderer/src/modules')]) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).length
  if (lines > 600) {
    failures.push(`${relative(root, file)} 达到 ${lines} 行；请按状态、视图或业务职责拆分，避免重新形成巨型文件。`)
  }
}

for (const file of sourceFiles('src')) {
  const content = readFileSync(file, 'utf8')
  if (!file.startsWith(join(root, 'src/preload') + sep) && /\bipcRenderer\b/.test(content)) {
    failures.push(`${relative(root, file)} 在 Preload 之外直接使用 ipcRenderer。`)
  }
  if (/\blocalStorage\b|\bsessionStorage\b/.test(content)) {
    failures.push(`${relative(root, file)} 使用浏览器临时存储；产品状态必须经 Desktop Gateway 持久化。`)
  }
}

const dshAdapter = join(root, 'src/main/modules/agent/DshAgentRuntime.ts')
for (const file of sourceFiles('src')) {
  const content = readFileSync(file, 'utf8')
  if (/@eleckoi\/dsh-runtime|@deepseek-ai\/dsh-/.test(content) && file !== dshAdapter) {
    failures.push(`${relative(root, file)} 绕过了 Agent 模块的 DSH Runtime Adapter。`)
  }
}
for (const file of sourceFiles('packages/dsh-runtime')) {
  const content = readFileSync(file, 'utf8')
  if (/packages[\\/]dsh-runtime[\\/]src|@eleckoi\/dsh-runtime\//.test(content)) {
    failures.push(`${relative(root, file)} 绕过了 @eleckoi/dsh-runtime 的公开入口。`)
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('Architecture check passed: Host, Gateway, Modules, Platform and Renderer boundaries are intact.')
}
