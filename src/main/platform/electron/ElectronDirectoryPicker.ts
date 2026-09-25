import { BrowserWindow, dialog } from 'electron'

export interface DirectoryPickerRequest {
  readonly title: string
  readonly buttonLabel: string
}

/**
 * 原生"选择目录"对话框的平台适配器。
 * 业务模块经 ctx.directoryPicker 注入使用，不直接持有 Electron 的窗口与对话框。
 */
export class ElectronDirectoryPicker {
  async pickDirectory(request: DirectoryPickerRequest): Promise<string | undefined> {
    const options = {
      title: request.title,
      buttonLabel: request.buttonLabel,
      properties: ['openDirectory', 'createDirectory'] as const
    }
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const selection = parent === undefined
      ? await dialog.showOpenDialog({ ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog(parent, { ...options, properties: [...options.properties] })
    if (selection.canceled) return undefined
    return selection.filePaths[0]
  }
}
