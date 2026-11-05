import type { Context } from '@deepseek-ai/cordis'

export interface IllustrationSessionConfiguration {
  autoIllustration?: { enabled: boolean; modelConfigId: string }
  inheritedFromSessionId?: string
}

/** 独立自动配图插件提供的本轮提示词与已有分镜重画能力。 */
export interface ElecKoiAutoIllustration {
  /**
   * 取得根角色会话本轮启用的配图指令。
   * @param snapshot - 已准备好的当前会话配置。
   * @returns 本轮指令；停用或未绑定模型时为空。
   */
  instructions(snapshot: IllustrationSessionConfiguration): string
  /**
   * 通过当前插件绑定的模型重画已有分镜，保留其他图片与正文。
   * @param sessionId - 角色会话编号。
   * @param batchId - 原配图批次编号。
   * @param frameId - 原分镜编号。
   * @param snapshot - 当前会话的自动配图配置。
   * @param signal - 调用取消信号。
   * @returns 重画的错误状态；完整图片结果通过原会话事件发布。
   */
  regenerateImage(sessionId: string, batchId: string, frameId: number,
    snapshot: IllustrationSessionConfiguration, signal: AbortSignal): Promise<{ error?: string }>
}

declare module '@deepseek-ai/cordis' {
  interface Context { eleckoiAutoIllustration: ElecKoiAutoIllustration }
}

export const name: 'eleckoi-auto-illustration'
export const inject: readonly string[]
export function apply(ctx: Context): void
