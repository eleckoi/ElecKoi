import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

const resolveRuntimeModule = createRequire(import.meta.url).resolve

const PRODUCT_PLUGIN_FILES = new Map([
  ['uploaded-file-tools', 'uploaded-file-tools.mjs'],
  ['variable-tools', 'variable-tools.mjs'],
  ['setting-library-tools', 'setting-library-tools.mjs'],
  ['roleplay-plan-tool', 'roleplay-plan-tool.mjs']
])

const productSpecifier = (id) => `eleckoi:agent-preset/${id}`
const retiredPruner = '@deepseek-ai/dsh-compaction-tool-result-pruner'
const retiredPrunerUrl = pathToFileURL(resolveRuntimeModule(retiredPruner)).href

export const durableProductPluginSpecifier = productSpecifier

export function runtimePresetDefinition(definition, templatePath) {
  return {
    ...definition,
    plugins: Array.isArray(definition.plugins)
      ? currentPlugins(definition.plugins).map((plugin) => resolveRuntimePlugin(plugin, templatePath))
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
  return runtimePresetDefinition(parsed, templatePath)
}

function resolveRuntimePlugin(plugin, templatePath) {
  if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) return plugin
  const productFile = PRODUCT_PLUGIN_FILES.get(plugin.id)
  let name = plugin.name
  if (typeof name === 'string' && (name.startsWith('@deepseek-ai/') || name.startsWith('@eleckoi/'))) {
    name = pathToFileURL(resolveRuntimeModule(name)).href

  } else if (productFile && name === productSpecifier(plugin.id)) {
    if (!templatePath) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `ElecKoi Agent preset ${plugin.id} is missing its runtime template path`, { what: '预设的运行时模板路径' })
    name = pathToFileURL(join(dirname(templatePath), '..', productFile)).href
  }
  return {
    ...plugin,
    name,
    ...(Array.isArray(plugin.config)
      ? { config: currentPlugins(plugin.config).map((item) => resolveRuntimePlugin(item, templatePath)) }
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
    [productSpecifier('image-generation-tools'), new URL('./image-generation-tools.mjs', import.meta.url).href].includes(plugin.name)
  return plugins.filter(plugin => !oldImage(plugin) && plugin?.name !== retiredPruner && plugin?.name !== retiredPrunerUrl)
}
