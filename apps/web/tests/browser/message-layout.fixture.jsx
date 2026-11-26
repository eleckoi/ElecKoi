import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';
import { MessageBubble } from '../../src/ui/messages/MessageBubble.jsx';
import { chatDisplayCssVariables } from '../../src/modules/appearance/preferences/chatDisplay.js';
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from '@shared/contracts/settings/schemas';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/styles/base.css';
import '../../src/modules/chat/styles/chat-panel.css';
import '../../src/modules/chat/styles/roleplay-style.css';
import '../../src/ui/styles/avatar.css';
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
  const layout = query.get('layout') || 'roleplay', shape = query.get('shape') || 'portrait';
  const scene = query.has('scene');
  const avatar = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  if (scene) options[0] = { ...options[0], segments: [
    { id: 'one', kind: 'speech', speakerName: '合成发言角色一', speakerAvatar: avatar, text: '第一句' },
    { id: 'two', kind: 'speech', speakerName: '合成发言角色二', speakerAvatar: avatar, text: '第二句' },
  ] };
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
        <div className="chat-conversation-body"><div className={`chat-panel${scene ? ' layout-' + layout : ''}${query.has('assistant-bubble') ? ' assistant-bubble-enabled' : ''}`}
          style={scene ? chatDisplayCssVariables(layout, { ...DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles[layout], avatar_shape: shape }) : undefined}
          data-roleplay-bubbles={query.has('bubbles') || undefined}>
          <header className="chat-header">合成聊天</header>
          <div className="message-area layout-roleplay">
            <div className="message-flow"><div className="message-flow-row">
            <MessageBubble message={{ id: opening ? 'opening' : 'synthetic-message', role: query.get('role') || 'assistant', pending: query.has('streaming'), content: opening ? current.content : sample,
              ...(opening ? { openingOptions: options, selectedOpeningId: selected, canChangeOpening: true } : {}) }}
              name="合成角色" layoutMode={layout} avatarShape={shape} floorNumber={opening ? 0 : undefined}
              onSelectOpening={(_message, id) => setSelected(id)} onEdit={() => {}} />
            {scene && <MessageBubble message={{ id: 'regular', role: 'assistant', content: '一般消息' }}
              avatar={avatar} name="对照角色" layoutMode={layout} avatarShape={shape} />}
            </div></div>
          </div>
        </div></div>
      </section>
    </main>
  </OfficialMarkdownProvider>
  );
}
createRoot(document.querySelector('#eleckoi-root')).render(<Fixture />);
