import { join } from 'node:path'
import { app, dialog } from 'electron'
import { DesktopHost } from '@main/host/DesktopHost'
import { StartupProfileStore } from '@main/host/startup/StartupProfileStore'
import { configureElectron } from '@main/host/startup/configureElectron'
import { getBootstrapLogger } from '@main/platform/logging/AppLog'
import { registerLocalMediaScheme } from '@main/platform/electron/mediaProtocol'

const logger = getBootstrapLogger()
registerLocalMediaScheme()
const startupProfiles = new StartupProfileStore()
const startupProfile = startupProfiles.load(join(app.getPath('userData'), 'startup-profile.json'))
configureElectron(startupProfile)

const host = new DesktopHost()
const ownsPrimaryInstance = app.requestSingleInstanceLock()
let shutdownStarted = false
let shutdownComplete = false

if (!ownsPrimaryInstance) {
  app.quit()
} else {
  void startDesktop()
}

async function startDesktop(): Promise<void> {
  try {
    await host.mountFoundation()
    await app.whenReady()
    app.setAppUserModelId('com.eleckoi.desktop')
    await host.mountInteractive()
  } catch (error) {
    logger.error({ err: error, effects: host.diagnostics() }, 'ElecKoi Desktop 启动失败')
    dialog.showErrorBox('ElecKoi 启动失败', `${formatError(error)}\n\n请把这段错误发给开发者。`)
    app.quit()
  }
}

app.on('window-all-closed', () => app.quit())

app.on('before-quit', (event) => {
  if (shutdownComplete) return
  event.preventDefault()
  if (shutdownStarted) return
  shutdownStarted = true
  void host.dispose()
    .catch((error) => logger.error({ err: error }, 'ElecKoi Desktop 关闭运行代失败'))
    .finally(() => {
      shutdownComplete = true
      app.quit()
    })
})

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}
