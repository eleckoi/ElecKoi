import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { startupProfileSchema, type StartupProfile } from '@shared/contracts/startup/schema'

export class StartupProfileStore {
  private profile: StartupProfile = startupProfileSchema.parse({})
  private path = ''

  load(path: string): StartupProfile {
    this.path = path
    if (!existsSync(path)) {
      this.profile = startupProfileSchema.parse({})
      return this.profile
    }
    try {
      this.profile = startupProfileSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    } catch {
      this.profile = startupProfileSchema.parse({})
    }
    return this.profile
  }

  get<TKey extends keyof StartupProfile>(key: TKey): StartupProfile[TKey] {
    return this.profile[key]
  }

  set<TKey extends keyof StartupProfile>(key: TKey, value: StartupProfile[TKey]): StartupProfile {
    this.profile = startupProfileSchema.parse({ ...this.profile, [key]: value })
    if (this.path.length > 0) {
      mkdirSync(dirname(this.path), { recursive: true })
      writeFileSync(this.path, JSON.stringify(this.profile, null, 2), 'utf8')
    }
    return this.profile
  }
}
