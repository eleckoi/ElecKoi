// @vitest-environment jsdom
import React, { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DynamicSettingsPanel } from '../../src/modules/settingLibraries/components/DynamicSettingsPanel.jsx'
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js'
import { EditorView } from '@codemirror/view'
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx'

vi.stubGlobal('React', React)
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
afterEach(() => { document.body.innerHTML = '' })

describe('automatic chat branch settings', () => {
  it.each([false, true])('edits and saves through the shared document, preserves references and inherited read-only entries (compact=%s)', async compact => {
    const library = { characterId: 'synthetic-character', name: '合成设定库', entries: [
      { ...createEntryDraft('', 1, []), id: 'controller', title: '控制器', content: '<%= getwi("引用") %>', contentMode: 'ejs' },
      { ...createEntryDraft('', 2, []), id: 'reference', title: '引用', content: '引用正文' },
      { ...createEntryDraft('', 3, []), id: 'inherited', title: '继承设定', kind: 'character', content: '只读正文' },
    ], groups: [{ id: 'folder', name: '原文件夹', parentId: '', treeViewOrder: 0 }], promptPositions: [], versions: [], expandedGroupIds: [] };
    const item = { sessionId: 'synthetic-chat', title: '合成聊天', library };
    const model = { readConversations: vi.fn(async () => [item]), subscribe: () => () => {}, saveConversation: vi.fn(async (_owner, _session, next) => { item.library = next; }) };
    const container = document.createElement('div'); document.body.append(container); const root = createRoot(container), ref = React.createRef();
    const click = async node => { expect(node).toBeTruthy(); await act(async () => node.click()); };
    let subpage;
    const presentation = { compact, registerSubpage: page => { subpage = page; return () => { if (subpage === page) subpage = null; }; } };
    const closeDetail = async () => compact ? act(async () => subpage.back()) : click(container.querySelector('[aria-label="关闭详情"]'));
    const button = label => [...container.querySelectorAll('button')].find(node => node.textContent.trim() === label);
    const open = async title => {
      await click([...container.querySelectorAll('[role="treeitem"]')].find(node => node.textContent.includes(title)));
      if (compact) await click(button('编辑'));
    };
    const changeInput = async (input, value) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const editContent = async text => act(async () => {
      const view = EditorView.findFromDOM(container.querySelector('.cm-editor'));
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    });
    try {
      await act(async () => root.render(<EditorPresentationContext.Provider value={presentation}><DynamicSettingsPanel ref={ref} characterId="synthetic-character" settingLibraries={model} /></EditorPresentationContext.Provider>));
      await click(container.querySelector('.dynamic-settings-conversation-row'));
      await open('控制器');
      expect(container.querySelector('[aria-current="step"]')).toBeNull();
      expect(container.querySelector('.setting-view-switch')).not.toBeNull();
      await closeDetail();
      await open('引用');
      expect(container.querySelector('[aria-label="条目标题"]').value).toBe('引用');
      const mixedReference = '引用正文已修改。<%= 1 %>保留结尾。';
      await editContent(mixedReference);
      await closeDetail();
      await open('控制器');
      await click(button('设置'));
      await click(container.querySelector('[aria-label="启用触发规则"]'));
      await click(button('常驻触发'));
      await click(button('指定插入位置'));
      await click(container.querySelector('[aria-label="选择设定插入点 2"]'));
      await changeInput(container.querySelector('[aria-label="位置内顺序"]'), '12');
      await closeDetail();
      await open('继承设定');
      expect(container.querySelector('[aria-label="条目标题"]').readOnly).toBe(true);
      expect(container.querySelector('.cm-content').getAttribute('aria-readonly')).toBe('true');
      expect(container.querySelector('.setting-view-switch')).toBeNull();
      expect(container.querySelector('[aria-label="删除设定"]')).toBeNull();
      await closeDetail();
      await open('原文件夹');
      await changeInput(container.querySelector('[aria-label="文件夹名称"]'), '修改文件夹');
      await act(async () => ref.current.save());
      const saved = model.saveConversation.mock.lastCall[2];
      expect(saved.entries.find(entry => entry.id === 'reference')).toMatchObject({ content: mixedReference, contentMode: 'ejs', enabled: false });
      expect(saved.entries.find(entry => entry.id === 'controller')).toMatchObject({ triggerMode: 'always', position: 'insert_point_2', order: 12 });
      expect(saved.entries.find(entry => entry.id === 'inherited').content).toBe('只读正文');
      expect(saved.groups[0].name).toBe('修改文件夹');
    } finally { await act(async () => root.unmount()); }
  });
  it('right-clicks branch settings without opening or switching the editor and deletes the menu target', async () => {
    const library = { characterId: 'synthetic-character', name: '合成设定库', entries: [
      { ...createEntryDraft('', 1, []), id: 'synthetic-first', title: '合成第一条目' },
      { ...createEntryDraft('', 2, []), id: 'synthetic-second', title: '合成第二条目' },
    ], groups: [], promptPositions: [], versions: [], activeVersionId: 'main', expandedGroupIds: [], listAllExpanded: false };
    const item = { sessionId: 'synthetic-chat', title: '合成聊天', characterName: '合成角色', summary: '', updatedAt: '', library };
    const model = { readConversations: vi.fn().mockResolvedValue([item]), subscribe: () => () => {}, saveConversation: vi.fn().mockResolvedValue(library) };
    const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    const row = title => [...container.querySelectorAll('[role="treeitem"]')].find(node => node.textContent.includes(title));
    const right = async title => act(async () => row(title).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 })));
    try {
      await act(async () => root.render(<DynamicSettingsPanel characterId="synthetic-character" settingLibraries={model} />));
      await act(async () => container.querySelector('.dynamic-settings-conversation-row').click());
      await right('合成第二条目'); expect(container.querySelector('.dynamic-settings-editor-pane')).toBeNull();
      await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true })));
      expect(document.querySelector('[role="menu"]')).toBeNull();
      await act(async () => row('合成第一条目').click());
      const inspector = container.querySelector('.dynamic-settings-editor-pane');
      await right('合成第二条目'); expect(container.querySelector('.dynamic-settings-editor-pane')).toBe(inspector);
      await act(async () => [...document.querySelectorAll('[role="menuitem"]')].find(node => node.textContent.trim() === '删除').click());
      await act(async () => [...document.querySelectorAll('.product-dialog-actions button')].find(node => node.textContent.trim() === '删除').click());
      expect(row('合成第二条目')).toBeUndefined(); expect(container.querySelector('.dynamic-settings-editor-pane')).toBe(inspector);
      await act(async () => container.querySelector('.setting-library-save-button').click());
      expect(model.saveConversation.mock.lastCall[2].entries.map(entry => entry.id)).toEqual(['synthetic-first']);
    } finally { await act(async () => root.unmount()); }
  });
  it('sizes the chat identity to its content instead of reserving an empty fixed column', () => {
    const css = readFileSync(resolve(process.cwd(), 'apps/web/src/modules/settingLibraries/styles/dynamic-settings.css'), 'utf8')
    const row = css.match(/\.dynamic-settings-conversation-row\s*\{([^}]+)\}/)?.[1]
    expect(row).toContain('grid-template-columns: fit-content(220px) minmax(0, 1fr) auto;')
    expect(row).toContain('gap: 16px;')
  })

  it('has no branch creation action and refreshes persisted branches with the full editor', async () => {
    let notify
    const entry = { ...createEntryDraft('', 1, []), id: 'synthetic-preference',
      title: '偏好', content: '喜欢茶。', enabled: true }
    const library = { characterId: 'synthetic-character', name: '设定库', entries: [entry],
      groups: [], promptPositions: [], versions: [], activeVersionId: 'main', expandedGroupIds: [], listAllExpanded: false }
    const item = { sessionId: 'synthetic-chat', title: '合成聊天', characterName: '合成角色',
      summary: '测试对话', updatedAt: new Date().toISOString(), library }
    const model = {
      readConversations: vi.fn().mockResolvedValue([]),
      subscribe(listener) { notify = listener; return () => {} },
      saveConversation: vi.fn().mockResolvedValue(library)
    }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const button = text => [...container.querySelectorAll('button')].find(node => node.textContent.trim() === text)
    try {
      await act(async () => root.render(<DynamicSettingsPanel characterId="synthetic-character" settingLibraries={model} />))
      expect(container.textContent).toContain('还没有分支设定')
      expect(container.querySelectorAll('button')).toHaveLength(0)
      await act(async () => notify('conversations', 'synthetic-character', { status: 'ready', value: [item] }))
      expect(container.textContent).toContain('合成聊天')
      expect(container.querySelector('.dynamic-settings-conversation-row').getAttribute('aria-label')).toBe('分支 1：合成聊天')
      await act(async () => container.querySelector('.dynamic-settings-conversation-row').click())
      expect(container.querySelector('[aria-label="设定编辑视图"]')).toBeNull()
      expect(container.querySelector('[role="separator"]')).toBeNull()
      await act(async () => container.querySelector('[role="treeitem"]').click())
      expect(container.querySelector('[aria-label="设定编辑视图"]')).not.toBeNull()
      expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1)
      expect(container.querySelector('[role="separator"]').getAttribute('aria-valuenow')).toBe('737')
      expect(container.querySelector('input[aria-label="条目标题"]').value).toBe('偏好')
      expect(container.querySelector('.cm-content').textContent).toBe('喜欢茶。')
      await act(async () => button('设置').click())
      const ruleSwitch = container.querySelector('[aria-label="启用触发规则"]')
      if (ruleSwitch.getAttribute('aria-checked') === 'false') await act(async () => ruleSwitch.click())
      expect(container.querySelector('[aria-label="触发方式"]')).not.toBeNull()
      expect(container.textContent).toContain('关键词触发')
      await act(async () => button('正文').click())
      expect(container.querySelector('.cm-content').textContent).toBe('喜欢茶。')
      expect(container.querySelector('.setting-template-status')).toBeNull()
      await act(async () => container.querySelector('[aria-label="关闭详情"]').click())
      expect(container.querySelector('.is-closing').hasAttribute('inert')).toBe(true)
      await act(async () => new Promise(resolve => setTimeout(resolve, 200)))
      expect(container.querySelector('.dynamic-settings-editor-pane')).toBeNull()
      expect(container.querySelector('[role="separator"]')).toBeNull()
      await act(async () => container.querySelector('[role="treeitem"]').click())
      expect(container.querySelector('.dynamic-settings-editor-pane')).not.toBeNull()
      await act(async () => container.querySelector('[role="treeitem"]').click())
      expect(container.querySelector('.dynamic-settings-editor-pane')).not.toBeNull()
      await act(async () => container.querySelector('[role="tree"]').dispatchEvent(new MouseEvent('mousedown', { clientX: 32, bubbles: true })))
      await act(async () => new Promise(resolve => setTimeout(resolve, 200)))
      expect(container.querySelector('.dynamic-settings-editor-pane')).toBeNull()
      await act(async () => container.querySelector('[aria-label="返回对话列表"]').click())
      await act(async () => container.querySelector('.dynamic-settings-conversation-row').click())
      expect(container.querySelector('.dynamic-settings-editor-pane')).toBeNull()
      await act(async () => container.querySelector('[aria-label="返回对话列表"]').click())
      await act(async () => notify('conversations', 'synthetic-character', { status: 'ready', value: [] }))
      expect(container.textContent).toContain('还没有分支设定')
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('keeps branch-to-chat labels through search, activity reordering and deletion', async () => {
    let notify
    const library = { characterId: 'synthetic-character', name: '设定库', entries: [], groups: [],
      promptPositions: [], versions: [], activeVersionId: 'main', expandedGroupIds: [], listAllExpanded: false }
    const first = { sessionId: 'synthetic-chat-first', title: '第一段聊天', characterName: '合成角色',
      summary: '最后一条 AI\n回复', updatedAt: new Date().toISOString(), library }
    const second = { ...first, sessionId: 'synthetic-chat-second', title: '第二段聊天', summary: '另一段真实摘要' }
    const model = { readConversations: vi.fn().mockResolvedValue([first, second]),
      subscribe(listener) { notify = listener; return () => {} } }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<DynamicSettingsPanel characterId="synthetic-character" settingLibraries={model} />))
      const record = container.querySelector('.dynamic-settings-conversation-row')
      expect(record.querySelector('.dynamic-settings-conversation-copy strong').textContent).toBe('第一段聊天')
      expect(record.querySelector('.dynamic-settings-conversation-summary').textContent).toBe('最后一条 AI 回复')
      expect(record.querySelector('.dynamic-settings-conversation-identity .dynamic-settings-conversation-summary')).toBeNull()
      expect(record.querySelector('.dynamic-settings-conversation-identity .dynamic-settings-avatar')).not.toBeNull()
      expect(record.querySelector('.dynamic-settings-conversation-copy .dynamic-settings-branch-label').textContent).toBe('分支 1')
      expect(record.querySelector('.dynamic-settings-conversation-activity time')).not.toBeNull()
      expect(container.querySelector('.dynamic-settings-conversation-heading')).toBeNull()
      const input = container.querySelector('input')
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '第二段')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(container.querySelectorAll('.dynamic-settings-conversation-row')).toHaveLength(1)
      expect(container.querySelector('.dynamic-settings-branch-label').textContent).toBe('分支 2')
      await act(async () => notify('conversations', 'synthetic-character', { status: 'ready', value: [second, first] }))
      expect(container.querySelector('.dynamic-settings-branch-label').textContent).toBe('分支 2')
      await act(async () => notify('conversations', 'synthetic-character', { status: 'ready', value: [second] }))
      await act(async () => container.querySelector('.dynamic-settings-conversation-row').click())
      expect(container.querySelector('.dynamic-settings-detail-toolbar .dynamic-settings-branch-label').textContent).toBe('分支 2')
      expect(container.querySelector('.dynamic-settings-toolbar-copy').textContent).toBe('第二段聊天')
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('shows refresh errors instead of leaving the panel waiting forever', async () => {
    let notify
    const model = { readConversations: vi.fn().mockResolvedValue([]),
      subscribe(listener) { notify = listener; return () => {} } }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<DynamicSettingsPanel characterId="synthetic-character" settingLibraries={model} />))
      await act(async () => notify('conversations', 'synthetic-character', { status: 'error', error: '读取失败' }))
      // 失败面同时给文案与码：存储里只有一句话时码走兜底，但一定可见。
      const alert = container.querySelector('[role="alert"]')
      expect(alert?.textContent).toContain('读取失败')
      expect(alert?.textContent).toContain('eleckoi/internal')
    } finally {
      await act(async () => root.unmount())
    }
  })
})
