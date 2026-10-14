import { Service, type Context } from '@deepseek-ai/cordis'

interface ConversationOperation {
  readonly operationId: string
  readonly conversationId: string
  readonly runtimeSessionId: string
  readonly turn: number
}

/** @internal 管理聊天操作互斥和产品保存等待，不提供第三方插件回调。 */
export class ElecKoiConversationLifecycle extends Service {
  static inject = ['eleckoiProductData']
  private readonly current = new Map<string, { input: ConversationOperation; pending?: Promise<void>; settled: boolean }>()
  private readonly busyConversations = new Set<string>()

  constructor(ctx: Context) {
    super(ctx, 'eleckoiConversationLifecycle')
    ctx.effect(() => async () => {
      await Promise.allSettled([...this.current.values()].map(entry => entry.pending))
      this.current.clear()
    })
  }

  /** @internal 同一聊天的准备和编辑互斥，其他聊天独立运行。 */
  async exclusive<T>(conversationId: string, operation: () => Promise<T>): Promise<T> {
    if (this.busyConversations.has(conversationId)) throw new Error('当前聊天正在准备生成或处理消息，请稍后重试。')
    this.busyConversations.add(conversationId)
    try { return await operation() } finally { this.busyConversations.delete(conversationId) }
  }

  /** @internal 每条聊天只保留当前操作，下一次准备替换，删除聊天及 Host 卸载清空。 */
  begin(input: ConversationOperation): void {
    const previous = this.current.get(input.conversationId)
    if (previous?.pending && !previous.settled) throw new Error('当前聊天尚未完成保存。')
    this.current.set(input.conversationId, { input: { ...input }, settled: false })
  }

  /** @internal 仅接收本进程已准备的操作及正式轮次，不从旧请求文件恢复完成状态。 */
  matches(conversationId: string, operationId: string, turn: number): boolean {
    const entry = this.current.get(conversationId)
    return entry?.input.operationId === operationId && entry.input.turn === turn
  }

  /** @internal Session 通知只安排工作；同一当前操作只保存一次。 */
  track(conversationId: string, operationId: string, operation: () => Promise<void>): void {
    const entry = this.current.get(conversationId)
    if (!entry || entry.input.operationId !== operationId) throw new Error('本次生成没有对应的准备过程。')
    if (entry.pending) return
    const pending = Promise.resolve().then(operation).finally(() => { entry.settled = true })
    entry.pending = pending
    void pending.catch(error => this.ctx.logger.error(`聊天保存失败：${String(error)}`))
  }

  /** @internal 等待当前进程本轮收尾，失败传给调用方；不提供历史结果查询。 */
  async wait(conversationId: string, operationId: string): Promise<void> {
    const entry = this.current.get(conversationId)
    if (!entry || entry.input.operationId !== operationId) throw new Error('本次生成的等待信息已不存在，请使用当前生成流程。')
    if (!entry.pending) throw new Error('本轮尚未进入保存流程，请先等待 DSH 运行结束。')
    await entry.pending
  }

  /** @internal 等待上一轮结束后允许重试；原失败已经通过调用结果和变更事件报告。 */
  async drain(conversationId: string): Promise<void> {
    await this.current.get(conversationId)?.pending?.catch(() => undefined)
  }

  /** @internal 释放尚未被 Session 接受的准备；已经收尾的轮次仍由 turn/end 管理。 */
  release(conversationId: string, operationId: string): boolean {
    const entry = this.current.get(conversationId)
    if (!entry || entry.input.operationId !== operationId || entry.pending) return false
    this.current.delete(conversationId)
    return true
  }

  /** @internal 删除聊天后释放本进程当前操作，调用前等待正在收尾的工作。 */
  forget(conversationId: string): void {
    this.current.delete(conversationId)
  }
}
