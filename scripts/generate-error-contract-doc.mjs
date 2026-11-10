#!/usr/bin/env node
/**
 * 从契约源生成内部可读的失败契约文档 `docs/error-contract.md`。
 *
 * 生成的产物逐码一行：码字符串 / 语义键 / 该码的详情参数 / 默认呈现通道 / 无参数时的用户句；
 * 外加解释四条契约规则、详情参数闭集与「通道只能上调」的三节。产物头部写明是生成物，
 * `pnpm check:error-contract-doc`（`pnpm build` 的一步）拒绝过期产物。
 *
 * ## 为什么用模块钩子读 TS 源（而不是 esbuild 或文本解析）
 *
 * 码表（`packages/shared/src/contracts/errors/codes.ts`）与参数表（同目录 `details.ts`）都是 TS 源，
 * 且 `details.ts` 里有 `import … from './codes.js'`——Node 的类型剥离按真实文件解析，
 * **不会**把 `.js` 重写成 `.ts`，所以直接 `import()` 那个文件会 `ERR_MODULE_NOT_FOUND`。
 * 三条路里选了第三条：
 *
 * 1. **esbuild**：根 `node_modules` 里没有它（`require.resolve('esbuild')` 从仓库根是 MODULE_NOT_FOUND；
 *    它只作为 vite 的传递依赖躺在 pnpm 的 `.pnpm/node_modules` 里）。为一个文档脚本引入一条隐式依赖不值。
 * 2. **文本解析**：码表确实是规整字面量，但那样文档就有两份真相——契约改了形状，生成器会静默产出旧表。
 * 3. **模块钩子（本文件）**：`module.registerHooks` 解析掉 `@shared/*` 别名与 `*.js → *.ts`，
 *    然后 `import()` 真源。没有引入依赖，读到的就是运行期真值（`ELECKOI_FAILURE_DETAIL_PARAMS`
 *    漏一条码在 TS 里就编译不过，这里拿到的就是那张表）。
 *
 * 用户句不能从 `failureText.js` 读：那张表是 `(details) => "…"` 的函数，拿不到字面量。
 * 所以表、默认通道集合与参数读取工具住在 `apps/web/src/utils/failureTexts.js`（无副作用的纯模块），
 * 这里直接 `import()` 它，用 `FAILURE_TEXTS[code]({})` 当「无参数时的说法」。
 *
 * 用法：
 *   node scripts/generate-error-contract-doc.mjs          # 写入 docs/error-contract.md
 *   node scripts/generate-error-contract-doc.mjs --check  # 只校验产物是否最新
 */
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalizeLineEndings } from './lib/normalize-line-endings.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(root, 'docs/error-contract.md')
const checkOnly = process.argv.includes('--check')

const SHARED_SOURCE = resolve(root, 'packages/shared/src')
const CODES_PATH = resolve(SHARED_SOURCE, 'contracts/errors/codes.ts')
const DETAILS_PATH = resolve(SHARED_SOURCE, 'contracts/errors/details.ts')
const TEXTS_PATH = resolve(root, 'apps/web/src/utils/failureTexts.js')

/** `docs/` 里的相对链接（`check:docs` 会逐个 stat）。 */
const links = {
  codes: '../packages/shared/src/contracts/errors/codes.ts',
  details: '../packages/shared/src/contracts/errors/details.ts',
  texts: '../apps/web/src/utils/failureTexts.js',
  gate: '../scripts/check-error-contract.mjs',
  authorApiError: '../packages/sdk/author/src/errors.ts',
  foldFailure: '../packages/shared/src/foundation/failure.ts',
  legacyCodes: '../packages/shared/src/foundation/DesktopError.ts'
}

/**
 * 参数名 → 一句可读的解释。键集合由下面的断言与 `details.ts` 的联合声明对齐：
 * 契约新增参数时必须在这里补一句，否则生成器报错（文档不许漏参数）。
 */
const PARAM_DESCRIPTIONS = {
  field: '出问题的字段或配置项名（用户填的、模型配置的）。',
  issues: '合同违例的逐条诊断：`{ path, message }` 数组。',
  path: '涉及的文件系统路径（操作对象、被占用的目录）。',
  operation: '动作名（`read` / `write` / `delete` / `spawn` / `request` …）。',
  guard: '拒绝执行的那道护栏名（如 `untrusted-sender`）。',
  what: '涉及的**东西**（会被拼进用户句，如「角色」「预设分组」）；多数码写名词短语，'
    + '`eleckoi/state/precondition` 例外、写用户该先做的**动作**；不是 id。',
  expected: '当前版本或支持范围要求的形态（如 `schema v3`）。',
  actual: '实际观察到的形态。',
  upstreamDetails: '未知上游失败携带的原始 JSON 详情，随兜底码保留供显示、复制与报告。'
}

const isFile = (path) => existsSync(path) && statSync(path).isFile()

/**
 * 模块说明符可以省略扩展名；按 Node 的 ESM 习惯补成真实文件。
 * @param {string} base - 不含扩展名的绝对路径。
 * @returns {string | undefined} 命中的真实文件。
 */
function findSourceFile(base) {
  return [`${base}.ts`, `${base}.js`, base, `${base}/index.ts`].find(isFile)
}

registerHooks({
  /**
   * 只解析两种说明符：`@shared/*` 别名与相对路径里的 `*.js → *.ts`。
   * 其余原样交给 Node（`node:`、包名等）。
   */
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL
    if (parent !== undefined && parent.startsWith('file:')) {
      const parentDirectory = dirname(fileURLToPath(parent))
      if (specifier.startsWith('@shared/')) {
        const target = findSourceFile(resolve(SHARED_SOURCE, specifier.slice('@shared/'.length)))
        if (target !== undefined) return { url: pathToFileURL(target).href, shortCircuit: true }
      }
      if (specifier.startsWith('.')) {
        const target = resolve(parentDirectory, specifier)
        const typeScript = target.endsWith('.js') ? `${target.slice(0, -3)}.ts` : target
        if (typeScript !== target && isFile(typeScript)) {
          return { url: pathToFileURL(typeScript).href, shortCircuit: true }
        }
      }
    }
    return nextResolve(specifier, context)
  }
})

const {
  ELECKOI_FAILURE_CODES,
  ELECKOI_FAILURE_CODE_LIST,
  ELECKOI_FALLBACK_FAILURE_CODE,
  ELECKOI_FAILURE_CODE_PATTERN
} = await import(pathToFileURL(CODES_PATH).href)
const { ELECKOI_FAILURE_DETAIL_PARAMS } = await import(pathToFileURL(DETAILS_PATH).href)
const { FAILURE_TEXTS, APP_LEVEL_CODES } = await import(pathToFileURL(TEXTS_PATH).href)

const CODES = [...ELECKOI_FAILURE_CODE_LIST]
const KEY_BY_CODE = new Map(Object.entries(ELECKOI_FAILURE_CODES).map(([key, code]) => [code, key]))

assert.equal(CODES.length, Object.keys(ELECKOI_FAILURE_CODES).length, '码表的清单与对象条数不一致')
assert.equal(new Set(CODES).size, CODES.length, '码表清单里有重复的码')
assert.ok(CODES.includes(ELECKOI_FALLBACK_FAILURE_CODE), '兜底码不在码表清单里')

/**
 * 参数名闭集从 `details.ts` 的联合类型声明读（运行期不存在这个类型）。
 * 类型被擦除后没有别的读法；读错时下面的断言会报出条数不符，而不是静默产出半张表。
 */
const detailsSource = normalizeLineEndings(await readFile(DETAILS_PATH, 'utf8'))
const paramUnion = /export type EleckoiFailureDetailParam =([\s\S]*?)\n\n/.exec(detailsSource)
assert.ok(paramUnion !== null, 'details.ts 里找不到 EleckoiFailureDetailParam 的联合声明')
const CLOSED_PARAMS = [...paramUnion[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
assert.equal(new Set(CLOSED_PARAMS).size, CLOSED_PARAMS.length, '参数名闭集里有重复项')
assert.deepEqual(
  [...CLOSED_PARAMS].sort(),
  Object.keys(PARAM_DESCRIPTIONS).sort(),
  'details.ts 的参数名闭集与生成器的解释表不一致：新增参数要在 generate-error-contract-doc.mjs 里补一句'
)

/** 每个参数被哪些码要求（文档表格用，永远与参数表一致）。 */
const CODES_BY_PARAM = new Map(CLOSED_PARAMS.map((param) => [param, []]))
for (const code of CODES) {
  const params = ELECKOI_FAILURE_DETAIL_PARAMS[code]
  assert.ok(Array.isArray(params), `码 ${code} 在 ELECKOI_FAILURE_DETAIL_PARAMS 里没有一行`)
  for (const param of params) {
    assert.ok(CODES_BY_PARAM.has(param), `码 ${code} 用了闭集外的参数 ${param}`)
    CODES_BY_PARAM.get(param).push(code)
  }
}

/**
 * 码 → 无参数时的用户句（兜底码没有固定说法，它走「原始失败」那条分支）。
 * @param {string} code - 契约码。
 * @returns {string} 一句话。
 */
function userTextOf(code) {
  const describe = FAILURE_TEXTS[code]
  if (describe === undefined) {
    assert.equal(code, ELECKOI_FALLBACK_FAILURE_CODE, `码 ${code} 在 failureTexts.js 里没有用户句`)
    return '—（无固定句：带 `details.what` → 通用句；不带 → 开发者诊断。见 §5.1）'
  }
  assert.equal(typeof describe, 'function', `码 ${code} 的用户句不是函数`)
  const text = describe({})
  assert.equal(typeof text, 'string', `码 ${code} 的用户句不是字符串`)
  assert.notEqual(text.trim(), '', `码 ${code} 的用户句是空的`)
  return text
}

/** 通道 → 对外说法。 */
const channelOf = (code) => (APP_LEVEL_CODES.has(code) ? '应用级（app）' : '功能内（inline）')

/** Markdown 表格单元格转义。 */
function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>')
}

const APP_LEVEL_LIST = CODES.filter((code) => APP_LEVEL_CODES.has(code))

/** 有固定用户句的码：除兜底码外每条都该有（下面断言），兜底码走 `userTextOf` 的策略分支。 */
const FIXED_TEXT_CODES = CODES.filter((code) => FAILURE_TEXTS[code] !== undefined)
assert.equal(
  FIXED_TEXT_CODES.length,
  CODES.length - 1,
  '除兜底码外的每条码都该在 failureTexts.js 里有一句固定说法'
)
assert.ok(!FIXED_TEXT_CODES.includes(ELECKOI_FALLBACK_FAILURE_CODE), '兜底码不该有固定说法')


/** 个别码的详情参数需要一句例外说明（写进 §5 的「详情参数」列）。 */
const PARAM_CELL_NOTES = {
  [ELECKOI_FAILURE_CODES.statePrecondition]: '（写用户该先做的**动作**，不是名词短语）'
}
for (const code of Object.keys(PARAM_CELL_NOTES)) {
  assert.ok(CODES.includes(code), `PARAM_CELL_NOTES 里有不在码表里的码 ${code}`)
}

const rows = CODES.map((code) => {
  const key = KEY_BY_CODE.get(code)
  assert.ok(key !== undefined, `码 ${code} 不在 ELECKOI_FAILURE_CODES 里`)
  const params = ELECKOI_FAILURE_DETAIL_PARAMS[code].map((param) => `\`${param}\``).join('、')
  const note = PARAM_CELL_NOTES[code] ?? ''
  return `| \`${code}\` | \`${key}\` | ${params}${note} | ${channelOf(code)} | ${escapeCell(userTextOf(code))} |`
})

const paramRows = CLOSED_PARAMS.map((param) => {
  const users = CODES_BY_PARAM.get(param)
  const usedBy = users.length === 0 ? '—（当前没有码要求）' : users.map((code) => `\`${code}\``).join('、')
  return `| \`${param}\` | ${PARAM_DESCRIPTIONS[param]} | ${usedBy} |`
})

/* 行数组而不是整段模板字符串：正文里有大量反引号（代码跨度），数组里每行都是纯字面量。 */
const lines = [
  '<!-- 由 pnpm generate:error-contract-doc 生成，请勿手改。 -->',
  '',
  '# ElecKoi 失败契约',
  '',
  '这份文档把 ElecKoi 的失败码、每条码的参数化详情、用户文案通道与四条契约规则写成内部可读的一页。',
  '它从契约源码生成（真源见文末），所以不会与实现漂移：手改产物会被 `pnpm check:error-contract-doc`',
  '拒绝，`pnpm build` 也跑这一步。',
  '',
  '这份文档是**内部契约**，读者是本仓库的维护者与客户端 bundle 的维护者：前者看哪条码带哪些参数、',
  '默认走哪个通道、用户看到的无参数说法是什么；后者看按 `code` 分支时对应哪条码。码表是内部枚举，',
  '加码自由、改名要一次全局替换；**第三方插件按 `code` 分支不是承诺过的接口**（对外表态要单独决定）。',
  '',
  '## 1. 失败对象与码的形态',
  '',
  '任何边界遇到无法判别的失败，一律折成兜底码 `eleckoi/internal`，并把原码或短诊断记进 `details.what`；',
  '**不许猜**成某个域码——猜错等于给调用方一个假的可判别失败。',
  '',
  '失败对象的形状（跨边界可以 `JSON.stringify` 往返，详情是扁平 JSON 对象）：',
  '',
  '```json',
  '{ "code": "<码表里的一条>", "message": "<开发者诊断>", "details": {} }',
  '```',
  '',
  `- \`code\`：给程序的分支依据；形态 \`eleckoi/<域>/<原因>\`（全小写 ASCII、连字符分词），` +
    '唯一例外是兜底码 `eleckoi/internal`（只有两段）。判定正则：`' + String(ELECKOI_FAILURE_CODE_PATTERN) + '`。',
  '- `message`：开发者诊断（原始中文句，可以带 id 与路径）。它进日志，**不是**给用户看的句子。',
  '- `details`：参数化详情，只放参数（见 §3），不许放拼好的句子。',
  '',
  '**用户可见文案只有一个解析点**（渲染层 `apps/web/src/utils/failureTexts.js`）：宿主、插件与领域层',
  '永不拼用户可见句子；任何按 `code` 写文案的地方都只能依赖 `code` + `details`，不解析 `message`。',
  '',
  '## 2. 四条契约规则',
  '',
  '`pnpm check:error-contract` 用四条规则守这份契约（实现见文末真源）。规则只看**代码位置**：',
  '同样一段文本出现在字符串或注释里不算（作者脚本示例、文档字面量因此不会被误判）。',
  '',
  '1. **禁止丢码**：不许把带码的失败压成一句话（例如 `new Error(result.error.message)`）。',
  '   宿主已经把 `code` 与 `details` 交出来了，调用方必须原样传下去，或者交给 `resolveFailure` 解析。',
  '2. **契约违例必须带 `issues`**：`eleckoi/contract/invalid-request` 与 `-response` 的详情必须是',
  '   **非空**数组，元素带 `path` 与 `message`。丢了 issues，用户就不知道哪一个字段不合要求。',
  '3. **空 catch 必须写成具名声明**：处理体为空时只能写成 `.catch(failureAlreadyPublished)`、',
  '   `.catch(rejectionIsAwaitedElsewhere)`、`.catch(bestEffort)` 之一，或者写一个非空处理体；',
  '   `catch {}` 与只含注释的 `catch {}` 都算裸吞。',
  '4. **不许裸抛**：领域、宿主与客户端插件层的 `throw new Error(` 必须改成带契约码的构造',
  '   （`DesktopError` / `productFailure`）。四条规则都是绝对值（命中即失败）；规则 4 在裸抛',
  '   归零后也按绝对值判失败，`--progress-only` 只给未来的迁移线路临时看数（CI 与门禁不带它）。',
  '',
  '## 3. 详情参数（闭集）',
  '',
  '详情只放参数，不放拼好的句子。参数名是**闭集**：不在这 ' + CLOSED_PARAMS.length + ' 个里的新参数属于契约变更。',
  '最初六个（`field` / `issues` / `path` / `operation` / `guard` / `what`）之外，扩表时新增了',
  '`expected` / `actual`，用来表达「要求什么、实际是什么」。',
  '',
  '`what` 的写法按码分两种：多数码是**名词短语**（模板如「找不到{what}。」）；',
  '`eleckoi/state/precondition` 例外，写用户该先做的**动作**（模板是「请先${what}。」），',
  '写成名词短语会变病句（「请先一个打开的聊天。」）。',
  '',
  '| 参数 | 含义 | 要求这个参数的码 |',
  '| --- | --- | --- |',
  ...paramRows,
  '',
  '## 4. 呈现通道：默认由码给，只能上调',
  '',
  '每条码有一个**默认通道**：',
  '',
  '- `app`（应用级）：失败不属于某一个窗口或面板（宿主进程、库、存储、调用来源），要弹应用级对话框或窗口级提示；',
  '- `inline`（功能内）：就地显示在发生的那块界面里（目录读失败、保存冲突这类）。',
  '',
  '调用点可以**上调**（`upgradeTo: "app"`），而**没有下调的位置**——解析函数的参数里根本没有那个方向，',
  '把严重失败藏成一行小字这条在结构上做不到。',
  '',
  `默认走应用级的码（${APP_LEVEL_LIST.length} 条）：${APP_LEVEL_LIST.map((code) => `\`${code}\``).join('、')}。`,
  '',
  `## 5. 码表（${CODES.length} 条，逐码一行）`,
  '',
  '顺序即文档表格与逐条断言的**列举顺序**（先兜底，再按「谁的问题」分组），别各自重排。',
  '「语义键」是契约源码里那条常量的键（给代码读）；「详情参数」是该码会带的参数（必填 / 可选见',
  `[详情形状](${links.details})）；「用户句」是**没有详情参数时**渲染层给用户的说法：` +
    `${FIXED_TEXT_CODES.length} 条码各有一句固定说法，兜底码 \`eleckoi/internal\` 不设固定句（见 §5.1）。`,
  '',
  '| 码 | 语义键 | 详情参数 | 默认通道 | 用户句（无参数时） |',
  '| --- | --- | --- | --- | --- |',
  ...rows,
  '',
  '### 5.1 兜底码的文案策略',
  '',
  '`eleckoi/internal` 不设固定句，因为它承载两类完全不同的情形——给同一句都会说假话：',
  '',
  '- **带 `details.what`**：说明有一个不在码表里的码被折掉了。不猜它的语义，界面用调用方给的说法；',
  '  调用方没给时是通用句「操作失败，请重试。」。',
  '- **不带 `details.what`**：真正的裸失败（没有码语义），或者上游 provider 自己的说法（例如「余额不足」）。',
  '  这时候把开发者诊断 `message` 当用户说法——它是唯一能让用户知道发生了什么的东西，不能被通用句盖掉。',
  '',
  '## 6. 不并进契约码的两种方言',
  '',
  '码表只收**产品失败**的语义。仓库里还有两种失败方言，故意不并进来——理由是它们的码有别的消费者，',
  '不是这里登记了例外：',
  '',
  `- **\`AuthorApiError\`**（[errors.ts](${links.authorApiError})）：**作者脚本 API 的方言**，带自己的码`,
  '  （`INVALID_PARAMS` / `INVALID_CONTEXT` / `NOT_FOUND` …），面是脚本作者写 `catch` 用的**编程接口**，',
  '  不是产品失败。它有自己的稳定约定，并进契约码等于改所有作者脚本的 `catch` 分支；脚本失败到宿主边界时',
  `  由 [foldFailure](${links.foldFailure}) 折成兜底码并保留 \`message\`。`,
  '- **legacy `DESKTOP_ERROR_CODES.*` 六个码**（`INVALID_REQUEST` / `FORBIDDEN` / `NOT_FOUND` / `CONFLICT` /',
  `  \`RUNTIME_UNAVAILABLE\` / \`INTERNAL\`，见 [DesktopError.ts](${links.legacyCodes})）：上游遗留形态，`,
  '  当前生产调用仍会抛出这些旧码，因此边界保留映射：有唯一对应的三个码折过去，',
  '  其余折兜底并把原码记进 `details.what`；**新代码不许再抛这六个码**。',
  '',
  '## 7. 真源与维护',
  '',
  '| 内容 | 真源 |',
  '| --- | --- |',
  `| 码字符串与顺序 | [codes.ts](${links.codes}) |`,
  `| 每条码的参数 | [details.ts](${links.details}) |`,
  `| 用户句与默认通道 | [failureTexts.js](${links.texts}) |`,
  `| 四条规则的实现 | [check-error-contract.mjs](${links.gate}) |`,
  '',
  '改契约的顺序：先改真源，再 `pnpm generate:error-contract-doc` 重生成，然后把产物一起提交。',
  '`pnpm check:error-contract-doc`（`pnpm build` 的一步）会拒绝过期产物。',
  '',
  '这份文档不记录当前裸抛处数——数字看 `pnpm check:error-contract` 的输出。',
  ''
]

const generated = `${lines.join('\n').trimEnd()}\n`

if (checkOnly) {
  let current = ''
  try {
    current = await readFile(outputPath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (normalizeLineEndings(current) !== normalizeLineEndings(generated)) {
    throw new Error('失败契约文档已过期，请运行 pnpm generate:error-contract-doc')
  }
  console.log(
    `Error contract documentation is current: ${CODES.length} codes, ${CLOSED_PARAMS.length} detail params, ` +
      `${APP_LEVEL_LIST.length} app-level codes.`
  )
} else {
  await writeFile(outputPath, generated, 'utf8')
  console.log(
    `Generated ${relative(root, outputPath)}: ${CODES.length} codes, ${CLOSED_PARAMS.length} detail params, ` +
      `${APP_LEVEL_LIST.length} app-level codes.`
  )
}
