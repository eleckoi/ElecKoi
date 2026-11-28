// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyPluginListWheel, PluginListPanel } from '../../src/app/windows/shell/components/PluginCenter.jsx'
import { CatalogSlotsContext } from '../../src/ui/ui/CatalogSlotsContext.jsx'

vi.stubGlobal('React', React)
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

afterEach(() => {
  document.body.innerHTML = ''
})

describe('plugin center groups', () => {
  it('lets the public plugin-list slot wrap the fallback and open the original detail and install flows', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let owner
    const render = vi.fn((name, state, fallback) => {
      if (name !== 'eleckoi.plugin.page.list') return fallback
      owner = state
      return <div data-plugin-wrapper="">{fallback}</div>
    })
    const select = vi.fn(event => { event.detail.opened = true })
    const add = vi.fn(event => { event.detail.opened = true })
    window.addEventListener('eleckoi:dsh-plugins:select', select)
    window.addEventListener('eleckoi:dsh-plugins:add', add)
    try {
      await act(async () => root.render(<CatalogSlotsContext.Provider value={{ render }}>
        <PluginListPanel onNotify={vi.fn()} />
      </CatalogSlotsContext.Provider>))
      const entries = [{ id: 'sample', name: '示例插件', kind: 'package', group: 'installed', icon: '' },
        { id: 'sample', name: '同名配置', kind: 'item', group: 'official', icon: '' }]
      await act(async () => window.dispatchEvent(new CustomEvent('eleckoi:dsh-plugins:state', {
        detail: { status: 'ready', selected: '', entries }
      })))
      expect(container.querySelector('[data-plugin-wrapper] .plugin-list-panel')).not.toBeNull()
      expect(owner.entries).toEqual(entries)
      await act(async () => owner.onQueryChange('配置'))
      expect(owner.entries).toEqual([entries[1]])
      await act(async () => owner.onSelect('item', 'sample'))
      expect(owner.selectedKey).toBe('item:sample')
      expect(select.mock.calls[0][0].detail).toMatchObject({ kind: 'item', id: 'sample' })
      await act(async () => owner.onSelect('item', 'missing'))
      expect(select).toHaveBeenCalledOnce()
      await act(async () => owner.onAdd())
      expect(add).toHaveBeenCalledOnce()
      expect(owner.selectedKey).toBe('')
    } finally {
      window.removeEventListener('eleckoi:dsh-plugins:select', select)
      window.removeEventListener('eleckoi:dsh-plugins:add', add)
      await act(async () => root.unmount())
    }
  })

  it('moves the plugin list with a vertical mouse wheel', () => {
    const element = { clientHeight: 320, scrollHeight: 960, scrollTop: 0 }
    const event = { ctrlKey: false, deltaX: 0, deltaY: 120, deltaMode: 0, preventDefault: vi.fn() }
    expect(applyPluginListWheel(element, event)).toBe(true)
    expect(element.scrollTop).toBe(120)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('separates DSH, ElecKoi, and user-installed plugins with Chinese labels', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<PluginListPanel onNotify={vi.fn()} />))
      await act(async () => window.dispatchEvent(new CustomEvent('eleckoi:dsh-plugins:state', {
        detail: {
          status: 'ready', selected: '', entries: [
            { id: '@deepseek-ai/example', kind: 'package', name: 'DSH 示例', icon: '', group: 'official' },
            { id: '@eleckoi/dsh-client-characters', kind: 'package', name: '角色页面', icon: '', group: 'eleckoi' },
            { id: '@third-party/example', kind: 'package', name: '第三方扩展', icon: '', group: 'installed' },
          ]
        }
      })))
      expect(container.textContent).toContain('DSH 官方插件')
      expect(container.textContent).toContain('ElecKoi 内置插件')
      expect(container.textContent).toContain('用户安装插件')
      expect(container.textContent).toContain('角色页面')
      expect(container.textContent).toContain('第三方扩展')
    } finally {
      await act(async () => root.unmount())
    }
  })
})
