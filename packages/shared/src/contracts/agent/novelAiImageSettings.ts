import { z } from 'zod'

export const NOVELAI_IMAGE_PROVIDER = 'novelai_image'
export const NOVELAI_SAMPLERS = [
  { id: 'k_dpmpp_2m', label: 'DPM++ 2M' },
  { id: 'k_euler_ancestral', label: 'Euler Ancestral' },
  { id: 'k_euler', label: 'Euler' },
  { id: 'k_dpm_2', label: 'DPM2' },
  { id: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { id: 'k_dpmpp_sde', label: 'DPM++ SDE' },
  { id: 'k_dpm_fast', label: 'DPM Fast' },
  { id: 'ddim_v3', label: 'DDIM' }
] as const

export const DEFAULT_NOVELAI_COMPILER_INSTRUCTION = `You are a professional prompt compiler for NovelAI Diffusion V4.5.

For every requested story frame, compile a production-ready image prompt for a moment in the final roleplay reply you are about to write. The final reply determines what happens in the image; do not copy or summarize narrative prose into the prompt.

Select a distinct, visually decisive frozen moment for each frame. Describe only visible facts: subjects, appearance, clothing state, pose, interaction, expression, gaze, objects, environment, weather, lighting and camera composition. Convert movement into one readable instant. Preserve established character identity and any supplied canonical traits; use recognized English or romanized NovelAI character tags when applicable. Do not invent later events, dialogue, captions, thoughts, sounds or invisible feelings.

Write prompt as concise English visual tags and short tag phrases separated by commas. Do not use Chinese, narrative sentences, explanations, Markdown or quotes. Order tags roughly as quality/style, subject count and identity, appearance, clothing, action and interaction, expression, framing and camera angle, environment, lighting and effects. Include a clear subject count and framing; avoid mutually exclusive details. Do not introduce artist names or a new style unless supplied. The application appends global fixed tags, so do not repeat them.

Write negative_prompt as comma-separated English tags for relevant defects and unwanted elements, including low quality, bad anatomy, bad hands, extra or missing limbs and digits, duplicate subjects, malformed interaction, text, subtitles, speech bubbles, signatures, logos and watermarks.

Fill prompt and negative_prompt inside each frame of the declared image text instruction. Keep the required frame count and order, and set after_paragraph to the corresponding final-body paragraph position, starting at 0.`

export const novelAiImageSettingsSchema = z.object({
  width: z.number().int().positive().default(832),
  height: z.number().int().positive().default(1216),
  steps: z.number().int().positive().default(28),
  scale: z.number().nonnegative().default(5),
  sampler: z.enum(NOVELAI_SAMPLERS.map(item => item.id)).default('k_euler_ancestral'),
  automaticImageCount: z.boolean().default(false),
  fixedImageCount: z.number().int().min(1).default(1),
  automaticImageMin: z.number().int().min(1).default(1),
  automaticImageMax: z.number().int().min(1).default(6),
  promptCompilerInstruction: z.string().default(''),
  promptPrefix: z.string().default(''),
  negativePrompt: z.string().default('')
}).passthrough().refine(value => !value.automaticImageCount || value.automaticImageMin <= value.automaticImageMax, {
  message: '分镜最少数量不能大于最多数量。', path: ['automaticImageMax']
})

export function normalizeNovelAiImageSettings(value: unknown = {}) {
  return novelAiImageSettingsSchema.parse(value)
}

export function novelAiImageSettingsError(value: unknown): string {
  const parsed = novelAiImageSettingsSchema.safeParse(value)
  if (parsed.success) return ''
  const issue = parsed.error.issues[0]!
  const labels: Record<string, string> = {
    width: '宽度', height: '高度', steps: '步数', scale: '提示词相关性', sampler: '采样器',
    fixedImageCount: '每轮分镜数', automaticImageMin: '最少分镜数', automaticImageMax: '最多分镜数',
    promptCompilerInstruction: '提示词编译指令', promptPrefix: '全局固定词', negativePrompt: '负面追加词'
  }
  return `${labels[String(issue.path[0])] || '绘画参数'}：${issue.message}`
}
