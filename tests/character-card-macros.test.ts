import { describe, expect, it } from 'vitest'
import { MessageDisplayProjector } from '../src/main/modules/conversations/MessageDisplayProjector'
import {
  resolveSettingLibraryCharacterCardMacros,
  resolveVariableContextCharacterCardMacros
} from '../src/main/modules/agent/CharacterCardMacroResolver'
import type {
  AgentSettingLibraryRuntimeContext,
  AgentVariableRuntimeContext
} from '../src/shared/contracts/agent/runtime'
import {
  characterCardMacroValues,
  resolveCharacterCardMacros
} from '../src/shared/foundation/characterCardMacros'

const values = { userName: '用户$1', characterName: '测试角色' }

describe('角色卡宏', () => {
  it('解析 user 和 char，同时保留未知宏', () => {
    expect(resolveCharacterCardMacros('{{user}}遇见{{char}}，{{unknown}}保持原样。', values))
      .toBe('用户$1遇见测试角色，{{unknown}}保持原样。')
  })

  it('忽略宏名大小写和括号内空格', () => {
    expect(resolveCharacterCardMacros('{{ USER }} / {{Char}}', values))
      .toBe('用户$1 / 测试角色')
  })

  it('只清理相邻中日韩文本之间的横向空格', () => {
    const cjkValues = { userName: '用户', characterName: '测试角色' }
    expect(resolveCharacterCardMacros('{{user}} 坐起身，看见 {{char}}　走来。', cjkValues))
      .toBe('用户坐起身，看见测试角色走来。')
    expect(resolveCharacterCardMacros('Hello {{user}} world\n{{char}}\n登场', cjkValues))
      .toBe('Hello 用户 world\n测试角色\n登场')
  })

  it('按调用方明确提供的用户权威源解析名字', () => {
    expect(characterCardMacroValues({
      characterId: 'character-a',
      characterName: '角色名',
      characterPersona: { user_name: '用户甲', assistant_name: '人格角色名' },
    }, '当前用户')).toEqual({ userName: '当前用户', characterName: '角色名' })
    expect(characterCardMacroValues({
      characterId: 'character-a',
      characterName: ' ',
      characterPersona: { user_name: '', assistant_name: '人格角色名' },
    }, '')).toEqual({ userName: '用户', characterName: '人格角色名' })
  })

  it('解析变量配置中的描述和更新规则', () => {
    const context = {
      initialStateJson: '{}',
      schemaCode: '',
      stateJson: '{}',
      objects: [{ description: '{{char}}状态', updateRule: '{{user}}观察' }],
      variables: [{ description: '{{user}}好感度', updateRule: '{{char}}改变' }]
    } as AgentVariableRuntimeContext
    const resolved = resolveVariableContextCharacterCardMacros(context, values)
    expect(resolved?.objects[0]).toMatchObject({ description: '测试角色状态', updateRule: '用户$1观察' })
    expect(resolved?.variables[0]).toMatchObject({ description: '用户$1好感度', updateRule: '测试角色改变' })
  })

  it('解析设定库正文、读取提示和开场白', () => {
    const context = {
      characterId: 'character-a',
      name: '设定库',
      groups: [],
      promptPositions: [],
      entries: [{
        content: '{{char}}的设定',
        agentSelectionHint: '涉及{{user}}时读取',
        openingMessages: [{ content: '{{char}}遇见{{user}}' }]
      }]
    } as unknown as AgentSettingLibraryRuntimeContext
    const resolved = resolveSettingLibraryCharacterCardMacros(context, values)
    expect(resolved?.entries[0]).toMatchObject({
      content: '测试角色的设定',
      agentSelectionHint: '涉及用户$1时读取',
      openingMessages: [{ content: '测试角色遇见用户$1' }]
    })
  })

  it('展示消息时解析宏，并在名字变化后废弃旧缓存', () => {
    const projector = new MessageDisplayProjector({
      prepareAssistantText: (text) => text,
      resolveVariableMacros: (text) => text
    })
    const collection = {
      characterId: 'character-a',
      agentPresetId: '',
      agentPresetName: '',
      globalRules: [],
      agentPresetRules: [],
      characterRules: [],
      versions: [],
      activeVersionId: '',
      revision: 0
    }
    const message = {
      id: 'message-a',
      conversationId: 'conversation-a',
      role: 'assistant' as const,
      content: '{{char}}正在看{{user}}。',
      variableStateJson: '{}',
      status: 'complete' as const,
      createdAt: ''
    }

    expect(projector.project(message, collection, values).displayContent)
      .toBe('测试角色正在看用户$1。')
    expect(projector.project(message, collection, {
      userName: '新用户',
      characterName: '新角色'
    }).displayContent).toBe('新角色正在看新用户。')
    expect(message.content).toBe('{{char}}正在看{{user}}。')
  })
})
