import type {
  AppUpdater,
  ProgressInfo,
  UpdateDownloadedEvent,
  UpdateInfo
} from 'electron-updater'
import type { Logger } from 'pino'
import type { UpdateInstallResult, UpdateStatus } from '@shared/contracts/updates/schemas'

const INITIAL_CHECK_DELAY_MS = 15_000
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000
const MAX_RELEASE_NOTES_LENGTH = 4_000
const PROGRESS_BROADCAST_INTERVAL_MS = 250

export interface UpdateServiceOptions {
  updater: AppUpdater
  currentVersion: string
  enabled: boolean
  disabledMessage: string
  canInstall: () => boolean
  publish: (status: UpdateStatus) => void
  logger: Pick<Logger, 'info' | 'warn' | 'error'>
}

export class UpdateService {
  private state: UpdateStatus
  private started = false
  private checking = false
  private downloading = false
  private manualCheck = false
  private lastProgressBroadcastAt = 0
  private initialCheckTimer: NodeJS.Timeout | undefined
  private recheckTimer: NodeJS.Timeout | undefined
  private installTimer: NodeJS.Timeout | undefined

  constructor(private readonly options: UpdateServiceOptions) {
    this.state = emptyStatus(
      options.enabled ? 'idle' : 'disabled',
      options.currentVersion,
      options.enabled ? null : options.disabledMessage
    )
  }

  start(): void {
    if (this.started) return
    this.started = true
    if (!this.options.enabled) return

    const updater = this.options.updater
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = true
    updater.autoRunAppAfterInstall = true
    updater.allowPrerelease = false
    updater.fullChangelog = false
    updater.disableWebInstaller = true
    updater.on('checking-for-update', this.handleChecking)
    updater.on('update-available', this.handleAvailable)
    updater.on('update-not-available', this.handleNotAvailable)
    updater.on('download-progress', this.handleProgress)
    updater.on('update-downloaded', this.handleDownloaded)
    updater.on('update-cancelled', this.handleCancelled)
    updater.on('error', this.handleError)

    this.initialCheckTimer = setTimeout(() => { void this.check(false) }, INITIAL_CHECK_DELAY_MS)
    this.initialCheckTimer.unref()
    this.recheckTimer = setInterval(() => { void this.check(false) }, RECHECK_INTERVAL_MS)
    this.recheckTimer.unref()
  }

  status(): UpdateStatus {
    return this.state
  }

  async check(manual = true): Promise<UpdateStatus> {
    if (!this.started || !this.options.enabled || this.checking || this.downloading) return this.state
    if (this.state.phase === 'ready' || this.state.phase === 'installing') return this.state

    this.checking = true
    this.manualCheck = manual
    this.setState({
      ...this.state,
      phase: 'checking',
      progress: null,
      message: manual ? '正在检查更新…' : null
    })

    try {
      const result = await this.options.updater.checkForUpdates()
      if (result === null && this.checking) this.handleNotAvailable()
    } catch (error) {
      if (this.checking) this.handleError(asError(error))
    }
    return this.state
  }

  download(): UpdateStatus {
    const canDownload = this.state.phase === 'available'
      || (this.state.phase === 'error' && this.state.availableVersion !== null)
    if (!this.started || !this.options.enabled || !canDownload || this.downloading) return this.state

    this.downloading = true
    this.setState({
      ...this.state,
      phase: 'downloading',
      progress: {
        percent: 0,
        transferredBytes: 0,
        totalBytes: this.state.downloadSizeBytes ?? 0,
        bytesPerSecond: 0
      },
      message: null
    })
    void this.options.updater.downloadUpdate().catch((error: unknown) => this.handleError(asError(error)))
    return this.state
  }

  install(): UpdateInstallResult {
    if (!this.started || this.state.phase !== 'ready') return { accepted: false, reason: 'not_ready' }
    if (!this.options.canInstall()) return { accepted: false, reason: 'agent_running' }

    this.setState({ ...this.state, phase: 'installing', message: '正在重启并安装更新…' })
    this.installTimer = setTimeout(() => {
      try {
        this.options.updater.quitAndInstall(false, true)
      } catch (error) {
        this.handleError(asError(error))
      }
    }, 250)
    this.installTimer.unref()
    return { accepted: true, reason: null }
  }

  dispose(): void {
    if (!this.started) return
    this.started = false
    if (this.initialCheckTimer !== undefined) clearTimeout(this.initialCheckTimer)
    if (this.recheckTimer !== undefined) clearInterval(this.recheckTimer)
    if (this.installTimer !== undefined) clearTimeout(this.installTimer)
    if (this.options.enabled) {
      const updater = this.options.updater
      updater.removeListener('checking-for-update', this.handleChecking)
      updater.removeListener('update-available', this.handleAvailable)
      updater.removeListener('update-not-available', this.handleNotAvailable)
      updater.removeListener('download-progress', this.handleProgress)
      updater.removeListener('update-downloaded', this.handleDownloaded)
      updater.removeListener('update-cancelled', this.handleCancelled)
      updater.removeListener('error', this.handleError)
    }
  }

  private readonly handleChecking = (): void => {
    if (!this.started) return
    this.checking = true
  }

  private readonly handleAvailable = (info: UpdateInfo): void => {
    if (!this.started) return
    this.checking = false
    this.manualCheck = false
    this.options.logger.info({ version: info.version }, '发现 ElecKoi 桌面更新')
    this.setState(statusFromInfo('available', this.options.currentVersion, info, null))
  }

  private readonly handleNotAvailable = (_info?: UpdateInfo): void => {
    if (!this.started) return
    const message = this.manualCheck ? '当前已是最新版本。' : null
    this.checking = false
    this.manualCheck = false
    this.setState(emptyStatus('idle', this.options.currentVersion, message))
  }

  private readonly handleProgress = (info: ProgressInfo): void => {
    if (!this.started || !this.downloading) return
    const now = Date.now()
    const percent = clamp(info.percent, 0, 100)
    if (percent < 100 && now - this.lastProgressBroadcastAt < PROGRESS_BROADCAST_INTERVAL_MS) return
    this.lastProgressBroadcastAt = now
    this.setState({
      ...this.state,
      phase: 'downloading',
      progress: {
        percent,
        transferredBytes: Math.max(0, info.transferred),
        totalBytes: Math.max(0, info.total),
        bytesPerSecond: Math.max(0, info.bytesPerSecond)
      },
      message: null
    })
  }

  private readonly handleDownloaded = (info: UpdateDownloadedEvent): void => {
    if (!this.started) return
    this.downloading = false
    this.options.logger.info({ version: info.version }, 'ElecKoi 桌面更新下载完成')
    this.setState({
      ...statusFromInfo('ready', this.options.currentVersion, info, '更新已下载，重启后即可完成安装。'),
      progress: {
        percent: 100,
        transferredBytes: downloadSize(info),
        totalBytes: downloadSize(info),
        bytesPerSecond: 0
      }
    })
  }

  private readonly handleCancelled = (): void => {
    if (!this.started) return
    this.downloading = false
    this.setState({ ...this.state, phase: 'available', progress: null, message: null })
  }

  private readonly handleError = (error: Error): void => {
    if (!this.started) return
    this.checking = false
    this.downloading = false
    this.manualCheck = false
    this.options.logger.warn({ err: error }, 'ElecKoi 桌面更新失败')
    this.setState({
      ...this.state,
      phase: 'error',
      progress: null,
      message: '更新失败，请检查网络后重试。'
    })
  }

  private setState(next: UpdateStatus): void {
    this.state = next
    this.options.publish(next)
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
    releaseName: cleanSingleLine(info.releaseName ?? null, 200),
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseDate: cleanSingleLine(info.releaseDate, 100),
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
  return plain.slice(0, MAX_RELEASE_NOTES_LENGTH)
}

function cleanSingleLine(value: string | null, maxLength: number): string | null {
  if (value === null) return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
