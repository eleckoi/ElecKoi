import { randomUUID } from 'node:crypto'
import { capturedImageResult, IMAGE_EVENT } from '@eleckoi/dsh-client-roleplay/host/generated-image-result.mjs'
import { roleplayReplyResult } from '@eleckoi/dsh-client-roleplay/host/roleplay-reply-tool.mjs'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import { prepareAutomaticIllustration } from './configuration.mjs'

/** Generate in the background after the official reply tool result is committed. */
export function installReplyIllustrations(ctx, images, readConfiguration) {
  const settingsBySession = new Map(), jobs = new Set()
  const retire = job => {
    jobs.delete(job)
    const release = job.release
    job.release = undefined
    if (release) void Promise.resolve().then(release)
      .catch(error => ctx.logger.error('自动配图任务释放失败', error))
  }
  const dispose = ctx.on('session/event', (session, event) => {
    if (event.type === 'step/start') {
      const snapshot = readConfiguration(session.id)
      const state = snapshot && !snapshot.inheritedFromSessionId && prepareAutomaticIllustration(ctx, snapshot)
      if (state) settingsBySession.set(session.id, state)
      else settingsBySession.delete(session.id)
    }
    if (event.type === 'turn/end') settingsBySession.delete(session.id)
    const frames = roleplayReplyResult(event)?.frames
    if (!frames?.length) return
    const agent = ctx.agents.get(session.id)
    const state = settingsBySession.get(session.id)
    if (!agent || !state) return
    const position = { batchId: randomUUID(), turn: event.data.turn, step: event.data.step,
      replyCallId: String(event.data.message.source.callId) }
    const publish = value => session.append(IMAGE_EVENT, { ...position, ...value }, { ignorable: true })
    const stopMessage = '本轮图片生成已停止。'
    const failed = value => ({ status: 'failed', error: stopMessage, frames: value.frames.map(frame => ({
      id: frame.id, width: frame.width, height: frame.height, status: 'failed', error: stopMessage
    })) })
    const job = { controller: new AbortController() }
    jobs.add(job)
    job.stop = () => job.stopping ??= (async () => {
      job.controller.abort(new Error(stopMessage))
      await job.promise
    })()
    job.release = agent.ctx.effect(() => async () => {
      job.release = undefined
      if (jobs.has(job)) await job.stop()
    })
    // Session observers cannot append while the parent tool result is being published.
    job.promise = Promise.resolve().then(() => {
      publish({ status: 'generating', frames: frames.map(frame => ({
        id: frame.id, width: state.settings.width, height: state.settings.height, status: 'generating'
      })) })
      return images.generate(state.entry, state.settings, frames, job.controller.signal)
    })
      .catch(error => ({ status: 'failed', frames: [], error: String(error?.message || error) }))
      .then(async generated => {
        const value = capturedImageResult(frames, state.settings, generated)
        if (job.controller.signal.aborted) {
          publish(failed(value))
          await ctx.eleckoiSessionEditor.discardGeneratedImages(value.frames.flatMap(frame => frame.attachment ? [frame.attachment] : []))
        } else publish(value)
      })
      .catch(error => ctx.logger.error('自动配图结果写入失败', error))
      .finally(() => retire(job))
  })
  return {
    validate(sessionId, frames) {
      const state = settingsBySession.get(sessionId)
      if (!state) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition,
        '当前角色会话未启用自动配图。', { what: '自动配图' })
      const { settings } = state
      const min = settings.automaticImageCount ? settings.automaticImageMin : settings.fixedImageCount
      const max = settings.automaticImageCount ? settings.automaticImageMax : settings.fixedImageCount
      if (frames.length < min || frames.length > max) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid,
        `本轮分镜数量需要在 ${min} 到 ${max} 之间。`, { field: 'frames', expected: `${min} 到 ${max}` })
    },
    async stop() {
      dispose()
      settingsBySession.clear()
      await Promise.all([...jobs].map(job => job.stop()))
    }
  }
}
