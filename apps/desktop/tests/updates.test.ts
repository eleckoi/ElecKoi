import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { AppUpdater, UpdateCheckResult, UpdateInfo } from 'electron-updater'
import { UpdateService, normalizeReleaseNotes } from '@main/modules/updates'
import { attachUpdaterLogger, preserveWindowsUpdateInstallDirectory } from '@main/modules/updates/updatesPlugin'
import type { UpdateStatus } from '@shared/contracts/updates/schemas'

vi.mock('electron-updater', () => ({ default: { autoUpdater: {} } }))

class FakeUpdater extends EventEmitter {
  logger: AppUpdater['logger'] = null
  autoDownload = true
  autoInstallOnAppQuit = true
  autoRunAppAfterInstall = false
  allowPrerelease = true
  fullChangelog = true
  disableWebInstaller = false
  checkForUpdates = vi.fn(async (): Promise<UpdateCheckResult | null> => {
    const info = updateInfo()
    this.emit('update-available', info)
    return { updateInfo: info, versionInfo: info, isUpdateAvailable: true }
  })
  downloadUpdate = vi.fn(async () => {
    this.emit('update-downloaded', { ...updateInfo(), downloadedFile: 'synthetic-installer.exe' })
    return [] as string[]
  })
  quitAndInstall = vi.fn()
}

describe('desktop updater', () => {
  it('does not authorize installation implicitly on ordinary application exit', () => {
    const updater = new FakeUpdater()
    const service = new UpdateService({ updater: updater as unknown as AppUpdater, currentVersion: '1.0.0', enabled: true,
      disabledMessage: '', prepareInstall: async () => true, releaseInstall: async () => {}, publish: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    service.start()
    try { expect(updater.autoInstallOnAppQuit).toBe(false) } finally { service.dispose() }
  })

  it('settles each download once and keeps verification pending until the download promise completes', async () => {
    const updater = new FakeUpdater(), download = deferred<string[]>()
    updater.downloadUpdate.mockReturnValueOnce(download.promise)
    const published: UpdateStatus[] = [], logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const service = new UpdateService({ updater: updater as unknown as AppUpdater, currentVersion: '0.1.0', enabled: true,
      disabledMessage: '', prepareInstall: async () => true, releaseInstall: async () => {}, publish: status => published.push(status), logger })
    service.start()
    try {
      await service.check()
      const pending = service.download()
      await vi.waitFor(() => expect(updater.downloadUpdate).toHaveBeenCalledOnce())
      updater.emit('download-progress', { percent: 100, transferred: 100, total: 100, bytesPerSecond: 1 })
      expect(service.status().phase).toBe('verifying')
      updater.emit('update-downloaded', { ...updateInfo(), downloadedFile: 'synthetic-installer.exe' })
      expect(service.status().phase).toBe('verifying')
      const failure = new Error('net::ERR_CONNECTION_CLOSED')
      updater.emit('error', failure)
      void service.download()
      expect(updater.downloadUpdate).toHaveBeenCalledOnce()
      download.reject(failure)
      await pending
      await vi.waitFor(() => expect(service.status().phase).toBe('error'))
      expect(published.filter(status => status.phase === 'error')).toHaveLength(1)
      expect(logger.warn).toHaveBeenCalledOnce()
    } finally { service.dispose() }
  })

  it('coalesces installation preparation and releases the Host lock after an asynchronous installer failure', async () => {
    vi.useFakeTimers()
    const updater = new FakeUpdater(), preparation = deferred<boolean>()
    const prepareInstall = vi.fn(() => preparation.promise), releaseInstall = vi.fn(async () => {})
    const service = new UpdateService({ updater: updater as unknown as AppUpdater, currentVersion: '0.1.0', enabled: true,
      disabledMessage: '', prepareInstall, releaseInstall, publish: vi.fn(), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    service.start()
    try {
      await service.check()
      await service.download()
      const first = service.install(), second = service.install()
      preparation.resolve(true)
      await Promise.all([first, second])
      expect(prepareInstall).toHaveBeenCalledOnce()
      expect(updater.quitAndInstall).toHaveBeenCalledOnce()
      updater.emit('error', Object.assign(new Error('installer blocked'), { code: 'EACCES' }))
      await vi.advanceTimersByTimeAsync(0)
      expect(releaseInstall).toHaveBeenCalledOnce()
      expect(service.status()).toMatchObject({ phase: 'error', failedOperation: 'install' })
    } finally { service.dispose(); vi.useRealTimers() }
  })

  it.each([
    [String.raw`D:\Apps\ElecKoi\ElecKoi.exe`, String.raw`D:\Apps\ElecKoi`],
    ['D:/Apps/ElecKoi/ElecKoi.exe', 'D:/Apps/ElecKoi'],
    [String.raw`\\server\apps\ElecKoi\ElecKoi.exe`, String.raw`\\server\apps\ElecKoi`],
    [String.raw`C:\ElecKoi.exe`, 'C:\\']
  ])('keeps app updates beside the Windows executable %s', (executablePath, directory) => {
    const updater = new FakeUpdater()

    preserveWindowsUpdateInstallDirectory(
      updater as unknown as AppUpdater,
      executablePath,
      true,
      'win32'
    )

    expect((updater as FakeUpdater & { installDirectory?: string }).installDirectory)
      .toBe(directory)
  })

  it.each([
    { executablePath: String.raw`D:\Apps\ElecKoi\ElecKoi.exe`, packaged: false, platform: 'win32' },
    { executablePath: '/Applications/ElecKoi.app/Contents/MacOS/ElecKoi', packaged: true, platform: 'darwin' },
    { executablePath: '/opt/eleckoi/ElecKoi', packaged: true, platform: 'linux' }
  ] as const)('does not set an NSIS install directory for $platform (packaged: $packaged)', ({
    executablePath, packaged, platform
  }) => {
    const updater = new FakeUpdater()
    preserveWindowsUpdateInstallDirectory(
      updater as unknown as AppUpdater,
      executablePath,
      packaged,
      platform
    )

    expect((updater as FakeUpdater & { installDirectory?: string }).installDirectory).toBeUndefined()
  })

  it('detaches updater logging before host services become inactive', () => {
    const updater = new FakeUpdater()
    const appLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const detach = attachUpdaterLogger(updater, appLog)

    updater.logger?.info('before dispose')
    expect(appLog.info).toHaveBeenCalledOnce()

    detach()
    expect(updater.logger).toBeNull()
  })

  it('turns release HTML into complete plain text', () => {
    const notes = normalizeReleaseNotes(`<h2>更新</h2><p>修复 &amp; 优化</p>${'很长'.repeat(3_000)}`)

    expect(notes).toBeTruthy()
    expect(notes).not.toContain('<h2>')
    expect(notes).toContain('修复 & 优化')
    expect(notes).toContain('很长'.repeat(3_000))
  })

  it('publishes available, download and ready states and blocks restart during generation', async () => {
    const updater = new FakeUpdater()
    const published: UpdateStatus[] = []
    let canInstall = false
    const service = new UpdateService({
      updater: updater as unknown as AppUpdater,
      currentVersion: '0.1.0',
      enabled: true,
      disabledMessage: '',
      prepareInstall: async () => canInstall,
      releaseInstall: async () => {},
      publish: (status) => published.push(status),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })
    service.start()

    await service.check()
    expect(service.status()).toMatchObject({ phase: 'available', availableVersion: '0.1.1' })

    const download = deferred<string[]>()
    updater.downloadUpdate.mockReturnValueOnce(download.promise)
    const pending = service.download()
    await vi.waitFor(() => expect(updater.downloadUpdate).toHaveBeenCalledOnce())
    expect(service.status().phase).toBe('downloading')
    updater.emit('download-progress', {
      percent: 52.4,
      transferred: 524,
      total: 1_000,
      delta: 100,
      bytesPerSecond: 256
    })
    expect(service.status().progress?.percent).toBe(52.4)

    updater.emit('update-downloaded', { ...updateInfo(), downloadedFile: 'ElecKoi.exe' })
    download.resolve([])
    await pending
    await expect(service.install()).resolves.toEqual({ accepted: false, reason: 'agent_running' })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()

    canInstall = true
    await expect(service.install()).resolves.toEqual({ accepted: true, reason: null })
    expect(service.status().phase).toBe('installing')
    expect(published.map((status) => status.phase)).toEqual([
      'available',
      'downloading',
      'downloading',
      'ready',
      'installing',
      'ready',
      'installing'
    ])
    service.dispose()
  })

  it('stays disabled in development builds', async () => {
    const updater = new FakeUpdater()
    const service = new UpdateService({
      updater: updater as unknown as AppUpdater,
      currentVersion: '0.1.0',
      enabled: false,
      disabledMessage: '开发模式不检查更新。',
      prepareInstall: async () => true,
      releaseInstall: async () => {},
      publish: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })
    service.start()

    expect(await service.check()).toMatchObject({
      phase: 'disabled',
      message: '开发模式不检查更新。'
    })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    service.dispose()
  })

  it.each([
    [Object.assign(new Error("ENOENT: open 'resources/app-update.yml'"), { code: 'ENOENT', path: 'resources/app-update.yml' }),
      '安装包缺少更新配置（app-update.yml），请重新安装修复后的版本。'],
    [new Error('HTTP 403: API rate limit exceeded'), '更新失败：HTTP 403: API rate limit exceeded'],
    [Object.assign(new Error('Missing unrelated file'), { code: 'ENOENT', path: 'resources/other.yml' }),
      '更新失败：Missing unrelated file']
  ])('keeps the diagnosed update failure visible: %s', async (failure, message) => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockRejectedValueOnce(failure)
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const service = new UpdateService({ updater: updater as unknown as AppUpdater, currentVersion: '1.2.3',
      enabled: true, disabledMessage: '', prepareInstall: async () => true, releaseInstall: async () => {},
      publish: vi.fn(), logger })
    service.start()
    try {
      expect(await service.check()).toMatchObject({ phase: 'error', message })
      expect(logger.warn).toHaveBeenCalledWith({ err: expect.objectContaining({ message: failure.message }) }, 'ElecKoi 桌面更新失败')
    } finally { service.dispose() }
  })

  it('ignores a delayed download failure after disposal', async () => {
    const updater = new FakeUpdater()
    let rejectDownload: ((error: Error) => void) | undefined
    updater.downloadUpdate.mockImplementationOnce(() => new Promise<string[]>((_, reject) => {
      rejectDownload = reject
    }))
    const published: UpdateStatus[] = []
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const service = new UpdateService({
      updater: updater as unknown as AppUpdater,
      currentVersion: '0.1.0',
      enabled: true,
      disabledMessage: '',
      prepareInstall: async () => true,
      releaseInstall: async () => {},
      publish: (status) => published.push(status),
      logger
    })
    service.start()
    await service.check()
    const pending = service.download()
    await vi.waitFor(() => expect(updater.downloadUpdate).toHaveBeenCalledOnce())
    service.dispose()

    const failure = new Error('late failure')
    updater.emit('error', failure)
    rejectDownload?.(failure)
    await pending

    expect(logger.warn).not.toHaveBeenCalled()
    expect(published.at(-1)?.phase).toBe('downloading')
  })
})

function updateInfo(): UpdateInfo {
  return {
    version: '0.1.1',
    files: [{ url: 'ElecKoi-0.1.1-x64-setup.exe', sha512: 'hash', size: 132_120_576 }],
    path: 'ElecKoi-0.1.1-x64-setup.exe',
    sha512: 'hash',
    releaseName: 'ElecKoi 0.1.1',
    releaseNotes: '- 改进聊天稳定性\n- 修复若干问题',
    releaseDate: '2026-09-12T00:00:00.000Z'
  }
}

function deferred<T>(): { promise: Promise<T>, resolve: (value: T) => void, reject: (error: Error) => void } {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
