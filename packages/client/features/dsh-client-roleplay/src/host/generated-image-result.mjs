import { z } from 'zod'
import { normalizeNovelAiImageSettings, NOVELAI_IMAGE_PROVIDER, AUTO_ILLUSTRATION_TOOL_GROUP, DEFAULT_NOVELAI_COMPILER_INSTRUCTION, MAX_STORY_IMAGES } from '@eleckoi/dsh-product-data'

export const IMAGE_EVENT = 'eleckoi/illustration'
export const IMAGE_PROMPT_OPEN = '<ACTION_CALL name="generate_image">'
export const IMAGE_PROMPT_CLOSE = '</ACTION_CALL>'
const frameSchema = z.object({ id: z.number().int().min(1), prompt: z.string().trim().min(1).max(8000),
  negative_prompt: z.string().max(2000), after_paragraph: z.number().int().min(0).optional(),
  seed: z.number().int().min(0).max(4294967295).optional() }).strict()
const argsSchema = z.object({ frames: z.array(frameSchema).min(1).max(MAX_STORY_IMAGES) }).strict()

/** Parse the complete declared image command before the current final-body boundary. */
export function parseImagePrompts(text) {
  const start = text.indexOf(IMAGE_PROMPT_OPEN)
  if (start < 0) return undefined
  const final = text.indexOf('<FINAL>')
  if (final >= 0 && start > final) throw new Error('生图提示词必须位于最终正文之前。')
  const end = text.indexOf(IMAGE_PROMPT_CLOSE, start + IMAGE_PROMPT_OPEN.length)
  if (end < 0) return undefined
  if (final >= 0 && end > final) throw new Error('生图提示词没有在最终正文前完整结束。')
  if (text.indexOf(IMAGE_PROMPT_OPEN, end) >= 0) throw new Error('一轮回复只能输出一组生图提示词。')
  const { frames } = argsSchema.parse(JSON.parse(text.slice(start + IMAGE_PROMPT_OPEN.length, end)))
  if (frames.some((frame, index) => frame.id !== index + 1)) throw new Error('分镜编号必须从 1 开始连续排列。')
  return frames
}

export function prepareIllustration(settings, snapshot) {
  const configId = snapshot.toolModelConfigIds?.[AUTO_ILLUSTRATION_TOOL_GROUP]
  if (!configId || snapshot.inheritedFromSessionId || snapshot.disabledToolGroupIds?.includes(AUTO_ILLUSTRATION_TOOL_GROUP)) return undefined
  const entry = settings.describe().find(row => row.ns === 'eleckoi-client-models')?.value?.entries?.[configId]
  if (!entry || entry.hidden) throw new Error('自动配图绑定的模型配置已不存在，请重新选择。')
  if (entry.provider !== NOVELAI_IMAGE_PROVIDER || !entry.model?.trim()) throw new Error('自动配图需要有效的 NovelAI 图片模型。')
  return { entry: structuredClone(entry), settings: normalizeNovelAiImageSettings(entry.image_settings || {}) }
}

export function illustrationInstructions(settings) {
  const min = settings.automaticImageCount ? settings.automaticImageMin : settings.fixedImageCount
  const max = settings.automaticImageCount ? settings.automaticImageMax : settings.fixedImageCount
  return [
    '当前角色对话已启用每轮自动配图。共同构思正文与画面，完成其他工具任务后，在同一次 assistant 文本响应中，先输出以下完整生图指令，再输出 <FINAL> 最终正文。',
    settings.automaticImageCount ? `本轮选择 ${min} 到 ${max} 个不同的剧情瞬间。` : `本轮必须输出恰好 ${min} 个分镜。`,
    `${IMAGE_PROMPT_OPEN}\n{"frames":[{"id":1,"prompt":"NovelAI 英文画面标签","negative_prompt":"英文负面标签"}]}\n${IMAGE_PROMPT_CLOSE}\n<FINAL>\n正文，在图片位置独占一行写 [[IMAGE:1]]\n</FINAL>`,
    'frames 必须按剧情顺序排列，id 从 1 开始连续编号。每个画面包含 prompt 和 negative_prompt。对应的 [[IMAGE:n]] 在正文里恰好出现一次。所有画面集中输出一次，分镜数量服从本轮要求。',
    'generate_image 是文本指令中的动作名称，不是原生工具。不要发起 Tool Call/function_call，不要等待图片结果，不要为生图追加聊天请求。程序收到完整指令后后台串行生图，正文继续正常流式输出。',
    '以下编译规则只约束每个画面的提示词，不改变上述格式、数量和顺序：',
    settings.promptCompilerInstruction.trim() || DEFAULT_NOVELAI_COMPILER_INSTRUCTION
  ].join('\n')
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
  if (!result || result.data.status === 'generating') throw new Error('没有找到这张图片对应的已完成生图记录。')
  const matches = result.data.frames.filter(frame => frame.id === frameId)
  if (matches.length !== 1) throw new Error('没有找到选中的图片。')
  const replies = events.filter(event => event.type === 'assistant/message' && event.data.turn === result.data.turn && event.data.step === result.data.step)
  if (replies.length !== 1) throw new Error('没有找到这张图片对应的原始 AI 回复。')
  const text = replies[0].data.message.content.filter(block => block.type === 'text').map(block => block.text).join('')
  const prompt = parseImagePrompts(text)?.find(frame => frame.id === frameId)
  if (!prompt) throw new Error('原始 AI 回复中没有这张图片的有效提示词。')
  return { event: result, data: result.data, frame: { ...matches[0], ...prompt } }
}
