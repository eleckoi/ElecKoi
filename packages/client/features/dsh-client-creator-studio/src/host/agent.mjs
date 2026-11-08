import { defineTool } from '@deepseek-ai/dsh-tools'
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { scopeChainOf, scopeOf } from '@deepseek-ai/dsh-scope'
import { creatorCapabilities, creatorToolsets, creatorAuthoringInstructions } from '@eleckoi/dsh-product-data'
import { applyDisabledPolicy, extendNativeRequestInput, projectCompactionRequest, requestProjectionSnapshot, requestSnapshot, sessionInstructions } from '@eleckoi/dsh-client-roleplay'
import { CREATOR_STUDIO_EVENT, creatorStudioProjection, resolveCreatorStudioSelection } from './projection.mjs'
import { readToolResult, resultReadParameter } from '@eleckoi/dsh-client-roleplay/host/tool-result-access.mjs'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import { presetPromptCapabilities, presetPromptToolset } from './preset-prompt-capabilities.mjs'

export const name = 'eleckoi-creator-studio-agent'
export const inject = ['agents', 'tools', 'llm', 'settings', 'sessionProjections', 'eleckoiProductData', 'eleckoiCharacterConfigurationChanges', 'eleckoiProductRecordChanges']

export function apply(ctx, config) {
  if (typeof config?.presetId !== 'string' || typeof config?.creatorTools !== 'boolean') throw productFailure(ELECKOI_FAILURE_CODES.internal, 'AI 创作工作室的预设配置不正确。', { what: 'AI 创作工作室的插件配置' })
  const ownerScope = scopeOf(ctx)
  if (ownerScope === undefined) throw productFailure(ELECKOI_FAILURE_CODES.internal, 'AI 创作工作室插件必须挂载在正式预设或 Agent 作用域中。', { what: 'AI 创作工作室插件的挂载作用域' })
  const owns = agent => agent && scopeChainOf(scopeOf(agent.ctx)).includes(ownerScope)
  const readState = agent => {
    if (!owns(agent)) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '该会话不属于当前 AI 创作工作室作用域。', { what: '该会话所属的 AI 创作工作室作用域', guard: 'creator-studio-scope' })
    const state = ctx.sessionProjections.stateOf(agent.session, creatorStudioProjection.key)
    if (!state || state.presetId !== config.presetId) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, 'AI 创作工作室会话缺少正式预设绑定。', { what: 'AI 创作工作室会话的预设绑定' })
    return resolveCreatorStudioSelection(state, ctx.eleckoiProductData.readCharacters().items)
  }
  const dispatchedLibraries = new WeakMap()
  const capabilities = [...presetPromptCapabilities(() => ctx.eleckoiProductData.creatorPresetRuntime(config.presetId).settingLibrary), ...creatorCapabilities(ctx.eleckoiProductData)]
  const toolsets = [presetPromptToolset, ...creatorToolsets]
  const output = { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
  const requireToolset = id => {
    const toolset = toolsets.find(item => item.id === id)
    if (!toolset) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `未知创作能力组：${id}`, { what: '创作能力组' })
    return toolset
  }
  const disposers = []
  const projected = new WeakSet()
  if (config.creatorTools) {
    disposers.push(ctx.tools.register(defineTool({ name: 'eleckoi_list_toolsets', description: '列出 AI 创作工作室可用的能力组。', parameters: {}, output,
      execute: () => ({ toolsets: toolsets.map(({ id, title, description }) => ({ id, title, description, operationCount: capabilities.filter(operation => operation.toolsetId === id).length })) }) })))
    disposers.push(ctx.tools.register(defineTool({ name: 'eleckoi_describe_toolset', description: '查看能力组的操作；指定 operation_ids 并启用 include_schema 可读取这些操作的准确参数。',
      parameters: { toolset_id: { type: 'string', required: true }, operation_ids: { type: 'array', items: { type: 'string' } }, include_schema: { type: 'boolean' } }, output,
      execute(args) {
        const toolset = requireToolset(args.toolset_id)
        const selected = new Set(args.operation_ids ?? [])
        if (args.include_schema && !selected.size) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '展开参数时必须指定 operation_ids。', { field: 'operation_ids' })
        const operations = capabilities.filter(item => item.toolsetId === toolset.id && (!selected.size || selected.has(item.id)))
        if (selected.size && operations.length !== selected.size) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '所选操作不属于这个能力组。', { field: 'operation_ids' })
        return { toolset, operations: operations.map(({ execute, inputSchema, ...item }) => ({ ...item, ...(args.include_schema ? { inputSchema } : {}) })) }
      } })))
    disposers.push(ctx.tools.register(defineTool({ name: 'eleckoi_call_capability', description: '执行已发现的创作操作；普通调用必须同时提供 capability_id 与 arguments。角色操作使用菜单当前选择的编辑目标；未选择角色不影响普通对话、全局配置和明确 presetId 的预设配置。可以新建空角色作为编辑目标。参数必须符合已查询的输入结构。创作工具结果溢出时，只传 result 按提示续读全文或搜索，不重新执行创作操作。',
      parameters: { capability_id: { type: 'string' }, arguments: { type: 'object', additionalProperties: true }, result: resultReadParameter }, output,
      async execute(args, exec) {
        exec.signal.throwIfAborted()
        if (!exec.agent) throw productFailure(ELECKOI_FAILURE_CODES.internal, '创作操作缺少调用会话。', { what: '创作操作的调用会话' })
        const state = readState(exec.agent)
        if (Object.hasOwn(args, 'result')) return readToolResult(ctx, args, exec, 'creator')
        if (typeof args.capability_id !== 'string' || !args.arguments || typeof args.arguments !== 'object' || Array.isArray(args.arguments)) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '普通创作调用必须提供 capability_id 和 arguments。', { field: 'capability_id' })
        const operation = capabilities.find(item => item.id === args.capability_id)
        if (!operation) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `未知创作操作：${args.capability_id}`, { what: '创作操作' })
        if (operation.target === 'selected-character' && !state.characterId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先在 AI 创作工作室菜单中选择角色，或通过 character.create 新建空角色。', { what: '在 AI 创作工作室菜单中选择编辑角色' })
        const value = await operation.execute(state.characterId, args.arguments, exec.signal, dispatchedLibraries.get(exec.agent))
        exec.signal.throwIfAborted()
        let changedCharacterId = state.characterId
        if (operation.target === 'new-character') {
          if (typeof value?.id !== 'string' || !ctx.eleckoiProductData.readCharacters().items.some(item => item.id === value.id)) {
            throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '新建角色没有返回有效的角色编号。', { what: '新建角色返回的角色编号' })
          }
          changedCharacterId = value.id
          exec.agent.session.append(CREATOR_STUDIO_EVENT, { ...state, characterId: value.id }, { ignorable: true })
        }
        if (operation.effect === 'write') {
          ctx.eleckoiCharacterConfigurationChanges.publish({ kind: 'snapshot' })
          if (changedCharacterId) ctx.eleckoiProductRecordChanges.publish({ kind: 'records', domain: 'characters', ids: [changedCharacterId] })
        }
        return { value }
      } })))
  }
  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (!owns(agent)) return
    if (agent.session.header.origin === 'subagent' && !ctx.sessionProjections.stateOf(agent.session, creatorStudioProjection.key)) {
      // Fresh and first-turn fork children have no Studio events. Capture the
      // editing target through their official lineage before queued work runs.
      const parent = ctx.agents.get(agent.session.header.parentSession)
      agent.session.append(CREATOR_STUDIO_EVENT, readState(parent), { ignorable: true })
    }
    const preset = ctx.eleckoiProductData.readAgentPreset(config.presetId)
    applyDisabledPolicy(agent.ctx, preset.toolGroups.filter(group => !group.included || !group.enabled).map(group => group.id), ctx.get('tools'))
  }))
  disposers.push(ctx.on('agent/request', async ({ agent, signal }, next) => {
    const request = await next()
    if (!owns(agent)) return request
    const info = await ctx.llm.resolveModelInfo(request.provider, request.model, signal)
    const parameters = requestSnapshot(ctx, request, info)
    const { temperature: _temperature, topP: _topP, maxTokens: _maxTokens, ...rest } = request
    return { ...rest,
      ...(parameters.temperature === undefined ? {} : { temperature: parameters.temperature }),
      ...(parameters.topP === undefined ? {} : { topP: parameters.topP }),
      ...(parameters.maxTokens === undefined ? {} : { maxTokens: parameters.maxTokens }) }
  }, { prepend: true }))
  const instructionsFor = (state, context) => {
    const target = state.characterId ? ctx.eleckoiProductData.readCharacters().items.find(item => item.id === state.characterId) : undefined
    const missingTarget = config.creatorTools ? '未选择角色。可调用 character.create 新建空角色并作为当前工作室编辑目标；修改已有角色时请用户从菜单选择角色。' : '未选择角色。'
    return [sessionInstructions({ conversationContext: context }), config.creatorTools ? creatorAuthoringInstructions : '', `当前编辑目标：${target ? JSON.stringify({ id: target.id, name: target.name }) : missingTarget}`].filter(Boolean).join('\n\n')
  }
  disposers.push(ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembly = await next()
    if (!owns(context.agent)) return assembly
    const state = readState(context.agent)
    const { settingLibrary } = ctx.eleckoiProductData.creatorPresetRuntime(config.presetId)
    return { ...assembly, sections: [
      { name: 'eleckoi:session-instructions', text: instructionsFor(state, { settingLibrary }), interpolate: false },
      ...assembly.sections
    ] }
  }))
  disposers.push(ctx.on('llm/stream', (options, next) => {
    if (projected.has(options) || (options.purpose !== 'compaction' && !isAgentLoopRequest(options))) return next()
    const agent = ctx.agents.get(options.sessionId)
    if (!owns(agent)) return next()
    const { settingLibrary, historyCompactionInstructions } = ctx.eleckoiProductData.creatorPresetRuntime(config.presetId)
    if (options.purpose === 'compaction') {
      // DSH compaction bypasses agent/request. Inherit effort only from the same
      // routed model, while preserving its own output budget and explicit effort.
      const latest = agent.session.requestHeader()?.config ?? agent.options
      const sameRoute = latest.provider === options.provider && latest.model === options.model
      const parameters = requestSnapshot(ctx, { ...options, reasoningEffort: sameRoute ? latest.reasoningEffort : undefined })
      const request = projectCompactionRequest(options, historyCompactionInstructions, parameters.reasoningEffort)
      if (!request) return next()
      projected.add(request)
      return ctx.llm.stream(request)
    }
    const context = { settingLibrary }
    // Only a model dispatch establishes cached body delivery; previews assemble without sending.
    dispatchedLibraries.set(agent, settingLibrary)
    const messages = extendNativeRequestInput(options.messages, requestProjectionSnapshot(context).plan)
    const request = { ...options, messages }
    projected.add(request)
    return ctx.llm.stream(request)
  }))
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
