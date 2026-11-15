import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const frameModule = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-layout/client'), 'utf8');

/** Register the actual public Client factory before the official boot graph starts. */
export const inject = ['clientModules'];
export function apply(ctx) {
  // The default layout entry is replaced by our registration adapter, so its
  // module is not a boot-graph row. An async page import arrives too late for
  // the required native Chat dependencies. Use the official index-injection
  // contract to enqueue the unchanged upstream factory ahead of that graph.
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'global', name: '__DSH_UI_WORKSPACE_CONFIG__', value: { autoSelectSession: false } });
    table.push({ kind: 'script', placement: 'head', text: frameModule });
  });
}
