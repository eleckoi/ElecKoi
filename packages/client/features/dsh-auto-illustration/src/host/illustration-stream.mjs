import { randomUUID } from 'node:crypto'
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import { capturedImageResult, IMAGE_EVENT, parseImagePrompts } from '@eleckoi/dsh-client-roleplay/host/generated-image-result.mjs'
import { prepareIllustration } from './configuration.mjs'

/** Capture text instructions without registering an Agent tool. */
export function installIllustrationStream(ctx, images, readConfiguration) {
  const owns = sessionId => {
    const snapshot = readConfiguration(sessionId)
    return snapshot && !snapshot.inheritedFromSessionId
  }
  const positions = new Map(), submitted = new Set(), jobs = new Set()
  const retire = job => {
    jobs.delete(job)
    const release = job.release
    job.release = undefined
    if (release) void Promise.resolve().then(release)
      .catch(error => ctx.logger.error('自动配图任务释放失败', error))
  }
  const disposePosition = ctx.on('session/event', (session, event) => {
    if (event.type !== 'step/start' && event.type !== 'turn/end') return
    if (!owns(session.id)) return
    if (event.type === 'step/start') positions.set(session.id, event.data)
    if (event.type === 'turn/end') { positions.delete(session.id); submitted.delete(session.id) }
  })
  const disposeStream = ctx.on('llm/stream', async function* (options, next) {
    if (!isAgentLoopRequest(options) || !owns(options.sessionId)) { yield* next(); return }
    const session = ctx.sessions.get(options.sessionId)
    if (!session) { yield* next(); return }
    const snapshot = readConfiguration(options.sessionId)
    const state = prepareIllustration(ctx.settings, snapshot)
    if (!state || submitted.has(session.id)) { yield* next(); return }
    const position = positions.get(session.id)
    if (!position) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '自动配图缺少本轮正式步骤。', { what: '本轮正式步骤' })
    const batchId = randomUUID()
    let text = '', frames, job, finished = false
    const publish = value => session.append(IMAGE_EVENT, { batchId, ...position, ...value }, { ignorable: true })
    const failed = value => ({ status: 'failed', error: '本轮图片生成已停止。', frames: value.frames.map(({ attachment, seed, ...frame }) => ({ ...frame, status: 'failed', error: '本轮图片生成已停止。' })) })
    try {
      for await (const chunk of next()) {
        if (chunk.type === 'text-delta') {
          text += chunk.text
          if (!job && !submitted.has(session.id)) {
            frames = parseImagePrompts(text)
            if (frames) {
              const min = state.settings.automaticImageCount ? state.settings.automaticImageMin : state.settings.fixedImageCount
              const max = state.settings.automaticImageCount ? state.settings.automaticImageMax : state.settings.fixedImageCount
              if (frames.length < min || frames.length > max) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, `本轮分镜数量需要在 ${min} 到 ${max} 之间。`, { what: '本轮分镜数量', expected: `${min} 到 ${max}` })
              submitted.add(session.id)
              session.append(IMAGE_EVENT, { batchId, ...position, status: 'generating', frames: frames.map(frame => ({ id: frame.id, width: state.settings.width, height: state.settings.height, status: 'generating' })) }, { ignorable: true })
              job = { controller: new AbortController(), settled: false, output: null }
              jobs.add(job)
              job.stop = () => job.stopping ??= (async () => {
                job.controller.abort(new Error('本轮图片生成已停止。'))
                await job.promise
                const images = job.output?.frames.flatMap(frame => frame.attachment ? [frame.attachment] : []) || []
                if (images.length) { publish(failed(job.output)); await ctx.eleckoiSessionEditor.discardGeneratedImages(images) }
                retire(job)
              })()
              job.promise = images.generate(state.entry, state.settings, frames, AbortSignal.any([options.signal, job.controller.signal]))
                .catch(error => ({ status: 'failed', frames: [], error: String(error?.message || error) }))
                .then(async generated => {
                  const value = capturedImageResult(frames, state.settings, generated)
                  job.output = job.controller.signal.aborted ? failed(value) : value
                  publish(job.output)
                  if (job.controller.signal.aborted) await ctx.eleckoiSessionEditor.discardGeneratedImages(value.frames.flatMap(frame => frame.attachment ? [frame.attachment] : []))
                  job.settled = true
                  if (finished) retire(job)
                })
              job.promise.catch(error => ctx.logger.error('自动配图结果写入失败', error))
              const agent = ctx.agents.get(session.id)
              if (!agent) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady,
                '自动配图所属的角色会话已关闭。', { what: '当前角色会话' })
              job.release = agent.ctx.effect(() => async () => {
                job.release = undefined
                if (jobs.has(job)) {
                  await job.stop()
                  positions.delete(session.id); submitted.delete(session.id)
                }
              })
            }
          }
        }
        if (chunk.type === 'finish') {
          if (!['stop', 'max-tokens'].includes(chunk.reason.kind)) await job?.stop()
          finished = true
          if (job?.settled) retire(job)
        }
        yield chunk
      }
    } finally { if (!finished) await job?.stop() }
  })
  return async () => {
    disposeStream(); disposePosition(); positions.clear(); submitted.clear()
    await Promise.all([...jobs].map(job => job.stop()))
  }
}
