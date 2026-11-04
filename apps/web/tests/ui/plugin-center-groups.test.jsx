// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyPluginListWheel, PluginListPanel } from '../../src/app/windows/shell/components/PluginCenter.jsx'

vi.stubGlobal('React', React)
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

afterEach(() => {
  document.body.innerHTML = ''
})

describe('plugin center groups', () => {
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
