import React, { useState } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
import * as slots from '@deepseek-ai/dsh-client-ui-slots';
import * as store from '@deepseek-ai/dsh-client-store';
import { MobileHeader } from '../../src/mobile/MobileChrome.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';

installBrowserIconSprite();
const query = new URLSearchParams(location.search), mobile = !query.has('desktop');
document.documentElement.dataset.eleckoiMobile = String(mobile);
window.__ModuleLoader__ = { load(entry) {
  const modules = { react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
    '@deepseek-ai/dsh-client-ui-primitives': primitives, '@deepseek-ai/dsh-client-ui-slots': slots, '@deepseek-ai/dsh-client-store': store };
  const { PluginManagerPage, createPluginHeaderRef, IDLE_INSTALL, zh } = entry.factory(name => {
    if (!(name in modules)) throw Error('Unexpected plugin manager dependency: ' + name);
    return modules[name];
  });
  const ledger = { items: [], rows: new Set(), bundles: new Set() };
  const tabs = query.has('tabs') ? [{ id: 'synthetic-tab', label: '合成目录' }] : [];
  function Fixture() {
    const [revision, setRevision] = useState(0), [navigation, setNavigation] = useState({ view: { kind: 'list' }, tab: 'installed' });
    const [state, setState] = useState({ status: 'ready', refreshStatus: 'idle', busy: [], notice: null, install: IDLE_INSTALL,
      confirm: null, highlight: null, versions: {}, update: null,
      packages: Array.from({ length: 15 }, (_, i) => ({ name: '@synthetic/plugin-' + i, installed: true, official: false,
        enabled: false, availability: 'available', rows: [], meta: { name: '合成插件 ' + i, description: '用于插件页面的布局回归。' } })) });
    const noOperation = () => {}, t = (key, values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll('{' + name + '}', value), zh[key] || key);
    window.pluginHeaderFixture = { remount: () => setRevision(value => value + 1),
      refreshStyles: () => { const tag = document.querySelector('style[data-plugin="@deepseek-ai/dsh-client-ui-plugin-manager"]'); document.head.appendChild(tag.cloneNode(true)); tag.remove(); } };
    return <MainPageContext.Provider value={{ routeBusy: false, openDrawer: noOperation }}>
      <main id="eleckoi-root" className={mobile ? 'mobile-shell' : ''} data-mobile-panel={mobile ? 'plugins' : undefined} style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <section className={mobile ? 'mobile-page-seat' : ''} style={{ flex: 1, minHeight: 0 }}>
          {mobile && <MobileHeader title="插件" back={noOperation} />}
          <PluginManagerPage key={revision} createHeaderRef={createPluginHeaderRef} t={t} ensure={noOperation} refresh={noOperation}
            renderSlot={() => null} resolveText={text => text} useConfigurations={select => select({})} usePluginManager={select => select(state)}
            useConfigLedger={select => select(ledger)} useStore={select => select(navigation)} usePluginTabs={select => select(tabs)}
            useBundleDetails={select => select({})} useLocale={select => select({ active: 'zh' })}
            actions={{ setView: view => setNavigation(current => ({ ...current, view })), setTab: tab => setNavigation(current => ({ ...current, tab })) }}
            setEnabled={(name, enabled) => setState(current => ({ ...current, packages: current.packages.map(pkg => pkg.name === name ? { ...pkg, enabled } : pkg) }))} />
        </section>
      </main>
    </MainPageContext.Provider>;
  }
  createRoot(document.querySelector('#root')).render(<Fixture />);
} };
