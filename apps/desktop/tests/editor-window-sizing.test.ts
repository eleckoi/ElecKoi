import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { editorWindowSize, isEditorFrame, matchEditorWindowSize } from '../src/main/platform/electron/editorWindowSizing'

function windowStub(bounds = { x: 40, y: 50, width: 1380, height: 860 }) {
  return {
    isDestroyed: vi.fn(() => false), isMaximized: vi.fn(() => false),
    getBounds: vi.fn(() => ({ ...bounds })), getNormalBounds: vi.fn(() => ({ ...bounds })),
    setBounds: vi.fn(), maximize: vi.fn(), unmaximize: vi.fn(),
  }
}
const native = (value: ReturnType<typeof windowStub>) => value as unknown as BrowserWindow

describe('managed editor window sizing', () => {
  it('uses the current main size for both editor types and re-reads it when reopened', () => {
    const main = windowStub(), editor = windowStub()
    for (const frame of ['character-editor-synthetic', 'preset-editor-synthetic']) {
      expect(isEditorFrame(frame)).toBe(true)
      expect(editorWindowSize(native(main))).toEqual({ width: 1380, height: 860 })
      matchEditorWindowSize(native(editor), native(main))
      expect(editor.setBounds).toHaveBeenLastCalledWith(main.getBounds())
    }
    main.getBounds.mockReturnValue({ x: 100, y: 60, width: 1600, height: 900 })
    matchEditorWindowSize(native(editor), native(main))
    expect(editor.setBounds).toHaveBeenLastCalledWith({ x: 100, y: 60, width: 1600, height: 900 })
  })

  it('maximizes on the main display and preserves its restore size', () => {
    const main = windowStub({ x: 2000, y: 40, width: 1300, height: 800 }), editor = windowStub()
    main.isMaximized.mockReturnValue(true)
    main.getBounds.mockReturnValue({ x: 1920, y: 0, width: 1920, height: 1040 })
    expect(editorWindowSize(native(main))).toEqual({ width: 1300, height: 800 })
    matchEditorWindowSize(native(editor), native(main))
    expect(editor.setBounds).toHaveBeenCalledWith({ x: 2000, y: 40, width: 1300, height: 800 })
    expect(editor.maximize).toHaveBeenCalledOnce()
    expect(editor.setBounds.mock.invocationCallOrder[0]).toBeLessThan(editor.maximize.mock.invocationCallOrder[0]!)
  })

  it('restores a reused maximized editor when the main window is normal again', () => {
    const main = windowStub(), editor = windowStub()
    editor.isMaximized.mockReturnValue(true)
    matchEditorWindowSize(native(editor), native(main))
    expect(editor.unmaximize).toHaveBeenCalledOnce()
    expect(editor.setBounds).toHaveBeenCalledWith(main.getBounds())
    expect(editor.maximize).not.toHaveBeenCalled()
  })

  it('avoids native reads after either window is destroyed and excludes other child windows', () => {
    const main = windowStub(), editor = windowStub()
    main.isDestroyed.mockReturnValue(true)
    matchEditorWindowSize(native(editor), native(main))
    expect(main.getBounds).not.toHaveBeenCalled()
    expect(editor.setBounds).not.toHaveBeenCalled()
    expect(editorWindowSize(native(main))).toEqual(editorWindowSize())
    main.isDestroyed.mockReturnValue(false)
    editor.isDestroyed.mockReturnValue(true)
    matchEditorWindowSize(native(editor), native(main))
    expect(main.getBounds).not.toHaveBeenCalled()
    for (const frame of ['creator-studio', 'character-manager', 'preset-manager', undefined]) expect(isEditorFrame(frame)).toBe(false)
  })
})
