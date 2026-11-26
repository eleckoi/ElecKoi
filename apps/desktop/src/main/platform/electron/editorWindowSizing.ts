import type { Rectangle } from 'electron'

export const MAIN_WINDOW_SIZE = { width: 1480, height: 970 }
const EDITOR_WINDOW_SIZE = { width: 1480, height: 970 }

export function isEditorFrame(frameName: unknown): boolean {
  return typeof frameName === 'string'
    && (frameName.startsWith('character-editor-') || frameName.startsWith('preset-editor-'))
}

const EDITOR_OFFSET = 32

function offsetAxis(parentStart: number, preferredSize: number, areaStart: number, areaSize: number) {
  const size = Math.min(preferredSize, Math.max(1, areaSize - EDITOR_OFFSET))
  const limit = areaStart + areaSize - size
  const forward = Math.min(limit, parentStart + EDITOR_OFFSET)
  const backward = Math.max(areaStart, parentStart - EDITOR_OFFSET)
  const start = forward - parentStart >= parentStart - backward ? forward : backward
  return { start: Math.max(areaStart, Math.min(limit, start)), size }
}

export function editorWindowBounds(opener: Rectangle, workArea: Rectangle): Rectangle {
  const horizontal = offsetAxis(opener.x, EDITOR_WINDOW_SIZE.width, workArea.x, workArea.width)
  const vertical = offsetAxis(opener.y, EDITOR_WINDOW_SIZE.height, workArea.y, workArea.height)
  return { x: horizontal.start, y: vertical.start, width: horizontal.size, height: vertical.size }
}
