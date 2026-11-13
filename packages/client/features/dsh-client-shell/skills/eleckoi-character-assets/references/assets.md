<!-- Generated from docs/plugins/character-assets.md; run pnpm generate:plugin-docs. -->

# 角色资产库创作

资产属于当前工作室选中的角色。它可以同时保存图片、视频、音频和模型；文件夹是混合的逻辑目录，文件类型用于筛选。没有全局、预设或聊天级资产库选项。

## 操作顺序

1. 查询 `assets` 能力组和本次操作 schema。
2. `assets.list({})` 获取完整目录、文件夹、准确 UUID、`reference` 和 `revision`。目录不包含文件正文，不能据此声称看过图片或听过音频。
3. 写入使用同一角色最新 `revision` 作为 `expectedRevision`。成功回执给出新 revision；冲突先重读目录再合并。
4. 将回执中的 `reference` 写入消息级 HTML、独立前端或脚本配置；按需要读回核对。

| 目的 | 操作与要点 |
| --- | --- |
| 查看目录／元数据 | `list`；`read({id})` 返回元数据与引用，不传磁盘路径 |
| 导入现有文件 | `import_file({file_path,expectedRevision,folderId})`；相对路径按当前 Host 会话工作区解析，folderId=null 是根目录 |
| 导入生成的小文件 | `import({name,content,encoding,folderId,expectedRevision})`；encoding 为 utf8 或 base64，例如生成 SVG 文本；类型由支持的文件格式确定 |
| 读取文件内容 | `read_content({id,offset,length})` 按字节返回 base64；单窗最多 1 MiB，沿 next_offset 直到 null，文件大小没有因此被限制 |
| 改名／复制 | `rename({id,name,expectedRevision})`；`duplicate({assetIds,expectedRevision})`，副本得到新编号 |
| 新建／改名文件夹 | `create_folder({name,parentId,expectedRevision})`；`rename_folder({folderId,name,expectedRevision})`；parentId=null 是根目录 |
| 移动 | `move({assetIds,folderIds,destination,expectedRevision})`；destination=null 是根目录，可批量移动，目标必须属于同一角色 |
| 删除 | `delete({assetIds,folderIds,expectedRevision})`；准确选择 UUID，文件夹连同子文件夹和内部资产递归删除 |

本地大媒体优先用 import_file。它按 1 MiB 窗口经过正式 DSH 文件服务读取，不要求 AI 把整个媒体转成参数中的 base64，也不把本机路径登记为素材引用。源文件变化、目标角色切换、目录并发变化或取消时不发布不完整资产，暂存沿原上传服务释放。

工作区编程可以生成文件或处理已经读取的字节，但必须有真实内容，不能只根据名称虚构导入成功。资产库的 ZIP 格式属于模型资源支持范围；需要导入独立前端 ZIP 时使用 `frontends.import_file`，不能把整个前端包误当单个模型资源。

## 固定引用

```html
<img src="asset://11111111-1111-4111-8111-111111111111" alt="背景">
<audio controls src="asset://22222222-2222-4222-8222-222222222222"></audio>
```

上述编号是占位示例，实际创作必须使用 list 或导入回执中的准确 reference。移动、文件夹层级和显示改名不会改变编号、正文或物理文件；同一个资产可以被多个开场白和故事线引用，不必重复导入。

`asset://` 由 ElecKoi 的作者文档装配解析，普通工作区 HTML 或操作系统不会自动识别它。图片、音视频、CSS 和常见动态属性赋值在作者文档内共用当前角色的解析；复杂加载器可使用页面提供的 `window.ElecKoiAssetUrl(reference)` 获得运行 URL。不要把运行 URL、本机端口、文件路径或 blob URL 写回长期源码。

删除仍在使用的资产会使引用失效。目录不能准确证明某项未被动态代码使用；只有用户要求删除时才删除相应对象。移出文件夹用 move，不能用 delete 文件夹代替。

## 包与能力边界

完整角色卡 PNG／ZIP／JSON 带全部资产及空文件夹，独立前端导出 ZIP 也携带同角色资产。导入重建本机读取地址并保留素材身份；无需手工换图床地址。具体存储、格式与内存边界见 [资产库](asset-storage.md) 和 [角色卡传输](character-transfer.md)。

`read_content` 是编程字节读取，不表示模型完成了视觉、听觉或三维预览。需要感知内容时使用当前会话实际可用的媒体工具；目录管理、显示预览和文件导出分别以其真实结果为准。
