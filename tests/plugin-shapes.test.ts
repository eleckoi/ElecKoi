import { describe, expect, it } from 'vitest'
import { gatewayPlugin, platformPlugin, sqlitePlugin } from '../src/main/host/plugins'
import { agentPlugin } from '../src/main/modules/agent'
import { conversationsPlugin } from '../src/main/modules/conversations'
import { modelsPlugin } from '../src/main/modules/models'
import { personasPlugin } from '../src/main/modules/personas'
import { settingsPlugin } from '../src/main/modules/settings'
import { variablesPlugin } from '../src/main/modules/variables'
import { settingLibrariesPlugin } from '../src/main/modules/settingLibraries'
import { regexRulesPlugin } from '../src/main/modules/regexRules'
import { mainWindowPlugin } from '../src/main/platform/electron/mainWindowPlugin'

const plugins = [
  platformPlugin,
  gatewayPlugin,
  sqlitePlugin,
  variablesPlugin,
  settingLibrariesPlugin,
  regexRulesPlugin,
  conversationsPlugin,
  personasPlugin,
  modelsPlugin,
  settingsPlugin,
  agentPlugin,
  mainWindowPlugin
]

describe('Cordis plugin definitions', () => {
  it('load as named object plugins without mutating Function.name', () => {
    expect(plugins).toHaveLength(12)
    for (const plugin of plugins) {
      expect(plugin.name).toMatch(/^eleckoi-/)
      expect(plugin.apply).toBeTypeOf('function')
      expect(typeof plugin).toBe('object')
    }
  })
})
