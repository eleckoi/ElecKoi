import { net, protocol, type CustomScheme } from 'electron'
import { pathToFileURL } from 'node:url'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { LocalMediaThumbnails, LOCAL_MEDIA_CACHE_CONTROL } from '@eleckoi/dsh-product-data/media'
import { LOCAL_MEDIA_SCHEME } from '@shared/foundation/mediaReference'

export const localMediaScheme = {
  scheme: LOCAL_MEDIA_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true
  }
} satisfies CustomScheme

export const mediaProtocolPlugin = {
  name: 'eleckoi-media-protocol',
  inject: ['appPaths'],
  apply(ctx: Context) {
    const thumbnails = new LocalMediaThumbnails(ctx.appPaths.media)
    protocol.handle(LOCAL_MEDIA_SCHEME, async (request) => {
      try {
        const path = await thumbnails.resolve(request.url)
        if (!path) return new Response(null, { status: 404 })
        const response = await net.fetch(pathToFileURL(path).toString())
        const headers = new Headers(response.headers)
        if (response.ok) headers.set('Cache-Control', LOCAL_MEDIA_CACHE_CONTROL)
        return new Response(response.body, { status: response.status, headers })
      } catch (error) {
        console.error('Local media image request failed', error)
        return new Response(null, { status: 500 })
      }
    })
    return () => protocol.unhandle(LOCAL_MEDIA_SCHEME)
  }
} satisfies Plugin.Object
