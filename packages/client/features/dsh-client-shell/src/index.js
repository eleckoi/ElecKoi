import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const frameModule = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-layout/client'), 'utf8');
const sidebarModule = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-sidebar/client'), 'utf8');

/** Register public Client factories for the layout and sidebar owned by the product shell. */
export const inject = ['clientModules'];
export function apply(ctx) {
  // The shell mounts these components through their public APIs. Their default
  // plugin entries are disabled, so queue their factories through DSH's web boot.
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'global', name: '__DSH_UI_WORKSPACE_CONFIG__', value: { autoSelectSession: false } });
    table.push({ kind: 'script', placement: 'head', text: frameModule });
    table.push({ kind: 'script', placement: 'head', text: sidebarModule });
  });
}
