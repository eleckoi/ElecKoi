import { normalizeNovelAiImageSettings, NOVELAI_IMAGE_PROVIDER, DEFAULT_NOVELAI_COMPILER_INSTRUCTION } from '@eleckoi/dsh-product-data'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

export function prepareIllustration(settings, snapshot) {
  const configId = snapshot.autoIllustration?.modelConfigId
  if (!configId || snapshot.inheritedFromSessionId || !snapshot.autoIllustration?.enabled) return undefined
  const entry = settings.describe().find(row => row.ns === 'eleckoi-client-models')?.value?.entries?.[configId]
  if (!entry || entry.hidden) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '自动配图绑定的模型配置已不存在，请重新选择。', { what: '自动配图绑定的模型配置' })
  if (entry.provider !== NOVELAI_IMAGE_PROVIDER || !entry.model?.trim()) throw productFailure(ELECKOI_FAILURE_CODES.modelConfigInvalid, '自动配图需要有效的 NovelAI 图片模型。', { field: 'model', what: '自动配图的 NovelAI 图片模型' })
  return { entry: structuredClone(entry), settings: normalizeNovelAiImageSettings(entry.image_settings || {}) }
}

/** Automatic illustration is optional for a text turn. Explicit image operations use the strict reader. */
export function prepareAutomaticIllustration(ctx, snapshot) {
  try { return prepareIllustration(ctx.settings, snapshot) }
  catch (error) {
    ctx.logger.error('自动配图模型配置读取失败', error)
    return undefined
  }
}

export function illustrationInstructions(settings) {
  const min = settings.automaticImageCount ? settings.automaticImageMin : settings.fixedImageCount
  const max = settings.automaticImageCount ? settings.automaticImageMax : settings.fixedImageCount
  return [
    '当前角色对话已启用每轮自动配图。共同构思正文与画面，将分镜放入 eleckoi_roleplay_reply 的 frames 参数。',
    settings.automaticImageCount ? `本轮选择 ${min} 到 ${max} 个不同的剧情瞬间。` : `本轮必须输出恰好 ${min} 个分镜。`,
    '在普通回复的正文中，将 [[IMAGE:n]] 单独写成一行，每张图出现一次。frames 按正文顺序排列，id 从 1 开始连续编号。',
    '在同一次输出中提交正文和工具调用。分镜在后台生成。',
    '以下编译规则只约束每个画面的提示词，不改变上述格式、数量和顺序：',
    settings.promptCompilerInstruction.trim() || DEFAULT_NOVELAI_COMPILER_INSTRUCTION
  ].join('\n')
}
