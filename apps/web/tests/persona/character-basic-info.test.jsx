// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const avatarCropModalMock = vi.hoisted(() => vi.fn(() => null))
const uploadAssetsMock = vi.hoisted(() => vi.fn())

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
vi.mock('../../src/modules/characterAssets/useCharacterAssets.js', () => ({
  useCharacterAssets: () => ({ upload: uploadAssetsMock }),
}))

import { CharacterBasicInfoPanel } from '../../src/modules/persona/components/CharacterBasicInfoPanel.jsx'
import { CharacterCard } from '../../src/modules/persona/components/CharacterCard.jsx'
import { CastRosterView } from '../../src/modules/persona/components/CastRosterView.jsx'

vi.stubGlobal('React', React)
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

afterEach(() => {
  document.body.innerHTML = ''
  avatarCropModalMock.mockClear()
  uploadAssetsMock.mockReset()
})

it('crops the selected cast portrait before uploading and keeps the old picture when cancelled', async () => {
  const original = { id: 'actor', name: '合成角色乙', portraitAssetId: 'old-portrait', circleAssetId: 'old-circle', squareAssetId: null, crop: null }
  function Editor() {
    const [roles, setRoles] = React.useState([original])
    return <CastRosterView characterId="card" roles={roles} setRoles={setRoles} />
  }
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const crop = () => avatarCropModalMock.mock.lastCall[0]
  const portrait = () => container.querySelector('.character-cast-inspector-portrait-art img').getAttribute('src')
  try {
    await act(async () => root.render(<Editor />))
    const source = new File(['source'], 'portrait.png', { type: 'image/png' })
    const input = container.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { configurable: true, value: [source] })
    const select = async () => {
      await act(async () => container.querySelector('[aria-label="更换竖版头像"]').click())
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    }
    await select()
    expect(crop()).toMatchObject({ file: source, title: '裁剪竖版头像', cropWidth: 210, cropHeight: 280, outputShape: 'portrait' })
    expect(uploadAssetsMock).not.toHaveBeenCalled()
    await act(async () => crop().onCancel())
    expect(crop().file).toBeNull()
    expect(portrait()).toContain('old-portrait')
    expect(uploadAssetsMock).not.toHaveBeenCalled()
    await select()
    uploadAssetsMock.mockResolvedValue(['new-portrait'])
    const cropped = new File(['cropped'], 'portrait-cropped.png', { type: 'image/png' })
    await act(async () => crop().onSave(cropped))
    expect(uploadAssetsMock).toHaveBeenCalledExactlyOnceWith([cropped])
    expect(portrait()).toContain('new-portrait')
    expect(container.querySelector('.character-cast-circle-thumb-btn img').getAttribute('src')).toContain('new-portrait')
    expect(crop().file).toBeNull()
  } finally { await act(async () => root.unmount()) }
})

describe('character basic information editor', () => {
  it('edits only the original author fields and shows them on the card preview', async () => {
    const onChange = vi.fn()
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<CharacterBasicInfoPanel character={{ id:'card', name:'角色', authorName:'原作者', authorAvatar:'', persona:{ user_name:'本地玩家', user_avatar:'local-player.png' } }}
        dirty={false} saving={false} onChange={onChange} onSave={() => {}} onCancel={() => {}} />))
      expect(container.querySelector('.character-basic-author-group h2').textContent).toBe('作者信息')
      expect(container.querySelector('.character-basic-group')).toBeNull()
      const input = container.querySelector('input[aria-label="作者名字"]')
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
  it('uses the portrait crop for the independent card cover', async () => {
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
        .find(props => props.title === '裁剪封面立绘')
      expect(avatarCrop).toMatchObject({
        cropWidth: 210,
        cropHeight: 280,
        cropRadius: '12px',
        outputShape: 'portrait',
        outputWidth: 900,
      })

      await act(async () => {
        await avatarCrop.onSave(new File(['card-cover'], 'cover.png', { type:'image/png' }))
      })

      expect(onChange).toHaveBeenLastCalledWith({ persona: { assistant_cover: expect.stringMatching(/^data:image\/png;base64,/) } })
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
