import { z } from 'zod'

export const DEFAULT_ROLEPLAY_PLAN_STEPS = [
  '必须先并行调用工具调研阅读设定，这里不扮演回复，禁止未阅读设定直接回复',
  '等前置任务都完成，直接输出 <FINAL> 正文，不要再次调用 update_roleplay_plan；应用检测到正文后会自动完成最终项的标记。'
] as const

export const roleplayPlanSettingsSchema = z.object({
  steps: z.array(z.string().min(1).max(2_000)).min(1).max(20)
}).strict()

export type RoleplayPlanSettings = z.output<typeof roleplayPlanSettingsSchema>

export function defaultRoleplayPlanSettings(): RoleplayPlanSettings {
  return { steps: [...DEFAULT_ROLEPLAY_PLAN_STEPS] }
}
