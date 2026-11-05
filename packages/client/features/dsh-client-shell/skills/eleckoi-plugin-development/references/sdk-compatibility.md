<!-- Generated from docs/plugins/sdk-compatibility.md; run pnpm generate:plugin-docs. -->

# 格式导入边界

ElecKoi 支持酒馆角色卡、聊天、预设、世界书和正则的数据导入，以及 MVU 变量转换。原生作者程序使用 [ElecKoi SDK](author-sdk.md)；格式转换不提供外部脚本库或前端 SDK 的运行环境。

## 数据归属

角色、预设、设定库、正则、当前变量及历史变量进入对应原生产品领域。角色卡中的 `creator_notes` 导入到角色简介，仅供展示，不作为角色描述注入请求。

MVU 导入读取明确的初始化数据与 Schema 注册合同。可以独立提取的规则保留默认值、preprocess、transform 和开场白变量版本关联；不能提取的规则显示提示，不阻止角色卡和明确的初始化变量导入。初始化处理失败时保留设定与开场白原始内容，并提示未导入变量配置。读取规则字段不等于启动外部脚本，也不会让 Agent 变量工具成功更新后再解析正文重复结算。

不再创建、读写或提供独立扩展数据库，也不保留该库的迁移入口。原生正则选项保存到已有规则表，作者前端文件保存到正式项目目录。具体决策见 [ADR 0033](../adr/0033-native-format-import-storage.md)。

## 页面与程序

普通 HTML 仍可显示并使用通用浏览器库，但依赖外部助手接口的按钮和后台脚本不再由应用启动或适配。原生 HTML、脚本与角色前端项目按自己的声明、文件入口和生命周期运行。

通用 HTML 浏览器库由 ElecKoi 的 `@eleckoi/dsh-client-html-resources` 产品插件通过 `/eleckoi/html/` 提供。该插件只提供资源与就绪状态，不装配旧外部脚本运行器。

原生作者 SDK 修改变量、设定和预设时调用正式产品服务，不另存同一份业务状态，也不改变既有请求组装规则。数据与运行合同见 [ADR 0032](../adr/0032-native-script-libraries.md)。
