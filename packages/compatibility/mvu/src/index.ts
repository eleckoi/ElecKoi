export interface MessageDisplayCompatibility {
  resolveVariableMacros(text: string, variableStateJson: string, escape?: (value: string) => string, preserveReplyTags?: boolean): string
}

export const MVU_STATUS_PLACEHOLDER = '<StatusPlaceHolderImpl/>'
export const MVU_SCHEMA_REGISTRATION_MODULES = Object.freeze(['cdn.jsdelivr.net', 'testingcf.jsdelivr.net'].flatMap(host => [
  `https://${host}/gh/StageDog/tavern_resource/dist/util/mvu_zod.js`,
  `https://${host}/gh/StageDog/tavern_resource@9255628bfbe7c3f92de4ba89fb2e250b10447976/dist/util/mvu_zod.js`,
]))
export const MVU_ENGINE_ENTRY_MODULES = Object.freeze([
  'https://gcore.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@master/artifact/bundle.js',
  'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@a30e5dcee286f3cb96c0914abd206641efa156f3/artifact/bundle.js',
])
const getMessageVariableMacro = /\{\{get_message_variable::(.*?)\}\}/gi
const formatMessageVariableMacro = /\{\{format_message_variable::(.*?)\}\}/i

type JsonObject = Record<string, unknown>

/** 契约码 `eleckoi/storage/corrupt` 的本地副本：本包没有运行期依赖，`tests/` 守住与码表一致。 */
const STORAGE_CORRUPT = 'eleckoi/storage/corrupt'

/**
 * 已落盘的消息变量状态读不出来：造一条带契约码的失败。
 *
 * 形状是 `Error` 实例（渲染层有些调用点还按 `instanceof Error` 取诊断）加官方 `RemoteError`
 * 的结构标记；`foldFailure` 的 remote 分支按标记保真码与详情。
 */
function corruptState(message: string): Error {
  return Object.assign(new Error(message), {
    isDSHRemoteError: true as const,
    code: STORAGE_CORRUPT,
    details: { what: '消息变量状态' }
  })
}

function record(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined
}

function parseState(source: string): JsonObject {
  let parsed: unknown
  try { parsed = JSON.parse(source) } catch { throw corruptState('Native message variable state is not valid JSON') }
  const state = record(parsed)
  if (!state) throw corruptState('Native message variable state must be a JSON object')
  return state
}

function valueAtMessagePath(state: JsonObject, rawPath: string): unknown {
  const root = state
  const path = rawPath.trim()
  const relative = path === 'stat_data' ? '' : path.startsWith('stat_data.') ? path.slice('stat_data.'.length) : path
  if (!relative) return root
  let current: unknown = root
  for (const segment of relative.split('.').filter(Boolean)) {
    if (Array.isArray(current)) current = current[Number(segment)]
    else current = record(current)?.[segment]
    if (current === undefined || current === null) return null
  }
  return current
}

function compactValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  const text = String(value)
  if (!text) return '""'
  const ambiguous = text !== text.trim() || text.includes('\n') || text.includes(': ') || text.startsWith('#')
    || /^(?:null|true|false)$/i.test(text) || (text.trim() !== '' && Number.isFinite(Number(text)))
  return ambiguous ? JSON.stringify(text) : text
}

function yamlKey(value: string): string {
  return /^[\p{L}\p{N}_-]+$/u.test(value) ? value : JSON.stringify(value)
}

function yamlValue(value: unknown, indent = 0): string {
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return value.map((item) => {
      if (Array.isArray(item) || record(item)) return `-\n${' '.repeat(indent + 2)}${yamlValue(item, indent + 2).replace(/\n/g, `\n${' '.repeat(indent + 2)}`)}`
      return `- ${yamlScalar(item)}`
    }).join('\n')
  }
  const object = record(value)
  if (!object) return yamlScalar(value)
  const entries = Object.entries(object).filter(([key]) => !key.startsWith('$'))
  if (!entries.length) return '{}'
  return entries.map(([key, item]) => {
    if (Array.isArray(item) || record(item)) {
      const child = yamlValue(item, indent + 2).replace(/\n/g, `\n${' '.repeat(indent + 2)}`)
      return `${yamlKey(key)}:\n${' '.repeat(indent + 2)}${child}`
    }
    return `${yamlKey(key)}: ${yamlScalar(item)}`
  }).join('\n')
}

export function resolveMvuMessageVariableMacros(
  text: string, variableStateJson: string, escape?: (value: string) => string
): string {
  if (!text.toLocaleLowerCase().includes('_message_variable::')) return text
  const state = parseState(variableStateJson)
  let output = text.replace(getMessageVariableMacro, (_match, path: string) => {
    const value = compactValue(valueAtMessagePath(state, path))
    return escape ? escape(value) : value
  })
  while (true) {
    const match = formatMessageVariableMacro.exec(output)
    if (!match || match.index === undefined) break
    const lineStart = output.lastIndexOf('\n', match.index - 1) + 1
    const prefix = ' '.repeat(match.index - lineStart)
    const formatted = yamlValue(valueAtMessagePath(state, match[1] ?? '')).replace(/\n/g, `\n${prefix}`)
    output = output.slice(0, match.index) + (escape ? escape(formatted) : formatted) + output.slice(match.index + match[0].length)
  }
  return output
}


export function hideMvuDisplayMarkers(text: string): string {
  return text
    .replace(/<FINAL>(?:\r\n|\r|\n)?/g, '')
    .replace(/(?:\r\n|\r|\n)?<\/FINAL>/g, '')
    .replaceAll(MVU_STATUS_PLACEHOLDER, '')
}

export const mvuMessageDisplayCompatibility: MessageDisplayCompatibility = {
  resolveVariableMacros(text, variableStateJson, escape, preserveReplyTags) {
    const resolved = resolveMvuMessageVariableMacros(text, variableStateJson, escape)
    return preserveReplyTags ? resolved.replaceAll(MVU_STATUS_PLACEHOLDER, '') : hideMvuDisplayMarkers(resolved)
  }
}
