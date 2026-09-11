import type { Context, Plugin } from '@deepseek-ai/cordis'
import { mvuMessageDisplayCompatibility } from '@eleckoi/compatibility-mvu'

export const compatibilityPlugin = {
  name: 'eleckoi-compatibility',
  provide: ['messageDisplayCompatibility'],
  apply(ctx: Context) {
    ctx.provide('messageDisplayCompatibility', mvuMessageDisplayCompatibility)
  }
} satisfies Plugin.Object
