import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { openSync, readSync, closeSync } from 'node:fs'
import { characterAssetId } from '@shared/contracts/characterAssets'
import { DesktopError } from '@shared/foundation/DesktopError'
import { ELECKOI_FAILURE_CODES as codes } from '@shared/contracts/errors/codes'
import type { CreatorCapability } from './capabilities'
import type { FrontendFileInput, FrontendJson } from '../frontends'

const id = z.string().min(1)
const revision = z.number().int().nonnegative()
const expected = { expectedRevision: revision.describe('最近同一角色资产目录或前端工作区返回的 revision。') }
const folderId = characterAssetId.nullable().describe('当前角色的文件夹编号；null 表示根目录。')
const asset = { id: characterAssetId }
const selection = { assetIds: z.array(characterAssetId), folderIds: z.array(characterAssetId) }
const file = z.object({ path: id, content: z.string(), encoding: z.enum(['utf8', 'base64']).optional() }).strict()
const manifest = z.object({ manifestVersion: z.literal(1).optional(), sdkVersion: z.literal('0.1.0').optional(), scope: z.literal('character').optional(),
  entryFile: id.optional(), globalStyles: z.array(id).optional(), config: z.record(z.string(), z.json()).optional(),
  bindings: z.array(z.object({ target: z.literal('root'), entryFile: id, view: z.literal('chat').optional() }).strict()).max(1).optional(),
}).strict()
const mismatch = (what: string) => { throw new DesktopError(codes.conflictStaleRevision, `${what}已变化，请重新读取后合并。`, { what }) }
const json = (value: object): FrontendJson => JSON.parse(JSON.stringify(value))
const sourceFile = (value: z.output<typeof file>): FrontendFileInput => ({ path: value.path, content: value.content, ...(value.encoding === undefined ? {} : { encoding: value.encoding }) })

/** Character-owned media and source operations reuse the existing repositories. */
export function creatorMediaCapabilities(data: Context['eleckoiProductData']): CreatorCapability[] {
  const catalog: CreatorCapability[] = []
  function operation<T extends z.ZodType>(toolset: string, name: string, title: string, effect: 'read' | 'write', schema: T, execute: (characterId: string, input: z.output<T>) => unknown) {
    catalog.push({ id: `${toolset}.${name}`, toolsetId: toolset, title, effect, target: 'selected-character', inputSchema: z.toJSONSchema(schema),
      execute(characterId, input, signal) {
        signal?.throwIfAborted()
        if (!data.readCharacters().items.some(item => item.id === characterId)) throw new DesktopError(codes.characterNotFound, '请先选择存在的角色卡。', { what: '当前编辑角色' })
        return execute(characterId, schema.parse(input))
      } })
  }
  const assets = data.characterAssets()
  const assetCatalog = (characterId: string) => {
    const catalog = assets.list(characterId)
    return { ...catalog, items: catalog.items.map(item => ({ ...item, reference: `asset://${item.id}` })) }
  }
  const checkAssets = (characterId: string, value: number) => { if (assets.list(characterId).revision !== value) mismatch('角色资产库') }
  operation('assets', 'list', '读取当前角色全部资产、文件夹和固定引用', 'read', z.object({}).strict(), assetCatalog)
  operation('assets', 'read', '读取指定资产元数据与固定引用，不读取二进制正文', 'read', z.object(asset).strict(), (characterId, input) => {
    const catalog = assetCatalog(characterId), item = catalog.items.find(item => item.id === input.id)
    if (!item) throw new DesktopError(codes.lookupNotFound, '找不到当前角色的资产。', { what: '角色资产' })
    return { characterId, revision: catalog.revision, item }
  })
  operation('assets', 'read_content', '按字节读取资产内容用于编程处理或导出', 'read', z.object({ ...asset, offset: revision.default(0), length: z.number().int().positive().max(1024 * 1024).default(1024 * 1024) }).strict(), (characterId, input) => {
    const { path, asset } = assets.readAsset(characterId, input.id), descriptor = openSync(path, 'r')
    try {
      const bytes = Buffer.alloc(Math.min(input.length, Math.max(0, asset.size - input.offset)))
      const size = bytes.length ? readSync(descriptor, bytes, 0, bytes.length, input.offset) : 0
      return { characterId, id: asset.id, name: asset.name, mimeType: asset.mimeType, size: asset.size, encoding: 'base64', offset: input.offset,
        content: bytes.subarray(0, size).toString('base64'), next_offset: input.offset + size < asset.size ? input.offset + size : null }
    } finally { closeSync(descriptor) }
  })
  operation('assets', 'import', '将生成的文本或已有 base64 内容导入当前角色资产库', 'write', z.object({ ...expected, name: id, content: z.string(), encoding: z.enum(['utf8', 'base64']), folderId: folderId.default(null) }).strict(), (characterId, input) => {
    checkAssets(characterId, input.expectedRevision)
    const bytes = Buffer.from(input.content, input.encoding)
    if (input.encoding === 'base64' && bytes.toString('base64') !== input.content) throw new DesktopError(codes.inputInvalid, '资产 base64 内容无效。', { field: 'content' })
    const ticket = assets.begin(characterId, { name: input.name, size: bytes.length, folderId: input.folderId })
    try {
      for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) assets.append(characterId, ticket.id, offset, bytes.subarray(offset, offset + 1024 * 1024).toString('base64'))
      assets.finish(characterId, ticket.id)
    } finally { assets.cancel(characterId, ticket.id) }
    const catalog = assetCatalog(characterId)
    return { ...catalog, importedIds: [catalog.items.at(-1)!.id] }
  })
  operation('assets', 'rename', '修改资产显示名称，保持固定引用与内容', 'write', z.object({ ...asset, ...expected, name: id }).strict(), (characterId, input) => {
    checkAssets(characterId, input.expectedRevision); assets.rename(characterId, input.id, input.name); return assetCatalog(characterId)
  })
  operation('assets', 'duplicate', '复制指定资产并生成新的固定引用', 'write', z.object({ ...expected, assetIds: z.array(characterAssetId).min(1) }).strict(), (characterId, input) => {
    checkAssets(characterId, input.expectedRevision)
    const before = new Set(assets.list(characterId).items.map(item => item.id)); assets.duplicate(characterId, input.assetIds)
    const catalog = assetCatalog(characterId); return { ...catalog, copiedIds: catalog.items.filter(item => !before.has(item.id)).map(item => item.id) }
  })
  operation('assets', 'delete', '删除明确资产及文件夹子树，文件夹内部资产一并删除', 'write', z.object({ ...expected, ...selection }).strict(), (characterId, input) => {
    checkAssets(characterId, input.expectedRevision); assets.delete(characterId, input.assetIds, input.folderIds); return assetCatalog(characterId)
  })
  operation('assets', 'create_folder', '在当前角色资产库新建混合文件夹', 'write', z.object({ ...expected, name: id, parentId: folderId.default(null) }).strict(), (characterId, input) => {
    checkAssets(characterId, input.expectedRevision)
    const before = new Set(assets.list(characterId).folders.map(item => item.id)); assets.createFolder(characterId, input.name, input.parentId)
    const catalog = assetCatalog(characterId); return { ...catalog, createdFolderIds: catalog.folders.filter(item => !before.has(item.id)).map(item => item.id) }
  })
  operation('assets', 'rename_folder', '重命名当前角色资产文件夹', 'write', z.object({ ...expected, folderId: characterAssetId, name: id }).strict(), (characterId, input) => {
    checkAssets(characterId, input.expectedRevision); assets.renameFolder(characterId, input.folderId, input.name); return assetCatalog(characterId)
  })
  operation('assets', 'move', '移动资产和文件夹到同一角色的文件夹或根目录', 'write', z.object({ ...expected, ...selection, destination: folderId }).strict(), (characterId, input) => {
    checkAssets(characterId, input.expectedRevision); assets.move(characterId, input.assetIds, input.folderIds, input.destination); return assetCatalog(characterId)
  })
  const projects = data.frontendProjects(), owner = (characterId: string) => ({ scope: 'character' as const, characterId })
  const checkProjects = (characterId: string, value: number) => { if (projects.workspace(owner(characterId)).revision !== value) mismatch('角色前端工作区') }
  operation('frontends', 'list', '读取当前角色的独立前端项目、文件目录与启用选择', 'read', z.object({}).strict(), characterId => projects.workspace(owner(characterId)))
  operation('frontends', 'read_file', '读取指定角色前端项目的完整文件', 'read', z.object({ projectId: id, path: id.optional(), encoding: z.enum(['utf8', 'base64']).optional() }).strict(), (characterId, input) => {
    const workspace = projects.workspace(owner(characterId))
    return { characterId, projectId: input.projectId, revision: workspace.revision, ...projects.readFile(owner(characterId), input.projectId, input.path, input.encoding) }
  })
  const importFields = { ...expected, name: id, entryFile: id.optional(), manifest: manifest.optional(), select: z.boolean().default(false) }
  operation('frontends', 'import', '从 HTML、文件列表或 ZIP 创建角色独立前端项目，默认不启用', 'write', z.discriminatedUnion('format', [
    z.object({ ...importFields, format: z.literal('html'), html: z.string() }).strict(),
    z.object({ ...importFields, format: z.literal('files'), files: z.array(file).min(1) }).strict(),
    z.object({ ...importFields, format: z.literal('zip'), data: z.string() }).strict(),
  ]), (characterId, input) => {
    checkProjects(characterId, input.expectedRevision)
    const previous = new Set(projects.workspace(owner(characterId)).projects.map(item => item.id))
    const workspace = projects.importProject(owner(characterId), { name: input.name, select: input.select,
      ...(input.entryFile === undefined ? {} : { entryFile: input.entryFile }), ...(input.manifest === undefined ? {} : { manifest: json(input.manifest) }),
      ...(input.format === 'zip' ? { filename: 'frontend.zip', data: input.data } : input.format === 'html' ? { html: input.html } : { files: input.files.map(sourceFile) }) })
    return { ...workspace, importedProjectIds: workspace.projects.filter(item => !previous.has(item.id)).map(item => item.id) }
  })
  operation('frontends', 'write_files', '原子更新或删除项目文件，保留未提交文件', 'write', z.object({ ...expected, projectId: id, files: z.array(file), deletePaths: z.array(id).optional(), entryFile: id.optional(), manifest: manifest.optional() }).strict(), (characterId, input) => {
    checkProjects(characterId, input.expectedRevision)
    return projects.replaceFiles(owner(characterId), input.projectId, { files: input.files.map(sourceFile),
      ...(input.deletePaths === undefined ? {} : { deletePaths: input.deletePaths }), ...(input.entryFile === undefined ? {} : { entryFile: input.entryFile }),
      ...(input.manifest === undefined ? {} : { manifest: json(input.manifest) }) })
  })
  operation('frontends', 'update', '修改角色前端项目名称、入口或清单', 'write', z.object({ ...expected, projectId: id, changes: z.object({ name: id.optional(), entryFile: id.optional(), manifest: manifest.optional() }).strict().refine(value => Object.keys(value).length > 0) }).strict(), (characterId, input) => {
    checkProjects(characterId, input.expectedRevision); return projects.updateProject(owner(characterId), input.projectId, json(input.changes))
  })
  operation('frontends', 'select', '选择角色独立前端；null 恢复默认聊天内容区', 'write', z.object({ ...expected, projectId: id.nullable() }).strict(), (characterId, input) => {
    checkProjects(characterId, input.expectedRevision); return projects.select(owner(characterId), input.projectId)
  })
  operation('frontends', 'configure', '设置默认聊天中的富消息渲染开关', 'write', z.object({ ...expected, messageRendererEnabled: z.boolean() }).strict(), (characterId, input) => {
    checkProjects(characterId, input.expectedRevision); return projects.setMessageRenderer(owner(characterId), input.messageRendererEnabled)
  })
  operation('frontends', 'delete', '移除指定角色前端项目及其源码文件，保留角色资产库', 'write', z.object({ ...expected, projectId: id }).strict(), (characterId, input) => {
    checkProjects(characterId, input.expectedRevision); return projects.delete(owner(characterId), input.projectId)
  })
  operation('frontends', 'export', '导出前端 ZIP，包含当前角色全部资产和文件夹', 'read', z.object({ projectId: id }).strict(), (characterId, input) => projects.exportProject(owner(characterId), input.projectId))
  return catalog
}
