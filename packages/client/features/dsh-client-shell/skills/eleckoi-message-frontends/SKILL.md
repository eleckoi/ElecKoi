---
name: eleckoi-message-frontends
description: 在 ElecKoi 常规聊天楼层中制作或修改状态栏、正文美化和交互页面时使用；通常通过正则替换生成 HTML／EJS，也支持正文已有 HTML。配套后台脚本和面板使用角色创作技能；自定义整套内容区交互才使用独立项目技能。
---

# 常规楼层界面

开始前读 `references/frontends.md` 的常规楼层界面部分。常规角色卡保留聊天楼层，通常由显示正则把稳定标记或文本区块替换成 HTML，再由富消息环境运行。正文也可以直接包含 HTML。页面源码内嵌、来自外部文件或使用框架，都不改变它所属的楼层。

先读取相关开场白、正则和脚本，按用户展示目标沿已有楼层结构选择入口。正则转换读取 regex 原稿、范围和 create/update/test schema；角色开场白原稿使用 character.read_openings/save_openings，并保留其他条目；已有聊天消息使用相应聊天接口。只有目标或影响范围不清楚时才澄清可见效果。

正则选中稳定标记或明确区块，复杂结构由 EJS 或页面程序解析；不要用复杂匹配代替程序，不默认吞掉应保留的叙事正文。显示规则通常为 AiOutput、displayOnly=true、promptOnly=false。精确说明在 `references/regex-ejs.md`。

需要交互时输出带原生 SDK 声明的完整 HTML，等待 ElecKoiReady。从 context.current().messageId 取得所属消息，不能用列表末条猜身份。页面程序可读取原文，避免把任意捕获数据拼接进脚本。

持续逻辑、变量规则、按钮和弹窗可由后台脚本配合；脚本面板是同一张卡的配套界面，不要求创建独立项目。需要时加载 eleckoi-character-authoring 的脚本参考。调用 SDK 前按所需能力读取 `references/author-sdk.md` 和 `references/author-sdk-reference.md`。

regex.test 只验证文本转换与 EJS，不启动网页或证明交互成功。需要素材时加载 eleckoi-character-assets；需要自定义整套内容区交互结构时才转入 eleckoi-character-frontends。

这些参考通过 Host 文件读取工具按需加载，不依赖用户工作区含产品源码。
