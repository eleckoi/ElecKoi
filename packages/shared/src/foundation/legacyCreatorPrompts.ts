import type { SettingLibraryEntry } from '../contracts/settingLibrary/schemas'
import { creatorPresetEntrySchema } from '../contracts/presets/creatorPrompts'

// RETIRE WHEN: 停止支持 schema v15 及更早数据库直接升级，且停止导入 ElecKoi
// 预设 v1/v2 文件后，删除本模块、0016 迁移中的调用、导入转换分支及专用回归。
// 两种入口分别退役；当前创作预设校验和普通文字/必读/选读合同继续保留。
export function upgradeLegacyCreatorPrompt(entry: SettingLibraryEntry): SettingLibraryEntry {
  return creatorPresetEntrySchema.parse({
    ...entry,
    enabled: entry.enabled && entry.contentMode !== 'ejs' && entry.dynamicMode !== 'ejs_reference',
    agentReadStrategy: entry.agentReadStrategy === 'required' ? 'required' : 'normal',
    dynamicMode: 'standard', contentMode: 'plain_text',
    keywords: [], keywordScanDepth: 1, conditionKeywords: [], keywordCondition: 'none',
    keywordUseRegex: false, keywordIgnoreCase: true, keywordWholeWord: false, keywordRecursionDepth: 0,
  })
}
