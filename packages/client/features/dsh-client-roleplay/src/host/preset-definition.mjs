import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

const resolveRuntimeModule = createRequire(import.meta.url).resolve

const PRODUCT_PLUGIN_FILES = new Map([
  ['variable-tools', 'variable-tools.mjs'],
  ['setting-library-tools', 'setting-library-tools.mjs'],
  ['roleplay-plan-tool', 'roleplay-plan-tool.mjs']
])

const productSpecifier = (id) => `@eleckoi/dsh-client-roleplay/host/${PRODUCT_PLUGIN_FILES.get(id)}`
const retiredPruner = '@deepseek-ai/dsh-compaction-tool-result-pruner'
const retiredPrunerUrl = pathToFileURL(resolveRuntimeModule(retiredPruner)).href

export const durableProductPluginSpecifier = productSpecifier

export function runtimePresetDefinition(definition) {
  const plugins = Array.isArray(definition.plugins)
    ? currentPlugins(definition.plugins).map(resolveRuntimePlugin) : definition.plugins
  // RETIRE WHEN: supported generated presets all include the native reader and
  // no longer refer to uploaded-file-tools. Keep the ordinary native composition.
  if (Array.isArray(plugins) && !plugins.some(plugin => plugin.name === '@deepseek-ai/dsh-tool-fs')) {
    plugins.push({ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs',
      config: { read: true, readImage: true, write: false, edit: false, applyPatch: false } })
  }
  return {
    ...definition,
    plugins
  }
}

export function readRuntimePresetDefinition(path, id, templatePath) {
  const source = readFileSync(path, 'utf8')
  const parsed = JSON.parse(source)
  if (parsed?.id !== id || !Array.isArray(parsed.plugins)) {
    throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, `ElecKoi Agent preset ${id} has an invalid composition`, { what: 'Agent 预设的组成' })
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
  return plugins.filter(plugin => plugin?.id !== 'uploaded-file-tools' && !oldImage(plugin) && plugin?.name !== retiredPruner && plugin?.name !== retiredPrunerUrl)
}
