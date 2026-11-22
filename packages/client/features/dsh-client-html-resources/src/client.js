import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api';
import * as sdk from './browser-libraries.js';
import { HtmlResourcesClient } from './runtime.js';

export function apply(ctx) {
  const baseUrl = window.__ELECKOI_HTML_RESOURCES__?.baseUrl;
  if (!baseUrl) {
    throw productFailure(ELECKOI_FAILURE_CODES.internal, 'HTML presentation resource URL is unavailable',
      { what: 'HTML 显示资源地址' });
  }
  const runtime = new HtmlResourcesClient({ window, sdk, assetsBaseUrl: baseUrl });
  ctx.provide('eleckoiHtmlResources', runtime);
  ctx.effect(() => {
    runtime.start();
    return () => runtime.dispose();
  }, 'eleckoi: HTML presentation resources');
}
