import { characterAssetBaseUrl, resolveCharacterAssetReferences } from '@eleckoi/dsh-product-data/frontends'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { FrontendOwner, FrontendWorkspace, FrontendImport, FrontendFileInput, FrontendFile,
  FrontendExport, FrontendJson, FrontendReplaceFiles, FrontendFileQuery, NativeFrontendChange } from './frontend-project-types.js'

interface Subscriber {
  owner: FrontendOwner; pending: NativeFrontendChange | undefined; closed: boolean; wake: (() => void) | undefined
}
declare module '@deepseek-ai/cordis' {
  interface Context { eleckoiAuthorFrontendsApi: ElecKoiAuthorFrontendsApi }
}

/** 原生前端文件项目、明确归属、选择与资源操作的正式 Remote。 */
export class ElecKoiAuthorFrontendsApi extends TypertRemoteService {
  static inject = ['typert', 'eleckoiProductData']
  private readonly owner: Context
  private readonly subscribers = new Set<Subscriber>()
  constructor(ctx: Context) {
    super(ctx, 'eleckoiAuthorFrontendsApi', { namespace: 'eleckoiAuthorFrontends' })
    this.owner = ctx
    ctx.effect(() => () => {
      for (const subscriber of this.subscribers) { subscriber.closed = true; subscriber.wake?.() }
      this.subscribers.clear()
    }, 'native frontend changes')
  }
  private repository() { return this.owner.eleckoiProductData.frontendProjects() }
  /** @internal Notify existing subscribers after a Host authoring operation. */
  invalidate(owner: FrontendOwner): void { this.changed(this.repository().workspace(owner)) }
  private changed(workspace: FrontendWorkspace): FrontendWorkspace {
    for (const subscriber of this.subscribers) {
      if (subscriber.owner.scope !== workspace.scope || (subscriber.owner.scope === 'character' && subscriber.owner.characterId !== workspace.characterId)) continue
      // This is an invalidation stream, not an edit history or a file-body projection.
      subscriber.pending = { kind: 'changed', revision: workspace.revision }
      subscriber.wake?.()
    }
    return workspace
  }

  /**
   * 读取明确所属应用或角色的前端项目与选择。
   * @param owner - 应用作用域，或带明确角色编号的角色作用域。
   * @returns 项目列表、选择、绑定和修改版本。
   */
  @Remote
  workspace(owner: FrontendOwner): FrontendWorkspace { return this.repository().workspace(owner) }

  /**
   * 导入 HTML、ZIP 或明确文件列表，保留项目额外元数据。
   * @param owner - 项目所属作用域。
   * @param input - 文件、入口与清单；普通导入创建新项目编号。
   * @returns 导入后的工作区。
   */
  @Remote
  importProject(owner: FrontendOwner, input: FrontendImport): FrontendWorkspace { const workspace = this.repository().importProject(owner, input); if (owner.scope === 'character') this.owner.get('eleckoiCharacterAssetsApi', false)?.invalidate(owner.characterId); return this.changed(workspace) }

  /**
   * 选择同一所属对象的项目，null 撤回自定义页面。
   * @param owner - 项目所属作用域。
   * @param projectId - 明确项目编号或 null。
   * @returns 修改后的工作区。
   */
  @Remote
  select(owner: FrontendOwner, projectId: string | null): FrontendWorkspace { return this.changed(this.repository().select(owner, projectId)) }

  /**
   * 删除明确项目与资源，失败时保留原登记和文件。
   * @param owner - 项目所属作用域。
   * @param projectId - 明确项目编号。
   * @returns 删除后的工作区。
   */
  @Remote
  delete(owner: FrontendOwner, projectId: string): FrontendWorkspace { return this.changed(this.repository().delete(owner, projectId)) }

  /**
   * 读取登记文件；不指定路径时读取该项目的明确入口。
   * @param owner - 项目所属作用域。
   * @param projectId - 明确项目编号。
   * @param input - 项目内路径与编码；省略路径使用入口，省略编码使用 utf8。
   * @returns 路径、编码后的内容与 MIME 类型。
   */
  @Remote
  readFile(owner: FrontendOwner, projectId: string, input: FrontendFileQuery): FrontendFile {
    return this.repository().readFile(owner, projectId, input.path, input.encoding)
  }

  /**
   * 写入明确文件，连同项目清单更新，失败时恢复原文件。
   * @param owner - 项目所属作用域。
   * @param projectId - 明确项目编号。
   * @param file - 路径、内容和编码。
   * @returns 修改后的工作区。
   */
  @Remote
  writeFile(owner: FrontendOwner, projectId: string, file: FrontendFileInput): FrontendWorkspace { return this.changed(this.repository().writeFile(owner, projectId, file)) }

  /**
   * 导出完整资源及清单，不改变原项目。
   * @param owner - 项目所属作用域。
   * @param projectId - 明确项目编号。
   * @returns ZIP 文件名、base64 数据和项目登记。
   */
  @Remote
  exportProject(owner: FrontendOwner, projectId: string): FrontendExport { return this.repository().exportProject(owner, projectId) }

  /**
   * 修改该工作区的消息渲染器开关。
   * @param owner - 明确作用域。
   * @param enabled - 是否启用消息渲染器。
   * @returns 修改后的工作区。
   */
  @Remote
  setMessageRenderer(owner: FrontendOwner, enabled: boolean): FrontendWorkspace { return this.changed(this.repository().setMessageRenderer(owner, enabled)) }

  /**
   * 修改项目名称、入口或清单，不改变编号、归属及文件列表。
   * @param owner - 项目所属作用域。
   * @param projectId - 明确项目编号。
   * @param patch - 明确的项目字段补丁。
   * @returns 修改后的工作区。
   */
  @Remote
  updateProject(owner: FrontendOwner, projectId: string, patch: FrontendJson): FrontendWorkspace { return this.changed(this.repository().updateProject(owner, projectId, patch)) }

  /**
   * 一次修改文件、删除路径与清单，验证引用后才提交。
   * @param owner - 项目所属作用域。
   * @param projectId - 明确项目编号。
   * @param input - 文件修改、明确删除路径与清单。
   * @returns 修改后的工作区。
   */
  @Remote
  replaceFiles(owner: FrontendOwner, projectId: string, input: FrontendReplaceFiles): FrontendWorkspace { return this.changed(this.repository().replaceFiles(owner, projectId, input)) }

  /**
   * 撤回自定义项目的选择，保留文件供以后再次启用。
   * @param owner - 明确作用域。
   * @returns 修改后的工作区。
   */
  @Remote
  restoreDefault(owner: FrontendOwner): FrontendWorkspace { return this.changed(this.repository().restoreDefault(owner)) }

  /**
   * 订阅该工作区的重读通知；合并待消费的通知，不回放编辑历史。
   * @param owner - 明确作用域。
   * @param signal - 取消订阅并释放等待者。
   * @returns 首次快照版本及后续最新修改版本，不传输源码或素材正文。
   */
  @Remote({ mode: 'stream' })
  changes(owner: FrontendOwner, signal: AbortSignal): AsyncIterable<NativeFrontendChange> {
    const workspace = this.workspace(owner)
    const subscriber: Subscriber = { owner: structuredClone(owner), pending: { kind: 'snapshot', revision: workspace.revision }, closed: false, wake: undefined }
    const close = () => { subscriber.closed = true; this.subscribers.delete(subscriber); subscriber.wake?.(); subscriber.wake = undefined }
    this.subscribers.add(subscriber)
    if (signal.aborted) close(); else signal.addEventListener('abort', close, { once: true })
    return (async function* () {
      try {
        while (!subscriber.closed) {
          if (subscriber.pending) { const next = subscriber.pending; subscriber.pending = undefined; yield next }
          else await new Promise<void>(resolve => { subscriber.wake = resolve })
          subscriber.wake = undefined
        }
      } finally { signal.removeEventListener('abort', close); close() }
    })()
  }
}

export function singleByteRange(value: string | undefined, length: number): { start: number; end: number } | 'unsatisfiable' | undefined {
  if (!value || !length) return undefined
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim())
  // Unsupported units, multiple ranges and invalid syntax use the full representation.
  if (!match || !match[1] && !match[2]) return undefined
  const size = BigInt(length)
  if (!match[1]) {
    const suffix = BigInt(match[2]!)
    if (!suffix) return 'unsatisfiable'
    return { start: Number(suffix >= size ? 0n : size - suffix), end: length - 1 }
  }
  const start = BigInt(match[1]), end = match[2] ? BigInt(match[2]) : size - 1n
  if (match[2] && end < start) return undefined
  if (start >= size) return 'unsatisfiable'
  return { start: Number(start), end: Number(end >= size ? size - 1n : end) }
}

/** Official web-server routes are owned by the native product plugin lifecycle. */
export const eleckoiFrontendAssetsPlugin = {
  name: 'eleckoi-frontend-assets', inject: ['webServer', 'eleckoiProductData'],
  apply(ctx: Context) {
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/eleckoi/frontends', handler(request, response) {
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return }
      let parts: string[]
      try { parts = new URL(request.url ?? '/', 'http://localhost').pathname.slice('/eleckoi/frontends/'.length).split('/').map(decodeURIComponent) }
      catch { response.writeHead(400); response.end(); return }
      const id = parts.shift() ?? '', path = parts.join('/'), frontends = ctx.eleckoiProductData.frontendProjects()
      try {
        const asset = frontends.readAsset(id, path)
        const characterId = frontends.resourceCharacterId(id)
        if (characterId && /^(?:text\/|application\/(?:javascript|json))/.test(asset.mimeType)) asset.body = Buffer.from(resolveCharacterAssetReferences(asset.body.toString('utf8'), characterAssetBaseUrl(characterId)), 'utf8')
        const range = request.method === 'GET' && !request.headers['if-range'] ? singleByteRange(request.headers.range, asset.body.length) : undefined
        if (range === 'unsatisfiable') { response.writeHead(416, { 'Content-Range': `bytes */${asset.body.length}` }); response.end(); return }
        const body = range ? asset.body.subarray(range.start, range.end + 1) : asset.body
        response.writeHead(range ? 206 : 200, { 'Content-Type': asset.mimeType, 'Cache-Control': 'no-store',
          'Accept-Ranges': 'bytes', 'Content-Length': body.length,
          ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${asset.body.length}` } : {}) })
        response.end(request.method === 'HEAD' ? undefined : body)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' || !frontends.hasAsset(id, path)) { response.writeHead(404); response.end(); return }
        throw error
      }
    } }), 'native frontend resources')
  }
} satisfies Plugin.Object
