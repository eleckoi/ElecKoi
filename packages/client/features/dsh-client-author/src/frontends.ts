import type { Context } from '@deepseek-ai/cordis'
import type {} from '@eleckoi/dsh-product-api/remote'
import type { FrontendOwner, FrontendWorkspace } from '@eleckoi/dsh-product-api/frontends'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import type { CharacterAssetCatalog } from '@eleckoi/dsh-product-api/types'

type Remote = Context['remote']['eleckoiAuthorFrontends']
type Watch = { start(): void; close(): void }

/** Native file projects use the generated Remote, independently of chat/script readiness. */
export class NativeFrontendClient {
  private readonly watchers = new Set<Watch>()
  private closed = false
  constructor(readonly projects: Remote, readonly assets?: Context['remote']['eleckoiCharacterAssets']) {}

  /** 订阅明确工作区的最新状态，串行重读并释放旧连接。
   * @param owner - 应用或明确角色的工作区。
   * @param listener - 最新状态回调。
   * @param onError - 未取消的读取或连接错误。
   * @returns 取消订阅函数。
   */
  watch(owner: FrontendOwner, listener: (workspace: FrontendWorkspace) => void, onError: (error: unknown) => void): () => void {
    if (this.closed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'Native frontend service is closed', { what: '原生前端服务' })
    const fixedOwner = structuredClone(owner)
    let stopped = false, abort: AbortController | undefined
    const watch: Watch = {
      start: () => {
        abort?.abort(new Error('Frontend connection reset'))
        const generation = new AbortController(); abort = generation
        let requested = -1, accepted = -1, reading: Promise<void> | undefined
        const current = () => !stopped && !this.closed && !generation.signal.aborted && abort === generation
        const read = () => {
          if (reading) return
          let failed = false
          reading = (async () => {
            while (current() && requested > accepted) {
              const result = await this.projects.workspace(fixedOwner)
              if (!current()) return
              if (!result.ok) throw result.error
              const workspace = result.value
              if (workspace.scope !== fixedOwner.scope || fixedOwner.scope === 'character' && workspace.characterId !== fixedOwner.characterId) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, 'Frontend workspace owner mismatch', { what: '前端工作区的归属' })
              if (workspace.revision < accepted) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, 'Frontend workspace revision decreased', { what: '前端工作区的修订号' })
              accepted = workspace.revision; listener(workspace)
            }
          })().catch(error => { failed = true; if (current()) onError(error) }).finally(() => {
            reading = undefined
            if (!failed && current() && requested > accepted) read()
          })
        }
        const stream = this.projects.changes(fixedOwner, generation.signal)
        void (async () => {
          try {
            for await (const change of stream) {
              if (!current()) return
              requested = Math.max(requested, change.revision); read()
            }
            if (current()) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'Native frontend changes stream ended', { what: '原生前端变更流' })
          } catch (error) { if (current()) onError(error) }
          finally { await stream.dispose() }
        })().catch(error => { if (current()) onError(error) })
      },
      close: () => { stopped = true; abort?.abort(new Error('Frontend workspace released')); this.watchers.delete(watch) },
    }
    this.watchers.add(watch)
    try { watch.start() } catch (error) { watch.close(); throw error }
    return watch.close
  }

  /** 订阅角色资产元数据，重连重新读取；不缓存文件正文。
   * @param characterId - 明确所属角色。
   * @param listener - 最新目录。
   * @param onError - 非取消错误。
   * @returns 释放订阅。
   */
  watchAssets(characterId: string, listener: (catalog: CharacterAssetCatalog) => void, onError: (error: unknown) => void): () => void {
    if (!this.assets || this.closed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '资产服务尚未就绪。', { what: '资产服务' })
    const remote = this.assets
    let abort: AbortController | undefined, stopped = false
    const watcher: Watch = {
      start: () => {
        abort?.abort(); const controller = new AbortController(); abort = controller
        const current = () => !stopped && !this.closed && abort === controller && !controller.signal.aborted
        const stream = remote.changes(characterId, controller.signal)
        void (async () => {
          try {
            let accepted = -1
            for await (const change of stream) {
              if (!current()) return
              if (change.revision <= accepted) continue
              try {
                const result = await remote.list(characterId)
                if (!current()) return
                if (!result.ok) throw result.error
                if (result.value.characterId !== characterId) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '资产归属不一致。', { what: '资产目录' })
                accepted = result.value.revision; listener(result.value)
              } catch (error) { if (current()) onError(error) }
            }
            if (current()) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '资产订阅已结束。', { what: '资产目录' })
          } catch (error) { if (current()) onError(error) }
          finally { await stream.dispose() }
        })().catch(error => { if (current()) onError(error) })
      },
      close: () => { stopped = true; abort?.abort(); this.watchers.delete(watcher) },
    }
    this.watchers.add(watcher); try { watcher.start() } catch (error) { watcher.close(); throw error }; return watcher.close
  }
  /** @internal */
  reset(): void { if (!this.closed) for (const watcher of this.watchers) watcher.start() }
  /** @internal */
  dispose(): void { this.closed = true; for (const watcher of this.watchers) watcher.close() }
}
