import { z } from 'zod'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

export const IMAGE_EVENT = 'eleckoi/illustration'
export const IMAGE_PROMPT_OPEN = '<ACTION_CALL name="generate_image">'
export const IMAGE_PROMPT_CLOSE = '</ACTION_CALL>'
const frameSchema = z.object({ id: z.number().int().min(1), prompt: z.string().trim().min(1),
  negative_prompt: z.string(), after_paragraph: z.number().int().min(0).optional(),
  seed: z.number().int().min(0).max(4294967295).optional() }).strict()
const argsSchema = z.object({ frames: z.array(frameSchema).min(1) }).strict()

/** Parse the complete declared image command before the current final-body boundary. */
export function parseImagePrompts(text) {
  const start = text.indexOf(IMAGE_PROMPT_OPEN)
  if (start < 0) return undefined
  const final = text.indexOf('<FINAL>')
  if (final >= 0 && start > final) throw productFailure(ELECKOI_FAILURE_CODES.mediaInvalid, '生图提示词必须位于最终正文之前。', { what: '生图提示词的位置' })
  const end = text.indexOf(IMAGE_PROMPT_CLOSE, start + IMAGE_PROMPT_OPEN.length)
  if (end < 0) return undefined
  if (final >= 0 && end > final) throw productFailure(ELECKOI_FAILURE_CODES.mediaInvalid, '生图提示词没有在最终正文前完整结束。', { what: '生图提示词的结束位置' })
  if (text.indexOf(IMAGE_PROMPT_OPEN, end) >= 0) throw productFailure(ELECKOI_FAILURE_CODES.mediaInvalid, '一轮回复只能输出一组生图提示词。', { what: '生图提示词的组数' })
  const { frames } = argsSchema.parse(JSON.parse(text.slice(start + IMAGE_PROMPT_OPEN.length, end)))
  if (frames.some((frame, index) => frame.id !== index + 1)) throw productFailure(ELECKOI_FAILURE_CODES.mediaInvalid, '分镜编号必须从 1 开始连续排列。', { what: '分镜编号' })
  return frames
}

/** Store only outcomes; scene prompts already belong to the original assistant text. */
export function capturedImageResult(frames, settings, generated) {
  const completed = new Map(generated.frames.map(frame => [frame.id, frame]))
  return { status: generated.status, ...(generated.error ? { error: generated.error } : {}),
    frames: frames.map(frame => { const output = completed.get(frame.id)
      return { id: frame.id, width: settings.width, height: settings.height,
        status: output?.attachment ? 'ready' : 'failed',
        ...(output?.attachment ? { attachment: output.attachment, seed: output.seed } : { error: generated.error || '图片生成失败。' }) }
    }) }
}

export function findGeneratedImage(events, batchId, frameId) {
  // Ordered Session updates replace the previous state of this declared batch.
  let result
  for (const event of events) if (event.type === IMAGE_EVENT && event.data.batchId === batchId) result = event
  if (!result || result.data.status === 'generating') throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '没有找到这张图片对应的已完成生图记录。', { what: '这张图片的已完成生图记录' })
  const matches = result.data.frames.filter(frame => frame.id === frameId)
  if (matches.length !== 1) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '没有找到选中的图片。', { what: '选中的图片' })
  const replies = events.filter(event => event.type === 'assistant/message' && event.data.turn === result.data.turn && event.data.step === result.data.step)
  if (replies.length !== 1) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '没有找到这张图片对应的原始 AI 回复。', { what: '这张图片对应的原始 AI 回复' })
  const text = replies[0].data.message.content.filter(block => block.type === 'text').map(block => block.text).join('')
  const prompt = parseImagePrompts(text)?.find(frame => frame.id === frameId)
  if (!prompt) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '原始 AI 回复中没有这张图片的有效提示词。', { what: '这张图片的有效提示词' })
  return { event: result, frame: { ...matches[0], ...prompt } }
}
