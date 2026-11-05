import React from 'react';
import { createRoot } from 'react-dom/client';
import { WebSearchProvider } from '../../src/modules/agentTools/model/WebSearchContext.jsx';
import { WebSearchSettings } from '../../src/modules/agentTools/components/WebSearchSettings.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/modules/agentTools/styles/web-search-settings.css';
import '../../src/mobile/mobile-conversation-overlays.css';

let snapshot = { status: 'ready', mode: 'provider_native', fetchMode: 'http', writable: true, tavilyAvailable: true,
  apiKeyConfigured: false, apiKeyWritable: true, apiKeyRef: 'TAVILY_API_KEY', maxResults: 5, officialDeepSeekAvailable: true };
const listeners = new Set();
const calls = [];
let allowNavigation = true;
let failNextUpdate = false;
let instance = 0;
const publish = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
const model = { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  update: async patch => { calls.push(patch); if (failNextUpdate) { failNextUpdate = false; throw new Error('合成保存失败'); } publish(patch); },
  openPluginSettings: () => calls.push({ open: 'web-search' }),
  saveAndTest: async () => { calls.push({ credentialProvider: 'tavily' }); return { connection: { ok: true, plan: 'Test', used: 0, limit: 100 } }; } };
const root = createRoot(document.getElementById('root'));
function reopen() {
  root.render(<main style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}><WebSearchProvider model={model}><WebSearchSettings key={++instance}
    onBeforeOpenPluginSettings={() => { calls.push({ guard: true }); return allowNavigation; }}
    onOpenPluginSettings={() => calls.push({ closed: true })} /></WebSearchProvider></main>);
}
window.webSearchFixture = { calls, getSnapshot: () => snapshot, reopen, publish,
  setAllowNavigation: value => { allowNavigation = value; }, failNextUpdate: () => { failNextUpdate = true; } };
reopen();
