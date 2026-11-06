import { delimiter } from 'node:path'
import { loadLayeredEnv, loadProfileDirectory, reportSkippedBundles } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import { retireDeepSeekExtensionSelection } from '@eleckoi/dsh-client-web-search/profile'
import { ELECKOI_INSTALL_ANCHOR } from './desktopPluginBundles'
import { repairRequestContextLogs, recoverStartupSessions } from '@eleckoi/dsh-runtime'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-jobs'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import { localDragResource } from './fileDrag'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@eleckoi/dsh-product-api'
import { foldFailure } from '@shared/foundation/failure'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import type { ChildHostMessage, ParentHostMessage } from './hostSessionProtocol'

function send(message: ChildHostMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.connected || process.send === undefined) {
      resolve()
      return
    }
    process.send(message, error => error === null ? resolve() : reject(error))
  })
}

async function main(): Promise<void> {
  const profileDirectory = process.argv[2]
  if (profileDirectory === undefined) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'Missing desktop plugin profile directory', { field: 'profileDirectory' })
  await retireDeepSeekExtensionSelection(profileDirectory)
  if (process.env.DSH_SESSION_ROOT) await repairRequestContextLogs(process.env.DSH_SESSION_ROOT)
  const profile = loadProfileDirectory('dsh', profileDirectory, ELECKOI_INSTALL_ANCHOR)
  reportSkippedBundles('dsh', profile)
  const application = runProfile({
    environment: loadLayeredEnv('dsh'),
    profile: 'desktop',
    resolvedProfile: { profile, installAnchor: ELECKOI_INSTALL_ANCHOR },
    patchFiles: [process.argv[3], process.argv[6]].filter((value): value is string => Boolean(value)),
    args: ['--no-open', '--port', '0'],
    ...!process.argv[4] ? {} : {
      packageManager: {
        command: process.execPath,
        args: ['--expose-internals', process.argv[4]],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
          PATH: `${process.argv[5] ?? ''}${delimiter}${process.env.PATH ?? ''}`
        }
      }
    }
  })
  let stopping: Promise<void> | undefined
  const dragReads = new Map<number, AbortController>()
  const dragTasks = new Set<Promise<void>>()
  const stop = (): Promise<void> => stopping ??= (async () => {
    for (const abort of dragReads.values()) abort.abort()
    await Promise.allSettled(dragTasks)
    const running = await application.catch(() => undefined)
    await running?.shutdown.shutdown(0)
    await send({ type: 'shutdown-complete' })
    if (process.connected) process.disconnect()
    if (running !== undefined) process.exit()
  })()
  const { ctx } = await application
  const updateTasks = installUpdateTaskControl(ctx)
  const startupPeer = new Peer(ctx.root, { principal: { kind: 'owner' } })
  const remoteStatus = await ctx.typertGateway.invoke({
    peer: startupPeer,
    namespace: 'eleckoiSystem',
    method: 'status',
    args: {}
  }).finally(() => startupPeer.dispose()) as { architecture?: unknown; protocolVersion?: unknown }
  if (remoteStatus.architecture !== 'dsh-remote' || remoteStatus.protocolVersion !== 1) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.pluginLoadFailed, 'ElecKoi DSH Remote Host 协议未正确装载。', { what: 'ElecKoi DSH Remote Host 协议' })
  }
  const requiredServices = [
    'eleckoiCharacterConfigurationApi', 'eleckoiCharactersApi', 'eleckoiPersonaApi',
    'eleckoiCreatorStudioApi', 'eleckoiWebSearchApi', 'eleckoiConversationModelsApi',
    'eleckoiConversationsApi', 'eleckoiRoleplaySessions'
  ] as const
  const missingServices = requiredServices.filter(name => ctx.get(name) === undefined)
  if (missingServices.length > 0) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.pluginLoadFailed, `ElecKoi Host 服务未正确装载：${missingServices.join(', ')}`, { what: 'ElecKoi Host 服务' })
  }
  const sessionRoot = process.env.DSH_SESSION_ROOT
  if (sessionRoot) await recoverStartupSessions(ctx, sessionRoot)
  process.on('message', (value: unknown) => {
    if (typeof value !== 'object' || value === null || !('type' in value)) return
    const message = value as ParentHostMessage
    if (message.type === 'file-drag-cancel') { dragReads.get(message.requestId)?.abort(); return }
    if (message.type === 'file-drag-resource') {
      const abort = new AbortController()
      dragReads.set(message.requestId, abort)
      const task = (async () => {
        try {
          if (stopping) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, '文件拖出服务正在停止。', { what: '文件拖出服务' })
          const resource = await localDragResource(ctx, message.address, abort.signal)
          await send({ type: 'file-drag-resource', requestId: message.requestId, resource })
        } catch (error) {
          if (!abort.signal.aborted) console.error(error)
          await send({ type: 'file-drag-resource', requestId: message.requestId, resource: null, error: 'File drag resource unavailable' })
        } finally { dragReads.delete(message.requestId) }
      })().catch(error => { console.error(error) })
      dragTasks.add(task)
      void task.finally(() => { dragTasks.delete(task) })
      return
    }
    if (message.type === 'shutdown') {
      void stop()
      return
    }
    void updateTasks(message.action)
      .then(active => send({ type: 'update-tasks-complete', id: message.id, active }))
      .catch(error => send({
        type: 'update-tasks-complete', id: message.id, active: true,
        message: error instanceof Error ? error.message : String(error)
      }))
  })
  process.once('disconnect', () => { void stop() })
  const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${String(ctx.webServer.port)}`)
  await send({ type: 'ready', url, injections: ctx.webServer.collectIndexInjections(ctx.connection.browserPeer) })
}

function installUpdateTaskControl(
  ctx: Awaited<ReturnType<typeof runProfile>>['ctx']
): (action: 'inspect' | 'lock' | 'unlock') => Promise<boolean> {
  let locked = false
  let lockGeneration = 0
  let stopped = false
  ctx.effect(() => () => { stopped = true })
  const pendingRequests = new Set<Promise<void>>()
  ctx.on('connection/request', async (_request, response, next) => {
    if (locked) {
      response.writeHead(503)
      response.end()
      return
    }
    const finished = Promise.withResolvers<void>()
    pendingRequests.add(finished.promise)
    try { await next() }
    finally {
      pendingRequests.delete(finished.promise)
      finished.resolve()
    }
  })
  return async (action) => {
    if (stopped) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'DSH 插件宿主正在停止。', { what: 'DSH 插件宿主' })
    }
    if (action === 'unlock') {
      locked = false
      lockGeneration++
    }
    const agents = ctx.get('agents')
    const jobs = ctx.get('jobs')
    if (agents === undefined || jobs === undefined) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 任务服务不可用。', { what: 'DSH 任务服务' })
    }
    if (action === 'lock') {
      locked = true
      const generation = ++lockGeneration
      await Promise.all(pendingRequests)
      if (stopped) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'DSH 插件宿主正在停止。', { what: 'DSH 插件宿主' })
      }
      if (generation !== lockGeneration) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, 'DSH 更新锁已被替换。', { what: 'DSH 更新锁' })
      }
    }
    const liveAgents = agents.list()
    return liveAgents.some(agent => agent.status === 'running'
      || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0)
      || [undefined, ...liveAgents].some(agent => jobs.list(agent?.id)
        .some(job => job.status === 'running' || job.status === 'stopping'))
  }
}

void main().catch(async error => {
  // 边界③：把这次装配失败折成契约形态，码与参数化详情随 fatal 帧一起交给父进程。
  // 父进程不重新猜语义（它看不懂 DSH 的异常），只负责搬运到宿主失败通知上。
  const failure = foldFailure(error)
  await send({
    type: 'fatal',
    code: failure.code,
    message: failure.message,
    details: failure.details as Readonly<Record<string, unknown>>,
    ...error instanceof Error && typeof error.stack === 'string' ? { stack: error.stack } : {}
  }).catch(() => undefined)
  console.error(error)
  process.exitCode = 1
  if (process.connected) process.disconnect?.()
})
