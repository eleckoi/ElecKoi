import { describe, expect, it } from 'vitest'
import { editorWindowBounds, isEditorFrame } from '../src/main/platform/electron/editorWindowSizing'

describe('managed editor window placement', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 }

  it('opens both editors at their default size even if the opener was resized', () => {
    for (const frame of ['character-editor-synthetic', 'preset-editor-synthetic']) expect(isEditorFrame(frame)).toBe(true)
    for (const size of [{ width: 1000, height: 650 }, { width: 1800, height: 990 }]) {
      expect(editorWindowBounds({ x: 40, y: 20, ...size }, area))
        .toEqual({ x: 72, y: 52, width: 1480, height: 970 })
    }
  })

  it('offsets in the other direction at the display edge', () => {
    expect(editorWindowBounds({ x: 440, y: 70, width: 1380, height: 860 }, area))
      .toEqual({ x: 408, y: 38, width: 1480, height: 970 })
  })

  it('opens a separate window inside a maximized opener on its own monitor', () => {
    const secondary = { ...area, x: -1920 }
    expect(editorWindowBounds(secondary, secondary)).toEqual({ x: -1888, y: 32, width: 1480, height: 970 })
    for (const frame of ['creator-studio', 'character-manager', 'preset-manager', undefined]) expect(isEditorFrame(frame)).toBe(false)
  })

  it('fits a smaller display while keeping the editor inside its work area', () => {
    const smallerArea = { x: 1920, y: 70, width: 1366, height: 810 }
    expect(editorWindowBounds({ ...smallerArea, width: 1000, height: 650 }, smallerArea))
      .toEqual({ x: 1952, y: 102, width: 1334, height: 778 })
  })
})
