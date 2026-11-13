import React from 'react';
import { createRoot } from 'react-dom/client';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import * as libraries from '@eleckoi/dsh-client-html-resources/browser-libraries';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';
import { MessageBubble } from '../../src/ui/messages/MessageBubble.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { RichMessageRenderProvider } from '../../src/modules/authorFrontend/hooks/RichMessageRenderContext.jsx';
import { decorateRichDisplayReplacement } from '../../../../packages/shared/src/foundation/richMessage';
import { installElecKoiAuthorApi } from '@eleckoi/author-sdk/browser';
import '../../src/modules/chat/styles/chat-panel.css';

globalThis.React = React;
const ready = { status: 'ready', error: '' };
window.__ElecKoiHtmlResources = { assetsBaseUrl: new URL('./', document.baseURI).href, sdk: libraries,
  getSnapshot: () => ready, subscribe: () => () => {} };
let nativeVariables = { counter: 7 };
const variableListeners = new Set();
window.updateSyntheticVariables = value => { nativeVariables = structuredClone(value); for (const listener of variableListeners) listener(); };
const runtime = { mountDocument(target, conversationId, messageId) {
  const methods = {
    'context.current': () => ({ surface: 'message-renderer', scope: 'current-character', conversationId, messageId, characterId: 'synthetic-character' }),
    'app.getCapabilities': () => Object.keys(methods).map(method => ({ method })),
    'messages.getPage': () => ({ items: [{ id: messageId, conversationId, role: 'assistant', content: 'Synthetic message', variableState: {} }], hasMore: false }),
    'variables.getState': () => structuredClone(nativeVariables),
    'events.list': () => ({ items: ['messages.changed'] }),
  };
  installElecKoiAuthorApi(target, { request: async (method, params) => methods[method](params), on: (event, listener) => {
    if (event !== 'messages.changed') throw new Error('Synthetic event unavailable');
    const changed = () => listener({ conversationId, reason: 'edited', messageIds: [] });
    variableListeners.add(changed); return () => variableListeners.delete(changed);
  } });
  return () => target.dispatchEvent(new target.Event('pagehide'));
} };
const connection = { getSnapshot: () => runtime, subscribe: () => () => {} };
const view = { characterConfiguration: { scriptRuntimeConnection: connection } };
const root = createRoot(document.querySelector('#root'));
window.renderPresentation = ({ enabled = false, native = false, key = 'first', source } = {}) => {
  nativeVariables = { counter: 7 };
  const narrative = Array.from({ length: 18 }, (_, index) => `Synthetic narrative paragraph ${index}.`).join('\n\n');
  const message = { id: 'synthetic-reply', conversationId: key, role: 'assistant', status: 'complete',
    content: narrative + '\n\n[TOP]\n\n[MIDDLE]\n\n[BOTTOM]' };
  message.displayContent = source ? decorateRichDisplayReplacement(source) : narrative + ['TOP', 'MIDDLE', 'BOTTOM'].map(name => decorateRichDisplayReplacement(
    `<!doctype html><html><head>${native ? '<meta name="eleckoi-author-api" content="0.1.0">' : ''}
    <style>html,body{margin:0;padding:0}.card{height:600px;background:#123456;color:#fff}</style></head>
    <body><section class="card">Synthetic ${name} card${!native && name === 'BOTTOM' ? '<output data-native-variable></output>' : ''}</section>
    ${!native && name === 'BOTTOM' ? `<script type="module">
      window.syntheticModuleOrder = ['first'];
      document.addEventListener('DOMContentLoaded', () => syntheticModuleOrder.push('dom-ready'));
      await errorCatched(async () => {
        await waitGlobalInitialized('Mvu');
        const render = () => { document.querySelector('[data-native-variable]').textContent = String(getAllVariables().stat_data.counter); };
        render(); eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, render);
      })();
      await new Promise(() => {});
    </script><script type="module">syntheticModuleOrder.push('second')</script>` : ''}</body></html>`)).join('\n');
  root.render(<MainPageContext.Provider value={view}><OfficialMarkdownProvider component={MarkdownText}>
    <section className="chat-panel view-chat layout-roleplay" style={{ height: '100vh' }}>
      <div className="chat-conversation-body"><div className="message-area layout-roleplay" data-conversation-scroll="">
        <div className="chat-transcript-region">
          <RichMessageRenderProvider key={key} messages={[message]} enabled={enabled} floorLimit={1}>
            <MessageBubble message={message} />
          </RichMessageRenderProvider>
        </div>
        <div className="chat-composer-region" data-composer-seat=""><textarea aria-label="Synthetic composer" /></div>
      </div></div>
    </section>
  </OfficialMarkdownProvider></MainPageContext.Provider>);
};
