// @vitest-environment jsdom
import { renderNativeConversationContent } from '../helpers/NativeConversationPresentation.jsx';
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageBubble, WithOfficialMarkdown } from '../helpers/officialMarkdown.jsx'
import { ChatPanel } from '../../src/modules/chat/components/ChatPanel.jsx'
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx'
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from '@shared/contracts/settings/schemas'

const opening = {
  id: 'opening', role: 'assistant', content: '合成开场一', selectedOpeningId: 'entry-a', canChangeOpening: true,
  openingOptions: [{ id: 'entry-a', content: '合成开场一' }, { id: 'entry-b', content: '合成开场二' }],
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('React', React)
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0))
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

describe('opening interaction permissions', () => {
  it.each([
    ['roleplay', 'portrait', 'portrait-art', '/card-portrait.png'],
    ['agent', 'circle', 'circle-art', '/card-circle.png'],
    ['social', 'rounded_square', 'square-art', '/card-square.png'],
  ])('uses the real chat layout and artwork for every opening speaker (%s, %s)', async (layout, shape, castArt, cardArt) => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const character = { id: 'test-card', cast: [{ id: 'cast-member', portraitAssetId: 'portrait-art',
      circleAssetId: 'circle-art', squareAssetId: 'square-art' }] }
    const segments = [
      { id: 'speech', kind: 'speech', speakerId: 'cast-member', speakerName: '登场角色', speakerAvatar: '/old-circle.png', text: '角色台词\n\n录音机开始转动。' },
      { id: 'cover', kind: 'cover', speakerName: '卡片名称', speakerAvatar: '/old-cover.png', text: '卡片正文' },
    ]
    const scene = { ...opening, content: segments.map(part => part.text).join('\n\n'),
      openingOptions: [{ ...opening.openingOptions[0], segments }, opening.openingOptions[1]] }
    try {
      await act(async () => root.render(<WithOfficialMarkdown><MainPageContext.Provider value={{ chat: { chatBackgroundCharacter: character } }}>
        <ChatPanel renderConversationContent={renderNativeConversationContent} hasActiveChat
          conversationId="test-chat" characterId={character.id} persona={{ assistant_cover: '/card-portrait.png',
            assistant_avatar: '/card-circle.png', assistant_square: '/card-square.png' }}
          messages={[scene]} input="" isSending={false} modelConfigs={[]} scrollRef={{ current: null }}
          chatDisplay={{ layout, profiles: { [layout]: { ...DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles[layout], avatar_shape: shape } } }}
          onSelectOpening={() => {}} renderRoleplaySlot={(slot, props) => slot === 'eleckoi.roleplay.chat' ? props.before : null} />
      </MainPageContext.Provider></WithOfficialMarkdown>))
      const rows = [...host.querySelectorAll(`.message-${layout}[data-opening-segment]`)]
      expect(rows.map(row => row.dataset.openingSegment)).toEqual(['speech', 'cover'])
      expect(rows.every(row => row.classList.contains(`avatar-shape-${shape}`))).toBe(true)
      expect(rows[0].querySelector(':scope > .avatar img').getAttribute('src')).toBe(`/eleckoi/character-assets/test-card/${castArt}`)
      expect(rows[0].querySelector('.message-author').textContent).toBe('登场角色')
      expect(rows[0].querySelector('.bubble').textContent).toContain('角色台词')
      expect(rows[0].querySelector('.bubble').textContent).toContain('录音机开始转动。')
      expect(rows[1].querySelector(':scope > .avatar img').getAttribute('src')).toBe(cardArt)
      expect([...host.querySelectorAll('.message-floor')].map(floor => floor.textContent))
        .toEqual(layout === 'roleplay' ? ['#0', '#1'] : [])
      expect(host.querySelectorAll('.opening-pager')).toHaveLength(1)
      expect(rows[1].contains(host.querySelector('.opening-pager'))).toBe(true)
    } finally { await act(async () => root.unmount()) }
  })

  it.each(['roleplay', 'agent'])('keeps the pager available on a selected blank opening (%s)', async layoutMode => {
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host), select = vi.fn()
    const blank = { ...opening, content: '', openingOptions: [{ id: 'entry-a', content: '' }, opening.openingOptions[1]] }
    try {
      await act(async () => root.render(<MessageBubble message={blank} layoutMode={layoutMode} floorNumber={0} onSelectOpening={select} />))
      expect(host.querySelector('.markdown-message')).toBeNull()
      expect(host.querySelector('.opening-pager-index').textContent).toBe('1/2')
      await act(async () => { host.querySelector('.opening-pager-next').click(); await new Promise(resolve => setTimeout(resolve, 30)) })
      expect(select).toHaveBeenCalledWith(blank, 'entry-b')
    } finally { await act(async () => root.unmount()) }
  })

  it('keeps selection functional before the first user input', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const select = vi.fn()
    try {
      await act(async () => root.render(<MessageBubble message={opening} onSelectOpening={select} />))
      await act(async () => {
        host.querySelector('.opening-pager-next').click()
        await new Promise(resolve => setTimeout(resolve, 30))
      })
      expect(select).toHaveBeenCalledWith(opening, 'entry-b')
    } finally { await act(async () => root.unmount()) }
  })

  it.each(['roleplay', 'agent'])('hides the pager and blocks editing after chat admission (%s)', async layoutMode => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const select = vi.fn()
    const edit = vi.fn()
    const render = message => root.render(<MessageBubble message={message} layoutMode={layoutMode}
      onSelectOpening={select} onEdit={edit} />)
    try {
      await act(async () => render(opening))
      expect(host.querySelector('.opening-pager-next').disabled).toBe(false)
      await act(async () => host.querySelector('.opening-pager-index').click())
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      await act(async () => render({ ...opening, canChangeOpening: false }))
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(host.querySelector('.opening-pager')).toBeNull()
      expect(host.querySelector('.has-opening-pager')).toBeNull()
      const controls = host.querySelectorAll('button[aria-label="编辑"]')
      expect(controls.length).toBe(1)
      expect([...controls].every(button => button.disabled)).toBe(true)
      await act(async () => { for (const button of controls) button.click() })
      expect(select).not.toHaveBeenCalled()
      expect(edit).not.toHaveBeenCalled()
      expect(host.querySelector('textarea')).toBeNull()
      expect(host.textContent).toContain('合成开场一')
    } finally { await act(async () => root.unmount()) }
  })

  it('blocks direction-key fallback when the existing pager button is disabled', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const select = vi.fn()
    const scrollRef = { current: host }
    const presetCatalog = { refresh: async () => ({ presets: [] }) }
    const render = message => root.render(<WithOfficialMarkdown><ChatPanel renderConversationContent={renderNativeConversationContent}
      hasActiveChat currentTitle="合成角色" conversationId="synthetic-chat" persona={{}}
      messages={[message]} input="" isSending={false} modelConfigs={[]} scrollRef={scrollRef}
      presetCatalog={presetCatalog} onSelectOpening={select}
      renderRoleplaySlot={(slot, props) => slot === 'eleckoi.roleplay.chat' ? props.before : null}
    /></WithOfficialMarkdown>)
    try {
      await act(async () => render(opening))
      host.querySelector('.opening-pager-next').disabled = true
      await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
      expect(select).not.toHaveBeenCalled()
      await act(async () => render({ ...opening, canChangeOpening: false }))
      expect(host.querySelector('.opening-pager')).toBeNull()
      await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
      expect(select).not.toHaveBeenCalled()
    } finally { await act(async () => root.unmount()) }
  })
})
