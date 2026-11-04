import { describe, expect, it } from 'vitest'
import { resolveConversationSeed } from '../src/domain/conversations/conversationSeed'

describe('conversation opening seed', () => {
  it('uses the saved primary character opening', () => {
    const openings = {
      get: () => ({

          enabled: true,
          defaultOpeningMessageId: 'primary',
          openingMessages: [
            { id: 'backup', title: '备用', content: '备用开场', initialVariableStateJson: '' },
            { id: 'primary', title: '主开场', content: '主开场', initialVariableStateJson: '{"好感":10}' }
          ]
      })
    }
    const variables = { get: () => ({ activeVersionId: 'version-a', initialStateJson: '{"好感":0}', versions: [{ id: 'version-a', initialStateJson: '{"好感":0}' }] }) }

    expect(resolveConversationSeed(
      'card-a', {} as never, openings as never, variables as never
    )).toEqual({
      variableVersionId: 'version-a',
      initialVariableStateJson: '{"好感":10}',
      openingText: '主开场',
      openingOptions: [
        { id: 'backup', title: '备用', content: '备用开场', variableVersionId: 'version-a', initialVariableStateJson: '{"好感":0}' },
        { id: 'primary', title: '主开场', content: '主开场', variableVersionId: 'version-a', initialVariableStateJson: '{"好感":10}' },
      ],
      selectedOpeningId: 'primary',
    })
  })

  it('does not fall back to the obsolete persona opening field', () => {
    const openings = { get: () => ({ enabled: true, defaultOpeningMessageId: 'primary',
      openingMessages: [{ id: 'primary', title: '', content: '', initialVariableStateJson: '' }] }) }
    const variables = { get: () => ({ activeVersionId: 'version-a', initialStateJson: '{}', versions: [{ id: 'version-a', initialStateJson: '{}' }] }) }

    expect(resolveConversationSeed(
      'card-a',
      {} as never,
      openings as never,
      variables as never
    )).toEqual({ variableVersionId: 'version-a', initialVariableStateJson: '{}', openingText: '', openingOptions: [], selectedOpeningId: '' })
  })

  it.each([true, false])('leaves empty and whitespace-only openings absent regardless of the saved enabled field (%s)', enabled => {
    const openings = { get: () => ({ enabled, defaultOpeningMessageId: 'primary', openingMessages: [
      { id: 'primary', title: '合成空开场', content: ' \n\t ', variableVersionId: 'missing-unused-version', initialVariableStateJson: '' },
      { id: 'backup', title: '合成空备用', content: '', initialVariableStateJson: '' },
    ] }) };
    const variables = { get: () => ({ activeVersionId: 'version-a', initialStateJson: '{}', versions: [{ id: 'version-a', initialStateJson: '{}' }] }) };
    expect(resolveConversationSeed('card-a', {} as never, openings as never, variables as never))
      .toEqual({ variableVersionId: 'version-a', initialVariableStateJson: '{}', openingText: '', openingOptions: [], selectedOpeningId: '' });
  })

  it('uses nonempty openings without an enable gate and excludes blank backup choices', () => {
    const openings = { get: () => ({ enabled: false, defaultOpeningMessageId: 'primary', openingMessages: [
      { id: 'primary', title: '合成主开场', content: '  合成正文  ', initialVariableStateJson: '{"score":1}' },
      { id: 'backup', title: '合成空备用', content: '\n ', initialVariableStateJson: '' },
    ] }) };
    const variables = { get: () => ({ activeVersionId: 'version-a', initialStateJson: '{}', versions: [{ id: 'version-a', initialStateJson: '{}' }] }) };
    expect(resolveConversationSeed('card-a', {} as never, openings as never, variables as never))
      .toMatchObject({ openingText: '合成正文', selectedOpeningId: 'primary', initialVariableStateJson: '{"score":1}', openingOptions: [{ id: 'primary' }] });
  })
})
