// @vitest-environment jsdom
//
// 角色卡导出：选择哪些卡片。
//
// 交互：点「导出角色」→ 卡片上出现可勾选圆圈，
//       选择条提供已选清单、格式切换、全选、清空、取消与导出。
//
// 断言分三层：
//   - 验收：与交互方案对齐（形状由需求给定，故意绑形状）。
//   - 能力：不依赖具体控件形态 —— 用户点选的卡片就是被导出的卡片。
//   - 边界：防回归取证。
//
// 组件用例只覆盖选择状态和 Gateway 参数；文件写入由主进程用例覆盖。

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
  pressedFormat,
  renderManager,
  selectedNames,
  selectionBar,
  targetsText,
  typeSearch,
} from './characterExportHarness.jsx'

afterEach(cleanup)

describe('角色卡导出：选择哪些卡片', () => {
  // ── 验收 ─────────────────────────────────────────────────────────────
  describe('验收：进入导出选择后卡片出现可勾选圆圈', () => {
    it('点击导出角色后，每张卡出现可勾选圆圈，但不预选当前角色', () => {
      const { container } = renderManager()
      expect(circles(container), '未进入勾选模式时不该有圆圈（用例前提）').toHaveLength(0)

      enterExport(container, 'PNG')

      expect(circles(container)).toHaveLength(CARD_NAMES.length)
      expect(cards(container).every((card) => card.getAttribute('aria-pressed') !== null)).toBe(true)
      expect(selectedNames(container)).toEqual([])
      expect(targetsText(container)).toBe('')
      expect(exportButton(container).disabled).toBe(true)
      expect(pressedFormat(container)).toBe('PNG')
    })

    it('勾选多张后确认导出，一次性把所选交给主进程', async () => {
      const { container, onExportCharacters } = renderManager()
      enterExport(container, 'PNG')

      click(cardByName(container, '角色甲'))
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
      enterExport(container, 'JSON')

      click(cardByName(container, '角色甲'))
      click(cardByName(container, '角色乙'))
      click(cardByName(container, '角色乙'))
      expect(selectedNames(container)).toEqual(['角色甲'])

      await clickAsync(exportButton(container))

      expect(onExportCharacters.mock.calls).toEqual([[['card-1'], 'json']])
    })

    it('取消退出勾选模式，不触发任何导出', () => {
      const { container, onExportCharacters } = renderManager()
      enterExport(container, 'JSON')

      click(buttonByText(container, '取消'))

      expect(onExportCharacters).not.toHaveBeenCalled()
      expect(circles(container)).toHaveLength(0)
      expect(buttonByText(container, '导出角色'), '取消后应回到默认工具栏').toBeTruthy()
    })

    it('进入勾选模式后不再响应双击编辑，避免误开编辑器', () => {
      const { container } = renderManager()
      enterExport(container, 'PNG')
      const card = cardByName(container, '角色乙')

      expect(card.getAttribute('title')).toBeNull()
      expect(card.getAttribute('aria-pressed')).toBe('false')
    })
  })

  // ── 不依赖控件形态的能力断言 ──────────────────────────────────────────
  describe('能力：用户点选的卡片就是被导出的卡片', () => {
    it('导出集合完全由用户点选决定，不依赖任何隐藏状态', async () => {
      const { container, onExportCharacters } = renderManager()
      enterExport(container, 'PNG')

      click(cardByName(container, '角色甲'))
      click(cardByName(container, '角色甲'))
      click(cardByName(container, '角色丙'))
      await clickAsync(exportButton(container))

      expect(onExportCharacters.mock.calls).toEqual([[['card-3'], 'png']])
    })
  })

  // ── 边界与防回归 ─────────────────────────────────────────────────────
  describe('边界(绿)：取证', () => {
    it('导出角色直接进入选择模式，默认 PNG，格式只在选择条切换', () => {
      const { container } = renderManager()
      enterExport(container)

      expect(selectionBar(container)).toBeTruthy()
      expect(container.querySelector('.character-manager-export-menu')).toBeNull()
      expect(pressedFormat(container)).toBe('PNG')
      expect([...selectionBar(container).querySelectorAll('.character-manager-format-switch button')]
        .map((button) => button.textContent.trim())).toEqual(['PNG', 'JSON'])
    })

    it('不进入勾选模式时，卡片不携带任何勾选语义', () => {
      const { container } = renderManager()
      click(cardByName(container, '角色乙'))

      expect(circles(container)).toHaveLength(0)
      expect(cards(container).every((card) => card.getAttribute('aria-pressed') === null)).toBe(true)
      expect(container.querySelectorAll('button.character-card.selected').length).toBe(0)
    })

    it('未点过任何卡时，即使有 active_character_id 也不预选', () => {
      const { container } = renderManager()
      enterExport(container, 'JSON')

      expect(selectedNames(container)).toEqual([])
    })

    it('目标被搜索隐藏后，提示条仍然点名它，不会静默导出看不见的卡', async () => {
      const { container, onExportCharacters } = renderManager()
      enterExport(container, 'PNG')
      click(cardByName(container, '角色甲'))
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
