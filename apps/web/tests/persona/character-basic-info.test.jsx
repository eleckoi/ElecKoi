// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const avatarCropModalMock = vi.hoisted(() => vi.fn(() => null))

vi.mock('@douyinfe/semi-ui-19/lib/es/avatar', () => ({
  default: ({ children, ...props }) => <span {...props}>{children}</span>,
}))
vi.mock('@douyinfe/semi-ui-19/lib/es/input', () => ({
  default: ({ value, onChange, ...props }) => <input {...props} value={value} onChange={event => onChange(event.target.value)} />,
}))
vi.mock('@douyinfe/semi-ui-19/lib/es/input/textarea', () => ({
  default: ({ value, onChange, maxCount: _maxCount, showCounter: _showCounter, ...props }) => (
    <textarea {...props} value={value} onChange={event => onChange(event.target.value)} />
  ),
}))
vi.mock('../../src/ui/ui/AvatarCropModal.jsx', () => ({ AvatarCropModal: avatarCropModalMock }))

import { CharacterBasicInfoPanel } from '../../src/modules/persona/components/CharacterBasicInfoPanel.jsx'
import { CharacterCard } from '../../src/modules/persona/components/CharacterCard.jsx'

vi.stubGlobal('React', React)
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

afterEach(() => {
  document.body.innerHTML = ''
  avatarCropModalMock.mockClear()
})

describe('character basic information editor', () => {
  it('edits only the original author fields and shows them on the card preview', async () => {
    const onChange = vi.fn()
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<CharacterBasicInfoPanel character={{ id:'card', name:'角色', authorName:'原作者', authorAvatar:'', persona:{ user_name:'本地玩家', user_avatar:'local-player.png' } }}
        dirty={false} saving={false} onChange={onChange} onSave={() => {}} onCancel={() => {}} />))
      expect([...container.querySelectorAll('.character-basic-group > h3')].map(n => n.textContent)).toEqual(['角色信息', '作者信息', '展示内容'])
      const input = container.querySelector('[aria-labelledby="character-author-name-label"]')
      expect(input.value).toBe('原作者')
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '新作者')
        input.dispatchEvent(new Event('input', { bubbles:true }))
      })
      expect(onChange).toHaveBeenLastCalledWith({ authorName:'新作者' })
      const crop = avatarCropModalMock.mock.calls.map(([props]) => props).find(props => props.title === '调整作者头像')
      await act(async () => crop.onSave(new File(['author-avatar'], 'author.png', { type:'image/png' })))
      expect(onChange).toHaveBeenLastCalledWith({ authorAvatar:expect.stringMatching(/^data:image\/png;base64,/) })
      await act(async () => [...container.querySelectorAll('button')].find(n => n.textContent === '预览角色卡').click())
      expect(document.querySelector('[role="dialog"] .character-card-owner > span:last-child').textContent).toBe('原作者')
      expect(document.querySelector('[role="dialog"] .character-card-owner img')?.getAttribute('src')).not.toBe('local-player.png')
    } finally { await act(async () => root.unmount()) }
  })

  it('does not impersonate the local player when a character has no author', async () => {
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<CharacterCard character={{ id:'card', name:'角色', persona:{ user_name:'本地玩家' } }} onClick={() => {}} />))
      expect(container.querySelector('.character-card-owner > span:last-child').textContent).toBe('未填写作者')
    } finally { await act(async () => root.unmount()) }
  })
  it('uses the shared square crop with a circular safe area for the character avatar', async () => {
    const onChange = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(<CharacterBasicInfoPanel
          character={{
            id: 'character-1',
            name: '测试角色',
            profileLike: '',
            persona: { assistant_name: '测试角色', assistant_avatar: '', assistant_square: '', assistant_cover: '' },
          }}
          dirty={false}
          saving={false}
          error=""
          saveNotice=""
          onChange={onChange}
          onCancel={() => {}}
          onSave={() => {}}
        />)
      })

      const avatarCrop = avatarCropModalMock.mock.calls
        .map(([props]) => props)
        .find(props => props.title === '调整圆形与方形头像')
      expect(avatarCrop).toMatchObject({
        cropWidth: 250,
        cropHeight: 250,
        cropRadius: '8px',
        showCircleGuide: true,
        outputShape: 'square',
        outputWidth: 420,
      })

      await act(async () => {
        await avatarCrop.onSave(new File(['shared-avatar'], 'shared-avatar.png', { type: 'image/png' }))
      })

      const update = onChange.mock.calls.at(-1)?.[0]
      expect(update?.persona?.assistant_avatar).toMatch(/^data:image\/png;base64,/)
      expect(update?.persona?.assistant_square).toBe(update?.persona?.assistant_avatar)
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('submits the current card instead of forwarding the button click event', async () => {
    const onSave = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(<CharacterBasicInfoPanel
          character={{
            id: 'character-1',
            name: '测试角色',
            profileLike: '',
            persona: { assistant_name: '测试角色', assistant_avatar: '', assistant_cover: '' },
          }}
          dirty
          saving={false}
          error=""
          saveNotice=""
          onChange={() => {}}
          onCancel={() => {}}
          onSave={onSave}
        />)
      })

      const saveButton = [...container.querySelectorAll('button')]
        .find(button => button.textContent === '保存更改')
      expect(saveButton).toBeTruthy()
      await act(async () => saveButton.click())
      expect(onSave).toHaveBeenCalledOnce()
      expect(onSave).toHaveBeenCalledWith()
    } finally {
      await act(async () => root.unmount())
    }
  })
})
