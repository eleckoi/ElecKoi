---
name: eleckoi-character-assets
description: 在 ElecKoi 角色卡资产库导入、读取、复制、改名、删除素材，新建或移动文件夹，以及在消息级界面或独立前端项目引用图片、视频、音频、模型时使用。
---

# 角色资产库

先读取 `references/assets.md`。资产属于当前选中的角色；list 返回完整目录及固定引用，写入带最新 expectedRevision。工具参数以 assets 能力组的当前 schema 为准。

本地文件用 assets.import_file，经当前 Host 工作区文件服务读取；生成的文本或 base64 用 assets.import。文件夹与素材可批量移动。移动和改名保持 `asset://UUID`，删除文件夹递归删除其内部资产。UUID 从读取回执获取，不按显示名称猜测。

源码使用返回的 reference，不保存本机路径或运行端口。不把资产 ZIP 自动解释成独立前端包；前端 ZIP 使用 frontends.import_file。

只有涉及格式往返、文件保存或失效原因时再读 `references/asset-storage.md` 和 `references/character-transfer.md`。用 Host 文件读取工具访问参考，文件内容不自动进入每次模型请求。
