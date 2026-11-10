// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { officialLocale } from '../../../../tests/helpers/officialLocale.js';
import { ProductLocaleProvider } from '../../src/app/i18n/ProductLocaleContext.jsx';
import { localizeUiCopy } from '../../src/app/i18n/productCopy.js';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileSettingsPage } from '../../src/mobile/MobileSettingsPage.jsx';
import { SettingsPanel, UserProfileSettings } from '../../src/modules/settings/components/SettingsPanel.jsx';
import { FailureAlert } from '../../src/ui/ui/FailureAlert.jsx';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from '@shared/contracts/settings/schemas';
import { addableProviderItems, configurationItems } from '../../src/modules/models/model/modelProviderCatalog.js';
import { reasoningEffortLabel } from '../../src/modules/models/model/modelReasoningOptions.js';
import { WithOfficialMarkdown } from '../helpers/officialMarkdown.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;
const roots = [];
const locales = ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt'];
const titles = ['聊天显示', 'Chat display', 'チャット表示', 'Visualización del chat', 'Affichage du chat', 'Chat-Anzeige', 'Отображение чата', 'Exibição do chat'];
function render(locale, children) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push([root, container]);
  act(() => root.render(<ProductLocaleProvider locale={locale}><WithOfficialMarkdown>{children}</WithOfficialMarkdown></ProductLocaleProvider>));
  return container;
}
afterEach(() => { for (const [root, container] of roots.splice(0)) { act(() => root.unmount()); container.remove(); } });

describe('product surfaces using the official eight-language runtime', () => {
  it.each(locales)('switches the existing settings and static options to %s without remounting', language => {
    const locale = officialLocale();
    const host = render(locale, <SettingsPanel activePage="chat" onPageChange={() => {}}
      chatDisplay={DEFAULT_CHAT_DISPLAY_PREFERENCES} onChatDisplayChange={() => {}}
      persona={{ user_name: '取消', assistant_name: '角色名保持中文' }} renderLanguageSettings={() => <button>native-language-control</button>}
      renderLayout={({ sidePanel, mainPanel }) => <>{sidePanel}{mainPanel}</>} />);
    const page = host.querySelector('.chat-display-settings-page');
    const category = host.querySelector('.app-settings-sidebar');
    act(() => locale.setLocale(language));
    expect(host.querySelector('.chat-display-settings-page')).toBe(page);
    expect(host.querySelector('h1').textContent).toBe(titles[locales.indexOf(language)]);
    const t = locale.bind('eleckoi.ui');
    expect(category.textContent).toContain(t('用户资料'));
    expect(host.querySelector('[data-group="typography"] summary').textContent).toContain(t('字号与字体'));
    expect(host.querySelector('[data-group="typography"] summary').textContent).toContain(t('正文、代码与终端的字体和字号'));
    expect(host.querySelector('[data-group="language"]')).toBe([...host.querySelectorAll('.ec-group')].at(-1));
    expect(host.querySelector('[data-group="language"] summary').textContent).toContain(locale.getSnapshot().locales.find(row => row.id === language).label);
    expect(page.textContent).toContain('角色名保持中文');
    expect(page.textContent).toContain('取消');
  });

  it('keeps the edited input, focus and user text while the interface changes language', () => {
    const locale = officialLocale();
    const persist = vi.fn();
    const host = render(locale, <UserProfileSettings persona={{ user_name: '原名字' }} onUpdateUserProfile={persist} />);
    const input = host.querySelector('input[type="text"]');
    input.focus();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '取消 · 未保存草稿');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    for (const language of locales) act(() => locale.setLocale(language));
    expect(host.querySelector('input[type="text"]')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('取消 · 未保存草稿');
    expect(persist).not.toHaveBeenCalled();
  });

  it.each(locales)('uses the same language in the shared mobile settings: %s', language => {
    const locale = officialLocale();
    const view = { settingsPage: 'chat', setSettingsPage() {},
      appearance: { chatDisplay: DEFAULT_CHAT_DISPLAY_PREFERENCES, changeChatDisplay() {} },
      chat: { persona: { user_name: '合成用户' }, notify() {} },
      registerBackHandler: () => () => {}, scrollPositions: new Map(), guardRef: { current: null },
      renderLanguageSettings: () => <button>native-language-control</button>, goBack() {}, selectPanel() {} };
    const host = render(locale, <MainPageContext.Provider value={view}><MobileSettingsPage /></MainPageContext.Provider>);
    act(() => locale.setLocale(language));
    const t = locale.bind('eleckoi.ui');
    expect(host.textContent).toContain(t('聊天显示'));
    expect(host.textContent).toContain(t('字号与字体'));
    expect(host.textContent).toContain(t('富消息'));
    expect(host.querySelector('.mobile-settings-switch-row').getAttribute('aria-label')).toBe(t('生成统计'));
  });

  it('localizes failure copy and catalog labels without rewriting evidence or custom model names', () => {
    const locale = officialLocale();
    const path = 'D:\\示例\\取消.json';
    const failure = new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, 'original diagnostic', { what: '设定库', path });
    const host = render(locale, <FailureAlert failure={failure} />);
    act(() => locale.setLocale('en'));
    expect(host.textContent).toContain('Lorebook');
    expect(host.textContent).toContain(path);
    expect(host.textContent).toContain(ELECKOI_FAILURE_CODES.lookupNotFound);
    expect(failure.details).toEqual({ what: '设定库', path });
    const t = locale.bind('eleckoi.ui');
    expect(configurationItems([{ id: 'custom-route', provider: 'custom', name: '取消', model: 'model/id' }], [], t)[0].label).toBe('取消');
    expect(reasoningEffortLabel('low', t)).not.toBe('低');
    expect(addableProviderItems([], t)[0].label).toBe(t('自定义提供商'));
    expect(localizeUiCopy([{ id: 'roleplay', value: 'off', label: '角色扮演' }], () => 'translated'))
      .toEqual([{ id: 'roleplay', value: 'off', label: 'translated' }]);
  });
});

it('ships identical complete dictionaries with matching interpolation parameters', () => {
  const dictionaries = Object.fromEntries(locales.map(language => [language,
    JSON.parse(readFileSync(resolve('apps/web/src/app/i18n/locales', `${language}.json`), 'utf8'))]));
  const keys = Object.keys(dictionaries.zh).sort();
  const params = text => [...text.matchAll(/\{([A-Za-z]\w*)\}/g)].map(match => match[1]).sort();
  for (const language of locales) {
    expect(Object.keys(dictionaries[language]).sort(), language).toEqual(keys);
    for (const key of keys) {
      expect(typeof dictionaries[language][key]).toBe('string');
      expect(params(dictionaries[language][key]), `${language}: ${key}`).toEqual(params(key));
      expect(dictionaries[language][key], `${language}: ${key}`).not.toMatch(/LINEBREAK|QXZ|ZXQ|XXQ|__\d+__|Q\d{5}/i);
      expect((dictionaries[language][key].match(/\n/g) || []).length, `${language}: ${key}`).toBe((key.match(/\n/g) || []).length);
    }
  }
});

it('registers every literal product translation key used by the client source', () => {
  const dictionary = JSON.parse(readFileSync(resolve('apps/web/src/app/i18n/locales/zh.json'), 'utf8'));
  const visit = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return ['tests', 'assets', 'i18n', 'node_modules', 'lib'].includes(entry.name) ? [] : visit(path);
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
  for (const file of [...visit(resolve('apps/web/src')), ...visit(resolve('packages/client/features')), ...visit(resolve('packages/client/mobile'))]) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\btUi\(\s*("(?:\\.|[^"\\])*")/g)) {
      const key = JSON.parse(match[1]);
      expect(Object.hasOwn(dictionary, key), `${file}: ${key}`).toBe(true);
    }
  }
});
