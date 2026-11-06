import { Context } from '@deepseek-ai/cordis'
import type { Logger } from 'pino'
import type { AppPaths } from '@main/platform/filesystem/AppPaths'
import { mainWindowPlugin } from '@main/platform/electron/mainWindowPlugin'
import { mediaProtocolPlugin } from '@main/platform/electron/mediaProtocol'
import { updatesPlugin } from '@main/modules/updates'
import { diagnosticsPlugin } from '@main/modules/diagnostics'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { platformPlugin } from './plugins'
import { dshHostPlugin } from './dshHostPlugin'

export class DesktopHost {
  private readonly root = new Context()
  private foundationMounted = false
  private interactiveMounted = false

  constructor(onFailure: (error: Error) => void = () => {}) {
    this.root.on('eleckoi/desktop-fatal', onFailure)
  }

  async mountFoundation(): Promise<void> {
    if (this.foundationMounted) return
    await this.root.plugin(platformPlugin)
    this.foundationMounted = true
  }

  async mountInteractive(): Promise<void> {
    if (this.interactiveMounted) return
    if (!this.foundationMounted) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, 'Desktop foundation 尚未装载。', { what: '装载 Desktop foundation' })
    }
    await this.root.plugin(dshHostPlugin)
    await this.root.plugin(mediaProtocolPlugin)
    await this.root.plugin(mainWindowPlugin)
    await this.root.plugin(updatesPlugin)
    await this.root.plugin(diagnosticsPlugin)
    this.interactiveMounted = true
  }

  diagnostics() {
    return this.root.fiber.getEffects()
  }

  async stopPluginHost(): Promise<void> {
    await this.root.get('pluginHost')?.close()
  }

  async disableUserPlugins(): Promise<string | undefined> {
    const host = this.root.get('pluginHost')
    if (host === undefined) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, 'DSH 插件宿主未装载，无法恢复插件配置。', { what: '装载 DSH 插件宿主' })
    }
    return host.disableUserPlugins()
  }

  async dispose(): Promise<void> {
    await this.root.fiber.dispose()
    this.interactiveMounted = false
    this.foundationMounted = false
  }

  /**
   * 主进程日志（`platformPlugin` 装载后可用）。
   * 会话首尾标记与进程级出口用它，保证与宿主日志写进同一个文件。
   */
  get appLog(): Logger | undefined {
    return this.root.get('appLog')
  }

  /**
   * 路径归属（`platformPlugin` 装载后可用）。`userData` 以它为最终值：
   * 启动配置可能改写 `app.setPath('userData')`，`main.ts` 自己不读 `app.getPath`。
   */
  get appPaths(): AppPaths | undefined {
    return this.root.get('appPaths')
  }
}
