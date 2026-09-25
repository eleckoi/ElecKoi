// @vitest-environment jsdom
//
// 导出选择条的逐项验收，编号对应下列行为：
//   ① Escape 退出   ② 全选 / 清空   ③ 部分失败去重   ④ 模式内换格式   ⑤ 成功后保留选择
//   ⑥ 模式标识      ⑦ 目标清单常驻   以及失效勾选自动剔除、空清单文案。

import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
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
  pressEscape,
  pressedFormat,
  renderManager,
  selectedIds,
  selectionBar,
  targetsText,
  typeSearch,
} from './characterExportHarness.jsx'

afterEach(cleanup)

describe('导出选择条', () => {
  it('Escape 退出勾选模式并清空勾选', () => {
    const { container } = renderManager()
    enterExport(container)
    click(cardByName(container, '角色乙'))
    expect(circles(container)).toHaveLength(3)

    pressEscape()

    expect(selectionBar(container), 'Escape 后应当回到默认工具栏').toBeNull()
    expect(circles(container)).toHaveLength(0)
    expect(buttonByText(container, '导出角色')).toBeTruthy()
  })

  it('全选当前列表：一次选中当前筛选范围内的全部卡片', () => {
    const { container } = renderManager({ characters: fixture(12) })
    enterExport(container)
    expect(selectedIds(container)).toBe(1)

    click(buttonByText(container, '全选当前列表'))

    expect(selectedIds(container)).toBe(12)
    // 已全选后按钮进入禁用态，避免无意义的重复点击
    expect(buttonByText(container, '全选当前列表').disabled).toBe(true)
    expect(exportButton(container).textContent.trim()).toBe('导出 12 张')
  })

  it('全选只作用于当前筛选结果，不会偷偷带上被筛掉的卡', () => {
    const { container } = renderManager({ characters: fixture(12) })
    enterExport(container)
    typeSearch(container, '角色1')

    click(buttonByText(container, '全选当前列表'))

    // 名字里含「角色1」的只有 角色10 / 角色11 / 角色12
    expect(cards(container)).toHaveLength(3)
    expect(selectedIds(container), '渲染出来的这 3 张全部勾上').toBe(3)
    expect(targetsText(container)).toContain('角色12')
    expect(targetsText(container), '进来时默认勾选的 角色甲 仍然被保留').toContain('角色甲')
    expect(targetsText(container), '没被筛出来、也没勾过的卡不该被带上').not.toContain('角色4')
  })

  it('清空：一次取消全部勾选，导出按钮随之禁用', () => {
    const { container } = renderManager()
    enterExport(container)
    click(cardByName(container, '角色乙'))
    expect(selectedIds(container)).toBe(2)

    click(buttonByText(container, '清空'))

    expect(selectedIds(container)).toBe(0)
    expect(targetsText(container)).toContain('尚未选择角色卡')
    expect(exportButton(container).disabled).toBe(true)
  })

  it('部分失败：成功的不再重复导，失败的留在勾选里', async () => {
    const { container, onExportCharacters } = renderManager()
    const calls = []
    let failedOnce = false
    onExportCharacters.mockImplementation(async (characterIds, format) => {
      calls.push([...characterIds])
      const failing = !failedOnce && characterIds.length === 3 ? 'card-2' : undefined
      failedOnce = true
      return {
        canceled: false,
        directory: 'D:\\导出',
        written: characterIds
          .filter((characterId) => characterId !== failing)
          .map((characterId) => ({ characterId, fileName: characterId + '.' + format })),
        failures: failing ? [{ characterId: failing, message: '磁盘写入失败' }] : [],
      }
    })

    enterExport(container)
    click(cardByName(container, '角色乙'))
    click(cardByName(container, '角色丙'))
    await clickAsync(exportButton(container))

    expect(calls, '第一轮：三张一起交给主进程').toEqual([['card-1', 'card-2', 'card-3']])
    expect(selectedIds(container), '成功的两张被移出勾选，只剩失败那张').toBe(1)
    expect(targetsText(container)).not.toContain('角色甲')
    expect(container.querySelector('.character-manager-error').textContent).toContain('已导出 2 张')

    await clickAsync(exportButton(container))

    expect(calls, '重试只补导失败的那一张').toEqual([['card-1', 'card-2', 'card-3'], ['card-2']])
  })

  it('勾选模式内可换格式，勾选不丢', async () => {
    const { container, onExportCharacters } = renderManager()
    enterExport(container, 'PNG 角色卡')
    click(cardByName(container, '角色乙'))
    expect(pressedFormat(container)).toBe('PNG')

    click(buttonByText(container, 'JSON'))

    expect(pressedFormat(container)).toBe('JSON')
    expect(selectedIds(container), '换格式不影响已勾选的卡').toBe(2)

    await clickAsync(exportButton(container))
    expect(onExportCharacters.mock.calls).toEqual([[['card-1', 'card-2'], 'json']])
  })

  it('成功后保留勾选与模式，可以直接换格式再导一次', async () => {
    const { container, onExportCharacters } = renderManager()
    enterExport(container, 'PNG 角色卡')
    click(cardByName(container, '角色乙'))

    await clickAsync(exportButton(container))

    expect(selectionBar(container), '成功后不退出勾选模式').toBeTruthy()
    expect(selectedIds(container), '成功后勾选保留').toBe(2)
    expect(container.querySelector('.character-manager-selection-notice').textContent).toBe('已导出 2 张 · PNG → D:\\导出')
    expect(buttonByText(container, '完成'), '成功后退出的语义变成「完成」').toBeTruthy()

    click(buttonByText(container, 'JSON'))
    await clickAsync(exportButton(container))

    expect(onExportCharacters.mock.calls).toEqual([
      [['card-1', 'card-2'], 'png'],
      [['card-1', 'card-2'], 'json'],
    ])
  })

  it('「完成」退出勾选模式并清空勾选', async () => {
    const { container } = renderManager()
    enterExport(container)
    await clickAsync(exportButton(container))

    click(buttonByText(container, '完成'))

    expect(selectionBar(container)).toBeNull()
    expect(circles(container)).toHaveLength(0)
  })

  it('选择条明示「导出模式」，卡片圆圈与批量删除保持同形（有意保留）', () => {
    const { container } = renderManager()
    enterExport(container)
    const exportCircle = circles(container)[0].outerHTML

    expect(selectionBar(container).querySelector('.character-manager-selection-mode').textContent).toBe('导出模式')
    expect(selectionBar(container).getAttribute('aria-label')).toBe('导出选择')

    click(buttonByText(container, '取消'))
    click(buttonByText(container, '删除'))

    expect(circles(container)[0].outerHTML, '两种模式复用同一个圆圈是刻意的设计决定').toBe(exportCircle)
    expect(selectionBar(container), '删除模式不引入选择条，维持原有形态').toBeNull()
  })

  it('目标清单搬到选择条里，不再和搜索抢标题栏的宽度', () => {
    const { container } = renderManager({ characters: fixture(12) })
    enterExport(container)
    click(buttonByText(container, '全选当前列表'))
    typeSearch(container, '角色')

    expect(container.querySelector('.character-manager-titlebar').textContent, '标题栏里不再有导出目标信息')
      .not.toContain('将导出')
    expect(targetsText(container)).toContain('角色甲')
    expect(targetsText(container)).toContain('角色12')
    expect(container.querySelector('.character-manager-selection-targets').getAttribute('title'))
      .toBe(targetsText(container).replace('将导出：', ''))
  })

  it('导出中禁用按钮，结束后提示落盘目录', async () => {
    const { container, onExportCharacters } = renderManager()
    let finish
    onExportCharacters.mockImplementation(() => new Promise((resolve) => { finish = resolve }))

    enterExport(container)
    click(cardByName(container, '角色乙'))
    expect(exportButton(container).textContent.trim()).toBe('导出 2 张')

    await act(async () => {
      exportButton(container).dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(exportButton(container).textContent.trim()).toBe('导出中…')
    expect(exportButton(container).disabled).toBe(true)

    await act(async () => {
      finish({
        canceled: false,
        directory: 'D:\\导出',
        written: [{ characterId: 'card-1', fileName: 'a.png' }, { characterId: 'card-2', fileName: 'b.png' }],
        failures: [],
      })
    })

    expect(exportButton(container).textContent.trim()).toBe('导出 2 张')
    expect(container.querySelector('.character-manager-selection-notice').textContent).toBe('已导出 2 张 · PNG → D:\\导出')
  })

  it('在目录选择里点取消：不动勾选、不报错、不进「完成」态', async () => {
    const { container, onExportCharacters } = renderManager()
    onExportCharacters.mockResolvedValue({ canceled: true, directory: '', written: [], failures: [] })
    enterExport(container)
    click(cardByName(container, '角色乙'))

    await clickAsync(exportButton(container))

    expect(selectedIds(container), '取消后勾选原样保留').toBe(2)
    expect(container.querySelector('.character-manager-error')).toBeNull()
    expect(container.querySelector('.character-manager-selection-notice').textContent).toBe('')
    expect(buttonByText(container, '取消'), '仍处于「取消」语义，没被当成导出成功').toBeTruthy()
  })

  // ── 勾选失效与空清单 ────────────────────────────────────────────────
  describe('失效勾选与空清单文案', () => {
    it('勾选的角色卡在别处被删除后，失效的勾选会被自动剔除', () => {
      const { container, rerender } = renderManager()
      enterExport(container, 'PNG 角色卡')
      click(cardByName(container, '角色乙'))
      click(cardByName(container, '角色丙'))
      expect(selectedIds(container)).toBe(3)

      // 模拟 records.changed → 刷新：角色乙没了（另一个窗口删的）
      const remaining = fixture().items.filter((item) => item.id !== 'card-2')
      rerender({ ...fixture(), items: remaining })

      expect(cards(container), '界面上只剩 2 张').toHaveLength(2)
      expect(selectedIds(container), '失效的勾选被剔除，不该留下幽灵目标').toBe(2)
      expect(targetsText(container), '清单里不该再出现它，更不该出现裸 id').not.toContain('角色乙')
      expect(targetsText(container)).not.toContain('card-2')
      expect(targetsText(container)).toBe('将导出：角色甲、角色丙')
      expect(exportButton(container).textContent.trim()).toBe('导出 2 张')
    })

    it('全部勾选都失效时，选择条回到空态而不是卡住', () => {
      const { container, rerender } = renderManager()
      enterExport(container, 'PNG 角色卡')
      expect(selectedIds(container)).toBe(1)

      rerender({ active_character_id: '', groups: [], items: [] })

      expect(selectedIds(container)).toBe(0)
      expect(targetsText(container)).toBe('尚未选择角色卡')
      expect(exportButton(container).disabled).toBe(true)
    })

    it('一张都没选时，清单文案不再带「将导出：」前缀', () => {
      const { container } = renderManager()
      enterExport(container, 'PNG 角色卡')
      click(buttonByText(container, '清空'))

      expect(targetsText(container), '空态文案读起来要通顺').toBe('尚未选择角色卡')
      expect(targetsText(container)).not.toContain('将导出')
      // 有选择时仍然带前缀
      click(cardByName(container, '角色甲'))
      expect(targetsText(container)).toBe('将导出：角色甲')
    })
  })
})
