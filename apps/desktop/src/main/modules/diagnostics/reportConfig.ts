/**
 * 内置投递配置的**纯**解析器——不 import `electron`，所以用例能直接跑。
 *
 * 判据（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md) 决定 12 / 16）：普通用户装的
 * 是安装包，环境变量那条路等于没有。所以投递配置随应用打包（{@link BUG_REPORT_CONFIG_FILE_NAME}），
 * 环境变量逐项覆盖；文件缺失、JSON 坏、字段形状不对一律按「未配置」处理，**永不抛**。
 *
 * 三条约束：
 *
 * 1. **逐字段读、逐字段降级。** 一个字段类型不对只丢这个字段，不整体拒绝——维护者改坏一处不该让
 *    整份配置消失。
 * 2. **覆盖规则三态。** 环境变量 `undefined`（没设）= 保留文件值；空串或全空白 = 显式清空；其余 =
 *    覆盖。显式清空是维护者关掉一条通道的唯一手段（比如表单链接换到新 Base 前的空窗）。
 * 3. **不推导也不校验表单链接形状。** 链接由维护者从飞书界面复制，客户端只往后追加预填参数
 *    （决定 12）；唯一的要求是它能当外部地址打开（http/https）。
 */
import { isRecord, parseJsonObject } from '@shared/foundation/json'
import type { BugReportDeliveryConfig } from '@shared/contracts/bugReport/delivery'
import type { BugReportFormConfig } from '@shared/contracts/bugReport/form'
import { isBugReportFormConfig } from '@shared/contracts/bugReport/form'
import {
  BUG_REPORT_MAILBOX_ENV,
  BUG_REPORT_MAILBOX_NAME_ENV,
  BUG_REPORT_REPOSITORY_ENV,
  BUG_REPORT_SUBSCRIBE_URL_ENV,
  readBugReportRelay
} from './reportDelivery'

/** 随应用打包的配置文件名（`apps/desktop/resources/` 下；`electron-builder.yml` 的 `resources/**` 通配自动进 asar）。 */
export const BUG_REPORT_CONFIG_FILE_NAME = 'bug-report.json'

/** 覆盖表单分享链接的环境变量名；空串 = 显式关掉表单通道。 */
export const BUG_REPORT_FORM_URL_ENV = 'ELECKOI_BUG_REPORT_FORM_URL'

/** 覆盖正文题目名的环境变量名。 */
export const BUG_REPORT_FORM_FIELD_BODY_ENV = 'ELECKOI_BUG_REPORT_FORM_FIELD_BODY'

/** 覆盖元信息题目名的环境变量名。 */
export const BUG_REPORT_FORM_FIELD_META_ENV = 'ELECKOI_BUG_REPORT_FORM_FIELD_META'

/** 覆盖失败码题目名的环境变量名。 */
export const BUG_REPORT_FORM_FIELD_CODE_ENV = 'ELECKOI_BUG_REPORT_FORM_FIELD_CODE'

/** 覆盖附件题目名的环境变量名。 */
export const BUG_REPORT_FORM_FIELD_FILE_ENV = 'ELECKOI_BUG_REPORT_FORM_FIELD_FILE'

/** 配置解析要的输入：文件原文与一份「像 `process.env` 的东西」（用例传固定值）。 */
export interface BugReportConfigInput {
  /** 内置配置文件原文；没读到就是 `undefined`。 */
  readonly fileText: string | undefined
  /** 环境变量。`undefined` = 没设（保留文件值）；空串 = 显式清空。 */
  readonly environment: Readonly<Record<string, string | undefined>>
}

/**
 * 解析内置配置 + 环境变量覆盖，得到投递配置。
 *
 * **永不抛**：坏输入一律当「未配置」。
 *
 * @param input - 文件原文与环境变量。
 * @returns 投递配置；空字符串表示该通道未配置。
 */
export function parseBugReportConfig(input: BugReportConfigInput): BugReportDeliveryConfig {
  const file = input.fileText === undefined ? {} : parseJsonObject(input.fileText)
  const environment = input.environment
  const form = formOf(file.form, environment)
  const relay = readBugReportRelay(environment)
  const mailboxName = override(environment, BUG_REPORT_MAILBOX_NAME_ENV, file.mailboxName)
  const subscribeUrl = override(environment, BUG_REPORT_SUBSCRIBE_URL_ENV, file.subscribeUrl)
  return {
    mailbox: override(environment, BUG_REPORT_MAILBOX_ENV, file.mailbox),
    repository: override(environment, BUG_REPORT_REPOSITORY_ENV, file.repository),
    ...(mailboxName === '' ? {} : { mailboxName }),
    ...(subscribeUrl === '' ? {} : { subscribeUrl }),
    ...(relay === undefined ? {} : { relay }),
    ...(form === undefined ? {} : { form })
  }
}

/**
 * 读表单段：文件值打底，环境变量逐项覆盖，最后整份过契约校验。
 *
 * 四个题目名逐个读（类型不对只丢那一个），但分享链接与正文题目缺一个整段就不出现——没有地址或
 * 没有正文的表单没有意义，界面据此不渲染「提交到飞书」。链接只要求 http(s)，不看 `/form/` 形状
 * （决定 12）。
 */
function formOf(
  value: unknown,
  environment: Readonly<Record<string, string | undefined>>
): BugReportFormConfig | undefined {
  const file = isRecord(value) ? value : {}
  const fileFields = isRecord(file.fields) ? file.fields : {}
  const meta = optionalOverride(environment, BUG_REPORT_FORM_FIELD_META_ENV, fileFields.meta)
  const code = optionalOverride(environment, BUG_REPORT_FORM_FIELD_CODE_ENV, fileFields.code)
  const attachment = optionalOverride(environment, BUG_REPORT_FORM_FIELD_FILE_ENV, fileFields.file)
  const candidate = {
    shareUrl: override(environment, BUG_REPORT_FORM_URL_ENV, file.shareUrl),
    fields: {
      body: override(environment, BUG_REPORT_FORM_FIELD_BODY_ENV, fileFields.body),
      ...(meta === undefined ? {} : { meta }),
      ...(code === undefined ? {} : { code }),
      ...(attachment === undefined ? {} : { file: attachment })
    }
  }
  if (!isBugReportFormConfig(candidate)) return undefined
  if (!isHttpUrl(candidate.shareUrl)) return undefined
  return candidate
}

/**
 * 一个配置项的最终值：环境变量没设就用文件值，设了（哪怕是空串）就以环境变量为准。
 *
 * 环境变量值要 trim——`ELECKOI_BUG_REPORT_MAILBOX="  "` 与 `""` 同义（显式清空）。
 */
function override(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  fileValue: unknown
): string {
  const value = environment[name]
  return value === undefined ? textOf(fileValue) : value.trim()
}

/** 可选配置项：覆盖之后为空就不产出这个键（`exactOptionalPropertyTypes` 下不能塞 `undefined`）。 */
function optionalOverride(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  fileValue: unknown
): string | undefined {
  const value = override(environment, name, fileValue)
  return value === '' ? undefined : value
}

/** 一个字符串配置项的取值；不是字符串就取空（= 没配）。 */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 能交给系统浏览器打开的地址。与契约 `form.ts` 的同名判断一致（那里不导出）。 */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S/i.test(value)
}
