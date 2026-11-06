import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { initProfile, readProfileManifest, sanitizeProfile, writeProfileBundles } from '@deepseek-ai/dsh-app-boot'
import { OPTIONAL_BUNDLES, PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { ELECKOI_DESKTOP_BUNDLES, registerDesktopBundles } from './desktopPluginBundles'
import { ELECKOI_FAILURE_CODES, isEleckoiFailureCode } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { isChildFatalFrame, pluginHostFailureOf } from './childHostFailure'
import type { ChildHostMessage, ParentHostMessage } from './hostSessionProtocol'
import type { LocalDragResource } from './fileDrag'

const require = createRequire(import.meta.url)
const runtimeRequire = createRequire(require.resolve('@eleckoi/desktop-host'))
const TAVILY_BUNDLE = '@eleckoi/dsh-web-search-tavily'
const webProfile = PROFILE_TEMPLATES.web
if (webProfile === undefined) {
  throw new DesktopError(ELECKOI_FAILURE_CODES.internal, 'DSH web profile template is unavailable', { what: 'DSH web profile 模板' })
}
export const ELECKOI_DESKTOP_RECOVERY_BUNDLES = Object.freeze([
  ...webProfile.bundles, ...ELECKOI_DESKTOP_BUNDLES, TAVILY_BUNDLE
])

/**
 * RETIRE WHEN: 受支持的升级及 profile 恢复入口都已完成 tavily-bundle-v1 登记后，
 * 删除本函数、start 调用及对应旧 profile 用例。保留新 profile 的 Tavily 默认选择，
 * 以及通过正式 profile 保存用户启停选择的正常流程；不要删除现有用户配置或标记文件。
 */
function selectTavilyBundleOnce(profile: string): void {
  const marker = join(profile, '.eleckoi-tavily-bundle-v1')
  if (existsSync(marker)) return
  const manifest = readProfileManifest('dsh', profile)
  const bundles = manifest.dsh?.profile?.bundles ?? []
  if (!bundles.includes(TAVILY_BUNDLE)) writeProfileBundles(profile, manifest, [...bundles, TAVILY_BUNDLE])
  writeFileSync(marker, 'initialized\n', { flag: 'wx' })
}

export function resolveDshWebFrontendDirectory(): string {
  return join(dirname(runtimeRequire.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist')
}

export interface DshDesktopPluginHostReady {
  url: string
  injections: readonly unknown[]
}

export interface DshDesktopPluginHostOptions {
  runtimeDataRoot: string
  workspaceRoot: string
  productDatabasePath: string
  productMediaRoot: string
  presetTemplatePath: string
  agentPatchPath: string
  executablePath: string
  packageManager?: { entryPath: string; nodeBinPath: string }
  onDiagnostic?: (message: string) => void
  onFailure?: (error: Error) => void
}

export type DshDesktopPluginHostEnvironment = Readonly<Record<string, string>>

function isChildMessage(value: unknown): value is ChildHostMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const message = value as Record<string, unknown>
  if (message.type === 'ready') return typeof message.url === 'string' && Array.isArray(message.injections)
  if (message.type === 'fatal') return isChildFatalFrame(message)
  if (message.type === 'file-drag-resource') {
    const resource = message.resource as Record<string, unknown> | null
    return Number.isSafeInteger(message.requestId) && (message.error === undefined || typeof message.error === 'string')
      && (resource === null || typeof resource === 'object' && resource !== undefined && typeof resource.path === 'string'
        && typeof resource.sha256 === 'string' && /^[0-9a-f]{64}$/.test(resource.sha256) && Number.isSafeInteger(resource.size))
  }
  if (message.type === 'update-tasks-complete') return typeof message.id === 'string'
    && typeof message.active === 'boolean'
    && (message.message === undefined || typeof message.message === 'string')
  return message.type === 'shutdown-complete'
}

interface PendingControl {
  resolve(value: boolean): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

export class DshDesktopPluginHost {
  private child: ChildProcess | undefined
  private readyTask: Promise<DshDesktopPluginHostReady> | undefined
  private stopping = false
  private closeTask: Promise<void> | undefined
  private readonly controls = new Map<string, PendingControl>()
  private readonly cleanlyStopped = new WeakSet<ChildProcess>()
  private nextDragId = 1
  private readonly dragControls = new Map<number, { resolve(value: LocalDragResource | null): void; reject(error: Error): void }>()

  constructor(private readonly options: DshDesktopPluginHostOptions) {
    if (typeof options.productDatabasePath !== 'string' || options.productDatabasePath.trim().length === 0) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'DSH 插件宿主必须提供产品数据库路径。', { field: 'productDatabasePath' })
    }
    if (typeof options.productMediaRoot !== 'string' || options.productMediaRoot.trim().length === 0) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'DSH 插件宿主必须提供产品媒体目录。', { field: 'productMediaRoot' })
    }
  }

  start(environment: DshDesktopPluginHostEnvironment = {}): Promise<DshDesktopPluginHostReady> {
    if (this.stopping && this.child === undefined) { this.stopping = false; this.closeTask = undefined }
    if (this.readyTask !== undefined) return this.readyTask
    if (this.stopping) return Promise.reject(new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'DSH 插件宿主正在停止。', { what: 'DSH 插件宿主' }))
    const home = join(this.options.runtimeDataRoot, 'home')
    const profile = join(home, 'profiles', 'desktop')
    initProfile(profile, ELECKOI_DESKTOP_RECOVERY_BUNDLES)
    registerDesktopBundles(profile)
    selectTavilyBundleOnce(profile)
    const overlayPath = join(profile, 'eleckoi-plugin-host.patch.yml')
    const sessionRoot = join(this.options.runtimeDataRoot, 'sessions')
    writeFileSync(overlayPath, [
      '- id: session-persistence-jsonl',
      '  config:',
      `    root: ${JSON.stringify(sessionRoot)}`,
      '    compression: none',
      '- id: desktop-product-telemetry',
      '  disabled: true',
      '- id: product-analytics',
      '  disabled: true',
      '- id: ui-layout',
      '  disabled: true',
      '- id: ui-sidebar',
      '  disabled: true',
      '- id: ui-settings-models',
      '  disabled: true',
      ''
    ].join('\n'))
    const child = spawn(this.options.executablePath, [
      require.resolve('@eleckoi/desktop-host/host'),
      profile,
      overlayPath,
      this.options.packageManager?.entryPath ?? '',
      this.options.packageManager?.nodeBinPath ?? '',
      this.options.agentPatchPath
    ], {
      cwd: profile,
      env: {
        ...process.env,
        ...environment,
        DSH_HOME: home,
        DSH_SESSION_ROOT: sessionRoot,
        DSH_CWD: this.options.workspaceRoot,
        ELECKOI_SESSION_SNAPSHOT_ROOT: join(this.options.runtimeDataRoot, 'session-snapshots'),
        ELECKOI_PRESET_ROOT: join(this.options.runtimeDataRoot, 'generated-presets'),
        ELECKOI_PRESET_TEMPLATE_PATH: this.options.presetTemplatePath,
        ELECKOI_SESSION_BRIDGE_ROOT: join(this.options.runtimeDataRoot, 'session-bridges'),
        ELECKOI_DATABASE_PATH: this.options.productDatabasePath,
        ELECKOI_MEDIA_ROOT: this.options.productMediaRoot,
        ELECKOI_WORKSPACE_ROOT: this.options.workspaceRoot,
        DSH_TELEMETRY_DISABLED: '1',
        ELECTRON_RUN_AS_NODE: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true
    })
    this.child = child
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => { this.options.onDiagnostic?.(chunk) })
    child.stderr?.on('data', (chunk: string) => { this.options.onDiagnostic?.(chunk) })
    this.readyTask = new Promise((resolve, reject) => {
      let settled = false
      let failureReported = false
      const timeout = setTimeout(() => {
        fail(new DesktopError(ELECKOI_FAILURE_CODES.timeoutExpired, 'DSH 插件宿主启动超时。', { what: 'DSH 插件宿主启动' }))
        child.kill()
      }, 90_000)
      const reportFailure = (error: Error): void => {
        if (failureReported || this.stopping) return
        failureReported = true
        this.options.onFailure?.(error)
      }
      const fail = (error: Error): void => {
        if (settled) reportFailure(error)
        else {
          settled = true
          clearTimeout(timeout)
          reject(error)
        }
      }
      child.on('message', (value: unknown) => {
        if (!isChildMessage(value)) {
          fail(new DesktopError(ELECKOI_FAILURE_CODES.contractInvalidResponse, 'DSH 插件宿主返回了无效消息。', {
            issues: [{ path: 'message', message: '子进程消息不满足 hostSessionProtocol 的形状' }]
          }))
          return
        }
        if (value.type === 'fatal') fail(pluginHostFailureOf(value))
        if (value.type === 'shutdown-complete') this.cleanlyStopped.add(child)
        if (value.type === 'file-drag-resource') {
          const pending = this.dragControls.get(value.requestId)
          if (value.error) pending?.reject(new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, value.error, { operation: '文件拖出授权' }))
          else pending?.resolve(value.resource)
        }
        if (value.type === 'update-tasks-complete') {
          const pending = this.controls.get(value.id)
          if (pending !== undefined) {
            clearTimeout(pending.timer)
            this.controls.delete(value.id)
            if (value.message) pending.reject(new DesktopError(ELECKOI_FAILURE_CODES.ipcCallFailed, value.message, { what: 'DSH 任务检查' }))
            else pending.resolve(value.active)
          }
        }
        if (value.type === 'ready' && !settled) {
          settled = true
          clearTimeout(timeout)
          resolve({ url: value.url, injections: value.injections })
        }
      })
      child.once('error', error => fail(error))
      child.once('exit', code => {
        const error = new DesktopError(ELECKOI_FAILURE_CODES.pluginLoadFailed, `DSH 插件宿主退出：${String(code)}`, { what: 'DSH 插件宿主进程' })
        this.rejectControls(error)
        if (this.child === child) {
          this.child = undefined
          this.readyTask = undefined
        }
        if (!this.stopping) fail(error)
      })
    })
    return this.readyTask
  }

  async updateTasks(action: 'inspect' | 'lock' | 'unlock'): Promise<boolean> {
    await (this.readyTask ?? this.start())
    const child = this.child
    if (child === undefined || !child.connected) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 插件宿主未连接。', { what: 'DSH 插件宿主' })
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.controls.delete(id)
        reject(new DesktopError(ELECKOI_FAILURE_CODES.timeoutExpired, 'DSH 任务检查超时。', { what: 'DSH 任务检查' }))
      }, 10_000)
      this.controls.set(id, { resolve, reject, timer })
      const message: ParentHostMessage = { type: 'update-tasks', id, action }
      child.send(message, error => {
        if (error === null) return
        clearTimeout(timer)
        this.controls.delete(id)
        reject(error)
      })
    })
  }

  /** Recovery owns shutdown before changing the official profile's enabled bundles. */
  async resolveDragResource(address: string, signal: AbortSignal): Promise<LocalDragResource | null> {
    const child = this.child
    if (!child?.connected || this.stopping) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, '文件拖出 Host 不可用。', { what: '文件拖出 Host' })
    signal.throwIfAborted()
    const requestId = this.nextDragId++
    const abort = (): void => {
      if (child.connected) child.send({ type: 'file-drag-cancel', requestId } satisfies ParentHostMessage, error => {
        if (error) this.options.onDiagnostic?.(`File drag cancellation failed: ${error.message}`)
      })
      this.dragControls.get(requestId)?.reject(signal.reason instanceof Error ? signal.reason
        : new DesktopError(ELECKOI_FAILURE_CODES.timeoutExpired, '文件拖出授权超时。', { what: '文件拖出授权' }))
    }
    const deadline = setTimeout(abort, 12_000)
    signal.addEventListener('abort', abort, { once: true })
    try {
      return await new Promise<LocalDragResource | null>((resolve, reject) => {
        this.dragControls.set(requestId, { resolve, reject })
        child.send({ type: 'file-drag-resource', requestId, address } satisfies ParentHostMessage, error => {
          if (error) reject(error)
        })
      })
    } finally { clearTimeout(deadline); signal.removeEventListener('abort', abort); this.dragControls.delete(requestId) }
  }

  async disableUserPlugins(): Promise<string | undefined> {
    await this.close()
    const profile = join(this.options.runtimeDataRoot, 'home', 'profiles', 'desktop')
    const selected = existsSync(join(profile, 'package.json')) ? readProfileManifest('eleckoi', profile).dsh?.profile?.bundles ?? [] : []
    return sanitizeProfile('eleckoi', profile, [
      ...ELECKOI_DESKTOP_RECOVERY_BUNDLES, ...selected.filter(name => OPTIONAL_BUNDLES.includes(name))
    ])
  }

  close(requireClean = false): Promise<void> {
    const child = this.child
    const task = this.closeTask ??= this.stopChild().catch(error => {
      this.closeTask = undefined
      throw error
    })
    if (!requireClean) return task
    return task.then(() => {
      if (child && (!this.cleanlyStopped.has(child) || child.exitCode !== 0)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'Host 未确认完成清理，更新安装已停止。', { what: '等待 Host 完成清理后重试更新' })
      }
    })
  }

  private async stopChild(): Promise<void> {
    this.stopping = true
    const child = this.child
    this.readyTask = undefined
    this.rejectControls(new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'DSH 插件宿主正在停止。', { what: 'DSH 插件宿主' }))
    if (child === undefined || child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
    if (child.connected) {
      try {
        child.send({ type: 'shutdown' } satisfies ParentHostMessage, error => {
          if (error !== null) this.options.onDiagnostic?.(`Host shutdown request failed: ${error.message}`)
        })
      } catch (error) {
        this.options.onDiagnostic?.(`Host shutdown request failed: ${String(error)}`)
      }
    }
    const graceful = await Promise.race([
      exited.then(() => true),
      new Promise<false>(resolve => setTimeout(() => resolve(false), 5_000))
    ])
    if (!graceful) {
      child.kill('SIGKILL')
      const terminated = await Promise.race([
        exited.then(() => true),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 5_000))
      ])
      if (!terminated) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.timeoutExpired, 'DSH 插件宿主未能停止，插件配置未修改。', { what: 'DSH 插件宿主停止' })
      }
    }
    if (this.child === child) this.child = undefined
  }

  private rejectControls(error: Error): void {
    for (const pending of this.dragControls.values()) pending.reject(error)
    this.dragControls.clear()
    for (const pending of this.controls.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.controls.clear()
  }
}
