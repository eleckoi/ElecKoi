import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { BlockAssembler, LlmRuntime, type ToolSchema } from '@deepseek-ai/dsh-llm'
import { CredentialProvider, credentialRef, type CredentialKey, type CredentialRecord, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import * as piAi from '@deepseek-ai/dsh-llm-pi-ai'
import * as deepSeek from '@deepseek-ai/dsh-llm-deepseek-api-key'
import type { ModelConnectionInput, ModelDiscoveryInput, ModelDiscoveryResult } from './types.js'

/** Credentials for one probe lifetime. No mutation reaches the durable store. */
class ProbeCredentials extends CredentialProvider {
  constructor(ctx: Context, private readonly key: string, private readonly stored: CredentialProvider) { super(ctx) }
  async resolve(_ref: CredentialRef) { return this.key ? { value: this.key, source: 'probe' } : undefined }
  async describe(_ref: CredentialRef) { return { configured: Boolean(this.key), writable: false, source: 'probe' } }
  async set(_ref: CredentialRef, _value: string): Promise<void> { throw new Error('测试凭据不能持久化。') }
  async unset(_ref: CredentialRef): Promise<void> { throw new Error('测试凭据不能持久化。') }
  async readRecord(key: CredentialKey) { return this.stored.readRecord(key) }
  async describeRecord(key: CredentialKey) { return this.stored.describeRecord(key) }
  async listRecords() { return this.stored.listRecords() }
  async modifyRecord(_key: CredentialKey, _mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>): Promise<CredentialRecord | undefined> { throw new Error('测试凭据不能持久化。') }
  async deleteRecord(_key: CredentialKey): Promise<void> { throw new Error('测试凭据不能持久化。') }
}

/** A caller-scoped route using the same official adapter as saved model profiles. */
export async function createTemporaryModelConnection(owner: Context, input: { apiKey: string; baseURL: string; model: string; api?: ModelConnectionInput['api']; headers?: Record<string,string> }) {
  const ctx = new Context(), provider = 'eleckoi-auxiliary'
  try {
    new ProbeCredentials(ctx, input.apiKey, owner.credentials)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(piAi, { providers: { [provider]: { apiKeyEnv: 'PROBE_API_KEY',
      api: input.api ?? 'openai-completions', baseURL: input.baseURL, headers: input.headers ?? {}, models: [{ id: input.model }],
    } } })
    return { context: ctx, provider, dispose: () => ctx.fiber.dispose() }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}

const tool: ToolSchema = {
  name: 'eleckoi_connection_probe', description: 'Return the supplied nonce using this tool.',
  parameters: { type: 'object', properties: { nonce: { type: 'string' } }, required: ['nonce'], additionalProperties: false },
}

/** Read the credential owned by one saved model configuration on user request. */
export async function readModelApiKey(owner: Context, configId: string): Promise<string> {
  const namespaces = owner.settings.describe()
  const entries = (namespaces.find(row => row.ns === 'eleckoi-client-models')?.value as {
    entries?: Record<string, { credentialRef?: string; hidden?: boolean }>
  } | undefined)?.entries
  const profile = (namespaces.find(row => row.ns === 'llm-pi-ai')?.value as {
    providers?: Record<string, { apiKeyEnv?: string }>
  } | undefined)?.providers?.[configId]
  const dedicated = configId === 'deepseek-official'
    ? namespaces.find(row => row.ns === 'llm-deepseek')?.value as { apiKeyEnv?: string } | undefined
    : undefined
  const entry = entries?.[configId]
  if (entry?.hidden || (!entry && !profile && !dedicated)) throw new Error('模型配置不存在。')
  const ref = entry?.credentialRef || profile?.apiKeyEnv || dedicated?.apiKeyEnv
    || (dedicated ? 'DEEPSEEK_API_KEY' : `${configId.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`)
  const credential = await owner.credentials.resolve(credentialRef(ref))
  if (!credential) throw new Error('此模型配置没有已保存的 API Key。')
  return credential.value
}

/** Resolve only the credential reference belonging to the current draft. */
async function draftKey(owner: Context, input: ModelDiscoveryInput): Promise<string> {
  const namespaces = owner.settings.describe()
  const row = namespaces.find(row => row.ns === 'eleckoi-client-models')
  const entries = (row?.value as { entries?: Record<string, { credentialRef?: string }> } | undefined)?.entries
  const profiles = namespaces.find(row => row.ns === 'llm-pi-ai')?.value as { providers?: Record<string, { apiKeyEnv?: string }> } | undefined
  const dedicated = namespaces.find(row => row.ns === 'llm-deepseek')?.value as { apiKeyEnv?: string } | undefined
  const ref = entries?.[input.configId]?.credentialRef
    || (input.api === 'deepseek_messages' ? dedicated?.apiKeyEnv : profiles?.providers?.[input.configId]?.apiKeyEnv)
    || (input.api === 'deepseek_messages' ? 'DEEPSEEK_API_KEY' : `${input.configId.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`)
  return input.apiKey?.trim() || (await owner.credentials.resolve(credentialRef(ref)))?.value || ''
}

/** Read the dedicated directory or discover a draft without persisting it. */
export async function discoverDraftModels(owner: Context, input: ModelDiscoveryInput): Promise<ModelDiscoveryResult[]> {
  const key = await draftKey(owner, input)
  const ctx = new Context()
  const provider = 'eleckoi-discovery-probe'
  try {
    new ProbeCredentials(ctx, key, owner.credentials)
    await ctx.plugin(LlmRuntime)
    if (input.api === 'deepseek_messages') {
      const settings = owner.settings.describe().find(row => row.ns === 'llm-deepseek')?.value as deepSeek.Options | undefined
      await ctx.plugin(deepSeek, { apiKeyEnv: 'PROBE_API_KEY', baseURL: input.baseURL,
        ...(settings?.thinking === undefined ? {} : { thinking: settings.thinking }),
        ...(settings?.reasoningEffort === undefined ? {} : { reasoningEffort: settings.reasoningEffort }),
      })
      const models = await ctx.llm.listModels('deepseek-official')
      return await Promise.all(models.map(async model => {
        const info = await ctx.llm.resolveModelInfo('deepseek-official', model.id)
        return { id: model.id, name: model.name,
          ...(info.context === undefined ? {} : { contextWindow: info.context.contextWindow }),
          ...(info.defaultMaxTokens === undefined ? {} : { maxTokens: info.defaultMaxTokens }),
          ...(info.inputModalities === undefined ? {} : { inputModalities: info.inputModalities }),
          ...(info.reasoning === undefined ? {} : {
            reasoningEfforts: Object.fromEntries(info.reasoning.efforts.map(effort => [effort.id, effort.id === 'off' ? null : effort.id])),
            ...(info.reasoning.defaultEffort === undefined ? {} : { reasoningEffort: info.reasoning.defaultEffort }),
          }),
        }
      }))
    }
    await ctx.plugin(piAi, { providers: { [provider]: {
      apiKeyEnv: 'PROBE_API_KEY', api: input.api, baseURL: input.baseURL,
      headers: input.headers || {}, models: [],
    } } })
    return await ctx.llm.discoverModels('llm-pi-ai', { provider, api: input.api,
      baseURL: input.baseURL, ...(key ? { apiKey: key } : {}) }, AbortSignal.timeout(30_000))
  } finally { await ctx.fiber.dispose() }
}

export async function testModelConnection(owner: Context, input: ModelConnectionInput): Promise<{ supported: true }> {
  if (!input.model.trim()) throw new Error('请选择要测试的模型。')
  if (input.api === 'deepseek_messages' && Object.keys(input.headers || {}).length) throw new Error('DeepSeek Messages 专用适配器不支持自定义请求头。')
  const key = await draftKey(owner, input)
  if (!key) throw new Error('请填写 API Key，或先保存此配置的密钥。')
  const ctx = new Context()
  const timeout = AbortSignal.timeout(60_000)
  const nonce = 'eleckoi-tool-probe'
  try {
    new ProbeCredentials(ctx, key, owner.credentials)
    await ctx.plugin(LlmRuntime)
    let provider: string
    if (input.api === 'deepseek_messages') {
      provider = 'deepseek-official'
      await ctx.plugin(deepSeek, { apiKeyEnv: 'PROBE_API_KEY', baseURL: input.baseURL, retryPolicy: { mode: 'normal', maxRetries: 0 } })
    } else {
      provider = 'eleckoi-connection-probe'
      await ctx.plugin(piAi, { providers: { [provider]: {
        apiKeyEnv: 'PROBE_API_KEY', api: input.api, baseURL: input.baseURL, ...(input.headers ? { headers: input.headers } : {}),
        models: [{ id: input.model }], retryPolicy: { mode: 'normal', maxRetries: 0 },
      } } })
    }
    const assembler = new BlockAssembler()
    for await (const chunk of ctx.llm.stream({ provider, model: input.model, signal: timeout,
      messages: [{ role: 'user', content: [{ type: 'text', text: `Call eleckoi_connection_probe exactly once with nonce "${nonce}". Do not answer with text.` }] }],
      tools: [tool], maxTokens: 4096,
    })) assembler.push(chunk)
    if (assembler.finish.kind === 'error' || assembler.finish.kind === 'aborted') throw new Error(assembler.finish.failure.message)
    const calls = assembler.blocks().filter(block => block.type === 'tool-call')
    if (!calls.length) throw new Error('本次测试模型没有调用工具；这次结果不能证明该模型不支持工具调用。')
    const call = calls.find(call => call.name === tool.name)
    if (!call) throw new Error('模型调用了其他工具，没有调用指定测试工具。')
    let argumentsValue: unknown
    try { argumentsValue = JSON.parse(call.arguments) } catch { throw new Error('工具参数不是有效 JSON。') }
    if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)
      || (argumentsValue as { nonce?: unknown }).nonce !== nonce
      || Object.keys(argumentsValue).length !== 1) throw new Error('测试工具的参数不符合约定。')
    return { supported: true }
  } finally { await ctx.fiber.dispose() }
}
