// 会话列表面板必须自己声明高度，不能依赖“侧栏外面套了几层插槽锚点”。
//
// v0.2.0 时侧栏内容只有一层锚点
// （`<div data-slot="sidebar.workspaces" style="display: contents">`），
// client-shell.css 的 `.side-panel-content > *` 还够得着面板；v0.2.1 起又套了一层：
//
//   aside.conversation-list
//     ← div[data-slot="eleckoi.conversation.list"]   display: contents
//       ← div[data-slot="sidebar.workspaces"]        display: contents
//         ← div.side-panel-content                   height: 944
//
// 于是直接子代规则只够到内层锚点，面板退化成内容高度（实测 54px），
// `.conversation-scroll` 拿不到有界高度、会话多了列表不再内部滚动。
// 作者对其余侧栏面板（character-list-panel、plugin-list-panel）的写法是面板自己声明
// `height: 100%; max-height: 100%; overflow: hidden`；会话列表漏了这一处，这里补齐并钉住。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const conversationStyles = read('../../src/modules/chat/styles/conversation-list.css');
const shellStyles = read('../../src/app/windows/shell/styles/client-shell.css');

describe('conversation list panel height', () => {
  it('面板自己声明有界高度，滚动容器才有界', () => {
    expect(conversationStyles).toMatch(
      /\.conversation-list\s*\{[^}]*height:\s*100%;[^}]*max-height:\s*100%;[^}]*overflow:\s*hidden;/,
    );
    expect(conversationStyles).toMatch(
      /\.conversation-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/,
    );
  });

  it('侧栏填充规则不再试图穿透插槽锚点（层数会变，穿了也会失效）', () => {
    const selectors = [...shellStyles.matchAll(/([^{}]+)\{/g)].map(match => match[1]);
    expect(selectors.filter(selector => selector.includes('.conversation-list')).join('\n')).not.toMatch(/\[data-slot/);
  });
});
