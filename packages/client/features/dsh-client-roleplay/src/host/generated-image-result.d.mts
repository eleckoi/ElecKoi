import type { GeneratedImageFrame } from '@eleckoi/dsh-product-data'
import type { SessionEventMap } from '@deepseek-ai/dsh-session'
import type {} from '../projections'

export const IMAGE_EVENT: 'eleckoi/illustration'
export const IMAGE_PROMPT_OPEN: '<ACTION_CALL name="generate_image">'
export const IMAGE_PROMPT_CLOSE: '</ACTION_CALL>'
export function parseImagePrompts(text: string): Array<Pick<GeneratedImageFrame, 'id' | 'prompt' | 'negative_prompt' | 'after_paragraph' | 'seed'>> | undefined
/** The event is the original borrowed object; callers use identity when replacing its data. */
export function findGeneratedImage<Event extends { readonly type: string; readonly data: unknown }>(
  events: readonly Event[], batchId: string, frameId: number
): { event: Event; data: SessionEventMap['eleckoi/illustration']; frame: GeneratedImageFrame }
