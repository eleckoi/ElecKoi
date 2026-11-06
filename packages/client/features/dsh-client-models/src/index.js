import z from '@deepseek-ai/schemastery'

export const name = 'eleckoi-client-models'
export const inject = ['settings']
export const Config = z.object({
  entries: z.any().default({}).volatile(),
  schemaVersion: z.number().step(1).min(0).default(0).volatile()
})

const SETTINGS_NAMESPACE = 'eleckoi-client-models'
const PI_AI_NAMESPACE = 'llm-pi-ai'
const DEEPSEEK_PROVIDER = 'deepseek-official'
const SUBAGENT_MODEL_NAMESPACE = 'subagent-model-selection-settings'
const MODEL_SETTINGS_SCHEMA_VERSION = 2
const OBSOLETE_SUBAGENT_PROVIDERS = new Set(['deepseek-default'])

/**
 * Migrate model settings that were persisted by older ElecKoi releases.
 * Registered DSH and third-party providers are deliberately left untouched.
 */
export async function migrateModelSettings(settings) {
  const descriptors = settings.describe()
  const modelSettings = descriptors.find(row => row.ns === SETTINGS_NAMESPACE)
  const piAi = descriptors.find(row => row.ns === PI_AI_NAMESPACE)
  const entries = modelSettings?.value?.entries ?? {}

  // RETIRE WHEN: 此段仅用于历史 schema v0/v1 设置；所有受支持的升级、profile 恢复入口均已保存至少 schema v2
  // 后，删除此 schema v0/v1 转换、仅供其使用的常量及迁移测试。
  // 本段和下方子 Agent 整理均退役后才移除 apply 中的迁移调用；保留当前设置合同及装配。
  if (modelSettings && (modelSettings.value?.schemaVersion ?? 0) < MODEL_SETTINGS_SCHEMA_VERSION) {
    const previousVersion = modelSettings.value?.schemaVersion ?? 0
    const migratedEntries = { ...entries }
    // schema v0 -> v1: generic pi-ai profiles were sometimes labelled as the
    // dedicated DeepSeek provider even though their actual adapter was custom.
    if (previousVersion < 1) {
      for (const [id, entry] of Object.entries(migratedEntries)) {
        if (id !== DEEPSEEK_PROVIDER && entry?.provider === 'deepseek' && piAi?.value?.providers?.[id]) {
          migratedEntries[id] = { ...entry, provider: 'custom' }
        }
      }
    }
    // schema v1 -> v2: the official route is permanent. Older clients used a
    // product-side hidden marker when its configuration was cleared, leaving a
    // visible provider card backed by an empty form.
    if (previousVersion < 2 && migratedEntries[DEEPSEEK_PROVIDER]?.hidden === true) {
      const { hidden: _hidden, ...entry } = migratedEntries[DEEPSEEK_PROVIDER]
      if (Object.keys(entry).length === 0) delete migratedEntries[DEEPSEEK_PROVIDER]
      else migratedEntries[DEEPSEEK_PROVIDER] = entry
    }
    const ops = Object.entries(migratedEntries)
      .filter(([id, entry]) => entry !== entries[id])
      .map(([id, entry]) => ({ op: 'set', path: ['entries', id], value: entry }))
    for (const id of Object.keys(entries)) {
      if (!(id in migratedEntries)) ops.push({ op: 'unset', path: ['entries', id] })
    }
    ops.push({ op: 'set', path: ['schemaVersion'], value: MODEL_SETTINGS_SCHEMA_VERSION })
    await settings.mutate(SETTINGS_NAMESPACE, ops, modelSettings.revision)
  }

  // RETIRE WHEN: 停止支持 v0.2.3 之前的版本直升，并确认受支持的 profile 恢复
  // 入口不再携带该子 Agent 占位路由后，删除此段、OBSOLETE_SUBAGENT_PROVIDERS、
  // 仅供此段使用的命名空间常量及对应测试。它与上面的模型设置 schema 转换独立核对。
  const subagent = descriptors.find(row => row.ns === SUBAGENT_MODEL_NAMESPACE)
  const allowedModels = Array.isArray(subagent?.value?.allowedModels) ? subagent.value.allowedModels : []
  const retainedModels = allowedModels.filter(route => !OBSOLETE_SUBAGENT_PROVIDERS.has(route?.provider))
  if (subagent && retainedModels.length !== allowedModels.length) {
    const ops = [{ op: 'set', path: ['allowedModels'], value: retainedModels }]
    if (subagent.value?.enabled === true && retainedModels.length === 0) {
      ops.push({ op: 'set', path: ['enabled'], value: false })
    }
    await settings.mutate(SUBAGENT_MODEL_NAMESPACE, ops, subagent.revision)
  }
}

export async function apply(ctx) {
  await migrateModelSettings(ctx.settings)
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber))
}
