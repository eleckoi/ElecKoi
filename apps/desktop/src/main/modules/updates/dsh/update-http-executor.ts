/** Electron-native inactivity deadlines for updater checks, full downloads, and blockmap requests. */
import type { OutgoingHttpHeaders, RequestOptions } from 'node:http'
import { basename, dirname, extname } from 'node:path'
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor.js'
import type { ClientRequest, IncomingMessage } from 'electron'
import type { AppUpdater } from 'electron-updater'
import { rejectionIsAwaitedElsewhere } from '@shared/foundation/swallowedFailure'
import { downloadFullInstaller, reconcileFullInstallerResume, type InstallerResponse } from '../full-installer-resume.js'

type DownloadOptions = Parameters<ElectronHttpExecutor['download']>[2]

/** Retains electron-updater transport and proxy handling while bounding silent connections. */
export class DesktopUpdateHttpExecutor extends ElectronHttpExecutor {
  /**
   * @param idleTimeoutMs - Maximum silence before headers or between response chunks, not a total download deadline.
   * @param proxyLogin - Existing updater login event forwarding.
   */
  constructor(private readonly idleTimeoutMs: number, proxyLogin?: ConstructorParameters<typeof ElectronHttpExecutor>[0]) {
    super(proxyLogin)
    if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1000 || idleTimeoutMs > 2_147_483_647) {
      throw new Error('desktop update: HTTP idle timeout must be an integer from 1000 through 2147483647')
    }
  }

  override download(url: URL, destination: string, options: DownloadOptions): Promise<string> {
    const downloadNative = () => super.download(url, destination, options)
    const sha512 = options.sha512
    if (sha512 == null || !/^[A-Za-z0-9+/]{86}==$/.test(sha512) || options.sha2 != null ||
      basename(dirname(destination)) !== 'pending' || extname(destination).toLowerCase() !== '.exe') return downloadNative()
    return downloadFullInstaller(url, destination, sha512, options,
      (headers, consume) => this.receiveInstaller(url, options, headers, consume), downloadNative)
  }

  private async receiveInstaller(
    url: URL,
    options: DownloadOptions,
    headers: OutgoingHttpHeaders,
    consume: (response: InstallerResponse) => Promise<void>,
  ): Promise<void> {
    let writing: Promise<void> | undefined
    try {
      await options.cancellationToken.createPromise<void>((resolve, reject, onCancel) => {
        let request: ClientRequest | undefined
        let response: InstallerResponse | undefined
        const abort = () => {
          response?.destroy()
          request?.abort()
        }
        const fail = (error: Error) => {
          reject(error)
          abort()
        }
        const send = (requestOptions: RequestOptions, redirects: number) => {
          request = this.createRequest(requestOptions, (incoming: IncomingMessage) => {
            // Electron documents IncomingMessage as a Readable, which its declarations omit.
            response = incoming as InstallerResponse
            response.on('error', fail)
            response.pause()
            writing = consume(response)
            void writing.then(resolve, fail)
          })
          this.addErrorAndTimeoutHandlers(request, fail)
          this.addRedirectHandlers(request, requestOptions, fail, redirects, next => send(next, redirects + 1))
          request.end()
        }
        onCancel(abort)
        const requestOptions = {
          protocol: url.protocol, hostname: url.hostname, port: url.port || undefined, path: url.pathname + url.search,
          method: 'GET', redirect: 'manual',
          headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'electron-builder', ...options.headers, ...headers },
        }
        send(requestOptions, 0)
      })
    } finally {
      // The library cancellation promise rejects before an active file stream closes.
      await writing?.catch(rejectionIsAwaitedElsewhere)
    }
  }

  override addErrorAndTimeoutHandlers(request: ClientRequest, reject: (error: Error) => void): void {
    // The upstream socket timer is for Node HTTP; Electron ClientRequest has response/close events instead.
    super.addErrorAndTimeoutHandlers(request, reject, this.idleTimeoutMs)
    let response: InstallerResponse | undefined
    let timer: ReturnType<typeof setTimeout>
    const stop = (): void => {
      clearTimeout(timer)
      request.off('response', onResponse)
      request.off('abort', stop)
      request.off('error', stop)
      response?.off('data', refresh)
      response?.off('end', stop)
      response?.off('error', stop)
      response?.off('close', stop)
    }
    const refresh = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        stop()
        reject(Object.assign(new Error('Desktop update connection timed out'), { code: 'ETIMEDOUT' }))
        request.abort()
      }, this.idleTimeoutMs)
    }
    const onResponse = (incoming: IncomingMessage): void => {
      response = incoming as InstallerResponse
      response.on('data', refresh)
      response.once('end', stop)
      response.once('error', stop)
      response.once('close', stop)
      refresh()
    }
    request.once('response', onResponse)
    // Electron 44 can emit writable close after finish, before response headers arrive.
    request.once('abort', stop)
    request.once('error', stop)
    refresh()
  }
}

/** Use the pinned updater's resolved cache path even if this process has yet to download anything. */
export async function reconcileUpdaterResume(updater: AppUpdater, expected: readonly string[] = []): Promise<void> {
  const internal = updater as object as {
    httpExecutor?: unknown
    getOrCreateDownloadHelper?: () => Promise<{ cacheDirForPendingUpdate: string }>
  }
  if (!(internal.httpExecutor instanceof DesktopUpdateHttpExecutor) || internal.getOrCreateDownloadHelper === undefined) return
  try {
    const helper = await internal.getOrCreateDownloadHelper()
    await reconcileFullInstallerResume(helper.cacheDirForPendingUpdate, expected)
  } catch (error) {
    updater.logger?.warn(`Desktop update resume cache could not be reconciled: ${String(error)}`)
  }
}
