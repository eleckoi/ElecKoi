import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
import { initProfile } from '@deepseek-ai/dsh-app-boot'
import { ELECKOI_INSTALL_ANCHOR, registerAndroidMobileBundle, registerAndroidFrontendBundles } from './androidPluginBundles'
import { ELECKOI_ANDROID_RECOVERY_BUNDLES } from './androidPluginRecovery'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

const require = createRequire(ELECKOI_INSTALL_ANCHOR)

export interface NodeHostConfiguration {
  schemaVersion: 1
  runtimeDataRoot: string
  homeRoot: string
  workspaceRoot: string
  productDatabasePath: string
  productMediaRoot: string
  resourceRoot: string
  clientDirectory: string
  presetTemplatePath: string
  agentPatchPath: string
  packageManagerEntryPath: string
  nodeBinPath: string
}

export interface PreparedPluginHost {
  profileDirectory: string
  overlayPath: string
  patchFiles: readonly string[]
  environment: Readonly<Record<string, string>>
}

/** Relative paths belong to the configuration file, independently of the launch directory. */
export function loadNodeHostConfiguration(configPath: string): NodeHostConfiguration {
  if (!isAbsolute(configPath)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'Android Host configuration path must be absolute', { field: 'configPath' })
  }
  const value: unknown = JSON.parse(readFileSync(configPath, 'utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'Android Host configuration must be a JSON object', { what: 'Android Host 配置' })
  }
  const config = value as Record<string, unknown>
  if (config.schemaVersion !== 1) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, 'Unsupported Android Host configuration schemaVersion', { what: 'Android Host 配置', expected: 'schemaVersion 1' })
  }
  const supported = new Set(['schemaVersion', 'runtimeDataRoot', 'homeRoot', 'workspaceRoot',
    'productDatabasePath', 'productMediaRoot', 'resourceRoot', 'clientDirectory',
    'presetTemplatePath', 'agentPatchPath', 'packageManagerEntryPath', 'nodeBinPath'])
  for (const key of Object.keys(config)) {
    if (!supported.has(key)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, `Unsupported Android Host configuration field: ${key}`, { what: 'Android Host 配置项', expected: 'schemaVersion 1 声明的字段' })
    }
  }
  const base = dirname(configPath)
  const path = (name: string, fallback?: string): string => {
    const raw = config[name] ?? fallback
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, `Missing Host configuration path: ${name}`, { field: name })
    }
    return resolve(base, raw)
  }
  const resourceRoot = path('resourceRoot')
  const runtimeDataRoot = path('runtimeDataRoot')
  const result: NodeHostConfiguration = {
    schemaVersion: 1, resourceRoot, runtimeDataRoot,
    homeRoot: path('homeRoot'), workspaceRoot: path('workspaceRoot'),
    productDatabasePath: path('productDatabasePath'), productMediaRoot: path('productMediaRoot'),
    clientDirectory: path('clientDirectory', join(dirname(require.resolve('@eleckoi/web-client/package.json')), 'dist')),
    presetTemplatePath: path('presetTemplatePath', join(resourceRoot, 'agent-preset-template', 'agent.cordis.yml')),
    agentPatchPath: path('agentPatchPath', join(resourceRoot, 'desktop-agent.patch.yml')),
    packageManagerEntryPath: path('packageManagerEntryPath', join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.mjs')),
    nodeBinPath: path('nodeBinPath', dirname(process.execPath))
  }
  for (const file of [result.presetTemplatePath, result.agentPatchPath, result.packageManagerEntryPath,
    join(resourceRoot, 'runtime-manifest.json'), join(result.clientDirectory, 'dsh.html')]) {
    if (!existsSync(file)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, `Android Host resource is missing: ${file}`, { operation: 'read', path: file })
    }
  }
  const runtime = JSON.parse(readFileSync(join(resourceRoot, 'runtime-manifest.json'), 'utf8'))
  const installed = require('@deepseek-ai/dsh/package.json') as { version: string }
  if (runtime.schemaVersion !== 1 || runtime.upstream?.version !== installed.version
    || runtime.upstream?.commit !== '66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db') {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, 'Android Host resources do not match the locked DSH installation', { what: 'Android Host 资源清单', expected: '与锁定的 DSH 安装一致' })
  }
  return result
}

/** Android owns its profile and paths; the existing Host bundles own all product behavior. */
export function preparePluginHost(paths: NodeHostConfiguration): PreparedPluginHost {
  const profileDirectory = join(paths.homeRoot, 'profiles', 'android')
  const sessionRoot = join(paths.runtimeDataRoot, 'sessions')
  for (const directory of [paths.homeRoot, paths.runtimeDataRoot, paths.workspaceRoot,
    paths.productMediaRoot, dirname(paths.productDatabasePath), sessionRoot]) mkdirSync(directory, { recursive: true })
  initProfile(profileDirectory, ELECKOI_ANDROID_RECOVERY_BUNDLES)
  registerAndroidMobileBundle(profileDirectory)
  registerAndroidFrontendBundles(profileDirectory)
  const overlayPath = join(profileDirectory, 'eleckoi-android-host.patch.yml')
  writeFileSync(overlayPath, [
    '- id: agent-preset-registry', '  config:', '    default: standard',
    '- id: session-persistence-jsonl', '  config:', `    root: ${JSON.stringify(sessionRoot)}`, '    compression: none',
    '- id: session-query-sqlite', '  config:', `    path: ${JSON.stringify(join(paths.runtimeDataRoot, 'session-search.sqlite'))}`, '    openAt: first-search',
    '- id: workspace-controller', '  config:', `    documentsDirectory: ${JSON.stringify(paths.workspaceRoot)}`,
    // General owns settings.general.item, including the mobile locale and font controls.
    ...['desktop-product-telemetry', 'product-analytics', 'ui-layout', 'ui-sidebar',
      'ui-settings-models', 'directory-picker'].flatMap(id => [`- id: ${id}`, '  disabled: true']),
    '- insert:',
    '    - id: eleckoi-android-directory-picker', '      name: "@deepseek-ai/dsh-host-directory-picker-browse"',
    '    - id: eleckoi-android-directory-picker-ui', '      name: "@deepseek-ai/dsh-client-ui-directory-picker-browse"', ''
  ].join('\n'))
  return {
    profileDirectory, overlayPath, patchFiles: [paths.agentPatchPath, overlayPath],
    environment: {
      DSH_HOME: paths.homeRoot, DSH_SESSION_ROOT: sessionRoot, DSH_CWD: paths.workspaceRoot,
      ELECKOI_SESSION_SNAPSHOT_ROOT: join(paths.runtimeDataRoot, 'session-snapshots'),
      ELECKOI_PRESET_ROOT: join(paths.runtimeDataRoot, 'generated-presets'),
      ELECKOI_PRESET_TEMPLATE_PATH: paths.presetTemplatePath,
      ELECKOI_SESSION_BRIDGE_ROOT: join(paths.runtimeDataRoot, 'session-bridges'),
      ELECKOI_DATABASE_PATH: paths.productDatabasePath, ELECKOI_MEDIA_ROOT: paths.productMediaRoot,
      ELECKOI_WORKSPACE_ROOT: paths.workspaceRoot, DSH_TELEMETRY_DISABLED: '1'
    }
  }
}

export function nodeHostPackageManager(config: NodeHostConfiguration) {
  return {
    command: process.execPath, args: ['--expose-internals', config.packageManagerEntryPath],
    env: { DSH_DESKTOP_NODE_EXECUTABLE: process.execPath, PATH: `${config.nodeBinPath}${delimiter}${process.env.PATH ?? ''}` }
  }
}
