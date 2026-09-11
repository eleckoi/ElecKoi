import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { AppUpdater, UpdateInfo } from 'electron-updater'
import { UpdateService, normalizeReleaseNotes } from '@main/modules/updates'
import type { UpdateStatus } from '@shared/contracts/updates/schemas'

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = false
  autoRunAppAfterInstall = false
  allowPrerelease = true
  fullChangelog = true
  disableWebInstaller = false
  checkForUpdates = vi.fn(async () => null)
  downloadUpdate = vi.fn(async () => [] as string[])
  quitAndInstall = vi.fn()
}

describe('desktop updater', () => {
  it('turns release HTML into bounded plain text', () => {
    const notes = normalizeReleaseNotes(`<h2>更新</h2><p>修复 &amp; 优化</p>${'很长'.repeat(3_000)}`)

    expect(notes).toBeTruthy()
    expect(notes).not.toContain('<h2>')
    expect(notes).toContain('修复 & 优化')
    expect(notes?.length).toBe(4_000)
  })

  it('publishes available, download and ready states and blocks restart during generation', () => {
    const updater = new FakeUpdater()
    const published: UpdateStatus[] = []
    let canInstall = false
    const service = new UpdateService({
      updater: updater as unknown as AppUpdater,
      currentVersion: '0.1.0',
      enabled: true,
      disabledMessage: '',
      canInstall: () => canInstall,
      publish: (status) => published.push(status),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })
    service.start()

    updater.emit('update-available', updateInfo())
    expect(service.status()).toMatchObject({ phase: 'available', availableVersion: '0.1.1' })

    service.download()
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
    expect(service.status().phase).toBe('ready')
    expect(service.install()).toEqual({ accepted: false, reason: 'agent_running' })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()

    canInstall = true
    expect(service.install()).toEqual({ accepted: true, reason: null })
    expect(service.status().phase).toBe('installing')
    expect(published.map((status) => status.phase)).toEqual([
      'available',
      'downloading',
      'downloading',
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
      canInstall: () => true,
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
