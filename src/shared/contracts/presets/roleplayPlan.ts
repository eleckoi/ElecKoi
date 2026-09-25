import { z } from 'zod'

export const DEFAULT_ROLEPLAY_PLAN_STEPS = [
  '必须先并行调用工具调研阅读设定，这里不扮演回复，禁止未阅读设定直接回复',
  '等前置任务都完成，直接输出 <FINAL> 正文，不要再次调用 update_roleplay_plan；应用检测到正文后会自动完成最终项的标记。'
] as const

function compactSteps(steps: string[]): string[] {
  return steps.map((step) => step.trim()).filter(Boolean)
}

export const roleplayPlanSettingsSchema = z.object({
  steps: z.array(z.string().max(2_000)).max(20)
    .transform(compactSteps)
    .pipe(z.array(z.string().min(1).max(2_000)).min(1).max(20))
})

export type RoleplayPlanSettings = z.output<typeof roleplayPlanSettingsSchema>

export function defaultRoleplayPlanSettings(): RoleplayPlanSettings {
  return { steps: [...DEFAULT_ROLEPLAY_PLAN_STEPS] }
}

export function normalizeRoleplayPlanDraft(value: { steps?: string[] } | undefined): RoleplayPlanSettings {
  const steps = compactSteps(value?.steps ?? [])
  return steps.length ? { steps } : defaultRoleplayPlanSettings()
}
