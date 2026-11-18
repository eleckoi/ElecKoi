import { AuthorApiError } from './errors'
import { AUTHOR_API_STAGE, AUTHOR_API_VERSION } from './version'

export { AUTHOR_API_STAGE, AUTHOR_API_VERSION } from './version'

export * from './contracts'
export * from './editor-versions'
export * from './browser'
export * from './errors'
export * from './variables'
export * from './scripts'
export * from './rule-registry'
export * from './script-session'
export * from './document'
export * from './document-diagnostics'
export * from './rich-document'

export const authorApiPermissions = {
  appRead: 'app.read',
  contextRead: 'context.read',
  scriptRead: 'script.read',
  editorVersionsRead: 'editor_versions.read',
  editorVersionsWrite: 'editor_versions.write',
  scriptWrite: 'script.write',
  scriptsCall: 'scripts.call',
  uiWrite: 'ui.write',
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
  settingLibraryWrite: 'setting_library.write',
  presetsRead: 'presets.read',
  presetsWrite: 'presets.write',
  inputRead: 'input.read',
  inputWrite: 'input.write',
  mediaRead: 'media.read',
  audioRead: 'audio.read',
  audioWrite: 'audio.write',
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
  definition('editorVersions.read', 'editorVersions', '读取共享全局、所属角色或当前扮演预设的完整配置版本', authorApiPermissions.editorVersionsRead),
  definition('editorVersions.save', 'editorVersions', '原子保存正则或脚本的配置及命名版本', authorApiPermissions.editorVersionsWrite),
  definition('app.getInfo', 'app', '读取应用与作者 API 版本信息', authorApiPermissions.appRead),
  definition('app.getCapabilities', 'app', '读取当前页面可调用的完整 API 清单', authorApiPermissions.appRead),
  definition('context.current', 'context', '读取当前页面上下文', authorApiPermissions.contextRead),
  definition('script.getSettings', 'script', '读取当前脚本的设置与修改版本', authorApiPermissions.scriptRead),
  definition('script.setSettings', 'script', '保存当前脚本设置，不重新启动程序', authorApiPermissions.scriptWrite),
  definition('script.getLibrarySettings', 'script', '读取当前脚本所属库的共享设置', authorApiPermissions.scriptRead),
  definition('script.setLibrarySettings', 'script', '保存当前脚本所属库的共享设置', authorApiPermissions.scriptWrite),
  definition('scripts.list', 'scripts', '查询当前聊天运行脚本的明确身份及已登记操作', authorApiPermissions.scriptRead),
  definition('scripts.request', 'scripts', '调用当前聊天指定脚本的操作并等待结果', authorApiPermissions.scriptsCall),
  definition('ui.openPanel', 'ui', '打开所属脚本的原生作者面板', authorApiPermissions.uiWrite),
  definition('ui.closePanel', 'ui', '关闭所属脚本的原生作者面板', authorApiPermissions.uiWrite),
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
  definition('messages.getPage', 'messages', '读取已加载消息与历史分页游标', authorApiPermissions.messagesRead),
  definition('messages.pageOlder', 'messages', '按当前游标加载更早的消息', authorApiPermissions.messagesRead),
  definition('messages.get', 'messages', '按消息 ID 读取一条消息', authorApiPermissions.messagesRead),
  definition('messages.current', 'messages', '读取当前最后一条消息', authorApiPermissions.messagesRead),
  definition('messages.setContent', 'messages', '改写指定消息正文', authorApiPermissions.messagesWrite),
  definition('messages.deleteFrom', 'messages', '删除指定消息以及它之后的全部消息', authorApiPermissions.messagesWrite),
  definition('messages.regenerate', 'messages', '从指定 AI 消息重新生成', authorApiPermissions.messagesWrite),
  definition('messages.editAndRegenerate', 'messages', '修改用户消息并从该处重新生成', authorApiPermissions.messagesWrite),
  definition('chat.current', 'chat', '读取当前聊天会话摘要', authorApiPermissions.chatRead),
  definition('chat.list', 'chat', '读取当前角色的聊天会话列表', authorApiPermissions.chatRead),
  definition('chat.getGenerationState', 'chat', '读取 AI 生成状态', authorApiPermissions.chatRead),
  definition('chat.getAgentTrajectory', 'chat', '读取当前聊天的完整 Agent 处理轨迹', authorApiPermissions.chatRead),
  definition('chat.getModels', 'chat', '读取模型目录与全局生效的模型', authorApiPermissions.chatRead),
  definition('chat.send', 'chat', '发送消息并开始 AI 回复', authorApiPermissions.chatSend),
  definition('chat.stopGeneration', 'chat', '停止当前 AI 回复', authorApiPermissions.chatWrite),
  definition('chat.create', 'chat', '为角色创建新对话', authorApiPermissions.chatWrite),
  definition('chat.open', 'chat', '切换当前对话', authorApiPermissions.chatWrite),
  definition('chat.delete', 'chat', '删除指定对话', authorApiPermissions.chatWrite),
  definition('chat.selectModel', 'chat', '选择全局模型与明确的推理档位', authorApiPermissions.chatWrite),
  definition('character.current', 'character', '读取当前角色摘要', authorApiPermissions.characterRead),
  definition('settingLibrary.current', 'settingLibrary', '读取所属角色的设定库原稿', authorApiPermissions.settingLibraryRead),
  definition('settingLibrary.getSummary', 'settingLibrary', '读取所属角色设定库摘要', authorApiPermissions.settingLibraryRead),
  definition('settingLibrary.replace', 'settingLibrary', '替换所属角色的当前设定库内容', authorApiPermissions.settingLibraryWrite),
  definition('settingLibrary.getEntry', 'settingLibrary', '按编号读取角色设定条目原稿', authorApiPermissions.settingLibraryRead),
  definition('settingLibrary.updateEntry', 'settingLibrary', '修改角色设定库的指定条目', authorApiPermissions.settingLibraryWrite),
  definition('settingLibrary.updateEntries', 'settingLibrary', '原子修改角色设定库的一组条目', authorApiPermissions.settingLibraryWrite),
  definition('presets.list', 'presets', '读取预设目录及全局选中的预设编号', authorApiPermissions.presetsRead),
  definition('presets.current', 'presets', '读取全局选中的预设原稿', authorApiPermissions.presetsRead),
  definition('presets.get', 'presets', '按编号读取预设原稿', authorApiPermissions.presetsRead),
  definition('presets.getEntry', 'presets', '按编号读取预设条目', authorApiPermissions.presetsRead),
  definition('presets.updateEntry', 'presets', '修改指定预设原稿的条目', authorApiPermissions.presetsWrite),
  definition('presets.updateEntries', 'presets', '原子修改指定预设原稿的一组条目', authorApiPermissions.presetsWrite),
  definition('presets.select', 'presets', '选择全部聊天后续请求使用的预设', authorApiPermissions.presetsWrite),
  definition('media.getMessageAttachments', 'media', '读取一条消息里的全部媒体附件', authorApiPermissions.mediaRead),
  definition('media.getMessageAttachment', 'media', '读取一条消息里的指定媒体附件', authorApiPermissions.mediaRead),
  definition('audio.play', 'audio', '播放背景音乐、环境音、语音或音效', authorApiPermissions.audioWrite),
  definition('audio.pause', 'audio', '暂停一个音频频道', authorApiPermissions.audioWrite),
  definition('audio.resume', 'audio', '继续播放一个音频频道', authorApiPermissions.audioWrite),
  definition('audio.stop', 'audio', '停止一个音频频道', authorApiPermissions.audioWrite),
  definition('audio.seek', 'audio', '跳转一个音频频道的播放位置', authorApiPermissions.audioWrite),
  definition('audio.getState', 'audio', '读取一个音频频道的播放状态', authorApiPermissions.audioRead),
  definition('audio.getPlaylist', 'audio', '读取一个音频频道的播放列表', authorApiPermissions.audioRead),
  definition('audio.setPlaylist', 'audio', '替换一个音频频道的播放列表', authorApiPermissions.audioWrite),
  definition('audio.appendPlaylist', 'audio', '向一个音频频道追加曲目', authorApiPermissions.audioWrite),
  definition('audio.getSettings', 'audio', '读取宿主音频设置', authorApiPermissions.audioRead),
  definition('audio.setSettings', 'audio', '修改宿主音频设置', authorApiPermissions.audioWrite),
  definition('input.get', 'input', '读取当前聊天输入框内容', authorApiPermissions.inputRead),
  definition('input.set', 'input', '设置当前聊天输入框内容', authorApiPermissions.inputWrite),
  definition('input.append', 'input', '向当前聊天输入框追加内容', authorApiPermissions.inputWrite),
  definition('input.clear', 'input', '清空当前聊天输入框内容', authorApiPermissions.inputWrite),
  definition('input.send', 'input', '发送当前输入框内容', authorApiPermissions.chatWrite),
  definition('events.list', 'events', '读取作者前端可订阅的事件名称', authorApiPermissions.eventsRead)
]

export const characterConversationPermissions: ReadonlySet<AuthorApiPermission> = new Set([
  authorApiPermissions.appRead,
  authorApiPermissions.contextRead,
  authorApiPermissions.scriptRead,
  authorApiPermissions.scriptWrite,
  authorApiPermissions.uiWrite,
  authorApiPermissions.variablesRead,
  authorApiPermissions.variablesWrite,
  authorApiPermissions.messagesRead,
  authorApiPermissions.messagesWrite,
  authorApiPermissions.openingsRead,
  authorApiPermissions.openingsWrite,
  authorApiPermissions.chatRead,
  authorApiPermissions.chatSend,
  authorApiPermissions.chatWrite,
  authorApiPermissions.characterRead,
  authorApiPermissions.settingLibraryRead,
  authorApiPermissions.editorVersionsRead,
  authorApiPermissions.editorVersionsWrite,
  authorApiPermissions.settingLibraryWrite,
  authorApiPermissions.presetsRead,
  authorApiPermissions.presetsWrite,
  authorApiPermissions.mediaRead,
  authorApiPermissions.audioRead,
  authorApiPermissions.audioWrite,
  authorApiPermissions.inputRead,
  authorApiPermissions.inputWrite,
  authorApiPermissions.eventsRead
])

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
