import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

const resolveRuntimeModule = createRequire(import.meta.url).resolve

const PRODUCT_PLUGIN_FILES = new Map([
  ['uploaded-file-tools', 'uploaded-file-tools.mjs'],
  ['variable-tools', 'variable-tools.mjs'],
  ['setting-library-tools', 'setting-library-tools.mjs'],
  ['roleplay-plan-tool', 'roleplay-plan-tool.mjs']
])

const productSpecifier = (id) => `@eleckoi/dsh-client-roleplay/host/${PRODUCT_PLUGIN_FILES.get(id)}`
const retiredPruner = '@deepseek-ai/dsh-compaction-tool-result-pruner'
const retiredPrunerUrl = pathToFileURL(resolveRuntimeModule(retiredPruner)).href

export const durableProductPluginSpecifier = productSpecifier

export function runtimePresetDefinition(definition) {
  return {
    ...definition,
    plugins: Array.isArray(definition.plugins)
      ? currentPlugins(definition.plugins).map(resolveRuntimePlugin)
      : definition.plugins
  }
}

export function readRuntimePresetDefinition(path, id, templatePath, requiredProductPlugins = []) {
  const source = readFileSync(path, 'utf8')
  const parsed = JSON.parse(source)
  if (parsed?.id !== id || !Array.isArray(parsed.plugins)) {
    throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, `ElecKoi Agent preset ${id} has an invalid composition`, { what: 'Agent 预设的组成' })
  }
  // Generated declarations retain their selected capabilities; required Host
  // file access is restored before mounting without changing Session history.
  for (const pluginId of requiredProductPlugins) {
    if (!PRODUCT_PLUGIN_FILES.has(pluginId)) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `未知的预设必需插件：${pluginId}`, { what: '预设必需插件' })
    if (!parsed.plugins.some(plugin => plugin?.id === pluginId)) {
      parsed.plugins.push({ id: pluginId, name: productSpecifier(pluginId) })
    }
  }
  return runtimePresetDefinition(parsed)
}

function resolveRuntimePlugin(plugin) {
  if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) return plugin
  let name = plugin.name
  // RETIRE WHEN: supported generated presets have all been regenerated with
  // package identities. Remove this old symbolic-name conversion and its test.
  if (PRODUCT_PLUGIN_FILES.has(plugin.id) && name === `eleckoi:agent-preset/${plugin.id}`) name = productSpecifier(plugin.id)
  return {
    ...plugin,
    name,
    ...(Array.isArray(plugin.config)
      ? { config: currentPlugins(plugin.config).map(resolveRuntimePlugin) }
      : {})
  }
}

// RETIRE WHEN: supported installations have regenerated all persisted runtime
// presets without the retired pruner, and an upgrade regression proves old
// sessions restore without filtering. Remove this filter, its two identity
// constants and the currentPlugins calls together; keep summary compaction.
function currentPlugins(plugins) {
  // RETIRE WHEN: supported Session presets have been regenerated without the
  // former preset-mounted image handler. Remove this filter with its regression.
  const oldImage = plugin => plugin?.id === 'image-generation-tools' &&
    ['eleckoi:agent-preset/image-generation-tools', new URL('./image-generation-tools.mjs', import.meta.url).href].includes(plugin.name)
  return plugins.filter(plugin => !oldImage(plugin) && plugin?.name !== retiredPruner && plugin?.name !== retiredPrunerUrl)
}
