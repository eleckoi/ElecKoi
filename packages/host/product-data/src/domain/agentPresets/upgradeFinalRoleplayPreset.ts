import {
  DEFAULT_HIDDEN_TOOL_TIMELINE_CONTENT,
  HIDDEN_TOOL_TIMELINE_ENTRY_TITLE,
  HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID,
  HIDDEN_TOOL_TIMELINE_REPLY_PHASE,
  isHiddenToolTimelineEntry,
  LEGACY_HIDDEN_TOOL_TIMELINE_CONTENT
} from '@shared/contracts/presets/builtIns'
import { DEFAULT_ROLEPLAY_PLAN_STEPS } from '@shared/contracts/presets/roleplayPlan'
import type { SettingLibraryEntry, SettingLibraryPromptPosition } from '@shared/contracts/settingLibrary/schemas'

// RETIRE WHEN: supported upgrades stop at v20 or newer and preset imports no
// longer accept the published FINAL protocol. Remove this module, its v19→v20
// preset call sites and import conversion tests together.
const legacyTitle = '隐藏工具时间线'
const legacyPlanSteps = [
  '必须先并行调用工具调研阅读设定，这里不扮演回复，禁止未阅读设定直接回复',
  '等前置任务都完成，直接输出 <FINAL> 正文，不要再次调用 update_roleplay_plan；应用检测到正文后会自动完成最终项的标记。'
]
const legacyToolOutput = LEGACY_HIDDEN_TOOL_TIMELINE_CONTENT.match(/\n  visible_output:[\s\S]*?(?=\nfinal_phase:)/)![0]

export function upgradeFinalReplyEntry<T extends Pick<SettingLibraryEntry, 'id' | 'kind' | 'title' | 'content'>>(entry: T): T {
  if (!isHiddenToolTimelineEntry(entry)) return entry
  const content = entry.content.replace(/<roleplay_output_protocol>[\s\S]*?<\/roleplay_output_protocol>/g, (protocol) => {
    const normalized = protocol.replace(/\r\n/g, '\n')
    const final = normalized.match(/\nfinal_phase:\n[\s\S]*?(?=\n<\/roleplay_output_protocol>)/)?.[0]
    if (!final?.includes('<FINAL>')) return protocol
    if (normalized === LEGACY_HIDDEN_TOOL_TIMELINE_CONTENT) return DEFAULT_HIDDEN_TOOL_TIMELINE_CONTENT
    return normalized.replace(legacyToolOutput, '').replace(final, '\n' + HIDDEN_TOOL_TIMELINE_REPLY_PHASE)
  })
  return { ...entry, content, title: entry.title === legacyTitle ? HIDDEN_TOOL_TIMELINE_ENTRY_TITLE : entry.title }
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
