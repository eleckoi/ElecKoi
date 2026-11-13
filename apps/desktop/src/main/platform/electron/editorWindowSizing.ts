import type { BrowserWindow } from 'electron'

export const MAIN_WINDOW_SIZE = { width: 1480, height: 970 }

export function isEditorFrame(frameName: unknown): boolean {
  return typeof frameName === 'string'
    && (frameName.startsWith('character-editor-') || frameName.startsWith('preset-editor-'))
}

export function editorWindowSize(main?: BrowserWindow): { width: number; height: number } {
  if (!main || main.isDestroyed()) return { ...MAIN_WINDOW_SIZE }
  const { width, height } = main.getNormalBounds()
  return { width, height }
}

/** Apply the current main window size whenever a managed editor is opened. */
export function matchEditorWindowSize(editor: BrowserWindow, main?: BrowserWindow): void {
  if (!main || main.isDestroyed() || editor.isDestroyed()) return
  if (main.isMaximized()) {
    const current = editor.getBounds(), target = main.getBounds()
    if (editor.isMaximized() && current.x === target.x && current.y === target.y
      && current.width === target.width && current.height === target.height) return
    if (editor.isMaximized()) editor.unmaximize()
    editor.setBounds(main.getNormalBounds())
    editor.maximize()
    return
  }
  if (editor.isMaximized()) editor.unmaximize()
  editor.setBounds(main.getBounds())
}
