/**
 * 报告草稿的落盘存储——只用 `node:fs` 与路径，不 import `electron`，所以用例能直接跑。
 *
 * 判据（[ADR 0042](../../../../../docs/adr/0042-bug-report-delivery.md) 决定 14）：**失败不丢，但也不
 * 偷偷重发。** 发送失败或用户中途关闭时，已脱敏的报告写进 `userData/bug-reports/pending/<key>.json`；
 * 30 天后清理，最多留 10 份；下次启动最多提示一次要不要重发——重发永远是用户点的。
 * 同一份失败（同签名）重复失败只留最新一份：一次崩溃循环不该把清理额度吃满、更不该把别的草稿挤掉。
 *
 * 四条约束：
 *
 * 1. **草稿键是文件名，所以是安全边界。** 键从渲染层经 IPC 回来，只允许 `[A-Za-z0-9._-]`（
 *    `isBugReportDraftKey`）；非法键一律拒，`../` 之类到不了文件系统。
 * 2. **原子写。** 临时文件 + `rename`：直接覆写一个正在读的草稿，或写到一半断电，都会留下半个
 *    JSON，下次启动只能当坏文件跳过。
 * 3. **读回永不抛。** 坏文件（半截 JSON、`[]`、缺字段、键与文件名对不上）跳过、**不删**——目录里
 *    可能有别人的文件，清理只碰我们自己命名规则的 `<key>.json`。
 * 4. **草稿是尽力而为的功能。** 列表与清理的失败不影响主流程；只有用户明确按下「存草稿」时，
 *    写失败才变成 `io/failed`（带 `operation` / `path`）。
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BugReportDraftSaved, BugReportPendingDraft } from '@shared/contracts/bugReport/delivery'
import {
  BUG_REPORT_DRAFT_KEY_MAX_LENGTH,
  isBugReportDraftKey,
  isBugReportPendingDraft
} from '@shared/contracts/bugReport/delivery'
import { bugReportSignature, type BugReport } from '@shared/contracts/bugReport/report'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { parseJsonObject } from '@shared/foundation/json'
import { errorTextOf } from './failureText'

/** 草稿保留多少天（决定 14）。 */
export const BUG_REPORT_DRAFT_RETENTION_DAYS = 30

/** 目录里最多留几份草稿；超出的从最旧的开始删。 */
export const BUG_REPORT_MAX_PENDING_DRAFTS = 10

/** 一天的毫秒数。 */
const DAY_MS = 24 * 60 * 60 * 1000

/** 草稿文件后缀；只有这个后缀的条目才归我们管。 */
const DRAFT_FILE_SUFFIX = '.json'

/** 一份从磁盘读回来的草稿：路径留给删除用，草稿本身是要给渲染层的。 */
interface StoredDraft {
  readonly path: string
  readonly draft: BugReportPendingDraft
}

/**
 * 草稿目录：`<userData>/bug-reports/pending`。
 *
 * @param userData - 应用数据目录（主进程用 `ctx.appPaths.userData`，不是 `app.getPath('userData')`）。
 * @returns 草稿目录的绝对路径。
 */
export function pendingDraftDirectory(userData: string): string {
  return join(userData, 'bug-reports', 'pending')
}

/**
 * 报告 → 草稿键：签名 + 生成时间，只保留 `[A-Za-z0-9._-]`。
 *
 * 同一份报告（同签名、同生成时间）永远得到同一个键，所以重存是覆盖而不是多一条。
 * 键必须过 `isBugReportDraftKey`：签名来自日志里的失败码，可能异常地长，所以超长时截断并补一段
 * 原文摘要——只截断不加摘要的话，两份长码只在尾部不同的报告会撞进同一个键。
 *
 * @param report - 已脱敏的报告。
 * @returns 文件名安全的草稿键。
 */
export function pendingDraftKey(report: BugReport): string {
  const raw = `${keyPart(bugReportSignature(report))}-${keyPart(report.generatedAt)}`
  if (raw.length <= BUG_REPORT_DRAFT_KEY_MAX_LENGTH) return raw
  const digest = shortDigest(raw)
  return `${raw.slice(0, BUG_REPORT_DRAFT_KEY_MAX_LENGTH - digest.length - 1)}-${digest}`
}

/**
 * 写一份草稿（原子：临时文件 + rename），返回 `{ key, savedAt }`。
 *
 * 写完在**同一趟**目录扫描里做两件事：同签名的旧草稿只留刚写的这份（同一份失败重复失败不该攒出
 * 一堆副本，否则一次崩溃循环就会把 30 天清理与 10 份上限吃满），再把多出来的按最旧删到 10 份。
 * 两件事看的是同一份快照，`storedDrafts` 已经解析过整份 JSON，没必要扫两遍。
 *
 * 写失败抛 `eleckoi/io/failed`（带 `operation` / `path`）——用户按下的动作必须有个交代。
 *
 * @param input - 目录、报告与「现在」（用例传固定时间）。
 * @returns 主进程生成的键与落盘时间。
 * @throws DesktopError `eleckoi/io/failed`：目录建不出来或文件写不进去。
 */
export function savePendingDraft(input: {
  readonly directory: string
  readonly report: BugReport
  readonly now: Date
}): BugReportDraftSaved {
  const key = pendingDraftKey(input.report)
  const savedAt = input.now.toISOString()
  const path = draftFilePath(input.directory, key)
  const draft: BugReportPendingDraft = { key, savedAt, report: input.report }
  try {
    mkdirSync(input.directory, { recursive: true })
    writeDraftAtomically(path, `${JSON.stringify(draft, null, 2)}\n`)
  } catch (error) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.ioFailed,
      `写入报告草稿失败：${errorTextOf(error)}`, { operation: 'write', path })
  }
  pruneAfterSave(input.directory, key, bugReportSignature(input.report))
  return { key, savedAt }
}

/**
 * 列出草稿（新到旧），顺手删掉超过 30 天的；坏文件跳过，**永不抛**。
 *
 * @param input - 目录与「现在」（用例传固定时间）。
 * @returns 合法的草稿，新的在前。
 */
export function listPendingDrafts(input: {
  readonly directory: string
  readonly now: Date
}): BugReportPendingDraft[] {
  const cutoff = input.now.getTime() - BUG_REPORT_DRAFT_RETENTION_DAYS * DAY_MS
  const kept: StoredDraft[] = []
  for (const entry of storedDrafts(input.directory)) {
    if (Date.parse(entry.draft.savedAt) < cutoff) {
      removeQuietly(entry.path)
      continue
    }
    kept.push(entry)
  }
  kept.sort(compareNewestFirst)
  return kept.map(entry => entry.draft)
}

/**
 * 删一份草稿；键非法或文件不存在都不抛。
 *
 * @param input - 目录与草稿键（渲染层回传的原始字符串）。
 */
export function discardPendingDraft(input: {
  readonly directory: string
  readonly key: string
}): void {
  if (!isBugReportDraftKey(input.key)) return
  removeQuietly(draftFilePath(input.directory, input.key))
}

/** 拼草稿文件的完整路径；调用方必须先过 `isBugReportDraftKey`。 */
function draftFilePath(directory: string, key: string): string {
  return join(directory, `${key}${DRAFT_FILE_SUFFIX}`)
}

/** 草稿键里只留文件名安全字符；其余（`@`、`/`、`:` …）一律压成 `-`。 */
function keyPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-')
}

/**
 * 8 位十六进制摘要（FNV-1a）。
 *
 * 只用来给超长键的截断部分补一个稳定的判据，不做安全用途。
 *
 * @param value - 原文。
 * @returns 固定 8 位的十六进制串。
 */
function shortDigest(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 原子写：先写临时文件（`wx`，绝不覆盖别人的），再 `rename` 到目标。
 *
 * 形状照 `packages/host/runtime/src/sessionEditPlugin.ts` 的同一个做法；临时文件在 `finally` 里删，
 * 成功路径上它已经被 `rename` 走了（`force` 让删除变成无害的 no-op）。
 */
function writeDraftAtomically(path: string, text: string): void {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, text, { flag: 'wx' })
    renameSync(temporary, path)
  } finally {
    removeQuietly(temporary)
  }
}

/**
 * 目录里所有**我们能认领**的草稿。
 *
 * 只读 `<key>.json` 且键合法的条目；读不了、JSON 坏、整份形状不对、键与文件名对不上的一律跳过。
 * 键与文件名必须一致：`discard` 只按文件名删，对不上的条目会永远删不掉，所以只能当坏文件。
 */
function storedDrafts(directory: string): readonly StoredDraft[] {
  const drafts: StoredDraft[] = []
  for (const name of readDirectory(directory)) {
    const entry = storedDraft(directory, name)
    if (entry !== undefined) drafts.push(entry)
  }
  return drafts
}

/** 读一个目录条目；目录不存在或读不了就是空的。 */
function readDirectory(directory: string): readonly string[] {
  try {
    return readdirSync(directory)
  } catch {
    return []
  }
}

/** 读一个条目，认领它或跳过它。 */
function storedDraft(directory: string, name: string): StoredDraft | undefined {
  if (!name.endsWith(DRAFT_FILE_SUFFIX)) return undefined
  const key = name.slice(0, -DRAFT_FILE_SUFFIX.length)
  if (!isBugReportDraftKey(key)) return undefined
  const path = join(directory, name)
  const text = readText(path)
  if (text === undefined) return undefined
  const draft = draftOf(parseJsonObject(text))
  if (draft === undefined || draft.key !== key) return undefined
  return { path, draft }
}

/** 读文件原文；读不了（不存在、权限、是目录）就是 `undefined`。 */
function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/** 整份校验；`savedAt` 还要能解析成时间——它参与排序与 30 天清理。 */
function draftOf(value: unknown): BugReportPendingDraft | undefined {
  if (!isBugReportPendingDraft(value)) return undefined
  return Number.isFinite(Date.parse(value.savedAt)) ? value : undefined
}

/**
 * 写完一趟扫描里做完两件事：同签名只留刚写的那份，多出来的按最旧删到上限。
 *
 * 「同签名」用 `bugReportSignature(report)` 重新派生——不信任文件名、也不额外存一份签名。
 * 刚写的那份按键排除：它可能因为时钟偏差排不到最前，但用户刚按下的动作不该被自己的清理删掉。
 */
function pruneAfterSave(directory: string, keptKey: string, signature: string): void {
  const survivors: StoredDraft[] = []
  for (const entry of [...storedDrafts(directory)].sort(compareNewestFirst)) {
    if (entry.draft.key !== keptKey && bugReportSignature(entry.draft.report) === signature) {
      removeQuietly(entry.path)
      continue
    }
    survivors.push(entry)
  }
  for (const entry of survivors.slice(BUG_REPORT_MAX_PENDING_DRAFTS)) removeQuietly(entry.path)
}

/** 新的在前；同一时刻按键升序，排序结果与目录读取顺序无关。 */
function compareNewestFirst(left: StoredDraft, right: StoredDraft): number {
  const byTime = Date.parse(right.draft.savedAt) - Date.parse(left.draft.savedAt)
  return byTime !== 0 ? byTime : left.draft.key.localeCompare(right.draft.key)
}

/** 删除是尽力而为的：清不掉不该让列表或保存失败（`force` 让不存在的文件也不抛）。 */
function removeQuietly(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    return
  }
}
