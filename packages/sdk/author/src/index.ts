export const AUTHOR_API_VERSION = '0.2.0-preview.5'
export const AUTHOR_API_STAGE = 'preview'

export const authorApiPermissions = {
  appRead: 'app.read',
  contextRead: 'context.read',
  variablesRead: 'variables.read',
  variablesWrite: 'variables.write',
  openingsRead: 'openings.read',
  openingsWrite: 'openings.write',
  messagesRead: 'messages.read',
  messagesWrite: 'messages.write',
  chatRead: 'chat.read',
  chatSend: 'chat.send',
  chatWrite: 'chat.write',
  characterRead: 'character.read',
  settingLibraryRead: 'setting_library.read',
  inputRead: 'input.read',
  inputWrite: 'input.write',
  eventsRead: 'events.read'
} as const

export type AuthorApiPermission = typeof authorApiPermissions[keyof typeof authorApiPermissions]

export interface AuthorApiDefinition {
  method: string
  namespace: string
  description: string
  permission: AuthorApiPermission
  stage: typeof AUTHOR_API_STAGE
  since: typeof AUTHOR_API_VERSION
}

const definition = (
  method: string,
  namespace: string,
  description: string,
  permission: AuthorApiPermission
): AuthorApiDefinition => ({ method, namespace, description, permission, stage: AUTHOR_API_STAGE, since: AUTHOR_API_VERSION })

export const authorApiDefinitions: readonly AuthorApiDefinition[] = [
  definition('app.getInfo', 'app', '读取应用与作者 API 版本信息', authorApiPermissions.appRead),
  definition('app.getCapabilities', 'app', '读取当前页面可调用的完整 API 清单', authorApiPermissions.appRead),
  definition('context.current', 'context', '读取当前页面上下文', authorApiPermissions.contextRead),
  definition('variables.getState', 'variables', '读取当前变量状态', authorApiPermissions.variablesRead),
  definition('variables.getConfig', 'variables', '读取角色变量结构与初始配置', authorApiPermissions.variablesRead),
  definition('variables.setState', 'variables', '替换当前聊天变量状态', authorApiPermissions.variablesWrite),
  definition('variables.merge', 'variables', '合并更新当前聊天变量状态', authorApiPermissions.variablesWrite),
  definition('variables.applyPatch', 'variables', '按操作清单更新当前聊天变量状态', authorApiPermissions.variablesWrite),
  definition('variables.reset', 'variables', '重置当前聊天变量状态', authorApiPermissions.variablesWrite),
  definition('openings.list', 'openings', '读取当前聊天的全部开场白选项', authorApiPermissions.openingsRead),
  definition('openings.current', 'openings', '读取当前选中的开场白', authorApiPermissions.openingsRead),
  definition('openings.select', 'openings', '切换当前聊天的开场白', authorApiPermissions.openingsWrite),
  definition('messages.list', 'messages', '读取当前聊天的消息列表', authorApiPermissions.messagesRead),
  definition('messages.get', 'messages', '按消息 ID 读取一条消息', authorApiPermissions.messagesRead),
  definition('messages.current', 'messages', '读取当前最后一条消息', authorApiPermissions.messagesRead),
  definition('messages.regenerate', 'messages', '从指定 AI 消息重新生成', authorApiPermissions.messagesWrite),
  definition('messages.editAndRegenerate', 'messages', '修改用户消息并从该处重新生成', authorApiPermissions.messagesWrite),
  definition('chat.current', 'chat', '读取当前聊天会话摘要', authorApiPermissions.chatRead),
  definition('chat.list', 'chat', '读取聊天会话列表', authorApiPermissions.chatRead),
  definition('chat.getGenerationState', 'chat', '读取 AI 生成状态', authorApiPermissions.chatRead),
  definition('chat.getModels', 'chat', '读取可用于当前聊天的模型摘要', authorApiPermissions.chatRead),
  definition('chat.send', 'chat', '发送消息并开始 AI 回复', authorApiPermissions.chatSend),
  definition('chat.stopGeneration', 'chat', '停止当前 AI 回复', authorApiPermissions.chatWrite),
  definition('chat.create', 'chat', '为角色创建新对话', authorApiPermissions.chatWrite),
  definition('chat.open', 'chat', '切换当前对话', authorApiPermissions.chatWrite),
  definition('chat.delete', 'chat', '删除指定对话', authorApiPermissions.chatWrite),
  definition('chat.selectModel', 'chat', '选择聊天模型与生成参数', authorApiPermissions.chatWrite),
  definition('character.current', 'character', '读取当前角色摘要', authorApiPermissions.characterRead),
  definition('settingLibrary.getSummary', 'settingLibrary', '读取当前角色设定库摘要', authorApiPermissions.settingLibraryRead),
  definition('input.get', 'input', '读取当前聊天输入框内容', authorApiPermissions.inputRead),
  definition('input.set', 'input', '设置当前聊天输入框内容', authorApiPermissions.inputWrite),
  definition('input.append', 'input', '向当前聊天输入框追加内容', authorApiPermissions.inputWrite),
  definition('input.clear', 'input', '清空当前聊天输入框内容', authorApiPermissions.inputWrite),
  definition('input.send', 'input', '发送当前输入框内容', authorApiPermissions.chatWrite),
  definition('events.list', 'events', '读取作者前端可订阅的事件名称', authorApiPermissions.eventsRead)
]

export const inlineMessageInteractivePermissions: ReadonlySet<AuthorApiPermission> = new Set([
  authorApiPermissions.appRead,
  authorApiPermissions.contextRead,
  authorApiPermissions.variablesRead,
  authorApiPermissions.messagesRead,
  authorApiPermissions.openingsRead,
  authorApiPermissions.openingsWrite,
  authorApiPermissions.chatSend
])

export class AuthorApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'AuthorApiError'
  }
}

export interface AuthorApiRequest {
  id: string
  apiVersion: string
  method: string
  params: Record<string, unknown>
}

export type AuthorApiInvoke = (method: string, params: Record<string, unknown>) => unknown | Promise<unknown>

function parseRequest(rawRequest: string): AuthorApiRequest {
  let value: unknown
  try {
    value = JSON.parse(rawRequest)
  } catch {
    throw new AuthorApiError('INVALID_REQUEST', '请求不是有效的作者 API JSON')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AuthorApiError('INVALID_REQUEST', '请求格式不正确')
  }
  const source = value as Record<string, unknown>
  const id = typeof source.id === 'string' ? source.id.trim() : ''
  const apiVersion = typeof source.apiVersion === 'string' ? source.apiVersion : ''
  const method = typeof source.method === 'string' ? source.method.trim() : ''
  const params = source.params && typeof source.params === 'object' && !Array.isArray(source.params)
    ? source.params as Record<string, unknown>
    : {}
  if (!id || id.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(id)) {
    throw new AuthorApiError('INVALID_REQUEST', '请求 id 格式不正确')
  }
  if (apiVersion !== AUTHOR_API_VERSION) {
    throw new AuthorApiError('UNSUPPORTED_VERSION', `不支持的 API 版本：${apiVersion}`)
  }
  if (!method) throw new AuthorApiError('INVALID_REQUEST', '请求方法不能为空')
  return { id, apiVersion, method, params }
}

export async function routeAuthorApiRequest(
  rawRequest: string,
  permissions: ReadonlySet<AuthorApiPermission>,
  invoke: AuthorApiInvoke
): Promise<string> {
  let requestId = ''
  try {
    const request = parseRequest(rawRequest)
    requestId = request.id
    const api = authorApiDefinitions.find((candidate) => candidate.method === request.method)
    if (!api) throw new AuthorApiError('METHOD_NOT_FOUND', `未知的作者 API：${request.method}`)
    if (!permissions.has(api.permission)) throw new AuthorApiError('PERMISSION_DENIED', `当前页面无权调用 ${request.method}`)
    const result = await invoke(request.method, request.params)
    return JSON.stringify({ id: request.id, ok: true, result: result ?? null })
  } catch (error) {
    const known = error instanceof AuthorApiError
      ? error
      : new AuthorApiError('INTERNAL_ERROR', '原生 API 调用失败')
    return JSON.stringify({ id: requestId, ok: false, error: { code: known.code, message: known.message } })
  }
}

export type AuthorBridgeRejectionCode = 'BRIDGE_REQUEST_TOO_LARGE' | 'BRIDGE_BUSY' | 'BRIDGE_RATE_LIMITED'

export class AuthorBridgeRequestGate {
  private readonly acceptedAt: number[] = []
  private inFlight = 0

  constructor(
    private readonly maxRequestBytes = 256 * 1024,
    private readonly maxInFlight = 8,
    private readonly maxRequestsPerWindow = 120,
    private readonly windowMillis = 10_000,
    private readonly clockMillis: () => number = Date.now
  ) {}

  tryAcquire(request: string): AuthorBridgeRejectionCode | null {
    if (new TextEncoder().encode(request).byteLength > this.maxRequestBytes) return 'BRIDGE_REQUEST_TOO_LARGE'
    const now = this.clockMillis()
    while (this.acceptedAt.length && now - (this.acceptedAt[0] ?? now) >= this.windowMillis) this.acceptedAt.shift()
    if (this.acceptedAt.length >= this.maxRequestsPerWindow) return 'BRIDGE_RATE_LIMITED'
    if (this.inFlight >= this.maxInFlight) return 'BRIDGE_BUSY'
    this.acceptedAt.push(now)
    this.inFlight += 1
    return null
  }

  release(): void {
    if (this.inFlight > 0) this.inFlight -= 1
  }
}

interface AuthorTransport {
  postMessage(value: string): void
  onmessage?: (event: { data: string }) => void
}

interface AuthorWindow {
  ElecKoiNative?: AuthorTransport
  ElecKoi?: unknown
  __ElecKoiAuthorPendingCount?: () => number
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
  dispatchEvent(event: Event): boolean
  CustomEvent: typeof CustomEvent
}

function installElecKoiAuthorApi(global: AuthorWindow): void {
  'use strict'
  const API_VERSION = '0.2.0-preview.5'
  const existing = global.ElecKoi as { api?: { version?: string } } | undefined
  if (existing?.api?.version === API_VERSION) return
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timeoutId: ReturnType<typeof setTimeout> }>()
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  let sequence = 0
  const notifyPending = () => global.dispatchEvent(new global.CustomEvent('eleckoi:author-pending-change', { detail: { pendingCount: pending.size } }))
  Object.defineProperty(global, '__ElecKoiAuthorPendingCount', { value: () => pending.size, configurable: false })
  const apiError = (code: string, message: string) => Object.assign(new Error(message), { code })
  const call = (method: string, params: Record<string, unknown> = {}) => {
    const transport = global.ElecKoiNative
    if (!transport || typeof transport.postMessage !== 'function') {
      return Promise.reject(apiError('BRIDGE_UNAVAILABLE', '当前页面不支持 ElecKoi 作者 API 桥接'))
    }
    const id = `author-${Date.now()}-${++sequence}`
    return new Promise((resolve, reject) => {
      const timeoutId = global.setTimeout(() => {
        pending.delete(id)
        notifyPending()
        reject(apiError('REQUEST_TIMEOUT', `API 调用超时：${method}`))
      }, 10_000)
      pending.set(id, { resolve, reject, timeoutId })
      notifyPending()
      transport.postMessage(JSON.stringify({ id, apiVersion: API_VERSION, method, params }))
    })
  }
  const transport = global.ElecKoiNative
  if (transport) transport.onmessage = (event) => {
    let message: { type?: string; event?: string; payload?: unknown; id?: string; ok?: boolean; result?: unknown; error?: { code?: string; message?: string } }
    try { message = JSON.parse(event.data) as typeof message } catch { return }
    if (message.type === 'event' && message.event) {
      listeners.get(message.event)?.forEach((listener) => listener(message.payload))
      return
    }
    const request = pending.get(message.id ?? '')
    if (!request) return
    global.clearTimeout(request.timeoutId)
    pending.delete(message.id ?? '')
    notifyPending()
    if (message.ok) request.resolve(message.result)
    else request.reject(apiError(message.error?.code ?? 'API_ERROR', message.error?.message ?? 'API 调用失败'))
  }
  const on = (name: string, listener: (payload: unknown) => void) => {
    const values = listeners.get(name) ?? new Set()
    values.add(listener)
    listeners.set(name, values)
    return () => { values.delete(listener) }
  }
  const off = (name: string, listener: (payload: unknown) => void) => listeners.get(name)?.delete(listener)
  const api = Object.freeze({
    api: Object.freeze({ stage: 'preview', version: API_VERSION }), call,
    app: Object.freeze({ getInfo: () => call('app.getInfo'), getCapabilities: () => call('app.getCapabilities') }),
    context: Object.freeze({ current: () => call('context.current') }),
    variables: Object.freeze({
      getState: (options = {}) => call('variables.getState', options), getConfig: () => call('variables.getConfig'),
      setState: (state: unknown) => call('variables.setState', { state }), merge: (state: unknown) => call('variables.merge', { state }),
      applyPatch: (patch: unknown) => call('variables.applyPatch', { patch }), reset: () => call('variables.reset')
    }),
    openings: Object.freeze({ list: () => call('openings.list'), current: () => call('openings.current'), select: (id: string) => call('openings.select', { id }) }),
    messages: Object.freeze({
      list: () => call('messages.list'), get: (id: string) => call('messages.get', { id }), current: () => call('messages.current'),
      regenerate: (id: string) => call('messages.regenerate', { id }), editAndRegenerate: (id: string, text: string) => call('messages.editAndRegenerate', { id, text })
    }),
    chat: Object.freeze({
      current: () => call('chat.current'), list: () => call('chat.list'), getGenerationState: () => call('chat.getGenerationState'),
      getModels: () => call('chat.getModels'), send: (text: string) => call('chat.send', { text }), stopGeneration: () => call('chat.stopGeneration'),
      create: (options = {}) => call('chat.create', options), open: (sessionId: string) => call('chat.open', { sessionId }),
      delete: (sessionId: string) => call('chat.delete', { sessionId }), selectModel: (options: Record<string, unknown>) => call('chat.selectModel', options)
    }),
    character: Object.freeze({ current: () => call('character.current') }),
    settingLibrary: Object.freeze({ getSummary: () => call('settingLibrary.getSummary') }),
    input: Object.freeze({
      get: () => call('input.get'), set: (text: string) => call('input.set', { text }), append: (text: string) => call('input.append', { text }),
      clear: () => call('input.clear'), send: () => call('input.send')
    }),
    events: Object.freeze({ list: () => call('events.list'), on, off })
  })
  global.ElecKoi = api
}

export const AUTHOR_FRONTEND_SOURCE = `(${installElecKoiAuthorApi.toString()})(window);`
