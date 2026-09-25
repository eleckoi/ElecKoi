// @vitest-environment jsdom
//
// 角色卡导出：选择哪些卡片。
//
// 交互：点「导出角色」→ 选导出方式（PNG / JSON）→ 卡片上出现可勾选圆圈，
//       同时出现一条选择条（模式 / 已选清单 / 格式切换 / 全选 / 清空 / 取消 / 导出）→ 勾选并导出。
//
// 断言分三层：
//   - 验收：与交互方案对齐（形状由需求给定，故意绑形状）。
//   - 能力：不依赖具体控件形态 —— 用户点选的卡片就是被导出的卡片。
//   - 边界：防回归取证。
//
// 已知缝隙：本用例把 onExportCharacters 换成 spy，只覆盖「点选 → 传给导出的 characterId 列表/format」；
// base64 → Blob → <a download> 的落盘路径（CharacterManagerWindow.jsx）不在覆盖范围内。

import { afterEach, describe, expect, it } from 'vitest'
import {
  CARD_NAMES,
  buttonByText,
  cardByName,
  cards,
  circles,
  cleanup,
  click,
  clickAsync,
  enterExport,
  exportButton,
  fixture,
  openExportMenu,
  pressedFormat,
  renderManager,
  selectedNames,
  targetsText,
  typeSearch,
} from './characterExportHarness.jsx'

afterEach(cleanup)

describe('角色卡导出：选择哪些卡片', () => {
  // ── 验收 ─────────────────────────────────────────────────────────────
  describe('验收：选定导出方式后卡片出现可勾选圆圈', () => {
    it('选定导出方式后，每张卡出现可勾选圆圈，并默认勾选当前那张卡', () => {
      const { container } = renderManager()
      expect(circles(container), '未进入勾选模式时不该有圆圈（用例前提）').toHaveLength(0)

      enterExport(container, 'PNG 角色卡')

      expect(circles(container)).toHaveLength(CARD_NAMES.length)
      expect(cards(container).every((card) => card.getAttribute('aria-pressed') !== null)).toBe(true)
      expect(selectedNames(container), '进入勾选模式时应默认勾选当前那张卡').toEqual(['角色甲'])
      expect(targetsText(container), '选择条必须常驻显示将导出哪张卡').toContain('角色甲')
      expect(pressedFormat(container)).toBe('PNG')
    })

    it('勾选多张后确认导出，一次性把所选交给主进程', async () => {
      const { container, onExportCharacters } = renderManager()
      enterExport(container, 'PNG 角色卡')

      click(cardByName(container, '角色乙'))
      click(cardByName(container, '角色丙'))
      expect(selectedNames(container)).toEqual(['角色甲', '角色乙', '角色丙'])
      expect(targetsText(container)).toContain('角色乙、角色丙')

      await clickAsync(exportButton(container))

      expect(onExportCharacters.mock.calls).toEqual([
        [['card-1', 'card-2', 'card-3'], 'png'],
      ])
    })

    it('再次点击已勾选的卡可以取消勾选', async () => {
      const { container, onExportCharacters } = renderManager()
      enterExport(container, 'JSON 角色卡')

      click(cardByName(container, '角色乙'))
      click(cardByName(container, '角色乙'))
      expect(selectedNames(container)).toEqual(['角色甲'])

      await clickAsync(exportButton(container))

      expect(onExportCharacters.mock.calls).toEqual([[['card-1'], 'json']])
    })

    it('取消退出勾选模式，不触发任何导出', () => {
      const { container, onExportCharacters } = renderManager()
      enterExport(container, 'JSON 角色卡')

      click(buttonByText(container, '取消'))

      expect(onExportCharacters).not.toHaveBeenCalled()
      expect(circles(container)).toHaveLength(0)
      expect(buttonByText(container, '导出角色'), '取消后应回到默认工具栏').toBeTruthy()
    })

    it('进入勾选模式后不再响应双击编辑，避免误开编辑器', () => {
      const { container } = renderManager()
      enterExport(container, 'PNG 角色卡')
      const card = cardByName(container, '角色乙')

      expect(card.getAttribute('title')).toBeNull()
      expect(card.getAttribute('aria-pressed')).toBe('false')
    })
  })

  // ── 不依赖控件形态的能力断言 ──────────────────────────────────────────
  describe('能力：用户点选的卡片就是被导出的卡片', () => {
    it('导出集合完全由用户点选决定，不依赖任何隐藏状态', async () => {
      const { container, onExportCharacters } = renderManager()
      enterExport(container, 'PNG 角色卡')

      click(cardByName(container, '角色甲')) // 取消默认勾选
      click(cardByName(container, '角色丙'))
      await clickAsync(exportButton(container))

      expect(onExportCharacters.mock.calls).toEqual([[['card-3'], 'png']])
    })
  })

  // ── 边界与防回归 ─────────────────────────────────────────────────────
  describe('边界(绿)：取证', () => {
    it('导出菜单本身仍然只有 PNG / JSON 两个格式项', () => {
      const { container } = renderManager()
      const menu = openExportMenu(container)

      expect([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent.trim()))
        .toEqual(['PNG 角色卡', 'JSON 角色卡'])
    })

    it('不进入勾选模式时，卡片不携带任何勾选语义', () => {
      const { container } = renderManager()
      click(cardByName(container, '角色乙'))

      expect(circles(container)).toHaveLength(0)
      expect(cards(container).every((card) => card.getAttribute('aria-pressed') === null)).toBe(true)
      expect(container.querySelectorAll('button.character-card.selected').length).toBe(0)
    })

    it('未点过任何卡时，进入勾选模式默认勾选 active_character_id', () => {
      const { container } = renderManager()
      enterExport(container, 'JSON 角色卡')

      expect(selectedNames(container)).toEqual(['角色甲'])
    })

    it('目标被搜索隐藏后，提示条仍然点名它，不会静默导出看不见的卡', async () => {
      const { container, onExportCharacters } = renderManager()
      enterExport(container, 'PNG 角色卡')
      click(cardByName(container, '角色乙'))
      typeSearch(container, '角色甲')

      expect(cards(container), '搜索没有生效，用例前提不成立').toHaveLength(1)
      expect(selectedNames(container), '可见范围内只剩角色甲').toEqual(['角色甲'])
      expect(targetsText(container), '被隐藏的角色乙必须仍然被点名').toContain('角色乙')

      await clickAsync(exportButton(container))

      expect(onExportCharacters.mock.calls).toEqual([[['card-1', 'card-2'], 'png']])
    })

    it('两条路由并存：批量走 characterIds，单卡路由仍受契约保护', async () => {
      const { requestContracts } = await import('@shared/contracts/gateway/definitions')

      const batch = requestContracts['command.characters.export.files']
      expect(batch.input.safeParse({ characterIds: ['card-1', 'card-2'], format: 'png' }).success).toBe(true)
      expect(batch.input.safeParse({ characterIds: [], format: 'png' }).success).toBe(false)
      // 契约上限 50，UI 的 MAX_EXPORT_SELECTION 与它对齐
      const tooMany = Array.from({ length: 51 }, (_, index) => `card-${index}`)
      expect(batch.input.safeParse({ characterIds: tooMany, format: 'png' }).success).toBe(false)

      // 单卡路由保留为契约层公开接口；渲染层当前不再调用它
      const single = requestContracts['command.characters.export']
      expect(single.input.safeParse({ characterId: 'card-1', format: 'png' }).success).toBe(true)
      expect(single.input.safeParse({ characterIds: ['card-1'], format: 'png' }).success).toBe(false)
    })
  })
})
