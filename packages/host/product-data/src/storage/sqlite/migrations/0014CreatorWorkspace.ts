import { DEFAULT_CREATOR_INSTRUCTIONS } from '@shared/contracts/presets/builtIns'
import type Database from 'better-sqlite3'
import { DEFAULT_AGENT_PRESET_IDS } from '@shared/contracts/presets/schemas'
import { CREATOR_AGENT_TOOL_GROUP_IDS } from '@product-data/domain/agentTools'

// RETIRE WHEN: v13 and earlier database upgrades are no longer supported, remove this step with its registration and regressions.
/** Upgrade the seeded Creator's original tool selection; custom presets stay independent. */
export const migration0014 = {
  fromVersion: 13, toVersion: 14, name: 'creator-workspace', acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    for (const table of ['agent_preset_contents', 'agent_preset_version_contents']) {
      const rows = database.prepare(`SELECT rowid, content FROM ${table} WHERE presetId = ? AND kind = 'tool_configuration'`).all(DEFAULT_AGENT_PRESET_IDS.creator) as { rowid: number; content: string }[]
      for (const row of rows) {
        const value = JSON.parse(row.content)
        if (value.includedGroupIds?.length !== 1 || value.includedGroupIds[0] !== 'builtin:creator'
          || value.enabledGroupIds?.length !== 1 || value.enabledGroupIds[0] !== 'builtin:creator') continue
        value.includedGroupIds = [...CREATOR_AGENT_TOOL_GROUP_IDS]
        value.enabledGroupIds = [...CREATOR_AGENT_TOOL_GROUP_IDS]
        database.prepare(`UPDATE ${table} SET content = ? WHERE rowid = ?`).run(JSON.stringify(value), row.rowid)
      }
    }
    for (const table of ['agent_preset_entries', 'agent_preset_version_entries']) {
      const rows = database.prepare(`SELECT rowid, payloadJson FROM ${table} WHERE presetId = ?`).all(DEFAULT_AGENT_PRESET_IDS.creator) as { rowid: number; payloadJson: string }[]
      for (const row of rows) {
        const value = JSON.parse(row.payloadJson)
        if (value.content !== LEGACY_INSTRUCTIONS) continue
        value.content = DEFAULT_CREATOR_INSTRUCTIONS
        database.prepare(`UPDATE ${table} SET payloadJson = ? WHERE rowid = ?`).run(JSON.stringify(value), row.rowid)
      }
    }
  },
} as const

const LEGACY_INSTRUCTIONS = '你是 ElecKoi 的 AI 创作工作室。通过创作能力工具直接维护用户选择的角色资料、设定库、变量与正则。先使用 eleckoi_list_toolsets 查看能力，再使用 eleckoi_describe_toolset 获取准确参数，最后通过 eleckoi_call_capability 执行操作。读取现有内容后再修改，保留仍有效的数据。没有选择角色时先请用户选择角色。创作目标是编辑对象，不是你要扮演的角色。回复采用普通对话，不输出角色扮演正文边界。'
