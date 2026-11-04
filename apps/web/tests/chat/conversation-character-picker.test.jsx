// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationList } from '../../src/modules/chat/components/ConversationList.jsx'

vi.stubGlobal('React', React)
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

afterEach(() => {
  document.body.innerHTML = ''
})

describe('conversation character picker', () => {
  it('renders outside the clipped conversation sidebar', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(
        <ConversationList
          keyword=""
          setKeyword={vi.fn()}
          sessions={[]}
          sessionId=""
          pinnedIds={[]}
          characters={{
            groups: [],
            items: [{ id: 'character-1', name: '测试角色', group: '' }],
          }}
          artworkMode="avatar"
          onLoadChat={vi.fn()}
          onOpenCharacterChat={vi.fn()}
          onGoCharacterSettings={vi.fn()}
          onTogglePinChat={vi.fn()}
          onOpenChatWindow={vi.fn()}
          onHideChat={vi.fn()}
        />,
      ))

      const sidebar = container.querySelector('.conversation-list')
      const searchRow = container.querySelector('.sidebar-section-header')
      vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue({
        left: 76, top: 40, right: 566, bottom: 760, width: 490, height: 720, x: 76, y: 40, toJSON: () => {},
      })
      vi.spyOn(searchRow, 'getBoundingClientRect').mockReturnValue({
        left: 88, top: 52, right: 554, bottom: 82, width: 466, height: 30, x: 88, y: 52, toJSON: () => {},
      })

      await act(async () => container.querySelector('[aria-label="新建对话"]').click())

      const picker = document.querySelector('.conversation-character-picker')
      expect(picker).not.toBeNull()
      expect(sidebar.contains(picker)).toBe(false)
      expect(picker.parentElement).toBe(document.body)
      expect(picker.style.left).toBe('86px')
      expect(picker.style.top).toBe('80px')
      expect(picker.style.width).toBe('470px')
      expect(picker.textContent).toContain('测试角色')
    } finally {
      await act(async () => root.unmount())
    }
  })
})
