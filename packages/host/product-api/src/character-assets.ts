import type { Context, Plugin } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createReadStream } from 'node:fs'
import { ELECKOI_FAILURE_CODES } from './errorCodes.generated.js'
import { singleByteRange } from './author-frontends.js'
import type { CharacterAssetCatalog, CharacterAssetUpload, CharacterAssetUploadTicket } from './types.js'
export type { CharacterAssetFolder, CharacterAsset, CharacterAssetCatalog, CharacterAssetUpload, CharacterAssetUploadTicket } from './types.js'

declare module '@deepseek-ai/cordis' { interface Context { eleckoiCharacterAssetsApi: ElecKoiCharacterAssetsApi } }
type Change = { revision: number }
type Subscriber = { characterId: string; pending?: Change | undefined; closed: boolean; wake?: (() => void) | undefined }

/** 通过正式 Remote 管理角色资产目录与分段上传；文件正文由资源路由提供。 */
export class ElecKoiCharacterAssetsApi extends TypertRemoteService {
  static inject = ['typert', 'eleckoiProductData', 'sessionController']
  private subscribers = new Set<Subscriber>()
  constructor(private readonly owner: Context) {
    super(owner, 'eleckoiCharacterAssetsApi', { namespace: 'eleckoiCharacterAssets' })
    owner.effect(() => () => { for (const sub of this.subscribers) { sub.closed = true; sub.wake?.() }; this.subscribers.clear() }, 'character asset subscriptions')
  }
  private repository() { return this.owner.eleckoiProductData.characterAssets() }
  /** @internal */
  invalidate(characterId: string): void { this.changed(this.list(characterId)) }
  private changed(catalog: CharacterAssetCatalog): CharacterAssetCatalog {
    for (const sub of this.subscribers) if (sub.characterId === catalog.characterId) { sub.pending = { revision: catalog.revision }; sub.wake?.() }
    return catalog
  }
  /** 读取角色资产目录，不传输文件正文。
   * @param characterId - 明确所属角色。
   * @returns 文件元数据及目录修订。
   */
  @Remote
  list(characterId: string): CharacterAssetCatalog { return this.repository().list(characterId) }
  /** 查询当前 Host 是否能在系统文件管理器中定位资产。
   * @returns 系统文件定位操作是否可用。
   */
  @Remote
  canReveal(): boolean { return this.owner.sessionController.canOpenWorkspacePath() }
  /** 在当前 Host 的文件管理器中定位角色库实际保存的文件。
   * @param characterId - 明确所属角色。
   * @param assetId - 要定位的资产编号，不接受客户端路径。
   * @param signal - 取消调用的生命周期信号。
   * @returns 系统接受定位操作后完成；失败保留正式错误。
   */
  @Remote
  async reveal(characterId: string, assetId: string, signal: AbortSignal): Promise<void> {
    const { path } = this.repository().readAsset(characterId, assetId)
    await this.owner.sessionController.openWorkspacePath({ path, action: 'reveal' }, signal)
  }
  /** 开始一项分段上传，不创建聊天或 Session。
   * @param characterId - 明确所属角色。
   * @param input - 文件名称与总字节数。
   * @returns 上传编号及已确认位置。
   */
  @Remote
  beginUpload(characterId: string, input: CharacterAssetUpload): CharacterAssetUploadTicket { return this.repository().begin(characterId, input) }
  /** 按已确认偏移追加文件数据。
   * @param characterId - 明确所属角色。
   * @param uploadId - 当前上传编号。
   * @param offset - 本段起始字节位置。
   * @param data - 本段 base64。
   * @returns 新的已确认位置。
   */
  @Remote
  appendUpload(characterId: string, uploadId: string, offset: number, data: string): CharacterAssetUploadTicket { return this.repository().append(characterId, uploadId, offset, data) }
  /** 完整接收后原子发布文件和目录。
   * @param characterId - 明确所属角色。
   * @param uploadId - 当前上传编号。
   * @returns 最新目录。
   */
  @Remote
  finishUpload(characterId: string, uploadId: string): CharacterAssetCatalog { return this.changed(this.repository().finish(characterId, uploadId)) }
  /** 取消未完成的上传并释放暂存文件。
   * @param characterId - 明确所属角色。
   * @param uploadId - 当前上传编号。
   * @returns 清理完成。
   */
  @Remote
  cancelUpload(characterId: string, uploadId: string): void { this.repository().cancel(characterId, uploadId) }
  /** 修改名称，保持引用编号、类型和内容。
   * @param characterId - 明确所属角色。
   * @param assetId - 资产编号。
   * @param name - 新显示名称。
   * @returns 最新目录。
   */
  @Remote
  rename(characterId: string, assetId: string, name: string): CharacterAssetCatalog { return this.changed(this.repository().rename(characterId, assetId, name)) }
  /** 复制选中资产，创建新的引用编号。
   * @param characterId - 明确所属角色。
   * @param assetIds - 要复制的编号。
   * @returns 最新目录。
   */
  @Remote
  duplicate(characterId: string, assetIds: string[]): CharacterAssetCatalog { return this.changed(this.repository().duplicate(characterId, assetIds)) }
  /** 删除明确选中的资产，其他角色与文件不变。
   * @param characterId - 明确所属角色。
   * @param assetIds - 要删除的编号。
   * @param folderIds - 要递归删除的文件夹编号。
   * @returns 最新目录。
   */
  @Remote
  delete(characterId: string, assetIds: string[], folderIds?: string[]): CharacterAssetCatalog { return this.changed(this.repository().delete(characterId, assetIds, folderIds)) }
  /** 新建可容纳混合素材的逻辑文件夹。
   * @param characterId - 所属角色。
   * @param name - 显示名称。
   * @param parentId - 父文件夹编号，null 表示根目录。
   * @returns 最新目录。
   */
  @Remote
  createFolder(characterId: string, name: string, parentId: string | null): CharacterAssetCatalog { return this.changed(this.repository().createFolder(characterId, name, parentId)) }
  /** 重命名文件夹，保持素材引用。
   * @param characterId - 所属角色。
   * @param folderId - 文件夹编号。
   * @param name - 显示名称。
   * @returns 最新目录。
   */
  @Remote
  renameFolder(characterId: string, folderId: string, name: string): CharacterAssetCatalog { return this.changed(this.repository().renameFolder(characterId, folderId, name)) }
  /** 将选中素材和文件夹移至目标位置，不移动实际文件或更改引用编号。
   * @param characterId - 所属角色。
   * @param assetIds - 素材编号。
   * @param folderIds - 文件夹编号。
   * @param destination - 目标文件夹编号，null 表示根目录。
   * @returns 最新目录。
   */
  @Remote
  move(characterId: string, assetIds: string[], folderIds: string[], destination: string | null): CharacterAssetCatalog { return this.changed(this.repository().move(characterId, assetIds, folderIds, destination)) }
  /** 订阅当前角色目录失效通知；取消时释放等待者。
   * @param characterId - 明确所属角色。
   * @param signal - 生命周期取消。
   * @returns 最新目录修订号，不包含二进制内容。
   */
  @Remote({ mode: 'stream' })
  changes(characterId: string, signal: AbortSignal): AsyncIterable<{ revision: number }> {
    const sub: Subscriber = { characterId, pending: { revision: this.list(characterId).revision }, closed: false }
    const close = () => { sub.closed = true; this.subscribers.delete(sub); sub.wake?.() }
    this.subscribers.add(sub); signal.addEventListener('abort', close, { once: true }); if (signal.aborted) close()
    return (async function* () { try { while (!sub.closed) { if (sub.pending) { const value = sub.pending; sub.pending = undefined; yield value } else await new Promise<void>(resolve => { sub.wake = resolve }) } } finally { signal.removeEventListener('abort', close); close() } })()
  }
}

export const eleckoiCharacterAssetFilesPlugin = {
  name: 'eleckoi-character-asset-files', inject: ['webServer', 'eleckoiProductData'],
  apply(ctx: Context) {
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/eleckoi/character-assets', handler(request, response) {
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return }
      try {
        const url = new URL(request.url ?? '/', 'http://localhost'), parts = url.pathname.slice('/eleckoi/character-assets/'.length).split('/').map(decodeURIComponent)
        if (parts.length !== 2 || !parts[0] || !parts[1]) { response.writeHead(400); response.end(); return }
        const { path, asset } = ctx.eleckoiProductData.characterAssets().readAsset(parts[0], parts[1])
        const range = request.method === 'GET' && !request.headers['if-range'] ? singleByteRange(request.headers.range, asset.size) : undefined
        if (range === 'unsatisfiable') { response.writeHead(416, { 'Content-Range': `bytes */${asset.size}` }); response.end(); return }
        response.writeHead(range ? 206 : 200, { 'Content-Type': asset.mimeType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          ...(asset.mimeType === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}),
          'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
          'Accept-Ranges': 'bytes', 'Content-Length': range ? range.end - range.start + 1 : asset.size,
          ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${asset.size}` } : {}) })
        if (request.method === 'HEAD') { response.end(); return }
        const stream = createReadStream(path, range || undefined)
        response.on('close', () => stream.destroy()); stream.on('error', error => response.destroy(error)); stream.pipe(response)
      } catch (error) {
        const code = (error as { code?: string }).code
        response.writeHead(code === 'ENOENT' || code === ELECKOI_FAILURE_CODES.lookupNotFound || code === ELECKOI_FAILURE_CODES.characterNotFound ? 404 : 400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(request.method === 'HEAD' ? undefined : '资产不存在或引用无效。')
      }
    } }), 'character media resources')
  },
} satisfies Plugin.Object
