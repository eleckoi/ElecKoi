<!-- Generated from docs/CHARACTER_CARD_TRANSFER.md; run pnpm generate:plugin-docs. -->

# ElecKoi 角色卡同步协议

本文是 Android 与 Desktop 当前唯一的 ElecKoi 角色卡交换合同。两端必须以同一份领域载荷完成 JSON / PNG / ZIP 往返，不以第三方角色卡标准定义产品数据。

## 文件形式

- JSON：UTF-8 编码的完整 `eleckoi.character-card` 文档，可直接导入。
- PNG：正常可预览的 PNG 图片。无库资产、无独立前端时，沿 `eleckoi-card` 文本块保存 gzip / Base64 角色文档；包含资产或前端时，写入 `eleckoi-bundle=1` 文本标记，并把同一 ZIP 资源包分段放进 IEND 之前的私有辅助块 `ekZa`。每段 16 MiB 是编码分段，不是素材总大小上限。
- ZIP：同一完整角色资源包，包含 `manifest.json`、`character.json`、`portraits/`、`assets/`、`frontends/`。前端直接保存文件，不再嵌套前端 ZIP。
- 同一角色同时导出 JSON 与 PNG 时，两者解码后必须得到语义相同的根文档。
- ElecKoi 导出禁止写入 `chara`、`ccv3`、`chara_card_v2` 等第三方兼容载荷。第三方格式若保留，只能作为用户明确选择的单向导入适配器。

## 根文档

```json
{
  "format": "eleckoi.character-card",
  "version": 3,
  "character": {},
  "assets": [],
  "library_assets": [],
  "frontends": {"projects": [], "selectedProjectId": null, "messageRendererEnabled": true},
  "character_openings": "{...}",
  "setting_library": "{...}",
  "variable_config": "{...}",
  "regex_rules": []
}
```

`version` 是 ElecKoi 自有载荷版本。含库资产或前端时导出为 `3`，新增 `library_assets` 与 `frontends`；其余角色继续导出独立开场白的 `2`。继续支持 v1、v2 角色卡导入，并在导入边界将设定库中的旧开场白提取到角色的独立存储。

## 必须导出的内容

### `character`

- `name`
- `group`
- `frontend_beauty_enabled`
- `profile_age`
- `profile_sex`
- `profile_height`
- `profile_birthday`
- `profile_like`
- `image_prompt`
- `opening`
- `show_opening`

### `assets`

固定键只有：

- `avatar.circle`
- `avatar.square`
- `avatar.portrait`

每项包含 `key`、实际图片 MIME 类型 `media_type` 与 Base64 字节 `data`。不存在的图片不写空附件。

### `setting_library`

值为 `eleckoi.setting-library-snapshot` JSON 字符串，必须包含当前母设定库的全部版本和 `active_version_id`。设定条目自身的关键词、触发条件、启用状态及动态控制方式均属于作者内容，必须保留；设定库不再包含角色开场白。

这里只读取角色母设定库，不读取任何会话的 `conversation_setting_changes`。

原生角色卡导入创建新角色所有者，普通条目、文件夹、自定义插入位置、开场白选项和变量版本的作者编号保留。

单独导出设定库不包含角色开场白，普通导入、切换和删除设定库版本不会改变角色开场白。含开场白的旧 v3 设定库文件在导入边界拆分：设定进入设定库，开场白追加到角色的多开场白列表，当前默认选择和整体启停保持不变。绑定的变量版本必须存在；否则整个导入不提交，保留原数据及待修改草稿。

### `character_openings`

值为角色多开场白配置的 JSON 字符串，只包含 `characterId`、`enabled`、`openingMessages` 和 `defaultOpeningMessageId`。每条开场白保留编号、标题、正文、`variableVersionId` 和 `initialVariableStateJson`；默认选择必须指向列表中的一条。开场白没有配置版本。导入时将所属角色编号重定向到新角色，开场白编号保留。

早期未发布 v2 文件误带 `versions` 时，仅在文件导入边界将全部不同开场白归入同一列表，默认选择和正文、变量绑定保持。停止支持此类早期文件后，删除该旧结构导入分支与专用回归；数据库正式结构与升级终点保持 v13。

角色编辑器将“角色开场白”放在“设定库”上方，直接管理多条开场白及默认选择。设定库的版本选择只影响设定；完整角色卡导出包含全部开场白和设定库全部版本。

旧角色卡解码位于 `legacyOpeningSnapshot.ts`；停止支持 v1 角色卡导入后才能删除该解码器及调用分支。旧设定库解码位于 `settingLibraryTransfer.js`，通过 `importSettingLibrary` 原子保存到两个独立所有者；停止支持含开场白的 v3 设定库文件后，再一起删除该解码、Client 分流、Remote 导入方法和对应回归。它们不参与正常开场白与设定库读写。

“并入设定”和复制条目是明确创建副本的操作，会为新副本分配新编号，不等于整体导入。作者脚本不会自动改为控制副本，也不按同名条目推断引用关系。

### `variable_config`

值为 `eleckoi.variable-config` JSON 字符串，必须包含全部作者配置版本和 `active_version_id`，包括变量定义、对象定义、Schema、默认/初始状态和更新规则。

这里的初始状态是作者配置，不是游玩中的会话变量状态；不得读取 `chat_session_variable_states`。

### `regex_rules`

只包含该角色自己拥有的正则规则，按 `order` 排序。每项字段为：

- `id`
- `name`
- `pattern`
- `replacement`
- `targets`
- `enabled`
- `display_only`
- `prompt_only`
- `run_on_edit`
- `order`
- `trim_strings`
- `min_depth`
- `max_depth`
- `substitute_regex`

`enabled` 是随角色卡携带的当前启用状态。不得导出全局正则、Agent/提示词预设正则，也不得把混合多个作用域的全局启用版本塞进角色卡。

## 明确禁止导出的内容

- 聊天背景图片、背景来源模式、透明度、模糊度、遮罩参数。
- 会话分支设定覆盖。
- 会话运行时变量状态。
- 聊天记录、摘要、工具轨迹和附件。
- 当前用户资料、用户头像。
- 全局正则、Agent/提示词预设正则及它们的启用版本。
- 本机路径、缓存路径和数据库主键关系。

完整前端和角色库资产现归同一个 Host 领域合同，PC 和 Android 的当前 Web Client / Node Host 共用该实现；旧的独立 Android 实现不再定义当前产品合同。详细存储、引用和单独前端 ZIP 见 [角色资产库](asset-storage.md)。

## 导入规则

- ElecKoi JSON：识别根对象的 `format` 与 `version` 后直接解码。
- ElecKoi PNG：按 `eleckoi-card` 或 `eleckoi-bundle` 标记读取；资源包和 JSON 使用同一领域解码器。PNG 块 CRC、ZIP CRC、清单文件大小和 SHA-256 均须有效。缺包、越界、重复路径或损坏附件须失败，不能静默导入空资源。
- ElecKoi ZIP：直接读取清单与同一根文档。
- 完整前端项目编号重新分配，活动项目重定向。存在已选项目时启用该项目；未选时启用目录首个项目，不再要求玩家另点应用。原消息渲染启用状态保留。库资产编号保持，物理所有者改为新角色。
- 导入时创建新的本地角色 ID，并把设定库、变量配置和角色正则重定向到新角色；载荷中的本机关系不得直接复用。
- 缺少可选图片时只留空对应槽位；PNG 自身的预览图仅可作为三套图片全部缺失时的兜底。

## 库资产与完整前端

`library_assets` 包含每项固定编号、显示名称、类型、MIME、字节数、SHA-256、创建时间、可选 `folderId` 和文件正文；`library_folders` 保存文件夹编号、显示名称、父级编号和创建时间，包含空文件夹。没有分组信息时素材位于根目录。JSON 正文是 Base64；ZIP / PNG 资源包中的正文是包内文件引用，导入前完整校验并还原同一领域载荷。文件夹是逻辑元数据，不把显示名称拼成存储或包内路径；移动和重命名不改素材编号。

`frontends.projects` 包含源项目编号和完整文件列表。每项文件保留相对路径、内容和编码；完整清单包含入口、绑定、样式及作者配置。原文件放在 `frontends/<序号>/<原相对路径>`，不嵌套 ZIP。源项目编号只用于映射选择，不用作导入后的物理目录。

导出自动收集角色资产库全部内容，包括尚未使用的素材，避免漏掉由变量拼接或其他开场白动态引用的资源。作者不必另行压缩、整理目录。卡包的每个文件由清单登记大小与摘要；媒体不重复压缩。JSON、ZIP 和 PNG 解码结果的媒体内容与前端文件应一致。

## 跨端与传输验证

1. 在不同临时数据目录往返 JSON、PNG、ZIP，比较资产编号与摘要、完整前端文件与选择、多开场白完整正文、变量、设定及正则。
2. 验证相对目录含中文、空格和符号，文件内保留 `asset://` 引用；运行时按新角色解析。
3. 验证损坏文件、缺失 PNG 资源块、不安全路径及导入到第二个前端失败时，整个角色和已写素材一起回滚。
4. PNG 仍显示正常封面，但群聊平台的重新编码可能移除附加块；需传输原文件。PNG 没有有效封面时沿当前导出器的后备图片行为，不承诺把任意图片格式转成封面。
5. 不设置素材总量的产品上限；当前导出 / 导入的 Base64 合同和 ZIP 组装在内存中完成，设备可用内存仍是实际边界。共享源码与隔离验证不代替已安装 Android 包的真机验证。
