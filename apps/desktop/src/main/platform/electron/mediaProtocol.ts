import { net, protocol, type CustomScheme } from 'electron'
import { pathToFileURL } from 'node:url'
import { extname } from 'node:path'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { resolveLocalMediaPath } from '@eleckoi/dsh-product-data/media'
import { LOCAL_MEDIA_SCHEME } from '@shared/foundation/mediaReference'

export const localMediaScheme = {
  scheme: LOCAL_MEDIA_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
} satisfies CustomScheme

export const mediaProtocolPlugin = {
  name: 'eleckoi-media-protocol',
  inject: ['appPaths'],
  apply(ctx: Context) {
    protocol.handle(LOCAL_MEDIA_SCHEME, async (request) => {
      const path = resolveLocalMediaPath(ctx.appPaths.media, request.url)
      if (!path) return new Response(null, { status: 404 })
      const response = await net.fetch(pathToFileURL(path).toString(), { headers: request.headers })
      const videoTypes: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg' }
      const mediaType = videoTypes[extname(path).toLowerCase()]
      if (!mediaType) return response
      const headers = new Headers(response.headers); headers.set('Content-Type', mediaType)
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
    })
    return () => protocol.unhandle(LOCAL_MEDIA_SCHEME)
  }
} satisfies Plugin.Object
