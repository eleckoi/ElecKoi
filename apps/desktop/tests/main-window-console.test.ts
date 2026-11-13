import { EventEmitter } from 'node:events'
import type { BrowserWindow, WebContentsConsoleMessageEventParams, WebFrameMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { describeAction, formatActionLogMessage } from '@shared/foundation/actionLog'
import { LOG_ACTIONS } from '@shared/contracts/logActions'
import { installMainWindowConsole } from '../src/main/platform/electron/mainWindowConsole'

function setup() {
  let windowDestroyed = false
  let contentsDestroyed = false
  let mainFrame = {} as WebFrameMain
  const assertLive = (): void => { if (contentsDestroyed) throw new TypeError('Object has been destroyed') }
  const frameRead = vi.fn(() => { assertLive(); return mainFrame })
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => contentsDestroyed,
    getURL: vi.fn(() => { assertLive(); return 'dsh-app://app/' })
  })
  Object.defineProperty(contents, 'mainFrame', { get: frameRead })
  const window = Object.assign(new EventEmitter(), { isDestroyed: () => windowDestroyed })
  Object.defineProperty(window, 'webContents', { get: () => {
    if (windowDestroyed) throw new TypeError('Object has been destroyed')
    return contents
  } })
  const log = { info: vi.fn(), error: vi.fn() }
  const dispose = installMainWindowConsole(window as unknown as BrowserWindow, log)
  const details = (values: Partial<WebContentsConsoleMessageEventParams> = {}): WebContentsConsoleMessageEventParams => ({
    level: 'error', message: 'Synthetic renderer failure', sourceId: 'dsh-app://app/client.js',
    lineNumber: 12, frame: mainFrame, ...values
  })
  return { window, contents, log, dispose, details, frameRead,
    destroyWindow: () => { windowDestroyed = true },
    destroyContents: () => { contentsDestroyed = true },
    replaceFrame: () => { mainFrame = {} as WebFrameMain }
  }
}

describe('main window console lifetime', () => {
  it('records main-frame actions and errors while ignoring ordinary console output', () => {
    const h = setup()
    h.contents.emit('console-message', h.details({ level: 'info', message: formatActionLogMessage(describeAction(LOG_ACTIONS.sessionStarted, 'start')) }))
    expect(h.log.info).toHaveBeenCalledWith(expect.objectContaining({ source: 'renderer' }), expect.any(String))
    h.contents.emit('console-message', h.details())
    expect(h.log.error).toHaveBeenCalledWith({ message: 'Synthetic renderer failure', lineNumber: 12,
      sourceId: 'dsh-app://app/client.js', url: 'dsh-app://app/' }, 'DSH client renderer error')
    h.contents.emit('console-message', h.details({ level: 'info', message: 'Ordinary output' }))
    expect(h.log.info).toHaveBeenCalledTimes(1)
    expect(h.log.error).toHaveBeenCalledTimes(1)
  })

  it.each(['srcdoc', 'subframe'])('keeps %s actions and errors out of the main renderer log', source => {
    const h = setup(), fields = source === 'srcdoc' ? { sourceId: 'about:srcdoc' } : { frame: {} as WebFrameMain }
    h.contents.emit('console-message', h.details(fields))
    h.contents.emit('console-message', h.details({ ...fields, message: formatActionLogMessage(describeAction(LOG_ACTIONS.sessionStarted, 'start')) }))
    expect(h.log.info).not.toHaveBeenCalled()
    expect(h.log.error).not.toHaveBeenCalled()
  })

  it.each(['window', 'contents'])('ignores a late console callback after the %s is destroyed, before notification', target => {
    const h = setup()
    const queued = h.contents.listeners('console-message')[0]!
    const details = h.details()
    if (target === 'window') h.destroyWindow(); else h.destroyContents()
    expect(() => queued(details)).not.toThrow()
    expect(h.frameRead).not.toHaveBeenCalled()
    expect(h.contents.getURL).not.toHaveBeenCalled()
    expect(h.log.error).not.toHaveBeenCalled()
  })

  it.each(['closed', 'destroyed', 'dispose'])('releases both lifetime listeners on %s and makes queued callbacks inert', event => {
    const h = setup(), queued = h.contents.listeners('console-message')[0]!, details = h.details()
    if (event === 'closed') h.window.emit('closed')
    else if (event === 'destroyed') h.contents.emit('destroyed')
    else h.dispose()
    h.dispose()
    expect(h.contents.listenerCount('console-message')).toBe(0)
    expect(h.contents.listenerCount('destroyed')).toBe(0)
    expect(h.window.listenerCount('closed')).toBe(0)
    queued(details)
    expect(h.log.error).not.toHaveBeenCalled()
  })

  it('keeps logging after a cancelled close and after main-frame navigation', () => {
    const h = setup()
    h.window.emit('close', { preventDefault: vi.fn() })
    h.replaceFrame()
    h.contents.emit('console-message', h.details())
    expect(h.log.error).toHaveBeenCalledTimes(1)
  })

  it('does not suppress unrelated logging failures in a live window', () => {
    const h = setup(), failure = new Error('Synthetic logging failure')
    h.log.error.mockImplementationOnce(() => { throw failure })
    expect(() => h.contents.emit('console-message', h.details())).toThrow(failure)
  })
})
