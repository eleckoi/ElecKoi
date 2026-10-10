import { requestSnapshot } from './model-selection-migration.mjs'

/** Imported Android config IDs remain the keys of the official provider profiles. */
export async function resolvePresetModelBindings(ctx, preset, mainModel, disabledGroupIds = []) {
  const disabled = new Set(disabledGroupIds), configured = preset.subagentModelSelection
  const subagentModel = !disabled.has('builtin:collaboration') && configured?.configId
    ? await resolvePresetModelConfig(ctx, configured.configId, configured.model)
    : structuredClone(mainModel)
  const toolModels = {}
  for (const [toolId, configId] of Object.entries(preset.toolModelConfigIds || {})) {
    // Image provider metadata belongs to the image service; asking the text
    // LLM registry to resolve an image model incorrectly rejects valid routes.
    if (configId && !disabled.has(toolId) && toolId !== 'builtin:auto-illustration') toolModels[toolId] = await resolvePresetModelConfig(ctx, configId)
  }
  return { subagentModel, toolModels, subagentModelSelection: configured ?? { configId: '', model: '' }, toolModelConfigIds: structuredClone(preset.toolModelConfigIds || {}) }
}

export async function resolvePresetModelConfig(ctx, configId, requestedModel = '') {
  const descriptors = ctx.settings.describe(), value = ns => descriptors.find(item => item.ns === ns)?.value ?? {}
  const entry = value('eleckoi-client-models').entries?.[configId], profile = value('llm-pi-ai').providers?.[configId]
  const dedicated = configId === 'deepseek-official' ? value('llm-deepseek') : undefined
  if (!entry && !profile && !dedicated) throw new Error(`Preset model configuration is not installed: ${configId}`)
  const model = requestedModel || entry?.model || profile?.models?.[0]?.id || dedicated?.model || dedicated?.models?.[0]?.id
  if (typeof model !== 'string' || !model.trim()) throw new Error(`Preset model configuration has no selected model: ${configId}`)
  const info = await ctx.llm.resolveModelInfo(configId, model)
  return requestSnapshot(ctx, { provider: configId, model }, info)
}
