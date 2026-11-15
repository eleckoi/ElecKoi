import { defineTool } from '@deepseek-ai/dsh-tools'
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { scopeChainOf, scopeOf } from '@deepseek-ai/dsh-scope'
import { creatorCapabilities, creatorToolsets, creatorAuthoringInstructions } from '@eleckoi/dsh-product-data'
import { applyDisabledPolicy, extendNativeRequestInput, projectCompactionRequest, requestProjectionSnapshot, requestSnapshot, sessionInstructions } from '@eleckoi/dsh-client-roleplay'
import { CREATOR_STUDIO_EVENT, creatorStudioProjection, resolveCreatorStudioSelection } from './projection.mjs'
import { readToolResult, resultReadParameter } from '@eleckoi/dsh-client-roleplay/host/tool-result-access.mjs'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import { presetPromptCapabilities, presetPromptToolset } from './preset-prompt-capabilities.mjs'
import { mediaFileCapabilities } from './media-file-capabilities.mjs'

export const name = 'eleckoi-creator-studio-agent'
export const inject = ['agents', 'tools', 'llm', 'settings', 'sessionProjections', 'eleckoiProductData', 'eleckoiCharacterConfigurationChanges', 'eleckoiProductRecordChanges']

export function apply(ctx, config) {
  if (typeof config?.presetId !== 'string' || typeof config?.creatorTools !== 'boolean') throw productFailure(ELECKOI_FAILURE_CODES.internal, 'AI 创作工作室的预设配置不正确。', { what: 'AI 创作工作室的插件配置' })
  const ownerScope = scopeOf(ctx)
  if (ownerScope === undefined) throw productFailure(ELECKOI_FAILURE_CODES.internal, 'AI 创作工作室插件必须挂载在正式预设或 Agent 作用域中。', { what: 'AI 创作工作室插件的挂载作用域' })
  const owns = agent => agent && scopeChainOf(scopeOf(agent.ctx)).includes(ownerScope)
  const roleplay = config.roleplay === true
  const readState = agent => {
    if (!owns(agent)) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '该会话不属于当前 AI 创作工作室作用域。', { what: '该会话所属的 AI 创作工作室作用域', guard: 'creator-studio-scope' })
    if (roleplay) {
      const runtime = ctx.get('eleckoiRuntimeContexts').get(agent.id)
      const details = ctx.eleckoiProductData.readConversationDetails(runtime.conversationId)
      return { presetId: config.presetId, characterId: details.metadata.characterId || '' }
    }
    const state = ctx.sessionProjections.stateOf(agent.session, creatorStudioProjection.key)
    if (!state || state.presetId !== config.presetId) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, 'AI 创作工作室会话缺少正式预设绑定。', { what: 'AI 创作工作室会话的预设绑定' })
    return resolveCreatorStudioSelection(state, ctx.eleckoiProductData.readCharacters().items)
  }
  const dispatchedLibraries = new WeakMap()
  const dispatchedTargets = new WeakMap()
  const capabilities = [...(roleplay ? [] : presetPromptCapabilities(() => ctx.eleckoiProductData.creatorPresetRuntime(config.presetId).settingLibrary)), ...creatorCapabilities(ctx.eleckoiProductData), ...mediaFileCapabilities(ctx, readState)]
  const toolsets = [...(roleplay ? [] : [presetPromptToolset]), ...creatorToolsets]
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
      execute: () => ({ toolsets: toolsets.map(({ id, title, description, skill }) => ({ id, title, description, ...(skill ? { skill } : {}), operationCount: capabilities.filter(operation => operation.toolsetId === id).length })) }) })))
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
    disposers.push(ctx.tools.register(defineTool({ name: 'eleckoi_call_capability', description: '执行已发现的创作操作。先加载相关技能，再查询对应 inputSchema；提供 capability_id 与 arguments。大结果沿 result 续读或搜索，不重复写操作。',
      parameters: { capability_id: { type: 'string' }, character_id: { type: 'string', description: '可选编辑目标。使用 character.list 返回的准确角色编号；省略时使用当前快捷定位角色，不要求预先绑定角色。' }, arguments: { type: 'object', additionalProperties: true }, result: resultReadParameter }, output,
      async execute(args, exec) {
        exec.signal.throwIfAborted()
        if (!exec.agent) throw productFailure(ELECKOI_FAILURE_CODES.internal, '创作操作缺少调用会话。', { what: '创作操作的调用会话' })
        const state = readState(exec.agent)
        if (Object.hasOwn(args, 'result')) return readToolResult(ctx, args, exec, 'creator')
        if (typeof args.capability_id !== 'string' || !args.arguments || typeof args.arguments !== 'object' || Array.isArray(args.arguments)) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '普通创作调用必须提供 capability_id 和 arguments。', { field: 'capability_id' })
        const operation = capabilities.find(item => item.id === args.capability_id)
        if (!operation) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `未知创作操作：${args.capability_id}`, { what: '创作操作' })
        const characterId = args.character_id ?? state.characterId
        if (args.character_id !== undefined && (typeof characterId !== 'string' || !characterId.trim())) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'character_id 必须是发现列表中的角色编号。', { field: 'character_id' })
        if (operation.target === 'selected-character' && !characterId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请通过 character.list 发现角色并提供 character_id，或通过 character.create 新建角色。', { what: '指定创作目标角色' })
        const dispatchedTarget = dispatchedTargets.get(exec.agent)
        if (operation.effect === 'write' && operation.target !== 'new-character' && args.arguments.target?.scope !== 'global'
          && args.character_id === undefined && dispatchedTarget !== undefined && dispatchedTarget !== state.characterId) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch,
          '本次模型请求期间编辑角色已切换，请重新读取当前角色后再修改。', { what: '本次请求的编辑角色' })
        const value = await operation.execute(characterId, args.arguments, exec.signal,
          characterId === state.characterId ? dispatchedLibraries.get(exec.agent) : undefined,
          { ...exec, creatorCharacterId: args.character_id })
        exec.signal.throwIfAborted()
        let changedCharacterId = args.arguments.target?.scope === 'global' ? '' : characterId
        if (operation.target === 'new-character') {
          if (typeof value?.id !== 'string' || !ctx.eleckoiProductData.readCharacters().items.some(item => item.id === value.id)) {
            throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '新建角色没有返回有效的角色编号。', { what: '新建角色返回的角色编号' })
          }
          changedCharacterId = value.id
          if (!roleplay) {
            exec.agent.session.append(CREATOR_STUDIO_EVENT, { ...state, characterId: value.id }, { ignorable: true })
            dispatchedTargets.set(exec.agent, value.id)
          }
        }
        if (operation.effect === 'write') {
          if (operation.toolsetId === 'assets' || operation.toolsetId === 'frontends') ctx.get('eleckoiCharacterAssetsApi', false)?.invalidate(changedCharacterId)
          if (operation.toolsetId === 'frontends') ctx.get('eleckoiAuthorFrontendsApi', false)?.invalidate({ scope: 'character', characterId: changedCharacterId })
          ctx.eleckoiCharacterConfigurationChanges.publish({ kind: 'snapshot' })
          if (changedCharacterId) ctx.eleckoiProductRecordChanges.publish({ kind: 'records', domain: 'characters', ids: [changedCharacterId] })
        }
        return { value }
      } })))
  }
  // Roleplay retains its own request projection and preset instructions. Only
  // reuse the authoring tools; never mark the conversation as a Studio Session.
  if (roleplay) {
    disposers.push(ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
      const assembly = await next()
      if (!owns(context.agent)) return assembly
      return { ...assembly, sections: [...assembly.sections, { name: 'eleckoi:creator-tools', interpolate: false,
        text: '创作能力可调用 character.list 发现角色。eleckoi_call_capability 可显式传 character_id；当前聊天角色只作省略编号时的快捷定位，不限制编辑其他角色。先 describe_toolset 查询准确参数，再调用。' }] }
    }))
    return () => { for (const dispose of disposers.reverse()) dispose() }
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
    dispatchedTargets.set(agent, readState(agent).characterId)
    const messages = extendNativeRequestInput(options.messages, requestProjectionSnapshot(context).plan)
    const request = { ...options, messages }
    projected.add(request)
    return ctx.llm.stream(request)
  }))
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
