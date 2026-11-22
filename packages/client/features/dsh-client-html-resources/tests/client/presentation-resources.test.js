import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import * as libraries from '@eleckoi/dsh-client-html-resources/browser-libraries';
import { HtmlResourcesClient } from '../../src/runtime.js';
import { createHtmlAssetHandler } from '../../src/assets.js';

describe('presentation-only resources', () => {
  it('activates the built DSH entry without separate document or network work', () => {
    const window = new EventTarget(); window.Event = Event;
    window.__ELECKOI_HTML_RESOURCES__ = { baseUrl: '/eleckoi/html/' };
    let registration;
    window.__ModuleLoader__ = { load: entry => { registration = entry; } };
    runInNewContext(readFileSync(new URL('../../dist/client.js', import.meta.url), 'utf8'), { window });
    const plugin = registration.factory(name => {
      expect(name).toBe('@eleckoi/dsh-product-api');
      return {};
    });
    let cleanup;
    plugin.apply({
      provide: (name, runtime) => {
        expect(name).toBe('eleckoiHtmlResources');
        expect(runtime.sdk.BROWSER_LIBRARY_SCRIPTS).toEqual(libraries.BROWSER_LIBRARY_SCRIPTS);
      },
      effect: start => { cleanup = start(); },
    });
    expect(window.__ElecKoiHtmlResources?.getSnapshot()).toEqual({ status: 'ready', error: '' });
    cleanup();
    expect(window.__ElecKoiHtmlResources).toBeUndefined();
  });

  it('starts and stops without installing external SDK globals or requesting author capabilities', () => {
    const window = new EventTarget(); window.Event = Event;
    const runtime = new HtmlResourcesClient({ window, sdk: libraries, assetsBaseUrl: '/eleckoi/html/' });
    runtime.start();
    expect(window.__ElecKoiHtmlResources).toBe(runtime);
    expect(runtime.getSnapshot()).toEqual({ status: 'ready', error: '' });
    for (const name of ['TavernHelper', 'Mvu', 'SillyTavern', 'ElecKoi']) expect(window[name]).toBeUndefined();
    for (const name of ['installSharedFrame', 'installTavernCompatibility', 'installHostAdapter']) expect(libraries[name]).toBeUndefined();
    for (const name of ['prepareDocument', 'registerChatUi', 'setEnvironment', 'registerFrontendTargets']) expect(runtime[name]).toBeUndefined();
    runtime.dispose();
    expect(window.__ElecKoiHtmlResources).toBeUndefined();
  });

  it('serves declared libraries but rejects old executable resources even if stale files exist', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-presentation-'));
    try {
      mkdirSync(join(root, 'assets'));
      for (const file of ['html-libraries.global.js', 'tavern-runtime.global.js', 'mvu-engine.js', 'mvu-schema.js']) writeFileSync(join(root, file), 'synthetic bytes');
      writeFileSync(join(root, 'assets', 'jquery.min.js'), 'synthetic library');
      const handler = createHtmlAssetHandler(root);
      const request = async (path, method = 'GET') => {
        const response = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
        await handler({ url: '/eleckoi/html/' + path, method }, response);
        return response;
      };
      expect((await request('html-libraries.global.js')).status).toBe(200);
      expect((await request('libraries/jquery.min.js')).body.toString()).toBe('synthetic library');
      expect((await request('libraries/jquery.min.js', 'HEAD')).body).toBeUndefined();
      for (const path of ['tavern-runtime.global.js', 'assets/tavern-runtime.global.js', 'assets/mvu-engine.js', 'assets/mvu-schema.js', 'plugin/synthetic/index.html', 'panel/synthetic']) {
        expect((await request(path)).status).toBe(404);
      }
      expect((await request('libraries/%2e%2e%2fmvu-engine.js')).status).toBe(403);
      expect((await request('html-libraries.global.js', 'POST')).status).toBe(405);
    } finally {
      const child = relative(tmpdir(), root);
      if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected test cleanup path');
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('serves the compiled HTML resource inventory without a retired runtime or tokenizer dependency', async () => {
    const handler = createHtmlAssetHandler();
    for (const file of [...libraries.BROWSER_LIBRARY_SCRIPTS, ...libraries.BROWSER_LIBRARY_STYLES,
      'document-pdf-worker.js', 'pdf-cmaps/78-EUC-H.bcmap', 'pdf-fonts/FoxitSerif.pfb', 'fontawesome/webfonts/fa-solid-900.woff2']) {
      const response = { writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
      await handler({ url: '/eleckoi/html/libraries/' + file, method: 'GET' }, response);
      expect(response.status, file).toBe(200);
      expect(response.body.length, file).toBeGreaterThan(0);
    }
    const root = 'packages/client/features/dsh-client-html-resources';
    for (const file of ['dist/tavern-runtime.global.js', 'assets/tiktoken.global.js', 'assets/tokenizer-models']) {
      expect(existsSync(join(root, file)), file).toBe(false);
    }
    const parser = readFileSync(join(root, 'assets/document-parsers.global.js'), 'utf8');
    expect(parser).toContain('/eleckoi/html/libraries/');
    expect(parser).not.toContain('/eleckoi/compat/');
  });
});
