/** Discovery routes to bundled skills; detailed authoring knowledge loads on demand. */
export const creatorToolsets = [
  { id: 'character', title: '角色资料', description: '新建空角色，维护当前角色资料和独立开场白。', skill: 'eleckoi-character-authoring',
    guide: ['先读取当前角色；character.create 可从零创建。开场白用 character.read_openings／character.save_openings，与设定版本独立。常规楼层界面加载 eleckoi-message-frontends；角色配置与配套脚本加载 eleckoi-character-authoring。'] },
  { id: 'settings', title: '设定库', description: '读写角色卡或共享全局的设定原稿、EJS、文件夹和配置。', skill: 'eleckoi-character-authoring',
    guide: ['省略 target 是当前角色；target={scope:"global",libraryId} 是明确全局库，无需选择角色。list 是目录，read 是原稿。片段编辑 settings.edit 无需重传整条正文。全局写入带 expectedRevision；角色完整配置用 read_library/save_library。agentReadStrategy 的 keyword 是选读关键词匹配。详细知识加载 skill eleckoi-character-authoring。'] },
  { id: 'variables', title: '变量库', description: '维护当前角色的变量定义、默认值和 Zod 校验。', skill: 'eleckoi-character-authoring',
    guide: ['配置与聊天当前值分别归属；schemaCode 使用 Zod 4。先 validate_schema 再保存，详细流程加载 skill eleckoi-character-authoring。'],
    examples: [{ title: '范围、动态字典与派生计算', schemaCode: 'z.object({ score: z.coerce.number().min(0).max(100).prefault(0), flags: z.record(z.string(), z.boolean()).prefault({}) }).transform(value => ({ ...value, level: Math.floor(value.score / 10) + 1 }))', state: { score: 20, flags: { ready: true } } }] },
  { id: 'scripts', title: '脚本', description: '读写全局或角色脚本、设置、按钮、文件夹和启停。', skill: 'eleckoi-character-authoring',
    guide: ['target 省略为当前角色；global 无需选择角色。先 list/read，写入带同范围 expectedRevision。脚本可配合楼层界面提供持续逻辑、按钮和面板，无需独立项目前端。新建原生脚本默认停用，已有兼容源码保持原格式。移动用 move，不跨库。详细 SDK 与用法加载 skill eleckoi-character-authoring。'],
    examples: [{ title: '原生辅助计算', content: 'export default context => context.api.variables.registerRule({ id: "derive-level", stage: "afterSchema", run(candidate) { candidate.signal.throwIfAborted(); const score = Number(candidate.state.score); if (!Number.isFinite(score)) throw new Error("score 必须是有限数字"); candidate.state.level = Math.floor(score / 10) + 1; } });' }] },
  { id: 'regex', title: '正则规则', description: '读写全局或角色正则，并测试文字、HTML 与 EJS 替换。', skill: 'eleckoi-message-frontends',
    guide: ['target 省略为当前角色；global 无需选择角色。先 list/read，写入带 expectedRevision。常规楼层前端通常由显示正则替换出 HTML，再由富消息环境运行。EJS replacement 与页面脚本是不同阶段；regex.test 只预览文本转换。制作楼层界面先加载 skill eleckoi-message-frontends。'] },
  { id: 'editorVersions', title: '配置版本', description: '管理角色卡或共享全局的正则／脚本命名版本。', skill: 'eleckoi-character-authoring',
    guide: ['普通修改用 regex/scripts 条目入口。read 返回 library 与 document；save 提交配置对象 documents 与 versions。global 版本读取无需选择角色。完整流程加载 skill eleckoi-character-authoring。'] },
  { id: 'assets', title: '角色资产库', description: '管理当前角色的图片、视频、音频、模型与混合文件夹，提供固定引用。', skill: 'eleckoi-character-assets',
    guide: ['只操作当前角色。先 list，写入带目录 expectedRevision；本地文件用 import_file，生成的文本或 base64 用 import。移动和改名不改 asset:// 引用；delete 文件夹递归删除内容。完整流程加载 skill eleckoi-character-assets。'] },
  { id: 'frontends', title: '角色独立前端', description: '导入、读写、选择、导出和移除当前角色的独立 HTML／ZIP 项目。', skill: 'eleckoi-character-frontends',
    guide: ['独立项目用于自定义整套角色聊天内容区交互，如接入 AI 的网页游戏。常规楼层界面用正则／正文 HTML，配套按钮面板用脚本。先 list/read_file，写入带工作区 expectedRevision；新项目默认不启用。选择 null 恢复默认。完整流程加载 skill eleckoi-character-frontends。'] },
] as const

export const creatorAuthoringInstructions = '先查询 presetPrompts，读取当前创作预设 required_entries；已知路径可直接 read。按任务加载技能：角色配置与后台脚本／按钮面板 eleckoi-character-authoring；资产 eleckoi-character-assets；常规楼层界面 eleckoi-message-frontends（通常由正则替换生成 HTML，也支持正文 HTML）。常规创作保留楼层结构，脚本可配套界面；需要自定义整套内容区交互时才用独立项目 eleckoi-character-frontends。依据展示目标和已有实现选择入口。技能和参考按需读取，准确参数通过 eleckoi_describe_toolset 的 operation_ids、include_schema 查询，再用 eleckoi_call_capability 执行。省略 target 是当前角色，global 必须明确；资产和独立前端只属于当前角色。先读后改，保留未修改内容。结果溢出沿 result 续读或搜索，不重复写入。工作区编程制作源码，产品数据通过对应能力保存。'
