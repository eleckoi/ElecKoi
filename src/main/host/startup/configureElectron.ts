import { app } from 'electron'
import type { StartupProfile } from '@shared/contracts/startup/schema'

export function configureElectron(profile: StartupProfile): void {
  if (profile.userDataPath.trim().length > 0) app.setPath('userData', profile.userDataPath)
  if (profile.disableHardwareAcceleration) app.disableHardwareAcceleration()
}
