import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater'
import type { Logger } from 'pino'
import type { UpdateInstallResult, UpdateStatus } from '@shared/contracts/updates/schemas'
import { DesktopUpdateCoordinator } from './dsh/update-coordinator'
import type { DesktopUpdateState } from '@shared/contracts/desktopNative'
import { DesktopUpdateSchedule, resolveDesktopUpdateScheduleConfig } from './dsh/update-schedule'
import { presentDesktopUpdate } from './dsh/update-presentation'


export interface UpdateServiceOptions {
  updater: AppUpdater
  currentVersion: string
  enabled: boolean
  disabledMessage: string
  prepareInstall: () => Promise<boolean>
  releaseInstall: () => Promise<void>
  publish: (status: UpdateStatus) => void
  logger: Pick<Logger, 'info' | 'warn' | 'error'>
  open?: (language: string, manual: boolean) => Promise<void>
}

/** Maps desktop update state to the existing product UI and Host admission boundary. */
export class UpdateService {
  private state: UpdateStatus
  private readonly coordinator: DesktopUpdateCoordinator | undefined
  private started = false
  private info: UpdateInfo | undefined
  private progress: UpdateStatus['progress'] = null
  private manualCheck = false
  private installLocked = false
  private releaseOperation: Promise<void> = Promise.resolve()
  private initialCheckTimer: NodeJS.Timeout | undefined
  private recheckTimer: NodeJS.Timeout | undefined
  private schedule: DesktopUpdateSchedule | undefined
  private readonly listeners = new Set<() => void>()

  constructor(private readonly options: UpdateServiceOptions) {
    this.state = emptyStatus(options.enabled ? 'idle' : 'disabled', options.currentVersion,
      options.enabled ? null : options.disabledMessage)
    if (!options.enabled) return
    this.coordinator = new DesktopUpdateCoordinator(next => {
      this.present(next)
      return next
    }, async () => {
      await this.releaseOperation
      const accepted = await options.prepareInstall()
      this.installLocked = accepted
      if (!this.started && accepted) {
        await this.unlockInstall()
        return false
      }
      return accepted
    }, options.updater, () => options.enabled, () => options.currentVersion, undefined, 'latest')
    // Product releases use the stable feed; selecting a channel can enable downgrade.
    options.updater.channel = 'latest'
    options.updater.allowPrerelease = false
    options.updater.allowDowngrade = false
    options.updater.autoRunAppAfterInstall = true
    options.updater.fullChangelog = false
    options.updater.disableWebInstaller = true
    this.schedule = new DesktopUpdateSchedule(this.coordinator, resolveDesktopUpdateScheduleConfig(process.env))
  }

  start(): void {
    if (this.started) return
    this.started = true
    if (!this.coordinator) return
    this.options.updater.on('update-available', this.captureInfo)
    this.options.updater.prependListener('download-progress', this.captureProgress)
    void this.check(false).catch(error => {
      if (this.started) this.options.logger.warn({ err: error }, 'ElecKoi 桌面更新检查失败')
    })
  }

  status(): UpdateStatus { return this.state }

  /** Observe the same main-owned transfer state without starting or joining a transfer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  nativeStatus(): DesktopUpdateState { return this.coordinator?.state ?? { phase: 'idle' } }

  async open(language: string, manual = false): Promise<UpdateStatus> {
    if (this.started && this.coordinator) await this.options.open?.(language, manual)
    return this.state
  }

  async check(manual = true): Promise<UpdateStatus> {
    if (!this.started || !this.coordinator) return this.state
    if (['downloading', 'verifying', 'ready', 'installing'].includes(this.state.phase)) return this.state
    this.manualCheck ||= manual
    const result = await this.schedule!.check(manual)
    if (result.phase === 'error' && !manual && this.started) {
      this.options.logger.warn({ err: new Error(result.message) }, 'ElecKoi 桌面更新检查失败')
    }
    this.manualCheck = false
    return this.state
  }

  async download(): Promise<UpdateStatus> {
    if (!this.started || !this.coordinator || !this.state.availableVersion) return this.state
    const allowed = ['available', 'downloading', 'verifying'].includes(this.state.phase)
      || (this.state.phase === 'error' && this.state.failedOperation === 'download')
    if (!allowed) return this.state
    await this.coordinator.download(this.state.availableVersion)
    return this.state
  }

  async install(): Promise<UpdateInstallResult> {
    const allowed = this.state.phase === 'ready'
      || (this.state.phase === 'error' && this.state.failedOperation === 'install')
    if (!this.started || !this.coordinator || !allowed || !this.state.availableVersion) {
      return { accepted: false, reason: 'not_ready' }
    }
    const result = await this.coordinator.install(this.state.availableVersion)
    if (result.phase === 'installing') return { accepted: true, reason: null }
    return { accepted: false, reason: result.phase === 'ready' ? 'agent_running' : 'not_ready' }
  }

  dispose(): void {
    this.started = false
    if (this.initialCheckTimer !== undefined) clearTimeout(this.initialCheckTimer)
    if (this.recheckTimer !== undefined) clearInterval(this.recheckTimer)
    this.options.updater.off('update-available', this.captureInfo)
    this.options.updater.off('download-progress', this.captureProgress)
    this.coordinator?.dispose()
    this.schedule?.dispose()
    this.listeners.clear()
  }

  private readonly captureInfo = (info: UpdateInfo): void => { this.info = info }
  private readonly captureProgress = (info: ProgressInfo): void => {
    this.progress = {
      percent: Math.min(100, Math.max(0, info.percent)),
      transferredBytes: Math.max(0, info.transferred),
      totalBytes: Math.max(0, info.total),
      bytesPerSecond: Math.max(0, info.bytesPerSecond)
    }
  }

  private present(next: DesktopUpdateState): void {
    if (!this.started) return
    const info = this.info?.version === next.version ? this.info : undefined
    const status = info
      ? statusFromInfo(next.phase, this.options.currentVersion, info, null)
      : emptyStatus(next.phase, this.options.currentVersion, null)
    status.availableVersion = next.version ?? null
    status.failedOperation = next.failedOperation
    if (next.phase === 'downloading' || next.phase === 'verifying') {
      status.progress = { ...(this.progress ?? { transferredBytes: 0, totalBytes: status.downloadSizeBytes ?? 0, bytesPerSecond: 0 }), percent: next.percent ?? 0 }
    } else this.progress = null
    if (next.phase === 'ready') status.message = '更新已下载，重启后即可完成安装。'
    if (next.phase === 'installing') status.message = '正在重启并安装更新…'
    if (next.phase === 'idle' && this.manualCheck) status.message = '当前已是最新版本。'
    if (next.phase === 'error') {
      status.message = updateErrorMessage(next.message ?? '未知更新错误')
      this.options.logger.warn({ err: new Error(next.message) }, 'ElecKoi 桌面更新失败')
      if (next.failedOperation === 'install') void this.unlockInstall()
    }
    this.publish(status, next)
  }

  private unlockInstall(): Promise<void> {
    if (!this.installLocked) return this.releaseOperation
    this.installLocked = false
    this.releaseOperation = this.options.releaseInstall().catch(error => {
      this.options.logger.warn({ err: error }, '释放 DSH 更新锁失败')
    })
    return this.releaseOperation
  }

  private publish(status: UpdateStatus, native: DesktopUpdateState): void {
    this.state = status
    for (const listener of this.listeners) listener()
    this.options.publish({ ...status, ...presentDesktopUpdate(native) })
  }
}

function emptyStatus(
  phase: UpdateStatus['phase'],
  currentVersion: string,
  message: string | null
): UpdateStatus {
  return {
    phase,
    currentVersion,
    availableVersion: null,
    releaseName: null,
    releaseNotes: null,
    releaseDate: null,
    downloadSizeBytes: null,
    progress: null,
    message
  }
}

function statusFromInfo(
  phase: UpdateStatus['phase'],
  currentVersion: string,
  info: UpdateInfo,
  message: string | null
): UpdateStatus {
  return {
    phase,
    currentVersion,
    availableVersion: info.version,
    releaseName: cleanSingleLine(info.releaseName ?? null),
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseDate: cleanSingleLine(info.releaseDate),
    downloadSizeBytes: downloadSize(info),
    progress: null,
    message
  }
}

export function normalizeReleaseNotes(notes: UpdateInfo['releaseNotes']): string | null {
  const raw = Array.isArray(notes)
    ? notes.map((item) => item.note ?? '').filter(Boolean).join('\n\n')
    : notes ?? ''
  const plain = decodeBasicHtmlEntities(
    raw
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!plain) return null
  return plain
}

function cleanSingleLine(value: string | null): string | null {
  if (value === null) return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned || null
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

function downloadSize(info: UpdateInfo): number {
  return info.files.reduce((largest, file) => Math.max(largest, file.size ?? 0), 0)
}

function updateErrorMessage(message: string): string {
  if (message.includes('ENOENT') && /(?:^|[/\\])app-update\.yml(?:$|['\"])/.test(message)) {
    return '安装包缺少更新配置（app-update.yml），请重新安装修复后的版本。'
  }
  return `更新失败：${message}`
}
