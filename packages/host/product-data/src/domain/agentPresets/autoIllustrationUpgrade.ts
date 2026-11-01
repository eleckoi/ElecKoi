import { autoIllustrationSchema } from '@shared/contracts/presets/autoIllustration'
import { z } from 'zod'

const legacyConfigurationSchema = z.object({
  includedGroupIds: z.array(z.string()).default([]),
  enabledGroupIds: z.array(z.string()).default([]),
  toolModelConfigIds: z.record(z.string(), z.string()).default({}),
  autoIllustration: autoIllustrationSchema.optional()
}).passthrough()

// RETIRE WHEN: supported preset imports and stored configuration versions no
// longer include v4/v5 tool-owned illustration settings. Remove this conversion
// and its startup/import callers together; retain the current plugin settings.
export function upgradeAutoIllustrationConfiguration(input: unknown) {
  const value = legacyConfigurationSchema.parse(input)
  const id = 'builtin:auto-illustration'
  const { [id]: modelConfigId, ...toolModelConfigIds } = value.toolModelConfigIds ?? {}
  return {
    ...value,
    version: 6,
    includedGroupIds: (value.includedGroupIds ?? []).filter((group: string) => group !== id),
    enabledGroupIds: (value.enabledGroupIds ?? []).filter((group: string) => group !== id),
    toolModelConfigIds,
    autoIllustration: autoIllustrationSchema.parse(value.autoIllustration ?? {
      enabled: Boolean(value.enabledGroupIds?.includes(id)),
      modelConfigId: modelConfigId ?? ''
    })
  }
}
