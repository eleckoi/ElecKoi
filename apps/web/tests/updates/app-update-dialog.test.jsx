// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppUpdateController as ProductAppUpdateController } from '../../src/modules/updates/components/AppUpdateController.jsx'
import { WithOfficialMarkdown } from '../helpers/officialMarkdown.jsx'
import { useAppUpdates } from '../../src/modules/updates/hooks/useAppUpdates.js'
import { AboutSettings } from '../../src/modules/settings/components/AboutSettings.jsx'

let root, host
function AppUpdateController(props) {
  return <WithOfficialMarkdown><ProductAppUpdateController {...props} /></WithOfficialMarkdown>
}
beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

function UpdateSettings() {
  const updates = useAppUpdates()
  return <><AboutSettings updates={updates} /><AppUpdateController updates={updates} /></>
}

function connectUpdateService(status) {
  let listener
  const service = {
    status: vi.fn(async () => status),
    subscribe: vi.fn(callback => { listener = callback; return () => { listener = undefined } }),
    check: vi.fn(async () => status),
    download: vi.fn(),
    install: vi.fn(async () => ({ accepted: true }))
  }
  if (globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === 'android') vi.stubGlobal('ElecKoiPlatform', { updates: service })
  else vi.stubGlobal('dshDesktop', { updates: service })
  return { service, publish(next) { status = next; listener?.(next) } }
}

it.each(['desktop', 'android'])('reopens a dismissed version on %s from About and after another manual check without reopening on background notifications', async platform => {
  vi.stubGlobal('__ELECKOI_CLIENT_PLATFORM__', { kind: platform })
  const available = { phase: 'available', currentVersion: '0.2.12', availableVersion: '0.2.13' }
  const bridge = connectUpdateService({ phase: 'idle', currentVersion: '0.2.12' })
  bridge.service.check.mockImplementation(async () => {
    bridge.publish({ ...available, phase: 'checking' })
    bridge.publish(available)
    return available
  })
  await act(async () => root.render(<UpdateSettings />))
  const aboutButton = () => document.querySelector('.about-update-button')
  const close = async () => act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  await act(async () => aboutButton().click())
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  await close()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await act(async () => bridge.publish({ ...available }))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await act(async () => aboutButton().click())
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  await close()
  // An explicit check can return the same release again after the checking state.
  await act(async () => bridge.publish({ phase: 'idle', currentVersion: '0.2.12' }))
  await act(async () => aboutButton().click())
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
})

it.each(['desktop', 'android'].flatMap(platform => ['downloading', 'verifying', 'ready', 'error'].map(phase => [platform, phase])))('reopens hidden %s %s controls from About without starting another update operation', async (platform, phase) => {
  vi.stubGlobal('__ELECKOI_CLIENT_PLATFORM__', { kind: platform })
  const { service } = connectUpdateService({ phase, currentVersion: '0.2.12', availableVersion: '0.2.13', failedOperation: phase === 'error' ? 'download' : undefined })
  await act(async () => root.render(<UpdateSettings />))
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  const button = document.querySelector('.about-update-button')
  expect(button.disabled).toBe(false)
  await act(async () => button.click())
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(service.check).not.toHaveBeenCalled()
  expect(service.download).not.toHaveBeenCalled()
  expect(service.install).not.toHaveBeenCalled()
})

it('uses the declared Android release and download action without desktop installation controls', async () => {
  vi.stubGlobal('__ELECKOI_CLIENT_PLATFORM__',{kind:'android'});
  const updates={status:{phase:'available',availableVersion:'0.2.9',currentVersion:'0.2.8',releaseUrl:'https://github.com/eleckoi/ElecKoi/releases/tag/android-v0.2.9'},download:vi.fn(),install:vi.fn()};
  await act(async () => root.render(<AppUpdateController updates={updates} />));
  expect(document.querySelector('a').href).toBe(updates.status.releaseUrl);
  expect(document.querySelector('.is-primary').textContent).toBe('前往下载');
  await act(async () => document.querySelector('.is-primary').click());
  expect(updates.download).toHaveBeenCalledOnce(); expect(updates.install).not.toHaveBeenCalled();
  updates.status={...updates.status,phase:'error',manualCheck:false,message:'合成网络错误'};
  await act(async () => root.render(<AppUpdateController updates={updates} />));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
})

it('keeps complete notes and update controls through download and install without stealing reading focus', async () => {
  const releaseNotes = Array.from({ length: 100 }, (_, index) => `合成更新条目 ${index}`).join('\n')
  const updates = { status: { phase: 'available', availableVersion: '0.2.8', currentVersion: '0.2.7', releaseNotes },
    download: vi.fn(), install: vi.fn(async () => ({ accepted: true })) }
  const render = async () => { await act(async () => root.render(<AppUpdateController updates={updates} />)) }
  await render()
  await new Promise(resolve => setTimeout(resolve, 5))
  const notes = document.querySelector('.app-update-notes-section')
  expect(notes.textContent.trim().replace(/\s+/g, ' ')).toBe(releaseNotes.replace(/\s+/g, ' '))
  expect(notes.tabIndex).toBe(0)
  expect(document.querySelector('a').href).toBe('https://github.com/eleckoi/ElecKoi/releases/tag/v0.2.8')
  await act(async () => document.querySelector('.is-primary').click())
  expect(updates.download).toHaveBeenCalledOnce()
  notes.focus()
  updates.status = { ...updates.status, phase: 'downloading', progress: { percent: 46 } }
  await render()
  await new Promise(resolve => setTimeout(resolve, 5))
  expect(document.activeElement).toBe(notes)
  expect(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('46')
  expect(document.querySelector('.is-primary').disabled).toBe(true)
  updates.status = { ...updates.status, phase: 'verifying', progress: { percent: 100 } }
  await render()
  expect(document.querySelector('.is-primary').textContent).toBe('正在校验')
  expect(document.querySelector('.is-primary').disabled).toBe(true)
  expect(document.activeElement).toBe(notes)
  updates.status = { ...updates.status, phase: 'ready' }
  await render()
  await act(async () => document.querySelector('.is-primary').click())
  expect(updates.install).toHaveBeenCalledOnce()
  const link = document.querySelector('a')
  link.focus()
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })))
  expect(document.activeElement).toBe(document.querySelector('.is-primary'))
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it.each([
  ['check', '重新检查', 'check'],
  ['download', '重新下载', 'download'],
  ['install', '重试安装', 'install']
])('retries the failed %s stage without repeating another stage', async (failedOperation, label, action) => {
  const updates = {
    status: { phase: 'error', failedOperation, availableVersion: '1.0.1', currentVersion: '1.0.0', message: '合成更新错误' },
    check: vi.fn(), download: vi.fn(), install: vi.fn(async () => ({ accepted: true }))
  }
  await act(async () => root.render(<AppUpdateController updates={updates} />))
  const button = document.querySelector('.is-primary')
  expect(button.textContent).toBe(label)
  await act(async () => button.click())
  for (const stage of ['check', 'download', 'install']) {
    expect(updates[stage]).toHaveBeenCalledTimes(stage === action ? 1 : 0)
  }
})

it.each(['desktop', 'android'])('renders complete release Markdown and keeps both platform download links on %s', async platform => {
  vi.stubGlobal('__ELECKOI_CLIENT_PLATFORM__', { kind: platform })
  const updates = { status: {
    phase: 'available', currentVersion: '1.0.0', availableVersion: '1.0.1',
    releaseUrl: 'https://github.com/eleckoi/ElecKoi/releases/tag/v1.0.1',
    releaseNotes: '## 修复\n\n- **合成修复**\n\n## 下载\n\n- [Windows 安装包](https://example.com/update.exe)\n- [Android 安装包](https://example.com/update.apk)\n\n末尾说明。'
  } }
  await act(async () => root.render(<AppUpdateController updates={updates} />))
  const notes = document.querySelector('.app-update-notes-section')
  expect([...notes.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual(['修复', '下载'])
  expect(notes.querySelector('strong')?.textContent).toBe('合成修复')
  expect([...notes.querySelectorAll('a')].map(link => [link.textContent, link.href])).toEqual([
    ['Windows 安装包', 'https://example.com/update.exe'],
    ['Android 安装包', 'https://example.com/update.apk']
  ])
  expect(notes.textContent).toContain('末尾说明。')
  expect(notes.textContent).not.toContain('##')
  expect(notes.textContent).not.toContain('https://example.com')
})
