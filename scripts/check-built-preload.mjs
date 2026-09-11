import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const cjsPath = join(process.cwd(), 'out', 'preload', 'preload.cjs')
const obsoleteEsmPath = join(process.cwd(), 'out', 'preload', 'preload.mjs')

if (!existsSync(cjsPath)) {
  throw new Error('Packaged preload must be emitted as out/preload/preload.cjs.')
}

if (existsSync(obsoleteEsmPath)) {
  throw new Error('Obsolete ESM preload artifact still exists: out/preload/preload.mjs.')
}

const preload = readFileSync(cjsPath, 'utf8')
if (/^\s*import\s/m.test(preload)) {
  throw new Error('Sandboxed preload contains an ESM import and will fail at startup.')
}

console.log('Packaged preload check passed: sandbox-compatible CommonJS artifact is present.')
