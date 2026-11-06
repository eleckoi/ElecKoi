import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { join, resolve, sep } from 'node:path'
import { initProfile, readProfileManifest, writeProfileBundles, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { OPTIONAL_BUNDLES } from '@deepseek-ai/dsh-official-bundles'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DshDesktopPluginHost, ELECKOI_DESKTOP_RECOVERY_BUNDLES, ELECKOI_DESKTOP_BUNDLES } from '@eleckoi/desktop-host'
import { disableAndroidUserPlugins, ELECKOI_ANDROID_RECOVERY_BUNDLES } from '../../apps/android-host/src/androidPluginRecovery'
import { ELECKOI_ANDROID_BUNDLES } from '../../apps/android-host/src/androidPluginBundles'
import { DesktopFatalRecovery } from '../../apps/desktop/src/main/platform/electron/desktopFatalRecovery'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    expect(resolve(root).startsWith(resolve(tmpdir()) + sep)).toBe(true)
    rmSync(root, { recursive: true, force: true })
  }
})

function fixture(platform: 'desktop' | 'android') {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-plugin-recovery-')); roots.push(root)
  const home = join(root, 'home'), profile = join(home, 'profiles', platform)
  const bundles = platform === 'desktop' ? ELECKOI_DESKTOP_RECOVERY_BUNDLES : ELECKOI_ANDROID_RECOVERY_BUNDLES
  // A custom package may even use the same scope; identity comes from the shipped roster.
  const custom = '@eleckoi/synthetic-user-plugin'
  initProfile(profile, [...bundles, custom])
  const manifest = readProfileManifest('test', profile)
  manifest.dependencies = { [custom]: '1.0.0' }
  writeProfileManifest(profile, manifest)
  const installed = join(profile, 'node_modules', custom, 'package.json')
  mkdirSync(join(profile, 'node_modules', custom), { recursive: true })
  writeFileSync(installed, '{broken plugin manifest')
  const patch = join(profile, 'cordis.patch.yml'); writeFileSync(patch, ': invalid user YAML')
  const data = join(root, 'chat-data'); writeFileSync(data, 'synthetic retained conversation')
  const globalPatch = join(home, 'cordis.patch.yml'); writeFileSync(globalPatch, '[]\n')
  const host = new DshDesktopPluginHost({ runtimeDataRoot: root, workspaceRoot: root,
    productDatabasePath: data, productMediaRoot: root, presetTemplatePath: 'unused', agentPatchPath: 'unused', executablePath: process.execPath })
  const recover = async () => platform === 'desktop' ? host.disableUserPlugins() : disableAndroidUserPlugins(home)
  return { root, profile, bundles, manifest, installed, patch, data, globalPatch, recover, host }
}

describe.each(['desktop', 'android'] as const)('%s plugin startup recovery', platform => {
  it('retains every shipped bundle while disabling user packages without importing or deleting them', async () => {
    const item = fixture(platform)
    const backup = await item.recover()
    expect(readProfileManifest('test', item.profile)).toEqual({ ...item.manifest, dsh: { profile: { bundles: item.bundles } } })
    const shipped = platform === 'desktop' ? ELECKOI_DESKTOP_BUNDLES : ELECKOI_ANDROID_BUNDLES
    expect(shipped.every(name => item.bundles.includes(name))).toBe(true)
    expect(readFileSync(backup!, 'utf8')).toBe(': invalid user YAML')
    expect(existsSync(item.patch)).toBe(false)
    expect(readFileSync(item.installed, 'utf8')).toBe('{broken plugin manifest')
    expect(readFileSync(item.data, 'utf8')).toBe('synthetic retained conversation')
    expect(readFileSync(item.globalPatch, 'utf8')).toBe('[]\n')
    initProfile(item.profile, item.bundles)
    expect(readProfileManifest('test', item.profile).dsh?.profile?.bundles).toEqual(item.bundles)
  })

  it('keeps the original configuration when the profile manifest cannot be read', async () => {
    const item = fixture(platform)
    writeFileSync(join(item.profile, 'package.json'), '{invalid')
    await expect(item.recover()).rejects.toThrow()
    expect(readFileSync(item.patch, 'utf8')).toBe(': invalid user YAML')
    expect(readFileSync(item.data, 'utf8')).toBe('synthetic retained conversation')
  })

  it('retains selected shipped official options without enabling the other optional bundles', async () => {
    const item = fixture(platform)
    const selected = '@deepseek-ai/dsh-experimental-auto-review'
    expect(OPTIONAL_BUNDLES).toContain(selected)
    writeProfileBundles(item.profile, item.manifest, [...item.manifest.dsh!.profile!.bundles!, selected])
    await item.recover()
    const restored = readProfileManifest('test', item.profile).dsh?.profile?.bundles
    expect(restored).toEqual([...item.bundles, selected])
    for (const name of OPTIONAL_BUNDLES.filter(name => name !== selected)) expect(restored).not.toContain(name)
  })
})

it('does not edit the desktop profile if the owning Host cannot stop', async () => {
  const item = fixture('desktop')
  vi.spyOn(item.host, 'close').mockRejectedValue(new Error('Synthetic shutdown failure'))
  await expect(item.recover()).rejects.toThrow('Synthetic shutdown failure')
  expect(readProfileManifest('test', item.profile)).toEqual(item.manifest)
  expect(readFileSync(item.patch, 'utf8')).toBe(': invalid user YAML')
})

it('shares the actual desktop shutdown wait and prevents profile recovery until the process exits', async () => {
  const item = fixture('desktop')
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, connected: true,
    send: vi.fn((_message, callback) => callback(null)), kill: vi.fn() })
  Object.assign(item.host, { child })
  const first = item.host.close()
  expect(item.host.close()).toBe(first)
  const recovering = item.recover()
  await Promise.resolve()
  expect(readProfileManifest('test', item.profile)).toEqual(item.manifest)
  expect(child.send).toHaveBeenCalledOnce()
  child.emit('exit', 0)
  await first
  await recovering
  expect(readProfileManifest('test', item.profile).dsh?.profile?.bundles).toEqual(item.bundles)
})

it('allows shutdown retry without changing plugin configuration after a termination timeout', async () => {
  vi.useFakeTimers()
  try {
    const item = fixture('desktop')
    const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, connected: false, kill: vi.fn() })
    Object.assign(item.host, { child })
    const rejected = expect(item.recover()).rejects.toThrow('插件配置未修改')
    await vi.advanceTimersByTimeAsync(10000)
    await rejected
    expect(readProfileManifest('test', item.profile)).toEqual(item.manifest)
    const retry = item.recover()
    child.emit('exit', 0)
    await retry
    expect(readProfileManifest('test', item.profile).dsh?.profile?.bundles).toEqual(item.bundles)
  } finally { vi.useRealTimers() }
})

describe('desktop native recovery', () => {
  it('deduplicates client and Host failures and stops before disabling user plugins', async () => {
    const order: string[] = []
    let choose!: (value: { response: number; checkboxChecked: boolean }) => void
    const choice = new Promise<{ response: number; checkboxChecked: boolean }>(resolve => { choose = resolve })
    const operations = {
      show: vi.fn(() => choice), stop: vi.fn(async () => { order.push('stop') }),
      disableUserPlugins: vi.fn(async () => { order.push('disable') }), restart: vi.fn(() => { order.push('restart') }),
      exit: vi.fn(), diagnostic: vi.fn()
    }
    const recovery = new DesktopFatalRecovery(operations)
    const first = recovery.report(new Error('Synthetic missing client dependency'))
    expect(recovery.report(new Error('Secondary Host error'))).toBe(first)
    choose({ response: 2, checkboxChecked: false }); await first
    expect(order).toEqual(['stop', 'disable', 'restart'])
    expect(operations.show).toHaveBeenCalledOnce()
  })

  it('shows a failed recovery operation again and ordinary restart does not change plugins', async () => {
    const operations = {
      show: vi.fn().mockResolvedValueOnce({ response: 2 }).mockResolvedValueOnce({ response: 1 }),
      stop: vi.fn().mockResolvedValue(undefined), disableUserPlugins: vi.fn().mockRejectedValue(new Error('Synthetic backup denied')),
      restart: vi.fn(), exit: vi.fn(), diagnostic: vi.fn()
    }
    await new DesktopFatalRecovery(operations).report(new Error('Synthetic client failure'))
    expect(operations.show.mock.calls[1]![0].detail).toContain('Synthetic backup denied')
    expect(operations.disableUserPlugins).toHaveBeenCalledOnce()
    expect(operations.restart).toHaveBeenCalledOnce()
  })

  it('preserves nested startup errors and ordinary exit does not change plugins', async () => {
    const operations = { show: vi.fn().mockResolvedValue({ response: 0 }), stop: vi.fn().mockResolvedValue(undefined),
      disableUserPlugins: vi.fn(), restart: vi.fn(), exit: vi.fn(), diagnostic: vi.fn() }
    await new DesktopFatalRecovery(operations).report(new AggregateError([
      new Error('Synthetic missing service'), new Error('Synthetic cleanup failure')
    ], 'Synthetic startup failure'))
    const detail = operations.show.mock.calls[0]![0].detail
    expect(detail).toContain('Synthetic missing service')
    expect(detail).toContain('Synthetic cleanup failure')
    expect(operations.disableUserPlugins).not.toHaveBeenCalled()
    expect(operations.restart).not.toHaveBeenCalled()
    expect(operations.exit).toHaveBeenCalledOnce()
  })
})
