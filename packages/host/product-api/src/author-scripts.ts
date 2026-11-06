import { createHash, randomUUID } from 'node:crypto'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { extname } from 'node:path'
import { Remote, RemoteError, TypertRemoteService, type RemoteStream } from '@deepseek-ai/dsh-typert-protocol'
import { assertNativeAuthorScriptVersion, isNativeAuthorScript } from '@eleckoi/author-sdk'
import { assertVariableJson } from '@eleckoi/dsh-product-data/variables'
import { ELECKOI_FAILURE_CODES } from './errorCodes.generated.js'
import type { NativeAuthorRuleReply, NativeAuthorRuleTask, NativeAuthorScriptCatalog, NativeAuthorScriptIdentity, NativeAuthorScriptSettings } from './types.js'
import type { VariableRuleProvider } from './variable-processing.js'

declare module '@deepseek-ai/cordis' {
  interface Context { eleckoiAuthorScriptsApi: ElecKoiAuthorScriptsApi }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap { 'eleckoi/author-script': { reason: string } }
}

function failure(reason: string, message: string): RemoteError<'eleckoi/author-script'> {
  return new RemoteError('eleckoi/author-script', message, { reason })
}
function stateObject(json: string): Record<string, unknown> {
  const value: unknown = JSON.parse(json)
  assertVariableJson(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('作者规则的结果必须是 JSON 对象。')
  return value as Record<string, unknown>
}

class RuleChannel {
  private readonly queue: NativeAuthorRuleTask[] = []
  private readonly pending = new Map<string, { resolve(json: string): void; reject(error: unknown): void; cleanup(): void }>()
  private waiter: (() => void) | undefined
  private error: unknown
  private closed = false

  constructor(readonly version: string) {}

  request(task: Extract<NativeAuthorRuleTask, { kind: 'process' }>, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    if (this.closed) return Promise.reject(this.error)
    return new Promise((resolve, reject) => {
      const cancel = () => {
        if (!this.pending.delete(task.id)) return
        signal.removeEventListener('abort', cancel)
        this.push({ kind: 'cancel', runId: task.runId }); reject(signal.reason)
      }
      this.pending.set(task.id, { resolve, reject, cleanup: () => signal.removeEventListener('abort', cancel) })
      signal.addEventListener('abort', cancel, { once: true }); this.push(task)
    })
  }

  reply(reply: NativeAuthorRuleReply): void {
    const pending = this.pending.get(reply.id)
    if (!pending) return
    this.pending.delete(reply.id); pending.cleanup()
    if (reply.ok) pending.resolve(reply.stateJson)
    else pending.reject(failure('RULE_FAILED', reply.message))
  }

  push(task: NativeAuthorRuleTask): void {
    if (this.closed) return
    this.queue.push(task); this.waiter?.(); this.waiter = undefined
  }

  async *tasks(): AsyncIterable<NativeAuthorRuleTask> {
    while (!this.closed) {
      const task = this.queue.shift()
      if (task) yield task
      else await new Promise<void>(resolve => { this.waiter = resolve })
    }
    if (this.error) throw this.error
  }

  close(error: unknown): void {
    if (this.closed) return
    this.closed = true; this.error = error; this.queue.length = 0
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(error) }
    this.pending.clear(); this.waiter?.(); this.waiter = undefined
  }
}

/** Native script source stays in product-data; only live callbacks cross this stream. */
export class ElecKoiAuthorScriptsApi extends TypertRemoteService {
  static inject = ['typert', 'eleckoiProductData', 'eleckoiVariableProcessing', 'eleckoiCharacterConfigurationChanges']
  private readonly owner: Context
  private readonly channels = new Map<string, RuleChannel>()

  constructor(ctx: Context) {
    super(ctx, 'eleckoiAuthorScriptsApi', { namespace: 'eleckoiAuthorScripts' })
    this.owner = ctx
    ctx.effect(() => ctx.eleckoiVariableProcessing.register(this.rules()))
    ctx.effect(() => () => {
      for (const channel of this.channels.values()) channel.close(failure('HOST_CLOSED', '原生作者脚本服务已卸载。'))
      this.channels.clear()
    })
  }

  /**
   * 读取当前聊天的全局、活动预设与角色原生脚本，不改写未声明原生标准的源码。
   * @param conversationId - ElecKoi 聊天编号。
   * @returns 按库与树顺序排列的启用脚本、所属配置和运行版本。
   */
  @Remote
  read(conversationId: string): NativeAuthorScriptCatalog {
    const data = this.owner.eleckoiProductData
    const characterId = data.readConversationDetails(conversationId).metadata.characterId
    const presetId = data.readAgentPresetCatalog().activePresetIds.roleplay
    const scripts: NativeAuthorScriptCatalog['scripts'] = []
    for (const scope of ['global', 'preset', 'character'] as const) {
      const ownerId = scope === 'character' ? characterId : scope === 'preset' ? presetId : ''
      if (scope !== 'global' && !ownerId) continue
      const library = data.readScriptLibrary(scope, ownerId)
      if (!library.enabled) continue
      let workspace: ReturnType<typeof data.readScriptWorkspace> | undefined
      for (const tree of library.trees) {
        if (!tree.enabled) continue
        for (const script of tree.type === 'folder' ? tree.scripts : [tree]) {
          if (!script.enabled || !isNativeAuthorScript(script)) continue
          assertNativeAuthorScriptVersion(script)
          workspace ??= data.readScriptWorkspace(scope, ownerId)
          const entry = workspace.entries.find(item => item.id === script.id)
          if (!entry) throw failure('SOURCE_MISSING', '原生脚本缺少已登记的源码文件。')
          scripts.push({ key: JSON.stringify([scope, ownerId, script.id]), id: script.id, name: script.name,
            scope, ownerId, source: script.content, buttonsVisible: script.button.enabled,
            entryUrl: `/eleckoi/scripts/${scope}/${encodeURIComponent(ownerId || '_')}/${workspace.version}/${entry.file.split('/').map(encodeURIComponent).join('/')}`,
            settings: structuredClone(script.data), librarySettings: structuredClone(library.variables) })
        }
      }
    }
    const programs = scripts.map(({ settings: _settings, librarySettings: _librarySettings, ...program }) => program)
    const version = createHash('sha256').update(JSON.stringify({ conversationId, characterId, presetId, programs })).digest('hex')
    return { conversationId, characterId, presetId, version, scripts }
  }

  /** 读取当前运行脚本或其所属库的设置与修改版本。
   * @param conversationId - 固定聊天编号。
   * @param version - 实际运行的程序版本。
   * @param identity - 明确的脚本作用域、所有者与编号。
   * @param target - 脚本设置或所属库共享设置。
   * @param signal - 取消读取。
   * @returns JSON 设置及库修改版本。
   */
  @Remote
  getSettings(conversationId: string, version: string, identity: NativeAuthorScriptIdentity,
    target: 'script' | 'library', signal: AbortSignal): NativeAuthorScriptSettings {
    signal.throwIfAborted(); this.requireScript(conversationId, version, identity)
    return this.settings(this.owner.eleckoiProductData.readScriptLibrary(identity.scope, identity.ownerId), identity.scriptId, target)
  }

  /** 保存当前脚本或所属库设置，不替换源码、不重新启动程序。
   * @param conversationId - 固定聊天编号。
   * @param version - 实际运行的程序版本。
   * @param identity - 明确脚本身份。
   * @param target - 脚本设置或所属库共享设置。
   * @param settingsJson - 完整 JSON 对象。
   * @param expectedRevision - 最近读取的库修改版本。
   * @param signal - 保存前取消。
   * @returns 已保存的设置与新修改版本。
   */
  @Remote
  setSettings(conversationId: string, version: string, identity: NativeAuthorScriptIdentity,
    target: 'script' | 'library', settingsJson: string, expectedRevision: number, signal: AbortSignal): NativeAuthorScriptSettings {
    signal.throwIfAborted(); this.requireScript(conversationId, version, identity)
    const values = stateObject(settingsJson)
    const saved = this.owner.eleckoiProductData.updateScriptSettings(identity.scope, identity.ownerId,
      identity.scriptId, target, values, expectedRevision)
    this.owner.eleckoiCharacterConfigurationChanges.publish({ kind: 'configuration', domain: 'scripts' })
    return this.settings(saved, identity.scriptId, target)
  }

  private requireScript(conversationId: string, version: string, identity: NativeAuthorScriptIdentity): void {
    const catalog = this.read(conversationId)
    if (catalog.version !== version) throw failure('CATALOG_CHANGED', '脚本程序已变化，请重新启动后再操作。')
    if (!catalog.scripts.some(script => script.scope === identity.scope && script.ownerId === identity.ownerId && script.id === identity.scriptId)) {
      throw failure('SCRIPT_UNAVAILABLE', '该脚本不属于当前聊天的已启用原生脚本。')
    }
  }

  private settings(library: ReturnType<Context['eleckoiProductData']['readScriptLibrary']>, scriptId: string,
    target: 'script' | 'library'): NativeAuthorScriptSettings {
    const script = library.trees.flatMap(tree => tree.type === 'folder' ? tree.scripts : [tree]).find(item => item.id === scriptId)
    if (!script) throw failure('SCRIPT_UNAVAILABLE', '脚本不存在。')
    return { revision: library.revision, values: structuredClone(target === 'script' ? script.data : library.variables) }
  }

  /**
   * 在脚本启动成功后建立本聊天唯一的原生变量规则流；断开会取消未完成修改。
   * @param conversationId - ElecKoi 聊天编号。
   * @param version - read 返回并实际启动的脚本版本。
   * @param signal - 取消连接与正在等待的规则。
   * @returns 就绪通知及变量候选任务；上行只接受本流任务的成功结果或明确错误。
   */
  @Remote({ mode: 'stream' })
  async *connect(conversationId: string, version: string, signal: AbortSignal): RemoteStream<NativeAuthorRuleTask, NativeAuthorRuleReply> {
    const invocation = this.ctx.invocation
    if (!invocation) throw failure('REMOTE_REQUIRED', '脚本规则流必须通过原生 Remote 建立。')
    signal.throwIfAborted()
    if (this.read(conversationId).version !== version) throw failure('CATALOG_CHANGED', '脚本配置已变化，请重新启动当前脚本。')
    if (this.channels.has(conversationId)) throw failure('OWNER_CONFLICT', '当前聊天已经有原生脚本运行页面。')
    const channel = new RuleChannel(version)
    this.channels.set(conversationId, channel)
    const close = (error: unknown) => {
      channel.close(error)
      if (this.channels.get(conversationId) === channel) this.channels.delete(conversationId)
      signal.removeEventListener('abort', cancel)
    }
    const cancel = () => close(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    const consume = (async () => {
      try {
        for await (const reply of invocation.uplink<NativeAuthorRuleReply>()) channel.reply(reply)
        close(failure('CLIENT_CLOSED', '作者脚本页面已经断开，本次变量修改未保存。'))
      } catch (error) { close(error) }
    })()
    try {
      yield { kind: 'ready', version }
      yield* channel.tasks()
    } finally {
      close(failure('CLIENT_CLOSED', '作者脚本页面已经断开，本次变量修改未保存。'))
      void consume
    }
  }

  private rules(): VariableRuleProvider {
    return { open: context => {
      const catalog = this.read(context.conversationId), channel = this.channels.get(context.conversationId)
      const scriptSettings = catalog.scripts.map(({ key, settings, librarySettings }) => ({ key, settings, librarySettings }))
      const settingsJson = JSON.stringify(scriptSettings)
      if (catalog.scripts.length && !channel) throw failure('CLIENT_UNAVAILABLE', '启用的原生作者脚本尚未启动，请打开该聊天并查看脚本运行错误。')
      const check = () => {
        context.signal.throwIfAborted()
        const latest = this.read(context.conversationId)
        if (latest.version !== catalog.version) throw failure('CATALOG_CHANGED', '处理期间脚本配置已经变化，请重新读取后重试。')
        if (JSON.stringify(latest.scripts.map(({ key, settings, librarySettings }) => ({ key, settings, librarySettings }))) !== settingsJson) {
          throw failure('SETTINGS_CHANGED', '计算期间脚本设置已变化，本次变量修改未保存，请重试。')
        }
        if (channel && (channel.version !== catalog.version || this.channels.get(context.conversationId) !== channel)) throw failure('CLIENT_CHANGED', '处理期间作者脚本运行页面已经变化。')
      }
      check()
      const runId = randomUUID()
      return {
        apply: async (stage, state, before) => {
          check()
          if (!channel) return state
          const json = await channel.request({ kind: 'process', id: randomUUID(), runId,
            conversationId: context.conversationId, stage, stateJson: JSON.stringify(state), beforeJson: JSON.stringify(before),
            scriptSettings: stage === 'before' ? scriptSettings : null }, context.signal)
          check(); return stateObject(json)
        },
        close: () => channel?.push({ kind: 'cancel', runId }),
      }
    } }
  }
}

/** Native ES modules and relative resources stay under their explicit library owner. */
export const eleckoiScriptAssetsPlugin = {
  name: 'eleckoi-script-assets', inject: ['webServer', 'eleckoiProductData', 'eleckoiCharacterConfigurationChanges'],
  apply(ctx: Context) {
    ctx.effect(() => ctx.eleckoiProductData.watchScriptSources(() => {
      ctx.eleckoiCharacterConfigurationChanges.publish({ kind: 'configuration', domain: 'scripts' })
    }), 'native script source changes')
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/eleckoi/scripts', handler(request, response) {
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return }
      try {
        const parts = new URL(request.url ?? '/', 'http://localhost').pathname.slice('/eleckoi/scripts/'.length).split('/').map(decodeURIComponent)
        const scope = parts.shift(), owner = parts.shift(), version = parts.shift(), file = parts.join('/')
        if (!['global', 'character', 'preset'].includes(scope ?? '') || !owner || !version || !file || scope === 'global' && owner !== '_') {
          response.writeHead(400); response.end(); return
        }
        const bytes = ctx.eleckoiProductData.readScriptAsset(scope as 'global' | 'character' | 'preset', scope === 'global' ? '' : owner, version, file)
        const mime: Record<string, string> = { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
          '.json': 'application/json', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml',
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm' }
        response.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': bytes.length })
        response.end(request.method === 'HEAD' ? undefined : bytes)
      } catch (error) {
        const code = (error as { code?: string }).code
        const conflict = code === ELECKOI_FAILURE_CODES.conflictStaleRevision
        const status = error instanceof URIError ? 400 : conflict ? 409 : code === 'ENOENT' ? 404 : 500
        response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(request.method === 'HEAD' ? undefined : error instanceof Error ? error.message : String(error))
      }
    } }), 'native script resources')
  },
} satisfies Plugin.Object
