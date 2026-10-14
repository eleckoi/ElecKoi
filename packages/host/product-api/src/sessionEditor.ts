
import type { GeneratedImageFrame } from '@eleckoi/dsh-product-data'

/** 修改同一个官方 Session 的消息和回退位置，保留 Session 编号。 */
export interface ElecKoiSessionEditor {
  /** Apply an ordered author message batch to the same Session, preserving Agent traces. */
  batchMessages(sessionId: string,
    previous: Array<{ id?: string; eventSeq?: number; role: 'user' | 'assistant' | 'system'; content: string }>,
    desired: Array<{ id?: string; eventSeq?: number; role: 'user' | 'assistant' | 'system'; content: string }>): Promise<{
      messages: Array<{ id: string; eventSeq: number; turn: number | null; role: 'user' | 'assistant' | 'system' }>
      turns: Array<{ previous: number; current: number }>
      sequences: Array<{ previous: number; current: number }>
    }>
  /**
   * 将导入的正文写入新建的空白官方 Session，并刷新消息投影。
   * @param sessionId - 空白官方 Session 编号。
   * @param messages - 按实际顺序排列的正文和可选变量快照。
   * @returns 各消息的正式事件与轮次标识。
   */
  importTranscript(sessionId: string, messages: Array<{ role: 'user' | 'assistant'; content: string; variableStateJson?: string }>): Promise<Array<{
    role: 'user' | 'assistant'; content: string; variableStateJson?: string; id: string; sessionEventSeq: number; turn: number | null
  }>>
  /**
   * 修改一条消息并刷新官方投影。
   * @param sessionId - 官方 Session 编号。
   * @param eventSeq - 消息事件序号。
   * @param role - 消息角色。
   * @param content - 新的完整消息文本。
   * @returns 消息修改和投影刷新完成。
   */
  editMessage(sessionId: string, eventSeq: number, role: 'user' | 'assistant', content: string): Promise<void>
  /**
   * 从指定轮次和可选事件位置回退，并刷新官方投影。
   * @param sessionId - 官方 Session 编号。
   * @param fromTurn - 首个需要撤销的轮次。
   * @param fromEventSeq - 可选消息事件边界。
   * @param retainInput - 保留该边界的直接用户事件并闭合其开放轮次。
   * @returns 移除的事件数；无法回退时返回 undefined。
   */
  rewind(sessionId: string, fromTurn: number, fromEventSeq?: number, retainInput?: boolean): Promise<number | undefined>
  /** @internal 产品保存失败时恢复 Session 日志的内部操作，不是跨数据域事务。 */
  transaction<T>(sessionId: string, operation: () => Promise<T>): Promise<T>
  /** @internal 产品删除流程使用的内部操作。 */
  deleteSession(sessionId: string): Promise<void>
  /** @internal 在现有会话写入锁下生成并替换指定图片；正文与其他图片不变。 */
  regenerateImage(sessionId: string, batchId: string, frameId: number, generate: (frame: GeneratedImageFrame) => Promise<GeneratedImageFrame>): Promise<GeneratedImageFrame>
  /** @internal 立即删除尚未进入有效记录的生图结果。 */
  discardGeneratedImages(images: NonNullable<GeneratedImageFrame['attachment']>[]): Promise<void>
}
