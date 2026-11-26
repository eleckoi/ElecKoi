import { z } from 'zod'
import { characterAssetId } from '../characterAssets'

export const characterCastCropSchema = z.strictObject({
  zoom: z.number().positive(),
  offset: z.strictObject({ x: z.number(), y: z.number() }),
  rotation: z.number(),
})

export const characterCastMemberSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  portraitAssetId: characterAssetId.nullable(),
  circleAssetId: characterAssetId.nullable(),
  squareAssetId: characterAssetId.nullable(),
  crop: characterCastCropSchema.nullable(),
})

export const characterCastSchema = z.array(characterCastMemberSchema).refine(
  members => new Set(members.map(member => member.id)).size === members.length,
  { message: '登场角色编号重复。' }
)

export type CharacterCastMember = z.infer<typeof characterCastMemberSchema>

export function characterCastAssetIds(member: CharacterCastMember): string[] {
  return [member.portraitAssetId, member.circleAssetId, member.squareAssetId].filter((id): id is string => id !== null)
}
