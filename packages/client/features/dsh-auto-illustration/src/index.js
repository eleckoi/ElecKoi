import { createNovelAiImageGeneration } from './host/novelai-image-generation.mjs'
import { capturedImageResult } from '@eleckoi/dsh-client-roleplay/host/generated-image-result.mjs'
import { illustrationInstructions, prepareIllustration } from './host/configuration.mjs'
import { installIllustrationStream } from './host/illustration-stream.mjs'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

export const name = 'eleckoi-auto-illustration'
export const inject = ['agents', 'llm', 'sessions', 'settings', 'credentials', 'attachments',
  'eleckoiSessionEditor', 'eleckoiRoleplaySessions']

export function apply(ctx) {
  const images = createNovelAiImageGeneration(ctx)
  ctx.provide('eleckoiAutoIllustration', {
    instructions(snapshot) {
      const state = prepareIllustration(ctx.settings, snapshot)
      return state ? illustrationInstructions(state.settings) : ''
    },
    async regenerateImage(sessionId, batchId, frameId, snapshot, signal) {
      const state = prepareIllustration(ctx.settings, snapshot)
      if (!state) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition,
        '当前预设没有启用自动配图，请在自动配图插件中配置。', { what: '启用自动配图插件并选择图片模型' })
      return ctx.eleckoiSessionEditor.regenerateImage(sessionId, batchId, frameId, async previous => {
        const { seed, attachment, error, status, width, height, ...prompt } = previous
        let generated
        try { generated = await images.generate(state.entry, state.settings, [prompt], signal) }
        catch (failure) { generated = { status: 'failed', frames: [], error: String(failure?.message || failure) } }
        const next = capturedImageResult([prompt], state.settings, generated).frames[0]
        return next.status === 'failed' && attachment ? { ...previous, error: next.error } : { ...prompt, ...next }
      })
    }
  })
  const stop = installIllustrationStream(ctx, images, id => ctx.eleckoiRoleplaySessions.configuration(id))
  ctx.effect(() => async () => {
    try { await stop() } finally { await images.close() }
  }, 'automatic illustration tasks')
}
