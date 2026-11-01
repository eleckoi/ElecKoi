import { normalizeNovelAiImageSettings, NOVELAI_IMAGE_PROVIDER, DEFAULT_NOVELAI_COMPILER_INSTRUCTION } from '@eleckoi/dsh-product-data'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import { IMAGE_PROMPT_OPEN, IMAGE_PROMPT_CLOSE } from '@eleckoi/dsh-client-roleplay/host/generated-image-result.mjs'

export function prepareIllustration(settings, snapshot) {
  const configId = snapshot.autoIllustration?.modelConfigId
  if (!configId || snapshot.inheritedFromSessionId || !snapshot.autoIllustration?.enabled) return undefined
  const entry = settings.describe().find(row => row.ns === 'eleckoi-client-models')?.value?.entries?.[configId]
  if (!entry || entry.hidden) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '自动配图绑定的模型配置已不存在，请重新选择。', { what: '自动配图绑定的模型配置' })
  if (entry.provider !== NOVELAI_IMAGE_PROVIDER || !entry.model?.trim()) throw productFailure(ELECKOI_FAILURE_CODES.modelConfigInvalid, '自动配图需要有效的 NovelAI 图片模型。', { field: 'model', what: '自动配图的 NovelAI 图片模型' })
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
