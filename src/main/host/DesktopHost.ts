import { Context } from '@deepseek-ai/cordis'
import { agentPlugin } from '@main/modules/agent'
import { agentToolsPlugin } from '@main/modules/agentTools'
import { authorSdkPlugin } from '@main/modules/authorSdk'
import { characterTransferPlugin } from '@main/modules/characterTransfer'
import { compatibilityPlugin } from '@main/modules/compatibility'
import { conversationsPlugin } from '@main/modules/conversations'
import { modelsPlugin } from '@main/modules/models'
import { personasPlugin } from '@main/modules/personas'
import { settingsPlugin } from '@main/modules/settings'
import { settingLibrariesPlugin } from '@main/modules/settingLibraries'
import { variablesPlugin } from '@main/modules/variables'
import { regexRulesPlugin } from '@main/modules/regexRules'
import { agentPresetsPlugin } from '@main/modules/agentPresets'
import { mainWindowPlugin } from '@main/platform/electron/mainWindowPlugin'
import { mediaProtocolPlugin } from '@main/platform/electron/mediaProtocol'
import { updatesPlugin } from '@main/modules/updates'
import { gatewayPlugin, platformPlugin, sqlitePlugin } from './plugins'

export class DesktopHost {
  private readonly root = new Context()
  private foundationMounted = false
  private interactiveMounted = false

  async mountFoundation(): Promise<void> {
    if (this.foundationMounted) return
    await this.root.plugin(platformPlugin)
    await this.root.plugin(gatewayPlugin)
    await this.root.plugin(sqlitePlugin)
    await this.root.plugin(compatibilityPlugin)
    await this.root.plugin(variablesPlugin)
    await this.root.plugin(agentPresetsPlugin)
    await this.root.plugin(agentToolsPlugin)
    await this.root.plugin(regexRulesPlugin)
    await this.root.plugin(settingLibrariesPlugin)
    await this.root.plugin(conversationsPlugin)
    await this.root.plugin(settingsPlugin)
    await this.root.plugin(personasPlugin)
    await this.root.plugin(characterTransferPlugin)
    await this.root.plugin(modelsPlugin)
    this.foundationMounted = true
  }

  async mountInteractive(): Promise<void> {
    if (this.interactiveMounted) return
    if (!this.foundationMounted) throw new Error('Desktop foundation 尚未装载。')
    await this.root.plugin(agentPlugin)
    await this.root.plugin(authorSdkPlugin)
    await this.root.plugin(mediaProtocolPlugin)
    await this.root.plugin(mainWindowPlugin)
    await this.root.plugin(updatesPlugin)
    this.interactiveMounted = true
  }

  diagnostics() {
    return this.root.fiber.getEffects()
  }

  async dispose(): Promise<void> {
    await this.root.fiber.dispose()
    this.interactiveMounted = false
    this.foundationMounted = false
  }
}
