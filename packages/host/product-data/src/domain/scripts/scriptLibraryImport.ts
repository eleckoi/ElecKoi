import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { scriptFilePathSchema, scriptLibrarySchema, type ScriptLibrary } from '@shared/contracts/scripts/schemas'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

const fileSchema = z.strictObject({ path: scriptFilePathSchema, data: z.string() })
export type PortableScriptLibrary = Pick<ScriptLibrary, 'trees' | 'variables' | 'enabled'> & {
  files?: Array<z.infer<typeof fileSchema>>
}

export function decodeScriptFiles(value: unknown): NonNullable<PortableScriptLibrary['files']> {
  const files = z.array(fileSchema).parse(value), paths = new Set<string>()
  for (const file of files) {
    const key = process.platform === 'win32' ? file.path.toLowerCase() : file.path
    if (paths.has(key)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, `脚本附件路径重复：${file.path}`, { what: '脚本附件路径', path: file.path })
    paths.add(key)
    const body = Buffer.from(file.data, 'base64')
    if (body.toString('base64') !== file.data) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `脚本附件内容损坏：${file.path}`, { what: '脚本附件内容', path: file.path })
  }
  return files
}

export function decodeScriptLibrary(value: unknown): PortableScriptLibrary | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '脚本库配置必须是对象。', { what: '脚本库配置' })
  const helper = value as Record<string, unknown>
  if (helper.scripts === undefined && helper.variables === undefined) return undefined
  const scripts = helper.scripts === undefined ? [] : helper.scripts
  if (!Array.isArray(scripts)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '脚本列表必须是数组。', { what: '脚本列表', path: 'scripts' })
  function identity(candidate: unknown): unknown {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '脚本项目必须是对象。', { what: '脚本项目', path: 'scripts' })
    const item = candidate as Record<string, unknown>
    return { ...item, id: item.id === undefined ? randomUUID() : item.id,
      ...(item.type === 'folder' && Array.isArray(item.scripts) ? { scripts: item.scripts.map(identity) } : {}),
    }
  }
  const input = { scope: 'global', ownerId: '', enabled: helper.enabled === undefined ? true : helper.enabled, revision: 0,
    trees: scripts.map(identity), variables: helper.variables === undefined ? {} : helper.variables,
  }
  z.json().parse(input)
  const { trees, variables, enabled } = scriptLibrarySchema.parse(input)
  return { trees, variables, enabled }
}

export function decodePortableScriptLibrary(value: unknown): PortableScriptLibrary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '脚本库配置必须是对象。', { what: '脚本库配置' })
  const library = value as Record<string, unknown>
  if (!Array.isArray(library.trees)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '脚本库缺少脚本列表。', { what: '脚本列表', path: 'trees' })
  return { ...decodeScriptLibrary({ scripts: library.trees, variables: library.variables, enabled: library.enabled })!,
    ...(library.files === undefined ? {} : { files: decodeScriptFiles(library.files) }) }
}
