import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const hiddenToolTimelineFileName = 'hidden-tool-timeline.txt'
export const bundledHiddenToolTimeline = new URL('../prompts/hidden-tool-timeline.txt', import.meta.url)

const header = /^<!-- eleckoi-default: ([a-f0-9]{64}) -->\r?\n/

export function readOptionalPromptFile(path: string): string | undefined {
  try { return readFileSync(path, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function replacePromptFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export class HiddenToolTimelineFile {
  private readonly path: string

  constructor(profileDirectory: string, private readonly bundledFile = bundledHiddenToolTimeline) {
    this.path = join(profileDirectory, hiddenToolTimelineFileName)
  }

  read(): string {
    const shipped = readFileSync(this.bundledFile, 'utf8').replaceAll('\r\n', '\n').trimEnd()
    const stamp = digest(shipped)
    const local = readOptionalPromptFile(this.path)
    if (local !== undefined) {
      const previous = header.exec(local)
      const content = local.slice(previous?.[0].length ?? 0)
      if (!previous || previous[1] === stamp) return content
    }
    replacePromptFile(this.path, `<!-- eleckoi-default: ${stamp} -->\n${shipped}`)
    return shipped
  }

  write(content: string): void {
    const local = readFileSync(this.path, 'utf8')
    replacePromptFile(this.path, (header.exec(local)?.[0] ?? '') + content)
  }
}
