import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/modules/persona/index.js', () => ({
  CharacterListPanel: () => <div>角色列表</div>,
  CharacterProfilePanel: () => <div>角色简介</div>,
  openCharacterEditorWindow: vi.fn(),
}))
vi.mock('../../src/modules/chat/index.js', () => ({
  ConversationList: () => <div>对话列表</div>,
  ChatPanel: () => <div>角色聊天</div>,
}))

import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx'
import { CharacterPage } from '../../../../packages/client/features/dsh-client-characters/src/page.jsx'
import { MessagesPage } from '../../../../packages/client/features/dsh-client-conversations/src/page.jsx'

vi.stubGlobal('React', React)

function renderWithView(Page, view) {
  return renderToStaticMarkup(<MainPageContext.Provider value={view}><Page /></MainPageContext.Provider>)
}

describe('ElecKoi product page plugin contracts', () => {
  it('routes the real character list and profile surfaces through DSH client chains', async () => {
    const renderSection = vi.fn((section) => <div data-extension={section}>{section}</div>)
    const chat = {
      characters: { active_character_id: 'character-1', groups: [], items: [] },
      selectedCharacterId: 'character-1',
      selectCharacter: vi.fn(), openCharacterChat: vi.fn(), saveCharacterGroups: vi.fn(),
      importPreparedCharacters: vi.fn(), createCharacter: vi.fn().mockResolvedValue('character-3'), deleteCharacterIds: vi.fn(),
    }
    const exportCharacters = vi.fn().mockResolvedValue({ canceled: true, written: [], failures: [] });
    const html = renderWithView(CharacterPage, {
      chat,
      characters: { exportCharacters },
      appearance: { sidebarCharacterArtwork: 'cover' },
      renderCharacterPageSection: renderSection,
      renderLayout: ({ sidePanel, mainPanel }) => <>{sidePanel}{mainPanel}</>,
    })
    expect(html).toContain('data-extension="list"')
    expect(html).toContain('data-extension="profile"')
    await expect(renderSection.mock.calls[0][1].onCreateCharacter('合成分组')).resolves.toBe('character-3')
    expect(chat.createCharacter).toHaveBeenCalledWith('合成分组')
    expect(renderSection.mock.calls[1][1].onStartConversation).toBe(chat.openCharacterChat)
    await renderSection.mock.calls[0][1].onExportCharacters(['character-2'], 'zip')
    expect(exportCharacters).toHaveBeenCalledWith(['character-2'], 'zip')
  })

  it('routes the real conversation list through a DSH client chain with its actions', () => {
    const renderList = vi.fn((owner) => <div data-extension="conversations">{owner.sessionId}</div>)
    const chat = {
      keyword: '', setKeyword: vi.fn(), filteredSessions: [], sessionId: 'conversation-1', pinnedIds: [],
      characters: { active_character_id: '', groups: [], items: [] },
      openCharacterChat: vi.fn(), togglePinChat: vi.fn(), openChatWindow: vi.fn(), hideChatEntry: vi.fn(),
    }
    const html = renderWithView(MessagesPage, {
      chat,
      appearance: { sidebarCharacterArtwork: 'cover' },
      conversations: {},
      renderConversationList: renderList,
      renderLayout: ({ sidePanel }) => sidePanel,
      selectConversation: vi.fn(), openChatBackground: vi.fn(), openPresetTools: vi.fn(), openCharacterSection: vi.fn(),
    })
    expect(html).toContain('data-extension="conversations"')
    expect(html).toContain('conversation-1')
    expect(renderList.mock.calls[0][0].onTogglePinChat).toBe(chat.togglePinChat)
  })
})
