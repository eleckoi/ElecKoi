// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import React, { act } from 'react';
import * as ReactDom from 'react-dom';
import * as Jsx from 'react/jsx-runtime';
import * as Slots from '@deepseek-ai/dsh-client-ui-slots';
import * as Store from '@deepseek-ai/dsh-client-store';
import { createRequire } from 'node:module';
import { createRoot } from 'react-dom/client';
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
import { describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { readWorkspacePackages } from '../workspace-packages.mjs';
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const bundles = JSON.parse(readFileSync(resolve('apps/desktop/resources/dsh/runtime-manifest.json'), 'utf8')).desktopProfile.bundles;
const packagePaths = new Map(readWorkspacePackages(process.cwd()).map(({ manifest, directory }) => [manifest.name, directory]));
const bundleRoot = (name) => {
    const directory = packagePaths.get(name);
    if (!directory) throw new Error(`Missing workspace bundle: ${name}`);
    return resolve(directory);
};
const bundleManifest = (name) => JSON.parse(readFileSync(resolve(bundleRoot(name), 'package.json'), 'utf8'));
const developerInterfaces = (name) => bundleManifest(name).eleckoi?.developerInterfaces ?? [];
function packageSource(name) {
    const files = [];
    const visit = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = resolve(directory, entry.name);
            if (entry.isDirectory())
                visit(path);
            else if (/\.(?:[cm]?js|tsx?|d\.ts)$/.test(entry.name))
                files.push(readFileSync(path, 'utf8'));
        }
    };
    visit(resolve(bundleRoot(name), 'src'));
    // Bundle contributions can be implemented by an explicitly inserted workspace package.
    const patch = bundleManifest(name).dsh?.bundle?.patch;
    if (patch) {
        const rows = parseYaml(readFileSync(resolve(bundleRoot(name), patch), 'utf8'));
        const visitInserted = entries => {
            for (const entry of entries) {
                for (const inserted of entry.insert ?? []) {
                    if (packagePaths.has(inserted.name)) visit(resolve(bundleRoot(inserted.name), 'src'));
                }
                if (entry.group) visitInserted(entry.group);
            }
        };
        visitInserted(rows);
    }
    return files.join('\n');
}
function inventory(face) {
    let registration;
    const entries = [];
    runInNewContext(readFileSync(resolve('packages/client/features/dsh-client-shell/src/client.js'), 'utf8'), {
        AbortController,
        window: { __ModuleLoader__: { load: (value) => { registration = value; } } },
    });
    registration.factory((name) => name === 'react' ? React : primitives).apply({
        inject: () => {},
        effect: () => { },
        reflect: { provide: () => () => {} },
        slots: {
            provideRoot: () => () => {},
            subscribe: () => () => {},
            entries: () => [],
            entriesOfSlot: () => [{ options: { key: 'plugins' }, inject: () => face }],
            inject: (_name, factory) => factory(),
            register: (options, component) => { entries.push({ options, component }); return () => { }; },
        },
    });
    return entries;
}
async function withDetail(run) {
    let snapshot = {
        packages: bundles.map(name => ({ name, enabled: true, developerInterfaces: developerInterfaces(name), rows: [{
                    rowId: 'example', entryId: 'example-entry', moduleName: name, enabled: true, phase: 'active',
                    meta: { title: { zh: '测试组件' } },
                }] })), busy: [],
    };
    const listeners = new Set();
    const face = {
        hooks: { pluginManager: {
                getSnapshot: () => snapshot,
                subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
            } },
        resolveText: (value) => typeof value === 'string' ? value : value.zh,
        setRowEnabled: vi.fn(),
    };
    const entries = inventory(face).filter(entry => entry.options.name === 'plugins.bundle.config');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let current = bundles[0];
    const show = async (name) => {
        current = name;
        const entry = entries.find(candidate => candidate.options.key === name);
        expect(entry, name).toBeDefined();
        await act(async () => root.render(entry.component()));
    };
    const update = async (row, protection = {}, busy = []) => act(async () => {
        snapshot = {
            packages: [{ name: current, enabled: true, developerInterfaces: developerInterfaces(current), ...protection, rows: row ? [row] : [] }],
            busy,
        };
        listeners.forEach(listener => listener());
    });
    try {
        await run(container, show, update, face);
    }
    finally {
        await act(async () => root.unmount());
        container.remove();
    }
}
describe('ElecKoi built-in bundle details', () => {
    it('keeps a shipped bundle in the official list and detail while disabled and allows enabling it again', async () => {
        let plugin, page, initialState;
        runInNewContext(readFileSync(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-client-ui-plugin-manager/client'), 'utf8'), {
            window: { __ModuleLoader__: { load: value => { plugin = value; } } },
        });
        const dependencies = { react: React, 'react-dom': ReactDom, 'react/jsx-runtime': Jsx,
            '@deepseek-ai/dsh-client-ui-primitives': primitives, '@deepseek-ai/dsh-client-ui-slots': Slots,
            '@deepseek-ai/dsh-client-store': Store };
        plugin.factory(name => dependencies[name]).apply({
            remoteAccess: { whenAccess: (_name, run) => { for (const _dispose of run()) {} } }, remote: { $on: () => () => {} }, on: () => () => {}, layout: { panelInfo: { subscribe: () => () => {}, getSnapshot: () => ({ activePanelId: 'plugins' }) } }, reflect: { provide: () => () => {} }, provide: () => {}, effect: () => {}, locale: { bind: () => () => '', resolveText: value => value },
            configForms: { describe: () => ({}) },
            slots: { inject: (_name, register) => { const result = register(); if (result?.next) result.next(); },
                register: (options, component) => { if (options.name === 'main') { page = component; initialState = options.inject().hooks.pluginManager.getSnapshot(); } return () => {}; } },
        });
        const node = document.createElement('div'); document.body.append(node);
        const root = createRoot(node);
        const name = '@eleckoi/dsh-client-characters';
        let view = { kind: 'list' }, state = { ...initialState, status: 'ready', packages: [{ name,
                enabled: true, installed: false, official: false, availability: 'installation', optional: false, rows: [], overrides: [], meta: { title: '合成插件' } }] };
        const render = () => root.render(React.createElement(page, {
            t: (key, values) => key === 'enableToggle' ? `启用 ${values.name}` : key,
            ensure: () => {}, renderSlot: () => null, resolveText: value => value,
            useConfigurations: select => select({}), configForm: () => {},
            useBundleDetails: select => select({ entries: {} }), useLocale: select => select({ active: 'zh' }), loadDetail: () => {}, retryDetail: () => {}, usePluginTabs: select => select([]),
            usePluginManager: select => select(state), useConfigLedger: select => select({ items: [], bundles: new Set(), rows: new Set() }),
            useStore: select => select({ view, tab: 'installed' }), actions: { setTab() {}, setView: next => { view = next; render(); } },
            setEnabled: (id, enabled) => { expect(id).toBe(name); state = { ...state, packages: [{ ...state.packages[0], enabled }] }; render(); },
        }));
        try {
            await act(async () => render());
            await act(async () => node.querySelector('[role="switch"]').click());
            expect(node.querySelector('[data-plugin-package]')?.dataset.pluginStatus).toBe('disabled');
            await act(async () => node.querySelector('[data-plugin-package] button').click());
            expect(node.querySelector('[data-plugin-detail]')).not.toBeNull();
            expect(node.querySelector('[role="switch"]').getAttribute('aria-checked')).toBe('false');
            await act(async () => node.querySelector('[role="switch"]').click());
            expect(state.packages[0].enabled).toBe(true);
            expect(node.querySelector('[role="switch"]').getAttribute('aria-checked')).toBe('true');
        } finally { await act(async () => root.unmount()); node.remove(); }
    });
    it('keeps five product cards below experimental plugins, reserves Installed for users, and returns through each More list', async () => {
        let plugin, page, initialState;
        runInNewContext(readFileSync(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-client-ui-plugin-manager/client'), 'utf8'), {
            window: { __ModuleLoader__: { load: value => { plugin = value; } } },
        });
        const dependencies = { react: React, 'react-dom': ReactDom, 'react/jsx-runtime': Jsx,
            '@deepseek-ai/dsh-client-ui-primitives': primitives, '@deepseek-ai/dsh-client-ui-slots': Slots,
            '@deepseek-ai/dsh-client-store': Store };
        plugin.factory(name => dependencies[name]).apply({
            remoteAccess: { whenAccess: (_name, run) => { for (const _dispose of run()) {} } }, remote: { $on: () => () => {} }, on: () => () => {}, layout: { panelInfo: { subscribe: () => () => {}, getSnapshot: () => ({ activePanelId: 'plugins' }) } }, reflect: { provide: () => () => {} }, provide: () => {}, effect: () => {}, locale: { bind: () => () => '', resolveText: value => value }, configForms: { describe: () => ({}) },
            slots: { inject: (_name, register) => { const result = register(); if (result?.next) result.next(); },
                register: (options, component) => { if (options.name === 'main') { page = component; initialState = options.inject().hooks.pluginManager.getSnapshot(); } return () => {}; } },
        });
        const makePackage = (name, options = {}) => ({ name, enabled: true, installed: false, official: false,
            availability: 'installation', optional: false, rows: [{ rowId: 'synthetic-row', entryId: `entry:${name}`,
                moduleName: name, enabled: true, phase: 'active' }], overrides: [], meta: { title: name }, ...options });
        const userNames = ['@test/user-plugin', '@eleckoi/user-installed-synthetic', '@test/missing-user-plugin'];
        const experimental = '@deepseek-ai/dsh-experimental-agent-team-profile';
        let view = { kind: 'list' };
        let state = { ...initialState, status: 'ready', packages: [
            ...[...bundles].reverse().map(name => makePackage(name)),
            makePackage(experimental, { official: true, optional: true }),
            ...userNames.map((name, index) => makePackage(name, { installed: true, availability: index === 2 ? 'missing' : 'profile' })),
            makePackage('@test/uninstalled-bundle', { availability: 'profile' }),
        ] };
        const node = document.createElement('div'); document.body.append(node);
        const root = createRoot(node);
        const render = () => root.render(React.createElement(page, {
            t: key => key, ensure: () => {}, renderSlot: () => null, resolveText: value => value,
            useConfigurations: select => select({}), configForm: () => {}, useBundleDetails: select => select({ entries: {} }), useLocale: select => select({ active: 'zh' }), loadDetail: () => {}, retryDetail: () => {}, usePluginTabs: select => select([]),
            usePluginManager: select => select(state),
            useConfigLedger: select => select({ items: [], bundles: new Set(), rows: new Set(bundles.map(name => `${name}#synthetic-row`)) }),
            useStore: select => select({ view, tab: 'installed' }), actions: { setTab() {}, setView: next => { view = next; render(); } },
            setEnabled: (name, enabled) => { state = { ...state, packages: state.packages.map(pkg => pkg.name === name ? { ...pkg, enabled } : pkg) }; render(); },
        }));
        const cards = group => [...node.querySelectorAll(`[data-plugin-group="${group}"] [data-plugin-package]`)].map(card => card.dataset.pluginPackage);
        const click = async selector => act(async () => { const button = node.querySelector(selector); expect(button, selector).not.toBeNull(); button.click(); });
        try {
            await act(async () => render());
            expect([...node.querySelectorAll('[data-plugin-group]')].map(group => group.dataset.pluginGroup)).toEqual(['extensions', 'eleckoi', 'bundles']);
            const featured = ['@eleckoi/dsh-client-characters', '@eleckoi/dsh-client-presets', '@eleckoi/dsh-client-creator-studio', '@eleckoi/dsh-client-models', '@eleckoi/dsh-client-web-search'];
            expect(cards('eleckoi')).toEqual(featured);
            expect(cards('bundles')).toEqual(userNames);
            await click('[data-plugin-group="eleckoi"] [role="switch"]');
            expect(cards('eleckoi')).toEqual(featured);
            await click('[data-plugin-group="eleckoi"] button');
            expect(view).toEqual({ kind: 'eleckoi-more' });
            expect(new Set(cards('eleckoi-more'))).toEqual(new Set(bundles));
            const extra = '@eleckoi/dsh-client-author';
            await click(`[data-plugin-package="${extra}"] button`);
            expect(view).toEqual({ kind: 'package', name: extra, from: 'eleckoi-more' });
            expect(node.querySelector('[data-plugin-detail]')).not.toBeNull();
            await click('[aria-label="configureRow"]');
            expect(view).toEqual({ kind: 'row', name: extra, rowId: 'synthetic-row', from: 'eleckoi-more' });
            await click('[aria-label="backToPackage"]');
            expect(view).toEqual({ kind: 'package', name: extra, from: 'eleckoi-more' });
            await click('[aria-label="backToPackage"]');
            expect(view).toEqual({ kind: 'eleckoi-more' });
            await click('[aria-label="backToList"]');
            await click('[data-plugin-group="extensions"] button');
            expect(view).toEqual({ kind: 'more' });
            expect(cards('more')).toEqual([experimental]);
            await click(`[data-plugin-package="${experimental}"] button`);
            await click('[aria-label="backToPackage"]');
            expect(view).toEqual({ kind: 'more' });
            expect(cards('more')).toEqual([experimental]);
        } finally { await act(async () => root.unmount()); node.remove(); }
    });
    it('publishes shipped bundles even when they are not installed into the user profile', () => {
        let registration;
        let rootComponent;
        let firstEffect = true;
        const effects = [];
        const observable = (value) => ({ subscribe: () => () => { }, getSnapshot: () => value });
        const face = {
            hooks: {
                pluginManager: observable({ status: 'ready', packages: [...bundles.map(name => ({ name, installed: false, optional: false, enabled: name !== bundles.at(-1), meta: { title: { zh: name } } })),
                    { name: '@eleckoi/user-installed-synthetic', installed: true, meta: { title: { zh: '合成用户插件' } } },
                    { name: '@test/uninstalled-bundle', installed: false, meta: { title: { zh: '合成未安装插件' } } },
                ] }),
                configLedger: observable({ items: [] }),
            }, resolveText: (value) => value.zh,
        };
        const slots = {
            provideRoot: () => () => { }, subscribe: () => () => { }, getVersion: () => 1, entries: () => [],
            entriesOfSlot: (name) => name === 'main' ? [{ options: { key: 'plugins' }, inject: () => face }] : [],
            inject: (_name, register) => register(),
            register: (options, component) => { if (options.name === 'root')
                rootComponent = component; return () => { }; },
        };
        const react = {
            lazy: () => () => null, createElement: () => null,
            useState: () => [null, () => { }], useMemo: (calculate) => calculate(),
            useSyncExternalStore: (_subscribe, read) => read(),
            useEffect: (run, deps) => effects.push({ run, deps }),
        };
        const original = window.__ModuleLoader__;
        try {
            ;
            window.__ModuleLoader__ = { load: (value) => { registration = value; } };
            runInNewContext(readFileSync(resolve('packages/client/features/dsh-client-shell/src/client.js'), 'utf8'), { window, CustomEvent, AbortController });
            registration.factory((name) => name === 'react' ? react : primitives).apply({
                inject: () => {},
                slots, reflect: { provide: () => () => { } },
                effect: (run) => { if (firstEffect) {
                    firstEffect = false;
                    run();
                } },
            });
            rootComponent({
                slots,
                layout: {
                    panelInfo: observable({ activePanelId: 'plugins' }),
                    rightbarInfo: observable({ shown: false }),
                    setViewportWidth: () => { },
                    setRightbar: () => { },
                },
                locale: { ...observable({ revision: 0 }), bind: () => key => key },
                renderSlot: () => null,
            });
            let published;
            const receive = (event) => { published = event.detail; };
            window.addEventListener('eleckoi:dsh-plugins:state', receive);
            const dispose = effects.find(effect => effect.deps?.[1] === slots).run();
            expect(published.entries.map((entry) => entry.id)).toEqual([...bundles, '@eleckoi/user-installed-synthetic']);
            expect(published.entries.filter(entry => bundles.includes(entry.id)).every((entry) => entry.kind === 'package' && entry.group === 'eleckoi')).toBe(true);
            expect(published.entries.find(entry => entry.id === '@eleckoi/user-installed-synthetic')?.group).toBe('installed');
            dispose();
            window.removeEventListener('eleckoi:dsh-plugins:state', receive);
        }
        finally {
            window.__ModuleLoader__ = original;
        }
    });
    it('uses actual declared bundle identities without fabricated plugin items', () => {
        const entries = inventory({});
        expect(entries.filter(entry => entry.options.name === 'plugins.item')).toHaveLength(0);
        expect(entries.filter(entry => entry.options.name === 'plugins.bundle.config').map(entry => entry.options.key)).toEqual(bundles.filter(name => name !== '@eleckoi/dsh-auto-illustration'));
    });
    it('projects real observable phases, counts and enable actions', async () => {
        await withDetail(async (container, show, update, face) => {
            await show(bundles[0]);
            expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe('运行组件 1');
            expect(container.textContent).toContain('运行中');
            expect(container.textContent).not.toContain('Client');
            await act(async () => container.querySelector('[role="switch"]').click());
            expect(face.setRowEnabled).toHaveBeenCalledWith('example-entry', false);
            for (const [phase, label] of [['loading', '加载中'], ['failed', '加载失败'], ['unloading', '卸载中'], [null, '未运行']]) {
                await update({ rowId: 'actual', entryId: 'actual', moduleName: bundles[0], enabled: true, phase });
                expect(container.textContent).toContain(label);
                expect(container.querySelector('[data-plugin-row]')?.getAttribute('data-plugin-row')).toBe('actual');
            }
            await update({ rowId: 'off', entryId: 'off', moduleName: bundles[0], enabled: false, phase: null });
            expect(container.textContent).toContain('已停用');
            await update(null);
            expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe('运行组件 0');
        });
    });
    it('respects core protection and active management operations', async () => {
        await withDetail(async (container, show, update, face) => {
            await show(bundles[0]);
            for (const protection of [{ readOnlyReason: 'management-required' }, {}]) {
                await update({ rowId: 'core', entryId: 'core', moduleName: bundles[0], enabled: true, phase: 'active' }, protection, protection.readOnlyReason ? [] : ['row:core']);
                expect(container.querySelector('[role="switch"]')?.disabled).toBe(true);
                await act(async () => container.querySelector('[role="switch"]').click());
            }
            expect(face.setRowEnabled).not.toHaveBeenCalled();
        });
    });
    it('keeps the independent illustration configuration from being shadowed by generic package details', () => {
        const name = '@eleckoi/dsh-auto-illustration';
        expect(inventory({}).some(entry => entry.options.name === 'plugins.bundle.config' && entry.options.key === name)).toBe(false);
        let plugin;
        runInNewContext(readFileSync(resolve(bundleRoot(name), 'src/client.js'), 'utf8'), {
            window: { __ModuleLoader__: { load: value => { plugin = value; } } },
        });
        const entries = [];
        plugin.factory(() => React).apply({ eleckoiModels: {}, eleckoiPresets: {}, slots: {
            inject: (_slot, register) => register(),
            register: (options, component) => { entries.push({ options, component }); return () => {}; },
        } });
        expect(entries).toHaveLength(1);
        expect(entries[0].options).toMatchObject({ name: 'plugins.bundle.config', key: name, registrant: name });
    });
    it('separates interfaces by their actual declaring package and supports keyboard tabs', async () => {
        await withDetail(async (container, show) => {
            const ids = new Set();
            const sharedDetails = bundles.filter(name => name !== '@eleckoi/dsh-auto-illustration');
            for (const name of sharedDetails) {
                await show(name);
                const declared = developerInterfaces(name);
                const tabs = container.querySelectorAll('[role="tab"]');
                expect(tabs[0].getAttribute('aria-selected')).toBe('true');
                expect(tabs[1].textContent, name).toBe(`开发接口 ${declared.length}`);
                tabs[0].focus();
                await act(async () => tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
                expect(document.activeElement).toBe(tabs[1]);
                expect(container.querySelector('[data-component-kind="component"]')).toBeNull();
                expect(container.querySelector('[role="switch"]')).toBeNull();
                const rows = container.querySelectorAll('[data-component-kind="interface"]');
                expect(rows).toHaveLength(declared.length);
                if (rows.length) {
                    const source = packageSource(name);
                    for (const row of rows) {
                        const id = row.dataset.pluginRow;
                        expect(ids.has(id), id).toBe(false);
                        ids.add(id);
                        const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const declaration = declared.find(item => item.id === id);
                        expect(declaration, id).toBeDefined();
                        if (declaration.kind === 'ui-slot') {
                            expect(source, id).toMatch(new RegExp(`(?:["']${escapedId}["']|\\b${escapedId}\\b)\\s*:\\s*\\{\\s*kind\\s*:`));
                        }
                        else if (declaration.kind === 'service') {
                            expect(source, id).toMatch(new RegExp(`(?:ctx(?:\\.reflect)?\\.provide\\(|super\\(ctx,\\s*)["']${escapedId}["']`));
                        }
                        else if (declaration.kind === 'contribution') {
                            expect(declaration.relation).toBe('contributes');
                            expect(declaration.owner).toBeTruthy();
                            for (const member of declaration.members ?? [])
                                expect(source, `${id}:${member}`).toContain(member);
                        }
                        expect(row.dataset.interfaceKind).toBe(declaration.kind);
                        expect(row.textContent).toContain(declaration.title);
                        expect(row.textContent).toContain(id);
                        if (declaration.scope === 'session-maybe') {
                            expect(row.textContent).toContain('会话可为空');
                            expect(row.textContent).not.toContain('session-maybe');
                        }
                    }
                }
                expect(document.getElementById(tabs[1].getAttribute('aria-controls'))?.hidden).toBe(false);
                await act(async () => tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
                expect(document.activeElement).toBe(tabs[0]);
            }
            expect(ids.size).toBe(sharedDetails.reduce((total, name) => total + developerInterfaces(name).length, 0));
        });
    });
    it('transports package-declared developer interfaces through the official manager', () => {
        const hostSource = readFileSync(resolve('node_modules/@deepseek-ai/dsh-plugin-manager/lib/index.js'), 'utf8');
        const clientSource = readFileSync(resolve('node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/lib/client.js'), 'utf8');
        expect(hostSource).toContain('manifest.eleckoi?.developerInterfaces');
        expect(hostSource).toContain('{ developerInterfaces: interfaces }');
        expect(clientSource).toContain('{ developerInterfaces: bundle.developerInterfaces }');
    });
    it('classifies patched upstream packages as adaptations', () => {
        const source = readFileSync(resolve('packages/client/features/dsh-client-shell/src/client.js'), 'utf8');
        const workspace = parseYaml(readFileSync(resolve('pnpm-workspace.yaml'), 'utf8'));
        for (const spec of Object.keys(workspace.patchedDependencies)) {
            const split = spec.lastIndexOf('@');
            const packageName = split > 0 ? spec.slice(0, split) : spec;
            if (packageName === '@deepseek-ai/dsh-typert-generator' || packageName === 'app-builder-lib')
                continue;
            expect(source, spec).toContain("['" + packageName + "',");
        }
        expect(workspace.patchedDependencies['@deepseek-ai/dsh-typert-generator@0.2.2-rc.1'])
            .toBe('patches/@deepseek-ai__dsh-typert-generator@0.2.2-rc.1.patch');
    });
});
