# 联网搜索与网页抓取

PC 与 Android 共用联网工具源码。预设的「联网搜索」工具组包含 `web_search` 和 `web_fetch`，分别负责找资料和读取指定网页。

## 配置入口

工具弹窗保留 DeepSeek 和 Tavily 两张选择卡片。默认沿 DSH 自动选择：DeepSeek 官方 API Key 和账号模型使用 DeepSeek 服务端搜索，其余模型使用 DeepSeek Search API。从 Tavily 点击 DeepSeek 会立即保存原有的 Messages 搜索选择，在官方插件配置里可切回自动。已保存的搜索方式继续生效。点击 Tavily 选择该提供器并展开原有密钥、连接测试和返回条数配置。

选中 DeepSeek 后，独立的「前往官方插件配置」按钮打开官方「插件 → 网页搜索」页面并关闭原弹窗；预设有未保存修改时使用现有离开提醒，单纯切换搜索方式不触发离开提醒。工具弹窗不列出模型原生、Search、HTTP、Fetch 等细分选项。官方 Messages 与 Search API 的切换、网页抓取方式和参数仍在官方页面管理，不重复维护配置表单。

Tavily 返回条数可以直接输入，使用官方 API 的 0–20 范围，默认 5；不再仅提供 3、5、8 三档。该范围来自 [Tavily Search 合同](https://docs.tavily.com/documentation/api-reference/endpoint/search)，不同于本地创作内容的数量限制。

官方页面分别提供搜索与抓取方式菜单，按 Host 实际注册的提供器列出自动选择、Search API、服务端搜索、HTTP、Fetch API 及其他提供器。Search API 结果数使用官方 1–50 范围，默认 10；Search 与 Fetch 各自选择自动、账号或 API Key 计费。服务端搜索保留基础地址、单次请求最多搜索次数和密钥控制。修改后点击官方「保存」，工具弹窗中的选择随官方保存更新。

默认 API Key 引用为 `DEEPSEEK_API_KEY`，由官方 Credentials 管理，可能与模型共用。Search／Fetch 可在 YAML 中用各自的 `searchBaseURL`／`fetchBaseURL` 和 `searchApiKeyEnv`／`fetchApiKeyEnv` 明确覆盖端点及凭据；官方页面只报告这些覆盖，不写入它们。旧 `web-deepseek-api.baseURL`／`apiKeyEnv` 字段按官方合同不再生效，没有产品猜测转换。沿用官方密钥和账号授权行为，工具弹窗不保存另一份 DeepSeek 密钥或参数。

## 实现与结果

DeepSeek Search、Fetch、Messages 和 HTTP 抓取使用锁定 DSH 的官方提供器。Search 按官方合同投影来源。Fetch 返回官方 Markdown，成功解析按上游合同映射为 200。HTTP 抓取由当前 Host 所在设备访问目标网站，显示实际收到的状态。

旧「DeepSeek 完整搜索／完整抓取」扩展、正文和地域表单及未知源站状态补丁已移除。启动前仅将 profile 内明确保存的 `eleckoi-deepseek-api` 选择改为对应官方提供器；已有官方参数与凭据引用不变，旧凭据不被删除。新旧密钥不互相覆盖；未配置官方密钥时在官方页面填写。

保留已有的完整工具输出配置：搜索条数由提供器决定、抓取正文不按旧固定长度裁剪；长结果继续使用 DSH 输出与溢出策略。此处不改官方 API 的字段、授权、错误和取消行为。

[官方接口指南](https://api-docs.deepseek.com/zh-cn/guides/search/) · [接入与补丁边界](adr/0039-deepseek-search-fetch.md)
