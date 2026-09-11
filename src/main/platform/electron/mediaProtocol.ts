import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { LOCAL_MEDIA_SCHEME } from '@main/platform/filesystem/LocalMediaStore'

export function registerLocalMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: LOCAL_MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }])
}

export const mediaProtocolPlugin = {
  name: 'eleckoi-media-protocol',
  inject: ['mediaAssets'],
  apply(ctx: Context) {
    protocol.handle(LOCAL_MEDIA_SCHEME, (request) => {
      const path = ctx.mediaAssets.pathForReference(request.url)
      if (!path) return new Response(null, { status: 404 })
      return net.fetch(pathToFileURL(path).toString())
    })
    return () => protocol.unhandle(LOCAL_MEDIA_SCHEME)
  }
} satisfies Plugin.Object
