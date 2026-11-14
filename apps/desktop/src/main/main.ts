import { join } from 'node:path'
import { app, dialog, protocol } from 'electron'
import type { Logger } from 'pino'
import { DesktopHost } from '@main/host/DesktopHost'
import { StartupProfileStore } from '@main/host/startup/StartupProfileStore'
import { configureElectron, configureRuntimeUserData } from '@main/host/startup/configureElectron'
import { getBootstrapLogger, logAppSessionEnd, logAppSessionStart } from '@main/platform/logging/AppLog'
import { appLogFilePath } from '@main/platform/logging/logRotation'
import { installDesktopProcessFailureLogging } from '@main/host/dshHostPlugin'
import { localMediaScheme } from '@main/platform/electron/mediaProtocol'
import { windowsAppUserModelId } from '@main/platform/electron/windowsAppIdentity'
import { DesktopFatalRecovery } from '@main/platform/electron/desktopFatalRecovery'

const logger = getBootstrapLogger()
protocol.registerSchemesAsPrivileged([localMediaScheme, {
  scheme: 'dsh-app',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    codeCache: true
  }
}])
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
configureRuntimeUserData()
const startupProfiles = new StartupProfileStore()
const startupProfile = startupProfiles.load(join(app.getPath('userData'), 'startup-profile.json'))
configureElectron(startupProfile)

const host = new DesktopHost(error => { void reportFatal(error) })
const recovery = new DesktopFatalRecovery({
  show: options => dialog.showMessageBox(options),
  stop: () => host.stopPluginHost(),
  disableUserPlugins: async () => {
    const backupPath = await host.disableUserPlugins()
    logger.info({ backupPath }, '用户插件已停用，ElecKoi 内置组合已保留')
  },
  exit: () => app.quit(),
  restart: () => { app.relaunch(); app.quit() },
  diagnostic: error => logger.error({ err: error, effects: host.diagnostics() }, 'ElecKoi 运行失败')
})
const ownsPrimaryInstance = app.requestSingleInstanceLock()
let shutdownStarted = false
let shutdownComplete = false
let sessionLog: Logger | undefined
let sessionId: string | undefined

if (!ownsPrimaryInstance) {
  app.quit()
} else {
  void startDesktop()
}

async function startDesktop(): Promise<void> {
  try {
    await host.mountFoundation()
    // 进程级出口写进文件日志：platformPlugin 已经把 appLog 提供出来了；万一没有（不该发生），
    // 退回 bootstrap logger，至少不静默。
    installDesktopProcessFailureLogging(host.appLog ?? logger)
    await app.whenReady()
    app.setAppUserModelId(windowsAppUserModelId)
    logSessionStart()
    await host.mountInteractive()
  } catch (error) {
    await reportFatal(error)
  }
}

/** 应用就绪：写会话开始标记（带语义键、配对标识与日志文件路径）。 */
function logSessionStart(): void {
  const appLog = host.appLog
  const appPaths = host.appPaths
  if (appLog === undefined || appPaths === undefined) return
  sessionLog = appLog
  sessionId = logAppSessionStart(appLog, appLogFilePath(appPaths.userData))
}

/** 正常退出：会话结束标记（同一个配对标识）。崩溃 / 强杀时走不到这里，日志只剩 start。 */
function logSessionEnd(): void {
  if (sessionLog === undefined || sessionId === undefined) return
  logAppSessionEnd(sessionLog, sessionId)
  sessionLog = undefined
  sessionId = undefined
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
      logSessionEnd()
      shutdownComplete = true
      app.quit()
    })
})

async function reportFatal(error: unknown): Promise<void> {
  await app.whenReady()
  try { await recovery.report(error) }
  catch (failure) { logger.error({ err: failure }, '原生恢复操作失败'); app.quit() }
}
