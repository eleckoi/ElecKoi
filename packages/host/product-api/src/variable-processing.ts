import { assertVariableJson, loadVariableSchema, parseVariableIdentities, projectVariableState, reconcileVariableState } from '@eleckoi/dsh-product-data/variables'
import { productFailure } from './productFailure.js'
import { ELECKOI_FAILURE_CODES } from './errorCodes.generated.js'
import type { ElecKoiProductDataStore } from './types.js'

type VariableObject = Record<string, unknown>
function assertObject(value: unknown): asserts value is VariableObject {
  assertVariableJson(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量状态必须是 JSON 对象。', { what: '变量状态' })
}
export interface VariableRuleContext {
  conversationId: string
  schemaCode: string
  signal: AbortSignal
}
export interface VariableRuleRun {
  apply(stage: 'before' | 'after' | 'afterSchema', state: VariableObject, before: VariableObject): Promise<VariableObject>
  schema?(state: VariableObject, before: VariableObject): Promise<VariableObject | null>
  close(): void
}
export interface VariableRuleProvider {
  open(context: VariableRuleContext): VariableRuleRun | Promise<VariableRuleRun>
}

/** Processes an isolated candidate; repositories only save its accepted result. */
export class ElecKoiVariableProcessing {
  private provider: VariableRuleProvider | undefined
  private providerRequired = false
  private readonly active = new Map<string, AbortController>()
  private closed = false

  constructor(private readonly data: ElecKoiProductDataStore) {}

  register(provider: VariableRuleProvider): () => void {
    if (this.provider) throw productFailure(ELECKOI_FAILURE_CODES.internal, '作者变量处理服务已经注册。', { what: '作者变量处理服务重复注册' })
    this.provider = provider
    this.providerRequired = true
    return () => {
      if (this.provider !== provider) return
      this.provider = undefined
      for (const controller of this.active.values()) controller.abort(productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '作者变量处理服务已卸载。', { what: '作者变量处理服务' }))
    }
  }

  async process(input: {
    conversationId: string
    before: VariableObject
    schemaCode: string
    apply(state: VariableObject): VariableObject
    signal?: AbortSignal
  }): Promise<{ patched: VariableObject; state: VariableObject }> {
    if (this.closed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '变量处理服务已关闭。', { what: '变量处理服务' })
    if (this.providerRequired && !this.provider) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '作者变量处理服务已卸载，本次修改未执行。', { what: '作者变量处理服务' })
    if (this.active.has(input.conversationId)) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '该聊天已有变量修改正在处理，请等待后重试。', { what: '等待当前变量修改结束' })
    const controller = new AbortController()
    const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal
    this.active.set(input.conversationId, controller)
    let run: VariableRuleRun | undefined
    try {
      signal.throwIfAborted()
      assertObject(input.before)
      const before = structuredClone(input.before)
      run = await this.provider?.open({ conversationId: input.conversationId, schemaCode: input.schemaCode, signal })
      let working = run ? await run.apply('before', structuredClone(before), structuredClone(before)) : structuredClone(before)
      signal.throwIfAborted()
      assertObject(working)
      const patched = input.apply(working)
      assertObject(patched)
      working = run ? await run.apply('after', structuredClone(patched), structuredClone(before)) : patched
      signal.throwIfAborted()
      assertObject(working)
      const preSchema = structuredClone(working)
      const authored = await run?.schema?.(structuredClone(working), structuredClone(before))
      let state = authored ?? (input.schemaCode.trim() ? loadVariableSchema(input.schemaCode).parse(working) : working)
      signal.throwIfAborted()
      assertObject(state)
      if (run) state = await run.apply('afterSchema', structuredClone(state), structuredClone(before))
      signal.throwIfAborted()
      assertObject(state)
      return { patched: preSchema, state }
    } finally {
      run?.close()
      this.active.delete(input.conversationId)
    }
  }

  async replace(conversationId: string, stateJson: string, signal?: AbortSignal): Promise<string> {
    const proposed: unknown = JSON.parse(stateJson)
    assertObject(proposed)
    return this.mutate(conversationId, () => structuredClone(proposed), signal)
  }

  async mutate(conversationId: string, apply: (state: VariableObject) => VariableObject, signal?: AbortSignal): Promise<string> {
    const original = this.data.readAuthorConversationState(conversationId)
    const config = { versionId: original.variableConfig?.activeVersionId || '', objects: original.variableConfig?.objects || [], variables: original.variableConfig?.variables || [] }
    const raw = JSON.parse(original.currentVariableStateJson) as VariableObject, identities = parseVariableIdentities(original.variableIdentityJson)
    const { state } = await this.process({ conversationId, before: projectVariableState(raw, identities, config).state,
      schemaCode: original.variableConfig?.schemaCode || '', apply, ...(signal ? { signal } : {}) })
    const current = this.data.readAuthorConversationState(conversationId)
    if (current.currentVariableStateJson !== original.currentVariableStateJson
      || current.variableIdentityJson !== original.variableIdentityJson
      || JSON.stringify(current.variableConfig) !== JSON.stringify(original.variableConfig)) {
      throw productFailure(ELECKOI_FAILURE_CODES.conflictStaleRevision, '处理期间变量或配置已变化，本次修改未保存，请重新读取后再试。', { what: '变量状态或配置' })
    }
    signal?.throwIfAborted()
    const accepted = reconcileVariableState(raw, identities, config, state)
    return this.data.replaceConversationVariableState(conversationId, JSON.stringify(accepted.state), JSON.stringify(accepted.identities))
  }

  close(): void {
    this.closed = true
    for (const controller of this.active.values()) controller.abort(productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '变量处理服务已关闭。', { what: '变量处理服务' }))
  }
}
