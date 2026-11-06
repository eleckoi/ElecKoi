import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { readProfileManifest, sanitizeProfile } from '@deepseek-ai/dsh-app-boot'
import { OPTIONAL_BUNDLES, PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { ELECKOI_ANDROID_BUNDLES } from './androidPluginBundles'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

const webProfile = PROFILE_TEMPLATES.web
if (webProfile === undefined) {
  throw new DesktopError(ELECKOI_FAILURE_CODES.internal, 'DSH web profile template is unavailable', { what: 'DSH web profile 模板' })
}
export const ELECKOI_ANDROID_RECOVERY_BUNDLES = Object.freeze([
  ...webProfile.bundles, ...ELECKOI_ANDROID_BUNDLES
])

/** Called by the new Host process only after the Android owner has stopped its predecessor. */
export function disableAndroidUserPlugins(homeRoot: string): string | undefined {
  const profile = join(homeRoot, 'profiles', 'android')
  const selected = existsSync(join(profile, 'package.json')) ? readProfileManifest('eleckoi', profile).dsh?.profile?.bundles ?? [] : []
  return sanitizeProfile('eleckoi', profile, [
    ...ELECKOI_ANDROID_RECOVERY_BUNDLES, ...selected.filter(name => OPTIONAL_BUNDLES.includes(name))
  ])
}
