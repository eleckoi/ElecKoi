import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';
import { MessageBubble } from '../../src/ui/messages/MessageBubble.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/styles/base.css';
import '../../src/modules/chat/styles/chat-panel.css';
import '../../src/modules/chat/styles/roleplay-style.css';
import '../../src/mobile/mobile.css';

const query = new URLSearchParams(location.search);
const mobile = !query.has('desktop');
document.documentElement.dataset.eleckoiMobile = String(mobile);
const sample = [
  '“合成对白”以及很长的正文。'.repeat(12),
  '# 合成标题与长行内代码 `' + 'synthetic-token-'.repeat(24) + '`',
  '- 合成长单词 ' + 'synthetic'.repeat(80),
  ['| 合成类型 | 合成示例 | 合成备注 | 合成说明 |',
    '| --- | --- | --- | --- |',
    '| 合成内容 | “合成引号” | ' + 'synthetic-note-'.repeat(28) + ' | 合成说明 |'].join('\n'),
  '```json\n{"synthetic":"' + 'long-value-'.repeat(50) + '"}\n```',
].join('\n\n');
function Fixture() {
  const options = [{ id: 'short', content: '你好啊' }, { id: 'blank', content: '' }, { id: 'long', content: sample }];
  const [selected, setSelected] = useState(query.get('opening') || 'short');
  const opening = query.has('opening');
  const current = options.find(option => option.id === selected);
  const theme = query.get('theme') || 'light';
  document.documentElement.dataset.theme = theme;
  document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark');
  return (
  <OfficialMarkdownProvider component={MarkdownText}>
    <main className={mobile ? 'mobile-shell' : 'main-window-shell'}>
      <section className={mobile ? 'mobile-conversation-page' : 'main-panel-content'}>
        <div className="chat-conversation-body"><div className="chat-panel" data-roleplay-bubbles={query.has('bubbles') || undefined}>
          <header className="chat-header">合成聊天</header>
          <div className="message-area layout-roleplay">
            <div className="message-flow"><div className="message-flow-row">
            <MessageBubble message={{ id: opening ? 'opening' : 'synthetic-message', role: query.get('role') || 'assistant', pending: query.has('streaming'), content: opening ? current.content : sample,
              ...(opening ? { openingOptions: options, selectedOpeningId: selected, canChangeOpening: true } : {}) }}
              name="合成角色" layoutMode={query.get('layout') || 'roleplay'} avatarShape={query.get('shape') || 'portrait'} floorNumber={opening ? 0 : undefined}
              onSelectOpening={(_message, id) => setSelected(id)} onEdit={() => {}} />
            </div></div>
          </div>
        </div></div>
      </section>
    </main>
  </OfficialMarkdownProvider>
  );
}
createRoot(document.querySelector('#eleckoi-root')).render(<Fixture />);
