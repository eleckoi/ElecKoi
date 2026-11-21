// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cards, cleanup, click, clickAsync, renderManager, buttonByText, fixture } from './characterExportHarness.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function context(card) {
  act(() => card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 })));
  return document.querySelector('[role=menu]');
}

describe('character manager actions', () => {
  it('opens the clicked card editor with one click and keeps selection modes separate', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { container } = renderManager();
    click(cards(container)[1]);
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0][0]).toContain('character=card-2');
    click(buttonByText(container, '删除'));
    click(cards(container)[1]);
    expect(open).toHaveBeenCalledOnce();
    expect(cards(container)[1].getAttribute('aria-pressed')).toBe('true');
  });
  it('offers editing, copying and grouping for the right-clicked card without opening its editor', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null), duplicate = vi.fn(async () => {}), move = vi.fn(async () => {});
    const { container } = renderManager({ characters: { ...fixture(), groups: ['甲组', '乙组'] }, onDuplicateCharacter: duplicate, onSaveGroups: move });
    const menu = context(cards(container)[1]);
    expect([...menu.querySelectorAll('button')].map(item => item.textContent)).toEqual(['编辑角色卡', '复制角色卡', '移出分组', '甲组', '乙组']);
    expect(open).not.toHaveBeenCalled();
    await clickAsync(buttonByText(menu, '复制角色卡'));
    expect(duplicate).toHaveBeenCalledWith('card-2');
    expect(document.querySelector('[role=menu]')).toBeNull();
    const reopened = context(cards(container)[1]);
    await clickAsync(buttonByText(reopened, '乙组'));
    expect(move).toHaveBeenCalledWith(['甲组', '乙组'], [{ characterId: 'card-2', group: '乙组' }]);
  });
  it('shows copy failures without removing the source or fabricating a new card', async () => {
    const { container } = renderManager({ onDuplicateCharacter: vi.fn(async () => { throw new Error('Synthetic copy failure'); }) });
    await clickAsync(buttonByText(context(cards(container)[0]), '复制角色卡'));
    expect(container.textContent).toContain('Synthetic copy failure');
    expect(cards(container)).toHaveLength(3);
  });
  it('moves the checked homepage cards without changing the filter, and can retry a failed move', async () => {
    const saveGroups = vi.fn().mockRejectedValueOnce(new Error('Synthetic move failure')).mockResolvedValueOnce(undefined);
    const setSelectedGroup = vi.fn();
    const { container } = renderManager({
      characters: { ...fixture(), groups: ['甲组', '乙组'] },
      onSaveGroups: saveGroups,
      home: { renderGroups: () => null, withFavorite: (_character, card) => card, setSelectedGroup },
    });
    click(buttonByText(container, '移动角色'));
    click(cards(container)[0]);
    click(cards(container)[2]);
    click(buttonByText(container, '移动到分组'));
    const dialog = document.querySelector('[role=dialog]');
    const save = buttonByText(dialog, '保存');
    expect(save.disabled).toBe(true);
    const target = dialog.querySelector('select');
    const destination = [...target.options].find(option => option.textContent === '乙组');
    act(() => {
      target.value = destination.value;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clickAsync(save);
    expect(dialog.textContent).toContain('Synthetic move failure');
    expect(saveGroups).toHaveBeenCalledTimes(1);
    await clickAsync(save);
    const assignments = [{ characterId: 'card-1', group: '乙组' }, { characterId: 'card-3', group: '乙组' }];
    expect(saveGroups).toHaveBeenNthCalledWith(1, ['甲组', '乙组'], assignments);
    expect(saveGroups).toHaveBeenNthCalledWith(2, ['甲组', '乙组'], assignments);
    expect(setSelectedGroup).not.toHaveBeenCalled();
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
});
