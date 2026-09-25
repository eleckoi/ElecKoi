// 角色卡导出用例的共享 harness。
//
// 供 tests/character-export-*.test.jsx 复用：三份用例真正需要的差异只在"渲染什么 + 断言什么"，
// fixture / 渲染 / 事件派发 / DOM 查询这些是所有用例共用的。
// 文件名刻意不匹配 vitest 的 *.test.* 收集规则，所以它只会被 import，不会被当成用例跑。
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { vi } from 'vitest'
import { CharacterManager } from '../src/renderer/src/modules/persona/components/CharacterManager.jsx'

globalThis.React = React
// 组件本身用 JSX 但不 import React（走 tsconfig 的 react-jsx），
// 而 vitest 这条链路对 .jsx 用 classic runtime，所以要给全局补一个。
globalThis.IS_REACT_ACT_ENVIRONMENT = true

export const CARD_NAMES = ['角色甲', '角色乙', '角色丙']

export function fixture(count = CARD_NAMES.length) {
  return {
    active_character_id: 'card-1',
    groups: [],
    items: Array.from({ length: count }, (_, index) => ({
      id: `card-${index + 1}`,
      name: CARD_NAMES[index] || `角色${index + 1}`,
      group: index < 6 ? '甲组' : '乙组',
    })),
  }
}

/** 批量导出路由的默认返回值：全部成功，落在 D:\导出。 */
export function batchResult(characterIds, format) {
  return {
    canceled: false,
    directory: 'D:\\导出',
    written: characterIds.map((characterId) => ({ characterId, fileName: `${characterId}.${format}` })),
    failures: [],
  }
}

const mounted = []

/** 卸载所有已渲染的树。用例文件里 `afterEach(cleanup)` 调用。 */
export function cleanup() {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  document.body.innerHTML = ''
}

export function renderManager({ characters = fixture(), ...overrides } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onExportCharacters = vi.fn(async (characterIds, format) => batchResult(characterIds, format))
  const render = (nextCharacters) => {
    act(() => {
      root.render(
        <CharacterManager
          characters={nextCharacters}
          persona={{ user_name: '用户', user_avatar: '' }}
          onSaveGroups={vi.fn()}
          onDeleteCharacters={vi.fn()}
          onImportCharacters={vi.fn()}
          onExportCharacters={onExportCharacters}
          {...overrides}
        />,
      )
    })
  }
  render(characters)
  mounted.push({ root, container })
  // 换一份 characters 重新渲染，用来模拟"卡在别处被删除后窗口刷新"。
  return { container, onExportCharacters, rerender: render }
}

export function click(node) {
  if (!node) throw new Error('要点击的元素不存在')
  act(() => {
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

export async function clickAsync(node) {
  if (!node) throw new Error('要点击的元素不存在')
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

export function pressEscape() {
  act(() => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
}

export function buttonByText(container, text) {
  return [...container.querySelectorAll('button')].find((button) => button.textContent.includes(text))
}

export function cards(container) {
  return [...container.querySelectorAll('button.character-card')]
}

export function cardByName(container, name) {
  return cards(container).find((card) => card.textContent.includes(name))
}

export function circles(container) {
  return [...container.querySelectorAll('.character-card-check')]
}

/** 可见范围内被勾选的卡片数量。 */
export function selectedIds(container) {
  return cards(container).filter((card) => card.getAttribute('aria-pressed') === 'true').length
}

/** 可见范围内被勾选的卡片名（按 CARD_NAMES 顺序）。 */
export function selectedNames(container) {
  return CARD_NAMES.filter((name) => cards(container)
    .some((card) => card.getAttribute('aria-pressed') === 'true' && card.textContent.includes(name)))
}

export function selectionBar(container) {
  return container.querySelector('.character-manager-selection-bar')
}

/** 选择条上的目标清单（选择期信息从标题栏移到了这条里）。 */
export function targetsText(container) {
  return container.querySelector('.character-manager-selection-targets')?.textContent || ''
}

/** 选择条上的「导出 N 张」按钮。 */
export function exportButton(container) {
  const button = container.querySelector('.character-manager-confirm-export')
  if (!button) throw new Error('选择条上的导出按钮不存在')
  return button
}

/** 格式分段控件当前按下的那一个。 */
export function pressedFormat(container) {
  const pressed = [...container.querySelectorAll('.character-manager-format-switch button')]
    .find((button) => button.getAttribute('aria-pressed') === 'true')
  return pressed?.textContent.trim() || ''
}

export function typeSearch(container, value) {
  const search = container.querySelector('input[aria-label="搜索角色"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  act(() => {
    setter.call(search, value)
    search.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  return search
}

/** 默认模式：点开「导出角色」菜单。 */
export function openExportMenu(container) {
  click(buttonByText(container, '导出角色'))
  const menu = container.querySelector('[role="menu"]')
  if (!menu) throw new Error('导出菜单没有打开')
  return menu
}

/** 走完「导出角色 → 选方式」，进入卡片勾选模式。 */
export function enterExport(container, formatLabel = 'PNG 角色卡') {
  openExportMenu(container)
  const item = [...container.querySelectorAll('[role="menuitem"]')]
    .find((button) => button.textContent.includes(formatLabel))
  click(item)
  return container
}
