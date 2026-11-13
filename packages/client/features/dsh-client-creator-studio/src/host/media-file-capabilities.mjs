import { basename } from 'node:path'
import { z } from 'zod'
import { productFailure, ELECKOI_FAILURE_CODES as codes } from '@eleckoi/dsh-product-api'

const fields = { file_path: z.string().min(1).describe('已存在的 Host 工作区文件路径，由当前会话的文件服务解析；不是 asset:// 引用。'),
  name: z.string().min(1).optional(), expectedRevision: z.number().int().nonnegative() }
const schemas = {
  assets: z.object({ ...fields, folderId: z.string().uuid().nullable().default(null) }).strict(),
  frontends: z.object({ ...fields, select: z.boolean().default(false) }).strict(),
}

/** Import working files through the current DSH filesystem execution world. */
export function mediaFileCapabilities(ctx, readState) {
  return Object.entries(schemas).map(([domain, schema]) => ({ id: `${domain}.import_file`, toolsetId: domain,
    title: domain === 'assets' ? '从当前工作区文件分段导入角色资产' : '从当前工作区导入 HTML 或 ZIP 独立前端',
    effect: 'write', target: 'selected-character', inputSchema: z.toJSONSchema(schema),
    async execute(characterId, raw, signal, _delivered, exec) {
      const input = schema.parse(raw), fs = ctx.get('fs', false), directories = ctx.get('workingDirectory', false)
      if (!fs || !directories) throw productFailure(codes.statePrecondition, '当前会话未启用工作区文件能力。', { what: '工作区文件能力' })
      const assertTarget = () => {
        signal.throwIfAborted()
        if (readState(exec.agent).characterId !== characterId) throw productFailure(codes.stateMismatch, '导入期间编辑角色已切换，请重新选择目标后导入。', { what: '导入目标角色' })
      }
      const target = await fs.resolve(input.file_path, { cwd: await directories.ensure(exec.agent, signal), signal })
      const info = await fs.stat(target, signal)
      if (info?.type !== 'file' || !Number.isSafeInteger(info.size) || info.size < 0) throw productFailure(codes.inputInvalid, '导入源必须是有明确字节数的普通文件。', { field: 'file_path' })
      const name = input.name ?? basename(target.displayPath.replaceAll('\\', '/'))
      const data = ctx.eleckoiProductData, assets = data.characterAssets(), projects = data.frontendProjects()
      const owner = { scope: 'character', characterId }
      const checkRevision = () => {
        const revision = domain === 'assets' ? assets.list(characterId).revision : projects.workspace(owner).revision
        if (revision !== input.expectedRevision) throw productFailure(codes.conflictStaleRevision, '导入目标已变化，请重新读取目录。', { what: '角色导入目录' })
      }
      const checkSource = async () => {
        if ((await fs.stat(target, signal))?.version !== info.version) throw productFailure(codes.conflictStaleRevision, '导入源文件已变化，请重新导入。', { what: '导入源文件' })
        assertTarget(); checkRevision()
      }
      assertTarget(); checkRevision()
      if (domain === 'frontends') {
        const filename = basename(target.displayPath.replaceAll('\\', '/'))
        if (!/\.(?:html?|zip)$/i.test(filename)) throw productFailure(codes.inputInvalid, '独立前端文件须为 HTML 或 ZIP。', { field: 'file_path' })
        const bytes = await fs.readBytes(target, signal, info.size)
        await checkSource()
        const previous = new Set(projects.workspace(owner).projects.map(item => item.id))
        const workspace = projects.importProject(owner, { name, filename, data: Buffer.from(bytes).toString('base64'), select: input.select })
        ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
        return { ...workspace, importedProjectIds: workspace.projects.filter(item => !previous.has(item.id)).map(item => item.id) }
      }
      const ticket = assets.begin(characterId, { name, size: info.size, folderId: input.folderId })
      try {
        for (let offset = 0; offset < info.size;) {
          const bytes = await fs.readByteRange(target, { offset, length: Math.min(1024 * 1024, info.size - offset) }, signal)
          assertTarget()
          if (!bytes.length) throw productFailure(codes.dataShapeInvalid, '导入源文件提前结束。', { what: '导入源文件' })
          assets.append(characterId, ticket.id, offset, Buffer.from(bytes).toString('base64')); offset += bytes.length
        }
        await checkSource()
        const catalog = assets.finish(characterId, ticket.id)
        ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
        return { ...catalog, items: catalog.items.map(item => ({ ...item, reference: `asset://${item.id}` })), importedIds: [catalog.items.at(-1).id] }
      } finally { assets.cancel(characterId, ticket.id) }
    },
  }))
}
