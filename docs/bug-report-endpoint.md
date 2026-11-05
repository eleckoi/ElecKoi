# 报告投递端点配置

这份文档写给维护者：报告功能往哪儿投、配置在哪、换端点时改什么。
决策依据见 [ADR 0041](./adr/0041-bug-report-delivery.md) 决定 12 与 16；失败码与文案不在本文范围。

## 配置在哪

发布配置就是仓库里的 [`apps/desktop/resources/bug-report.json`](../apps/desktop/resources/bug-report.json)。
`electron-builder.yml` 的 `files: resources/**/*` 会把它打进 asar，所以**不需要**改打包配置。
主进程读配置时按两个候选路径找它（开发态是 `apps/desktop/resources/`，打包态在 asar 里），
读不到、JSON 坏、字段形状不对，一律按「未配置」处理并**不抛**——报告功能照样起来，只是少一个按钮。

```json
{
  "form": {
    "shareUrl": "https://<tenant>.feishu.cn/share/base/form/<shrcn…>",
    "fields": {
      "body": "report_body",
      "meta": "report_meta",
      "code": "report_code",
      "file": "report_file"
    }
  },
  "mailbox": "",
  "mailboxName": "",
  "subscribeUrl": "",
  "repository": ""
}
```

- `form`：飞书表单通道（默认收件端点）。`shareUrl` 与 `fields.body` 缺一个整段不生效。
- `mailbox` / `mailboxName` / `subscribeUrl` / `repository`：邮件与仓库通道，空串 = 未配置。
- 代发通道（`web3forms` / `formspree` / `eleckoi-relay`）只走环境变量，**文件里不配代发**。

## 四个题目名是发布契约

`report_body`（正文）、`report_meta`（版本/平台/签名）、`report_code`（失败码）、
`report_file`（附件提示）是飞书表单里的**题目名**，参数名是 `prefill_<题目名>`。
维护者改题目名等于破坏预填：表单会打开，但内容是空的。**改题目名要同步改这个文件并跟着发版。**

## `/form/` 的坑

飞书 `+form-share-get` 返回的 `https://<tenant>.feishu.cn/share/base/<shrcn…>` 是 **Base 分享链接**，
未登录打开会 302 到登录页。能匿名填写的**表单填写页**是 `.../share/base/form/<shrcn…>`——
多一段 `form`。客户端不做推导也不校验形状（决定 12）：复制错就只是「表单打不开」，所以请从飞书界面
复制填写页地址，存完整链接。

当前仓库里那份指向 2026-10-29 建的测试 Base（验证用）。**上线前换成正式 Base 的填写链接**，
并同步删掉这句说明。

## 环境变量覆盖

环境变量逐项覆盖文件值，优先级高于文件。三态规则：

| 环境变量 | 效果 |
| --- | --- |
| 没设（`undefined`） | 保留文件值 |
| 空串或全空白 | **显式清空**这一项（例如临时关掉表单通道） |
| 其它值 | 覆盖文件值（两端空白会 trim） |

| 环境变量 | 覆盖的配置项 |
| --- | --- |
| `ELECKOI_BUG_REPORT_FORM_URL` | `form.shareUrl` |
| `ELECKOI_BUG_REPORT_FORM_FIELD_BODY` / `_META` / `_CODE` / `_FILE` | 四个题目名 |
| `ELECKOI_BUG_REPORT_MAILBOX` / `_MAILBOX_NAME` / `_SUBSCRIBE_URL` / `_REPOSITORY` | 邮件与仓库通道 |
| `ELECKOI_BUG_REPORT_RELAY_PROVIDER` / `_ENDPOINT` / `_KEY` / `_FROM_NAME` | 代发通道（沿用既有语义） |
| `ELECKOI_BUG_REPORT_CONFIG_URL` | `configUrl`（线上配置的地址，见下一节；空串 = 关掉线上配置） |

只设环境变量、文件里没有 `form` 也可以——`FORM_URL` + `FORM_FIELD_BODY` 给齐就能产出一条表单通道。

## 线上配置（可选）

**不用它也能跑。** 默认 `configUrl` 是空的，客户端一次网络请求都不发。

它解决的问题只有一个：内置 JSON 随包发布，Base 被删或链接填错时，用户手里的版本只能等下次发版。
给一个 `configUrl` 之后，客户端可以在启动时拉一次新的**表单端点**，把用户迁移到新 Base 上。

```json
{
  "form": { "shareUrl": "https://<租户>.feishu.cn/share/base/form/<id>", "fields": { "...": "..." } },
  "formHosts": ["feishu.cn"],
  "configUrl": ""
}
```

- **远程能改什么：** 只有 `form`（分享链接 + 四个题目名）。改不了邮件、代发，也改不了自己的地址——
  下一次拉哪个地址仍由内置文件与环境变量决定。
- **护栏：** 只走 https；响应上限 64 KB；分享链接的主机必须落在 `formHosts`（后缀匹配，默认
  `feishu.cn`）里；形状不对整份丢弃。远程配置**不能扩权**。
- **失败怎么办：** 拉不到、超时（3 秒）、非 2xx、被墙、缓存坏了——全都静默回退到内置配置。
  报告功能不依赖网络。
- **优先级：** 环境变量 > 线上配置（拉到了且合法）> 内置文件。
- **缓存：** `userData/bug-reports/remote-config.json`，带 `fetchedAt`；六小时内不重复拉，
  过期后先用旧值、后台再取。
- **这是信任边界：** 这条链接决定用户的日志发到哪里。别把 `configUrl` 指向不受控的第三方；
  白名单也要跟着收紧（比如只留正式租户的域名）。

## 换 Base 时怎么刷新

1. 在新 Base 里建表单视图，分享设置选「任何人可填写 + 允许匿名填写 + 不要求登录」。
2. 从浏览器地址栏复制**填写页**链接（带 `/share/base/form/`），填进 `bug-report.json` 的
   `form.shareUrl`。
3. 新表单的题目名若与旧的不同，同步改 `fields` 里的四个题目名——但优先沿用旧题目名，
   否则老版本客户端会发出空表单。
4. 提交一条测试记录，确认表格里正文、元信息、失败码都在，再发版。

## 红线：客户端不放服务端凭据

飞书自建应用的 `app_secret`、企业微信 Secret、GitHub token、SMTP 授权码一律**不进**这个文件，
也不进任何环境变量——拆包即泄露，后果是能以你的身份读写整个租户。表单分享链接与自定义机器人
webhook 是另一类凭证：只能往指定表 / 群写，泄漏的后果是脏数据而非数据外泄，即便如此也要能轮换
（重建表单、删机器人），不能当作身份使用。

## 客户端几乎不发请求

客户端只把预填参数拼到分享链接后面，然后交给系统浏览器（`openExternal`）。没有飞书凭据、
不调 `+form-submit`、**不上传报告**——提交是用户在看过的表单页上按的那一下。

唯一的例外是**配了 `configUrl` 时拉一次投递配置**（上一节）：启动时后台拉、只读 `form`、
失败静默。默认没配，所以默认形态下客户端确实一次请求都不发。

## 去重与限额：客户端挡掉了什么，飞书那边不管什么

**会被淹没吗？** 先看客户端已经挡掉的：

- **没有自动上传。** 客户端从不主动发请求，也没有队列：用户点「提交到飞书」→ 浏览器打开填好的表单 →
  用户自己在飞书页上按提交。没有「后台补发」，关掉对话框就不再动作。
- **一份报告里同码只留一条。** 崩溃循环不会把一份报告写成几百行：`foldBugReportFailures` 按失败码折叠，
  最多 20 条（`BUG_REPORT_MAX_FAILURES`）。
- **草稿按签名去重。** 同一签名（`<失败码>@<版本>:<平台>`）只留最新一份，最多 10 份、30 天过期——
  同一台机器反复失败不会在本地堆一摞。
- **预填里带着签名。** `report_meta` 的第一段就是 `签名：<失败码>@<版本>:<平台>`，`report_code` 另给失败码列表，
  所以**重复提交可以离线合并**（表格按签名分组，或 `lark-cli` 导出后 group by）。

**飞书那边不管什么。** 多维表格是收件箱，不是我们的服务端：它不会按签名去重，也不替我们限流；
表单要不要验证码、要不要限制重复提交，取决于这个 Base 的表单设置，得在飞书后台确认，客户端不能假设。

**所以剩下的风险是：** 同一个用户手动重复提交同一份（落重复行，可离线按签名合并），以及大量用户各自提交
不同错误（那是正常反馈量）。客户端**没有**按来源/时间的节流——它只有用户点下去的那一下。

**要服务端去重/限流时**，那正是代发通道（`relay`）预留的接缝：签名已经在 `report_meta` 里、投递契约
（`delivery.ts` 的 `relay`）也在，将来上了 Worker 就在那一层做去重、限流与分级告警，不用改客户端。
现在默认配置不配 `relay`，「直接发送」按钮就不会出现。

**维护者侧今天就能做的低成本去重：** Base 里加一列「签名」并用它分组/视图过滤；或定期导出后按
`report_meta` 的签名段合并同类。
