import { describe, expect, it } from 'vitest'
import { resolveConversationSeed } from '../src/main/modules/conversations/conversationSeed'

const metadata = (characterPersona: Record<string, unknown> = {}) => ({
  characterId: 'card-a',
  characterName: '角色',
  characterAvatar: '',
  characterPersona,
  modelSettings: {}
})

describe('conversation opening seed', () => {
  it('uses the saved primary setting-library opening for story conversations', () => {
    const settingLibraries = {
      get: () => ({
        entries: [{
          id: 'fixed-opening-assistant',
          kind: 'opening',
          enabled: true,
          defaultOpeningMessageId: 'primary',
          openingMessages: [
            { id: 'backup', title: '备用', content: '备用开场', initialVariableStateJson: '' },
            { id: 'primary', title: '主开场', content: '主开场', initialVariableStateJson: '{"好感":10}' }
          ]
        }]
      })
    }
    const variables = { initialState: () => '{"好感":0}' }

    expect(resolveConversationSeed(
      'card-a', 'story', metadata(), {} as never, settingLibraries as never, variables as never
    )).toEqual({
      initialVariableStateJson: '{"好感":10}',
      openingText: '主开场',
      openingOptions: [
        { id: 'backup', title: '备用', content: '备用开场', initialVariableStateJson: '{"好感":0}' },
        { id: 'primary', title: '主开场', content: '主开场', initialVariableStateJson: '{"好感":10}' },
      ],
      selectedOpeningId: 'primary',
    })
  })

  it('does not fall back to the obsolete persona opening for a story conversation', () => {
    const settingLibraries = { get: () => ({ entries: [] }) }
    const variables = { initialState: () => '{}' }

    expect(resolveConversationSeed(
      'card-a',
      'story',
      metadata({ opening: '旧开场', show_opening: true }),
      {} as never,
      settingLibraries as never,
      variables as never
    )).toEqual({ initialVariableStateJson: '{}', openingText: '', openingOptions: [], selectedOpeningId: '' })
  })

  it('keeps the persona opening behavior for non-story conversations', () => {
    const settingLibraries = { get: () => ({ entries: [] }) }
    const variables = { initialState: () => '{}' }

    expect(resolveConversationSeed(
      'card-a',
      'agent',
      metadata({ opening: ' Agent 开场 ', show_opening: true }),
      {} as never,
      settingLibraries as never,
      variables as never
    )).toEqual({ initialVariableStateJson: '{}', openingText: 'Agent 开场', openingOptions: [], selectedOpeningId: '' })
  })
})
