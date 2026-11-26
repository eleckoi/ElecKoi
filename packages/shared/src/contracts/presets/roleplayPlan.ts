import { z } from 'zod'

export const DEFAULT_ROLEPLAY_PLAN_STEPS = [
  '使用可用的设定库和变量工具，确认这轮扮演需要的设定和状态。',
  '前置任务完成后，调用 eleckoi_roleplay_reply 选择发言角色。下一步必须用 <角色名>对应的角色扮演内容</角色名> 把正文直接发给玩家。'
] as const

function compactSteps(steps: string[]): string[] {
  return steps.map((step) => step.trim()).filter(Boolean)
}

export const roleplayPlanSettingsSchema = z.object({
  steps: z.array(z.string())
    .transform(compactSteps)
    .pipe(z.array(z.string().min(1)).min(1))
})

export type RoleplayPlanSettings = z.output<typeof roleplayPlanSettingsSchema>

export function defaultRoleplayPlanSettings(): RoleplayPlanSettings {
  return { steps: [...DEFAULT_ROLEPLAY_PLAN_STEPS] }
}

export function normalizeRoleplayPlanDraft(value: { steps?: string[] } | undefined): RoleplayPlanSettings {
  const steps = compactSteps(value?.steps ?? [])
  return steps.length ? { steps } : defaultRoleplayPlanSettings()
}
