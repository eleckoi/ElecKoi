/** Discovery routes to bundled skills; detailed authoring knowledge loads on demand. */
export const creatorToolsets = [
  { id: 'character', title: '角色卡', description: '查找或创建角色卡，编辑基础资料、单人或多人登场名单及开场白。', skill: 'eleckoi-character-authoring',
    guide: [
      'character.list 查找角色卡，调用时可用 character_id 指定准确目标；省略时用当前快捷目标。character.create 创建一张新卡，默认未分组；按用户要求整理分组。',
      '登场角色是卡片里可以出场和发言的人。单人卡用一位，多人卡登记多位；每位可有自己的名字、立绘和头像。角色对话的回复工具用名单中的名字区分发言者，开场白段落用固定编号选择头像。名单告诉模型谁可以出场，当轮谁开口由剧情决定。人物性格和关系写在角色设定里。',
      'character.read 返回 cast 名单。character.create_cast_member 在这张卡里新增一位并返回固定编号；character.update_cast_member 用编号改名字、立绘或头像取景；character.remove_cast_member 用编号移除一位，最后一位保留。卡片名称、作者、封面和简介用 character.update。',
      '主开场白与备用开场白用 character.read_openings／character.save_openings。只有卡片封面的单段直接写 content；要指定或切换发言者就按顺序提交 segments。cover 用卡片封面，speech 用 cast 中的 speakerId。台词、动作和环境都写进段落的 text。保存完整列表并保留未修改项和绑定。',
    ] },
  { id: 'settings', title: '设定库', description: '读写角色卡或共享全局的设定原稿、EJS、文件夹和配置。', skill: 'eleckoi-character-authoring',
    guide: [
      '省略 target 读取当前角色。target={scope:"global",libraryId} 指定全局库，无需选择角色。list 是目录，read 是原稿。仅改一段用 settings.edit，无需重传整条正文。全局写入带 expectedRevision，角色完整配置用 read_library/save_library。',
      '新建默认关闭触发规则。需启用时传 enabled=true。triggerMode=agent_tool 时，agentReadStrategy=normal 为 AI 选读、keyword 为关键词触发、required 为常驻触发（每轮必读）。triggerMode=always 为常驻触发（指定插入位置）。',
      '混写正文将整份原稿作为 content，并设 contentMode=ejs。关闭触发规则后，正文可供其他模板通过 getwi 引用。getwi 可递归读取当前聊天库中的普通设定，包括规则关闭或关键词尚未命中的条目。详细知识加载 skill eleckoi-character-authoring。',
    ],
    examples: [{ title: '动态人物状态引用', operation: 'settings.create', arguments: {
      title: '人物状态', contentMode: 'ejs', agentReadStrategy: 'normal', triggerMode: 'agent_tool', enabled: false,
      content: '好感度：<%= getvar("好感度", { defaults: 0 }) %>。<%- await getwi("固定规则") %>'
    } }] },
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

export const creatorAuthoringInstructions = '先查询 presetPrompts，读取当前创作预设 required_entries；已知路径可直接 read。按任务加载技能：角色配置与后台脚本／按钮面板 eleckoi-character-authoring；资产 eleckoi-character-assets；常规楼层界面 eleckoi-message-frontends（通常由正则替换生成 HTML，也支持正文 HTML）。新建角色默认未分组；仅按用户要求指定或新建角色分组，不自行按题材分类。常规创作保留楼层结构，脚本可配套界面；需要自定义整套内容区交互时才用独立项目 eleckoi-character-frontends。依据展示目标和已有实现选择入口。技能和参考按需读取，eleckoi_describe_toolset 默认返回本组准确 inputSchema，operation_ids 可缩小范围，再用 eleckoi_call_capability 执行。只读省略 arguments 等同空对象，写入明确提供业务参数。省略 target 是当前角色，global 必须明确；资产和独立前端只属于当前角色。先读后改，保留未修改内容。结果溢出仅传 result 续读或搜索，路径取已有回执，不与普通调用混用、不重复写入。工作区编程制作源码，产品数据通过对应能力保存。'
