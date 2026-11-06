/**
 * 码 → 用户可见说法、默认通道与参数读取的**纯数据模块**。
 *
 * 为什么单独一层：`failureText.js` 是界面用的解析点，它 import 契约包的折叠函数；而
 * `scripts/generate-error-contract-doc.mjs` 要生成对外文档里的「用户句（无参数时）」一列，
 * 需要**直接**读这张表。让生成器去加载整条渲染层依赖没有意义，所以把表与两个小工具留在这里。
 *
 * 硬约束（生成器按这个用）：
 *
 * 1. **只有一个 import**：契约码表。键必须是 `ELECKOI_FAILURE_CODES` 的常量，不许重写字面量
 *    （码字符串只有契约那一份真相）。
 * 2. **没有副作用**：不在模块顶层读 DOM、`window` 或浏览器持久化存储，只声明常量与纯函数。
 *
 * 生成器用 Node 的模块钩子解析 `@shared/*` 别名与 `.js → .ts`（见那个脚本的文件头）。
 */
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";

/**
 * 默认走**应用级**通道的码。
 *
 * 判据：这些失败不属于某一个窗口或面板，而是整个应用的状态（宿主进程、库、存储、
 * 调用来源），就地显示会让人以为只有某个功能坏了。其余一律默认功能内——
 * 目录读失败、保存冲突这类都该留在发生的那块界面里。
 *
 * 调用点可以**上调**（`upgradeTo: "app"`），不能下调，理由见 `failureText.js` 的 `resolveFailure`。
 */
export const APP_LEVEL_CODES = new Set([
  ELECKOI_FAILURE_CODES.pluginLoadFailed,
  ELECKOI_FAILURE_CODES.dbSchemaMismatch,
  ELECKOI_FAILURE_CODES.storageCorrupt,
  ELECKOI_FAILURE_CODES.senderUntrusted,
  ELECKOI_FAILURE_CODES.lifecycleDisposed
]);

/** IO 动作 → 用户能懂的说法。其余取值走通用说法。 */
export const IO_OPERATION_TEXTS = {
  read: "读取失败",
  write: "保存失败",
  delete: "删除失败",
  spawn: "启动失败",
};

/**
 * `eleckoi/shell/open-failed` 的判别值 → 用户能懂的程序名。其余取值走通用说法。
 *
 * `details.what` 这里是 `mail` / `form` 这样的**判别值**，不是名词短语，所以必须映射成中文，
 * 不能原样拼进句子（与 `IO_OPERATION_TEXTS` 同一个理由）。
 */
const SHELL_OPEN_PROGRAM_TEXTS = {
  mail: "邮件客户端",
  form: "浏览器",
};

/**
 * 码 → 用户可见说法。键用 `ELECKOI_FAILURE_CODES` 的常量（**不是**重写的字面量：
 * 码字符串只有契约那一份真相）。兜底码不在表里，它走"开发者诊断"那条分支。
 *
 * 每条码都必须有一句（`apps/web/tests/ui/failure-text.test.js` 逐码断言）。
 * 写法要求：一句、主动、说"能不能再试"，不出现码、字段名、类名、堆栈。
 *
 * 生成器拿 `FAILURE_TEXTS[code]({})` 当文档里的「用户句（无参数时）」——所以每条函数
 * 都必须能在拿到空详情时返回一句完整的话（不能返回 `undefined`）。
 */
export const FAILURE_TEXTS = {
  [ELECKOI_FAILURE_CODES.contractInvalidRequest]: () => "请求内容不符合要求，已拒绝。",
  [ELECKOI_FAILURE_CODES.contractInvalidResponse]: () => "服务返回的内容不符合要求，已拒绝。",
  [ELECKOI_FAILURE_CODES.dataShapeInvalid]: (details) => {
    const what = detailString(details.what);
    return what ? `数据格式不符合要求：${what}。` : "数据格式不符合要求。";
  },
  [ELECKOI_FAILURE_CODES.dataLegacyMismatch]: (details) => {
    const what = detailString(details.what);
    return what ? `这份数据来自旧版本，当前版本读不了：${what}。` : "这份数据来自旧版本，当前版本读不了。";
  },
  [ELECKOI_FAILURE_CODES.inputInvalid]: (details) => {
    const field = detailString(details.field);
    return field ? `输入不合法：${field}。` : "输入不合法。";
  },
  [ELECKOI_FAILURE_CODES.inputUnsupported]: (details) => {
    const what = detailString(details.what);
    return what ? `不支持这个格式、版本或能力：${what}。` : "不支持这个格式、版本或能力。";
  },
  [ELECKOI_FAILURE_CODES.lookupNotFound]: (details) => {
    const what = detailString(details.what);
    return what ? `找不到${what}。` : "找不到要操作的内容。";
  },
  [ELECKOI_FAILURE_CODES.lookupDuplicate]: (details) => {
    const what = detailString(details.what);
    return what ? `已存在同名的${what}。` : "已存在同名内容。";
  },
  [ELECKOI_FAILURE_CODES.characterNotFound]: () => "角色不存在或已被删除。",
  [ELECKOI_FAILURE_CODES.creatorProjectNotFound]: () => "创作项目不存在或已被删除。",
  [ELECKOI_FAILURE_CODES.agentPresetNotFound]: () => "Agent 预设不存在或已被删除。",
  [ELECKOI_FAILURE_CODES.creatorProjectNameTaken]: (details) => {
    const path = detailString(details.path);
    return path ? `保存位置已存在同名目录：${path}。` : "保存位置已存在同名目录。";
  },
  [ELECKOI_FAILURE_CODES.conflictStaleRevision]: (details) => {
    const what = detailString(details.what);
    return what ? `${what}已在别处被修改，请刷新后重试。` : "内容已在别处被修改，请刷新后重试。";
  },
  [ELECKOI_FAILURE_CODES.stateMismatch]: (details) => {
    const what = detailString(details.what);
    return what ? `${what}对不上，请刷新后重试。` : "内容状态对不上，请刷新后重试。";
  },
  [ELECKOI_FAILURE_CODES.statePrecondition]: (details) => {
    const what = detailString(details.what);
    return what ? `请先${what}。` : "请先完成前置操作。";
  },
  [ELECKOI_FAILURE_CODES.safetyRefused]: (details) => {
    const guard = detailString(details.guard);
    return guard ? `操作被拒绝：${guard}。` : "操作被拒绝。";
  },
  [ELECKOI_FAILURE_CODES.securityDenied]: () => "没有权限执行这个操作。",
  [ELECKOI_FAILURE_CODES.senderUntrusted]: () => "该操作被拒绝：调用来源不可信。",
  [ELECKOI_FAILURE_CODES.lifecycleNotReady]: (details) => {
    const what = detailString(details.what);
    return what ? `${what}还没准备好，请稍后再试。` : "服务还没准备好，请稍后再试。";
  },
  [ELECKOI_FAILURE_CODES.lifecycleDisposed]: (details) => {
    const what = detailString(details.what);
    return what ? `${what}已关闭，请重新打开。` : "这个功能已关闭，请重新打开。";
  },
  [ELECKOI_FAILURE_CODES.pluginLoadFailed]: () => "插件服务没有启动起来，请重新打开插件中心。",
  [ELECKOI_FAILURE_CODES.ioFailed]: (details) => {
    const path = detailString(details.path);
    const action = IO_OPERATION_TEXTS[detailString(details.operation)] || "读写失败";
    return `${action}${path ? `：${path}` : ""}。`;
  },
  [ELECKOI_FAILURE_CODES.netOperationFailed]: (details) => {
    const what = detailString(details.what);
    return what ? `网络请求失败：${what}。` : "网络请求失败，请检查网络连接后重试。";
  },
  // 投递动作先写剪贴板再打开外部程序，但**剪贴板也可能失败**（ADR 0042 决定 13）。这条码只说
  // 程序没打开、下一步可以点「复制报告」；"全文已复制"成不成是运行期事实，由对话框按 `copied`
  // 另说——静态句子宣称一件没发生的事，比少说一句更糟。
  [ELECKOI_FAILURE_CODES.shellOpenFailed]: (details) => {
    const program = SHELL_OPEN_PROGRAM_TEXTS[detailString(details.what)] || "外部程序";
    return `没能打开${program}。可以点「复制报告」，把全文粘到任意地方发给作者。`;
  },
  [ELECKOI_FAILURE_CODES.timeoutExpired]: (details) => {
    const what = detailString(details.what);
    return what ? `等待${what}超时，请重试。` : "操作超时，请重试。";
  },
  [ELECKOI_FAILURE_CODES.storageCorrupt]: (details) => {
    const what = detailString(details.what);
    return what ? `存储内容已损坏，读不出来：${what}。` : "存储内容已损坏，读不出来。";
  },
  [ELECKOI_FAILURE_CODES.dbSchemaMismatch]: () => "本地数据库结构不对，请重新安装或升级后再试。",
  [ELECKOI_FAILURE_CODES.modelConfigInvalid]: (details) => {
    const field = detailString(details.field);
    return field ? `模型配置不合法：${field}。` : "模型配置不合法。";
  },
  [ELECKOI_FAILURE_CODES.mediaInvalid]: (details) => {
    const what = detailString(details.what);
    return what ? `图片或音频不符合要求：${what}。` : "图片或音频不符合要求。";
  },
  [ELECKOI_FAILURE_CODES.ipcCallFailed]: () => "与后台服务通信失败，请重试。",
};

/**
 * 读一个详情参数：只认非空字符串。
 * @param {unknown} value - 详情里的任意值。
 * @returns {string} 去掉首尾空白的字符串；不是字符串时是空串。
 */
export function detailString(value) {
  return typeof value === "string" ? value.trim() : "";
}
