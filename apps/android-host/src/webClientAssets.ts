import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createRequire } from 'node:module'
import { installWebClientAssets as installSharedWebClientAssets } from '@eleckoi/dsh-runtime'
import { WEBVIEW_BOOT_COMPATIBILITY_SCRIPT } from './webViewBootCompatibility'

/** The official HTTP Host serves the same product renderer used by Electron. */
export async function installWebClientAssets(ctx: Context, directory: string): Promise<void> {
  await installSharedWebClientAssets(ctx, directory)
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'script', placement: 'head', text: WEBVIEW_BOOT_COMPATIBILITY_SCRIPT })
    table.push({ kind: 'global', name: '__ELECKOI_CLIENT_PLATFORM__', value: {
      kind: 'android', version: createRequire(import.meta.url)('@eleckoi/android-host/package.json').version
    } })
  })
}
