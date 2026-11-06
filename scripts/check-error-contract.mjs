/**
 * 错误合约闸 `check:error-contract`。
 *
 * 判据来源：错误处理设计 §四「怎么算做对了」第 2、3 条 + §五「所以该改的不是代码，是声明方式」。
 *
 * **不写 shebang**：这个文件被 `scripts/tests/check-error-contract.test.mjs` 直接 import。
 * Windows 检出会把行尾转成 CRLF，带 shebang 的模块在 vitest 里会报
 * `SyntaxError: Invalid or unexpected token`（2026-10-18 实测，CRLF 版两份文件复现）。
 * 仓库用 `node scripts/check-error-contract.mjs` 调用它，文件也不是可执行位，不需要 shebang。
 *
 * ## 四条规则
 *
 * 1. **禁止丢码**（绝对值）：`new Error(<…>.error.message …)` —— 宿主已经把带码的失败交出来了，
 *    调用方却把它压成一句话。这是本线要消灭的核心形状。
 * 2. **契约违例必须带 `issues`**（绝对值）：`code: ELECKOI_FAILURE_CODES.contractInvalid*` 的对象字面量
 *    里必须有结构完整的 `issues`（契约规定这两条码的详情形状）。
 * 3. **空 catch 必须写成具名声明**（绝对值）：`.catch(() => {})` 与空的 / 只有注释的 `catch {}` 一律红；
 *    允许的形式是三个具名回调（`failureAlreadyPublished` / `rejectionIsAwaitedElsewhere` / `bestEffort`），
 *    或者任何**非空**的处理体（例如 `.catch(error => reportFailure(...))`）。
 *    见 `packages/shared/src/foundation/swallowedFailure.ts` 的语义表。
 * 4. **不许裸抛**：领域 / 宿主 / 客户端插件层的 `throw new Error(`
 *    必须改成带契约码的形式（`throw new DesktopError(ELECKOI_FAILURE_CODES.…, …)`）。
 *    本轮收口时已归零，所以它也是**绝对值**——P5 期间它曾是进度尺（`--strict` 才判失败），
 *    现在不需要那个开关：`--progress-only` 只给未来做迁移的线路临时看数用，CI 不要带它。
 *
 * ## 只在代码位置上匹配
 *
 * 四条规则都只看**代码位置**：同样一段文本出现在字符串字面量、模板字符串或注释里不算。
 * 判定在 {@link codePositions} 的引号状态机里做——规则 4 的语义是「我们的代码抛裸 `Error`」，
 * 而不是「仓库里恰好有一行含这个文本」。反例（曾经误计）：`guides.ts` 把作者脚本示例写成
 * 模板字符串，示例里 `throw new Error(` 是**示例脚本**的合法写法，不该让闸变红。
 *
 * 判定粒度是**匹配起点**：正则命中从代码字符开始才算命中。这样规则 2 的字面量分支
 * （`code: 'eleckoi/contract/invalid-request'`，值本身是字符串）仍然有效，而整段落在字符串里的命中无效。
 *
 * ## 不扫什么
 *
 * - `**\/assets/**`：随包分发的第三方浏览器库（lodash / pixi / pdf worker …），不是我们的代码；
 * - `**\/tests/**`、`packages/examples/**`、`scripts/**`：测试用的桩与仓库工具，不参与产品错误语义。
 *
 * ## 已知限制（诚实说明）
 *
 * 规则 1 只认**显式**的 `.error.message`。`if (!result.ok) throw new Error('泛化句')` 这种
 * 把整个失败信封丢掉的写法看不出码，本闸抓不到——它由规则 4（裸抛必须带码）在 P5 收口，
 * 以及 review 兜底。不要为了"抓得更全"把规则 1 的正则放宽成 `if (!x.ok) throw`：
 * `if (!response.ok) throw` 是**HTTP** 的 `ok`，那张网会把正常代码也判红。
 *
 * 引号状态机的边界（都不影响今天的判定，但换写法时要知道）：
 *
 * - **不认正则字面量**：`/["']/` 里的引号会被当成字符串起点。误判最多影响一行——
 *   单/双引号字符串遇到未转义换行就复位成代码（那本来不是合法 JS 的多行字符串）；
 *   模板字符串可以跨行，但那是合法的多行字符串。
 * - **不认 JSX 文本**：`<p>don't</p>` 里的撇号同样被当成字符串起点，同样受"换行复位"限制。
 * - 规则 4 只数 `throw new Error(` 这一种形状：`throw Error(...)`、字符串抛出、
 *   `Promise.reject(new Error(...))` 仍然看不见。
 *
 * 用法：
 *   node scripts/check-error-contract.mjs                     # 四条规则都是绝对值
 *   node scripts/check-error-contract.mjs --progress-only     # 规则 4 只报数（迁移期临时用，CI 不用）
 *   node scripts/check-error-contract.mjs --json              # 机器可读摘要
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

/** 扫哪些目录（仓库相对路径前缀）。 */
const SCAN_ROOTS = [
  'apps/desktop/src/',
  'apps/desktop-host/src/',
  'apps/android-host/src/',
  'apps/web/src/',
  'apps/desktop/resources/dsh/',
  'packages/host/',
  'packages/client/',
  'packages/shared/src/',
  'packages/sdk/',
  'packages/compatibility/'
]

/** 这些路径不参与扫描（第三方随包资源、测试、仓库工具）。 */
const EXCLUDED = [
  // Exact upstream sources are checked by updater provenance, not product failure rules.
  'apps/desktop/src/main/modules/updates/dsh/',
  '/assets/',
  '/tests/',
  'packages/examples/',
  '/node_modules/',
  '/lib/',
  '/dist/',
  '/out/'
]

/** 契约声明的规范目录：那里是规则表，不是失败构造点（规则 2 跳过它）。 */
const CONTRACT_DECLARATION_DIRECTORY = 'packages/shared/src/contracts/errors/'

/** 只扫这些扩展名。 */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

/** 规则 1：把带码的失败压成一句话。 */
const CODE_DROP = /new\s+Error\s*\([^)]*\.error\??\.message/g

/** 规则 2：`code:` 位置上的契约违例码。 */
const CONTRACT_INVALID_CODE = /\bcode\s*:\s*(?:ELECKOI_FAILURE_CODES\.(contractInvalid[A-Za-z_$]*)|(['"])(eleckoi\/contract\/invalid-[a-z-]+)\2)/g

/** 规则 2 的形状判据：非空 issues 数组 + 元素带 path 与 message。 */
const ISSUES_ARRAY = /issues\s*:\s*\[[^\]]*[^\]\s][^\]]*\]/
const ISSUE_ITEM = /\{\s*path\b[^}]*\bmessage\s*:|\{\s*message\s*:[^}]*\bpath\b/

/** 契约违例的两条合法码（符号名与字面量都要认）。 */
const CONTRACT_INVALID_SYMBOLS = new Set(['contractInvalidRequest', 'contractInvalidResponse'])
const CONTRACT_INVALID_LITERALS = new Set(['eleckoi/contract/invalid-request', 'eleckoi/contract/invalid-response'])
const CONTRACT_INVALID_PREFIX = 'eleckoi/contract/invalid'

/** 规则 3a：`.catch(() => {})` 及同族的空箭头体。 */
const EMPTY_PROMISE_CATCH = /\.catch\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{\s*\}\s*\)/g

/** 规则 3b：空的 / 只有注释的 `catch {}` / `catch (error) {}` 体。 */
const EMPTY_CATCH_BLOCK = /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*|\/\*[^\n]*?\*\/\s*)*\}/g

/** 规则 4：裸抛。 */
const BARE_THROW = /\bthrow\s+new\s+Error\s*\(/g

/** 规则 3 允许的三个具名声明（`.catch(name)` 是唯一"不看处理体"就放行的形式）。 */
const SWALLOW_DECLARATIONS = ['failureAlreadyPublished', 'rejectionIsAwaitedElsewhere', 'bestEffort']

/** 代码位置掩码的取值：`CODE` = 代码字符，其余（0） = 字符串内容 / 注释 / 引号本身。 */
const CODE = 1

/**
 * 逐字符判「这个字符是不是代码位置」。
 *
 * 维护的状态：代码、单引号、双引号、模板字符串、行注释、块注释。转义符 `\` 跳过下一个字符
 * （所以 `'it\'s'` 不会在 `\'` 处收尾）。模板字符串里的 `${…}` 切回代码状态并记录花括号深度，
 * 所以插值里的 `throw` 是真代码、插值里的字符串仍被遮住。
 *
 * 单/双引号字符串遇到未转义换行就复位成代码：那本来不是合法的多行 JS 字符串，
 * 复位把"认错的引号"（正则字面量、JSX 文本里的撇号）的影响限制在一行以内。
 *
 * `@returns {Uint8Array}` 与源码等长：`1` 是代码位置，`0` 不是。
 * @param {string} text - 源码全文。
 */
export function codePositions(text) {
  const positions = new Uint8Array(text.length)
  /** 模板字符串插值的花括号深度（每层 `${` 一个元素）。 */
  const interpolations = []
  /** @type {'code' | 'single' | 'double' | 'template' | 'line-comment' | 'block-comment'} */
  let mode = 'code'
  /** 每行行首的插值层数：换个行就要回到这个层数（见下面的引号复位）。 */
  let lineStartDepth = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (index === 0 || text[index - 1] === '\n') lineStartDepth = interpolations.length
    if (mode === 'line-comment') {
      if (char === '\n') mode = 'code'
      continue
    }
    if (mode === 'block-comment') {
      if (char === '*' && next === '/') {
        mode = 'code'
        index += 1
      }
      continue
    }
    if (mode === 'single' || mode === 'double') {
      if (char === '\\') {
        index += 1
        continue
      }
      if (char === '\n') {
        // 未转义的换行：这个引号多半不是字符串起点（正则字面量 / JSX 文本里的撇号）。
        // 丢掉这一行造成的假状态：回到代码，并退回行首的插值层数，别让一行误判污染后面所有行。
        mode = 'code'
        interpolations.length = lineStartDepth
        continue
      }
      if ((mode === 'single' && char === "'") || (mode === 'double' && char === '"')) mode = 'code'
      continue
    }
    if (mode === 'template') {
      if (char === '\\') {
        index += 1
        continue
      }
      if (char === '`') {
        mode = 'code'
        continue
      }
      if (char === '$' && next === '{') {
        interpolations.push(0)
        mode = 'code'
        index += 1
        continue
      }
      continue
    }
    // mode === 'code'
    if (char === '/' && next === '/') {
      mode = 'line-comment'
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      mode = 'block-comment'
      index += 1
      continue
    }
    if (char === "'") {
      mode = 'single'
      continue
    }
    if (char === '"') {
      mode = 'double'
      continue
    }
    if (char === '`') {
      mode = 'template'
      continue
    }
    if (interpolations.length > 0) {
      // 插值内部：`{` / `}` 只用来找配对的 `}`；深度归零后回到模板字符串。
      const depth = interpolations[interpolations.length - 1]
      if (char === '{') {
        interpolations[interpolations.length - 1] = depth + 1
        positions[index] = CODE
        continue
      }
      if (char === '}') {
        if (depth === 0) {
          interpolations.pop()
          mode = 'template'
          continue
        }
        interpolations[interpolations.length - 1] = depth - 1
        positions[index] = CODE
        continue
      }
    }
    positions[index] = CODE
  }
  return positions
}

/**
 * 把源码切成行，并为每行切出对应的代码位置掩码（行号因此与源码一致）。
 * @param {string} text - 源码全文。
 * @returns {{ lines: string[], masks: Uint8Array[] }} 行与逐行掩码。
 */
function linesWithPositions(text) {
  const positions = codePositions(text)
  const lines = text.split('\n')
  const masks = []
  let offset = 0
  for (const line of lines) {
    masks.push(positions.subarray(offset, offset + line.length))
    offset += line.length + 1
  }
  return { lines, masks }
}

/**
 * 只在代码位置上找匹配：返回第一个**起点是代码字符**的匹配，没有就是 `null`。
 *
 * 用 `matchAll` 而不是 `.test`：一行里可能先出现字符串里的假命中，再出现真命中
 * （例如 `if (!x.ok) throw new Error("…" + result.error.message)`）。
 * @param {RegExp} pattern - 必须是带 `g` 标志的正则（沿用调用处的捕获组）。
 * @param {string} line - 一行源码。
 * @param {Uint8Array} positions - 这一行的代码位置掩码。
 * @returns {RegExpMatchArray | null} 匹配或 `null`。
 */
function matchInCode(pattern, line, positions) {
  for (const match of line.matchAll(pattern)) {
    if (positions[match.index] === CODE) return match
  }
  return null
}

/**
 * 列出仓库里要扫的文件（用 git ls-files，避免把 node_modules 与构建产物扫进来）。
 * @returns {string[]} 仓库相对路径。
 */
function scanFiles() {
  const nativeSources = new Set()
  const repository = resolve(fileURLToPath(new URL('..', import.meta.url)))
  for (const manifestPath of [
    'apps/desktop/src/main/platform/electron/dsh/capabilities.provenance.json',
    'apps/desktop/src/main/modules/updates/dsh/provenance.json'
  ]) {
    const manifestDirectory = resolve(repository, manifestPath, '..')
    const manifest = JSON.parse(readFileSync(resolve(repository, manifestPath), 'utf8'))
    for (const source of manifest.files) {
      const path = manifestPath.endsWith('capabilities.provenance.json')
        ? resolve(repository, source.path) : resolve(manifestDirectory, source.path)
      const contents = readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
      if (createHash('sha256').update(contents).digest('hex') !== source.localSha256) {
        throw new Error(`DSH native source differs from provenance: ${source.path}`)
      }
      nativeSources.add(path)
    }
  }
  const listed = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean))]
  return listed.filter((file) => {
    if (!SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension))) return false
    if (!SCAN_ROOTS.some((root) => file.startsWith(root))) return false
    return !nativeSources.has(resolve(repository, file)) && !EXCLUDED.some((part) => file.includes(part))
  })
}

/**
 * 扫**一段源码**，返回四条规则的命中。是 `inspect` 的单文件版本，也是用例直接调的入口。
 * @param {string} text - 源码全文。
 * @param {string} file - 报告里用的文件名（`<source>` 用于样本；只影响规则 2 的契约目录豁免）。
 * @returns {Array<{rule: string, file: string, line: number, detail: string}>} 命中列表。
 */
export function inspectSource(text, file = '<source>') {
  const { lines, masks } = linesWithPositions(text)
  const hasIssuesArray = ISSUES_ARRAY.test(text)
  const hasIssueItem = ISSUE_ITEM.test(text)
  const contractDeclaration = file.startsWith(CONTRACT_DECLARATION_DIRECTORY)
  const hits = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const positions = masks[index]
    const lineNumber = index + 1
    if (matchInCode(CODE_DROP, line, positions) !== null) {
      hits.push({ rule: 'no-code-drop', file, line: lineNumber, detail: line.trim() })
    }
    if (matchInCode(EMPTY_PROMISE_CATCH, line, positions) !== null) {
      hits.push({ rule: 'empty-catch', file, line: lineNumber, detail: line.trim() })
    }
    if (matchInCode(EMPTY_CATCH_BLOCK, line, positions) !== null) {
      hits.push({ rule: 'empty-catch', file, line: lineNumber, detail: line.trim() })
    }
    if (matchInCode(BARE_THROW, line, positions) !== null) {
      hits.push({ rule: 'bare-throw', file, line: lineNumber, detail: line.trim() })
    }
    if (contractDeclaration) continue
    const contract = matchInCode(CONTRACT_INVALID_CODE, line, positions)
    if (contract !== null) {
      const symbol = contract[1]
      const literal = contract[3]
      const registered = symbol !== undefined
        ? CONTRACT_INVALID_SYMBOLS.has(symbol)
        : CONTRACT_INVALID_LITERALS.has(literal)
      if (!registered) {
        hits.push({ rule: 'contract-issues', file, line: lineNumber, detail: `未登记的契约违例码：${symbol ?? literal}` })
      } else if (!hasIssuesArray || !hasIssueItem) {
        hits.push({ rule: 'contract-issues', file, line: lineNumber, detail: '契约违例的详情必须是带 path 与 message 的非空 issues 数组' })
      }
    }
  }
  return hits
}

/**
 * 逐文件跑 {@link inspectSource}。
 * @param {string[]} files - 仓库相对路径列表。
 * @returns {{ hits: Array<{rule: string, file: string, line: number, detail: string}>, files: number }} 命中与文件数。
 */
function inspect(files) {
  const hits = []
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    hits.push(...inspectSource(text, file))
  }
  return { hits, files: files.length }
}

/**
 * 规则 3 的放行判据：`.catch(name)` 里的 name 在三个允许的名字里。
 * 规则 3 只把**空处理体**判红，非空的处理体（如 `.catch(error => reportFailure(...))`）不算命中，
 * 所以这里只用于报告时区分"用名字声明的"与"根本没命中"的条数。
 * @param {string} line - 一行源码。
 * @returns {boolean} 是不是具名声明。
 */
export function isNamedDeclaration(line) {
  return SWALLOW_DECLARATIONS.some((name) => new RegExp(`\\.catch\\(\\s*${name}\\s*\\)`).test(line))
}

function main() {
  // 规则 4 已是绝对值：默认判失败；`--progress-only` 只给迁移期的线路临时看数。
  const strict = !process.argv.includes('--progress-only')
  const json = process.argv.includes('--json')
  const files = scanFiles()
  const { hits } = inspect(files)
  const byRule = new Map()
  for (const hit of hits) {
    const list = byRule.get(hit.rule) ?? []
    list.push(hit)
    byRule.set(hit.rule, list)
  }
  const absoluteRules = ['no-code-drop', 'contract-issues', 'empty-catch']
  const failing = []
  for (const rule of absoluteRules) {
    const list = byRule.get(rule) ?? []
    if (list.length > 0) failing.push({ rule, hits: list })
  }
  const bareThrows = byRule.get('bare-throw') ?? []
  if (strict && bareThrows.length > 0) failing.push({ rule: 'bare-throw', hits: bareThrows })

  if (json) {
    console.log(JSON.stringify({
      sourceFiles: files.length,
      counts: Object.fromEntries([...byRule].map(([rule, list]) => [rule, list.length])),
      failures: failing.map((entry) => ({ rule: entry.rule, count: entry.hits.length }))
    }, null, 2))
  } else {
    console.log(`扫了 ${files.length} 个源文件（规则只看代码位置：字符串与注释里的同样文本不计）。`)
    console.log(`规则 1 禁止丢码：${(byRule.get('no-code-drop') ?? []).length} 处`)
    console.log(`规则 2 契约违例详情：${(byRule.get('contract-issues') ?? []).length} 处`)
    console.log(`规则 3 空 catch：${(byRule.get('empty-catch') ?? []).length} 处`)
    console.log(`规则 4 裸抛（${strict ? '绝对值' : '只报数（--progress-only）'}）：${bareThrows.length} 处`)
    for (const entry of failing) {
      console.log(`\n✗ 规则「${ruleTitle(entry.rule)}」命中 ${entry.hits.length} 处：`)
      for (const hit of entry.hits.slice(0, 40)) console.log(`  ${hit.file}:${hit.line}  ${hit.detail}`)
      if (entry.hits.length > 40) console.log(`  …还有 ${entry.hits.length - 40} 处`)
    }
  }
  if (failing.length > 0) {
    if (!json) console.log(`\nError contract check FAILED（${failing.map((entry) => entry.rule).join(', ')}）。`)
    process.exitCode = 1
    return
  }
  if (!json) console.log('\nError contract check passed.')
}

/**
 * 规则 id → 中文标题（报告用）。
 * @param {string} id - 规则 id。
 * @returns {string} 标题。
 */
function ruleTitle(id) {
  if (id === 'no-code-drop') return '禁止丢码'
  if (id === 'contract-issues') return '契约违例必须带 issues'
  if (id === 'empty-catch') return '空 catch 必须写成具名声明'
  return '不许裸抛（领域 / 宿主 / 客户端插件层）'
}

// 被 `scripts/tests/**` import 时只拿函数，不要顺手跑一遍全仓扫描。
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
