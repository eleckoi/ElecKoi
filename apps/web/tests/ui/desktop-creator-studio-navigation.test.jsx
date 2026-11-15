// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorStudioWindow } from '../../src/app/windows/CreatorStudioWindow.jsx';
import { PresetManagerWindow } from '../../src/app/windows/PresetManagerWindow.jsx';
import { officialLayoutFixture } from '../../../../tests/helpers/officialLayout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;
const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
function store(snapshot) {
  const listeners = new Set();
  return { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    publish(next) { snapshot = next; listeners.forEach(listener => listener()); } };
}
async function mount(element) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(element));
  const unmount = async () => { await act(async () => root.unmount()); node.remove(); };
  cleanups.push(unmount);
  return { node, click: async label => {
    const button = [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label || item.textContent.trim() === label);
    expect(button, label).toBeTruthy(); await act(async () => button.click());
  } };
}
function studioFixture() {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const { Frame, store: layout, dispose } = officialLayoutFixture({ window, document, ResizeObserver, requestAnimationFrame, cancelAnimationFrame });
  cleanups.push(dispose);
  function NativeFrame(props) {
    const useStore = selector => selector(React.useSyncExternalStore(layout.subscribe, layout.getSnapshot));
    return <Frame {...props} actions={layout.actions} useStore={useStore} usePanelInfo={selector => selector({ activePanelId: 'creatorStudio' })}
      useSessions={selector => selector({ byId: {} })} useFoldedLandscape={selector => selector(false)} t={key => key} />;
  }
  const active = { sessionId: 'synthetic-session', characterId: '', presetId: 'synthetic-creator' };
  const model = Object.assign(store({ status: 'ready', active, reference: {}, error: '', items: [
    { ...active, title: '合成对话', updatedAt: Date.now(), pinned: false, pinIndex: -1 },
  ] }), {
    restoreRecent: vi.fn(async () => active), release: vi.fn(), create: vi.fn(async () => active), open: vi.fn(async () => active),
    rename: vi.fn(async () => {}), pin: vi.fn(async () => {}), delete: vi.fn(async () => {}),
    search: vi.fn(async () => ({ items: [{ sessionId: 'synthetic-session' }], hasMore: false })),
    selectCharacter: vi.fn(async characterId => { model.publish({ ...model.getSnapshot(), active: { ...active, characterId } }); }),
  });
  const props = {
    nativeFrame: <NativeFrame renderSlot={name => name === 'rightbar' ? <div data-native-rightbar="" /> : null} />,
    navigation: { selectedPanelId: 'creatorStudio', toggleSidebar: layout.actions.toggleSidebar },
    characterCatalog: store({ status: 'ready', error: '', collection: { groups: ['合成分组'], items: [{ id: 'synthetic-character', name: '合成角色', group: '合成分组', avatar: '' }] } }),
    projectCatalog: { sessions: model }, models: store({ configs: [] }),
    presetCatalog: store({ status: 'ready', error: '', catalog: { presets: [{ id: 'synthetic-creator', name: '合成创作预设' }] } }),
    renderCreatorStudioConversation: vi.fn(owner => <div><div data-native-studio>{owner.props.title}</div><button aria-label="新建工作室对话" onClick={owner.props.onCreate} /></div>),
  };
  return { model, props };
}
describe('Desktop simple AI creator studio', () => {
  it('opens official plugin panels and returns without remounting the right sidebar or releasing the Studio Session', async () => {
    const { model, props } = studioFixture();
    let selectPanel;
    function Window() {
      const [selectedPanelId, setPanel] = React.useState('messages');
      selectPanel = setPanel;
      return <CreatorStudioWindow {...props} navigation={{ selectedPanelId, selectPanel: setPanel,
        toggleSidebar: props.navigation.toggleSidebar,
        renderPanel: id => <div data-official-panel={id}>插件配置</div> }}
        rightbar={{ render: () => <div data-native-rightbar="" /> }} />;
    }
    const f = await mount(<Window />);
    await f.click('进入简易版');
    const rightbar = f.node.querySelector('[data-native-rightbar]');
    await act(() => selectPanel('plugins'));
    expect(f.node.querySelector('[data-official-panel="plugins"]')).toBeTruthy();
    expect(f.node.querySelector('[data-native-studio]')).toBeNull();
    expect(f.node.querySelector('[data-native-rightbar]')).toBe(rightbar);
    expect(model.release).not.toHaveBeenCalled();
    await f.click('返回工作室对话');
    expect(f.node.querySelector('[data-native-studio]')).toBeTruthy();
    expect(f.node.querySelector('[data-native-rightbar]')).toBe(rightbar);
    expect(model.restoreRecent).toHaveBeenCalledOnce();
  });
  it('restores the recent Session and sends its title to the native conversation assembly', async () => {
    const { model, props } = studioFixture(), f = await mount(<CreatorStudioWindow {...props} />);
    expect(model.restoreRecent).not.toHaveBeenCalled();
    await f.click('进入简易版');
    expect(model.restoreRecent).toHaveBeenCalledOnce();
    expect(f.node.querySelector('[data-native-studio]').textContent).toBe('合成对话');
    expect(props.renderCreatorStudioConversation.mock.calls[0][0].component.name).toBe('CreatorStudioConversation');
    expect(f.node.querySelector('[aria-label="收起对话列表"]').closest('.creator-simple-titlebar-sidebar')).toBeTruthy();
    expect(f.node.querySelectorAll('[aria-label="新建工作室对话"]')).toHaveLength(1);
    await f.click('收起对话列表');
    expect(f.node.querySelector('.creator-simple-sidebar').closest('[aria-hidden]').getAttribute('aria-hidden')).toBe('true');
    await f.click('展开对话列表');
    await f.click('选择角色'); await f.click('选择角色 合成角色');
    expect(model.selectCharacter).toHaveBeenCalledWith('synthetic-character');
    expect(document.querySelector('[role=dialog]')).toBeNull();
    await f.click('新建工作室对话');
    expect(model.create).toHaveBeenCalledWith('synthetic-character');
    model.create.mockClear();
    await act(async () => props.characterCatalog.publish({ status: 'ready', error: '', collection: { groups: [], items: [] } }));
    await f.click('新建工作室对话');
    expect(model.create).toHaveBeenCalledWith('');
    await f.click('选择角色');
    expect([...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent === '不选择角色').getAttribute('aria-pressed')).toBe('true');
    await f.click('不选择角色');
    await f.click('返回工作室入口');
    expect(model.release).toHaveBeenCalledOnce();
    expect(f.node.textContent).toContain('开发者专用');
    await f.click('进入简易版');
    expect(model.restoreRecent).toHaveBeenCalledTimes(2);
  });
  it('uses the selected history row for pinning and deletion', async () => {
    const { model, props } = studioFixture(), f = await mount(<CreatorStudioWindow {...props} />);
    await f.click('进入简易版'); await f.click('管理 合成对话'); await f.click('置顶');
    expect(model.pin).toHaveBeenCalledWith('synthetic-session', true);
    await f.click('管理 合成对话'); await f.click('删除对话');
    expect(document.querySelector('[role=dialog]').textContent).toContain('合成对话');
    await f.click('删除');
    expect(model.delete).toHaveBeenCalledWith('synthetic-session');
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
  it('finds conversation content and manages selected history from the time-group row', async () => {
    const { model, props } = studioFixture(), f = await mount(<CreatorStudioWindow {...props} />);
    await f.click('进入简易版');
    const search = f.node.querySelector('[aria-label="搜索工作室对话"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, '合成正文');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
    expect(model.search).toHaveBeenCalledWith('合成正文', expect.any(AbortSignal));
    expect(f.node.querySelector('.creator-simple-history-title').textContent).toBe('合成对话');
    expect(f.node.querySelector('[aria-label="管理对话"]').closest('.creator-simple-group-heading').textContent).toContain('30 天内');
    await f.click('管理对话');
    expect([...f.node.querySelectorAll('.creator-simple-selection-footer button')].every(button => button.disabled)).toBe(true);
    await act(async () => f.node.querySelector('input[type=checkbox]').click());
    await f.click('置顶');
    expect(model.pin).toHaveBeenCalledWith('synthetic-session', true);
    expect(f.node.querySelector('input[type=checkbox]')).toBeNull();
  });
});

describe('Desktop preset manager categories', () => {
  it('keeps the purpose switch inside the groups sidebar and changes category without activating a preset', async () => {
    const catalog = { activePresetIds: { roleplay: 'synthetic-roleplay', creator: 'synthetic-creator' }, groups: [], presets: [
      { id: 'synthetic-roleplay', purpose: 'roleplay', name: '合成对话预设', profile: { authorName: '' }, libraryGroupId: '' },
      { id: 'synthetic-creator', purpose: 'creator', name: '合成创作预设', profile: { authorName: '' }, libraryGroupId: '' },
    ] };
    const model = Object.assign(store({ status: 'ready', catalog, error: '' }), { refresh: vi.fn(async () => catalog), activate: vi.fn() });
    const f = await mount(<PresetManagerWindow presetCatalog={model} />);
    const categories = f.node.querySelector('[aria-label="预设分类"]');
    expect(categories.closest('.preset-manager-groups')).toBeTruthy();
    expect(f.node.querySelector('.preset-manager-grid').textContent).toContain('合成对话预设');
    await f.click('创作预设');
    expect(f.node.querySelector('.preset-manager-grid').textContent).toContain('合成创作预设');
    expect(f.node.querySelector('.preset-manager-grid').textContent).not.toContain('合成对话预设');
    expect(model.activate).not.toHaveBeenCalled();
  });
});
