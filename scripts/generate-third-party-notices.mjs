import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const outputPath = join(process.cwd(), 'resources', 'licenses', 'THIRD_PARTY_NOTICES.txt')
const checkOnly = process.argv.includes('--check')
const pnpmCli = process.env.npm_execpath
const command = pnpmCli ? process.execPath : (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
const args = pnpmCli
  ? [pnpmCli, 'licenses', 'list', '--prod', '--json']
  : ['licenses', 'list', '--prod', '--json']
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024
})

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || result.error?.message || 'Unable to inspect production dependency licenses.\n')
  process.exit(result.status ?? 1)
}

const grouped = JSON.parse(result.stdout)
const packages = []
const notices = new Map()

for (const [license, entries] of Object.entries(grouped)) {
  for (const entry of entries) {
    const versions = [...new Set(entry.versions ?? [])].sort()
    const packageId = `${entry.name}@${versions.join(',')}`
    const noticeIds = new Set()

    for (const packagePath of entry.paths ?? []) {
      for (const file of rootNoticeFiles(packagePath)) {
        const text = normalizeText(readFileSync(join(packagePath, file), 'utf8'))
        if (!text) continue
        const hash = createHash('sha256').update(text).digest('hex')
        const noticeId = hash.slice(0, 16)
        noticeIds.add(noticeId)
        const existing = notices.get(hash)
        if (existing) {
          existing.packages.add(packageId)
          existing.files.add(file)
        } else {
          notices.set(hash, {
            id: noticeId,
            text,
            packages: new Set([packageId]),
            files: new Set([file])
          })
        }
      }
    }

    packages.push({
      name: entry.name,
      versions,
      license,
      author: formatAuthor(entry.author),
      homepage: typeof entry.homepage === 'string' ? entry.homepage : '',
      noticeIds: [...noticeIds].sort()
    })
  }
}

packages.sort((left, right) => (
  left.name.localeCompare(right.name) || left.versions.join(',').localeCompare(right.versions.join(','))
))

const content = render(packages, [...notices.values()].sort((left, right) => left.id.localeCompare(right.id)))

if (checkOnly) {
  if (!existsSync(outputPath) || normalizeText(readFileSync(outputPath, 'utf8')) !== normalizeText(content)) {
    process.stderr.write('Third-party notices are stale. Run `pnpm licenses:generate`.\n')
    process.exit(1)
  }
  console.log(`Third-party license check passed: ${packages.length} production packages, ${notices.size} notice texts.`)
} else {
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, content, 'utf8')
  console.log(`Generated ${outputPath}: ${packages.length} production packages, ${notices.size} notice texts.`)
}

function rootNoticeFiles(packagePath) {
  return readdirSync(packagePath, { withFileTypes: true })
    .filter((item) => item.isFile() && /^(LICENSE|LICENCE|NOTICE|COPYING)(\.|$)/i.test(item.name))
    .map((item) => item.name)
    .sort((left, right) => left.localeCompare(right))
}

function formatAuthor(author) {
  if (typeof author === 'string') return author
  if (!author || typeof author !== 'object') return ''
  return [author.name, author.email, author.url].filter((value) => typeof value === 'string' && value).join(' · ')
}

function render(dependencies, noticeTexts) {
  const lines = [
    'ElecKoi Desktop — Third-Party Notices',
    '',
    'This file is generated from the locked production dependency graph.',
    'Third-party components remain under their own licenses. ElecKoi does not',
    'replace or remove those terms by distributing them with AGPL-covered code.',
    '',
    'Dependency catalog',
    '==================',
    ''
  ]

  for (const dependency of dependencies) {
    lines.push(`${dependency.name}@${dependency.versions.join(', ')}`)
    lines.push(`License: ${dependency.license}`)
    if (dependency.author) lines.push(`Author: ${dependency.author}`)
    if (dependency.homepage) lines.push(`Homepage: ${dependency.homepage}`)
    lines.push(`Bundled notice text: ${dependency.noticeIds.length ? dependency.noticeIds.join(', ') : 'not supplied by package'}`)
    lines.push('')
  }

  lines.push('License and notice texts')
  lines.push('========================')
  lines.push('')

  for (const notice of noticeTexts) {
    lines.push(`NOTICE TEXT ${notice.id}`)
    lines.push('-'.repeat(36))
    lines.push(`Source filenames: ${[...notice.files].sort().join(', ')}`)
    lines.push('Applies to:')
    for (const packageId of [...notice.packages].sort()) lines.push(`- ${packageId}`)
    lines.push('')
    lines.push(notice.text)
    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function normalizeText(value) {
  return value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
}
