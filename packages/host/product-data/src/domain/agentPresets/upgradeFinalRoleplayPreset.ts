import {
  HIDDEN_TOOL_TIMELINE_ENTRY_TITLE,
  HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID,
  isHiddenToolTimelineEntry
} from '@shared/contracts/presets/builtIns'
import { DEFAULT_ROLEPLAY_PLAN_STEPS } from '@shared/contracts/presets/roleplayPlan'
import type { SettingLibraryEntry, SettingLibraryPromptPosition } from '@shared/contracts/settingLibrary/schemas'

// RETIRE WHEN: 正式停止支持 v19 及更早数据库直升后，删除 0020 的预设转换调用和专项测试。
// 受支持的预设导入也不再接收已发布的 FINAL 协议后，删除此模块、导入调用和专项测试。
// 只更新旧库和旧预设的默认标题、位置名称及计划，正文由提示词文件提供。
const legacyTitle = '隐藏工具时间线'
const legacyPlanSteps = [
  '必须先并行调用工具调研阅读设定，这里不扮演回复，禁止未阅读设定直接回复',
  '等前置任务都完成，直接输出 <FINAL> 正文，不要再次调用 update_roleplay_plan；应用检测到正文后会自动完成最终项的标记。'
]
export function upgradeFinalReplyEntry<T extends Pick<SettingLibraryEntry, 'id' | 'kind' | 'title'>>(entry: T): T {
  return isHiddenToolTimelineEntry(entry) && entry.title === legacyTitle
    ? { ...entry, title: HIDDEN_TOOL_TIMELINE_ENTRY_TITLE } : entry
}

export function upgradeFinalReplyPosition<T extends Pick<SettingLibraryPromptPosition, 'id' | 'name'>>(position: T): T {
  return position.id === HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID && position.name === legacyTitle
    ? { ...position, name: HIDDEN_TOOL_TIMELINE_ENTRY_TITLE } : position
}

export function upgradeFinalReplyPlan(plan: unknown): unknown {
  if (typeof plan !== 'object' || !plan || !('steps' in plan) || !Array.isArray(plan.steps)) return plan
  const original: unknown[] = plan.steps
  const steps = original.map(step => typeof step === 'string'
    ? DEFAULT_ROLEPLAY_PLAN_STEPS[legacyPlanSteps.indexOf(step.trim())] ?? step : step)
  return steps.some((step, index) => step !== original[index]) ? { ...plan, steps } : plan
}
