<!-- Generated from docs/plugins/services.md; run pnpm generate:plugin-docs. -->

# 服务接口

服务是插件能直接调用的功能。提供方通过 Cordis 注册到 Context，使用方声明 inject 后通过 ctx 调用。Client 服务负责页面中的状态、订阅和调用 Host；保存产品数据的操作仍由 Host 完成。

完整方法、参数、返回值和字段由公开源码生成：

- [Client 服务参考](api-client.md)：角色、设定库、变量、正则、聊天、项目、模型、资料、预设、搜索和显示偏好。
- [Host 服务参考](api-host.md)：正式产品 API，以及同一个 Session 内的消息修改和回退。
- [Client 数据类型](types-client.md)与 [Host 数据类型](types-host.md)：方法引用的完整数据结构。
- [Remote 调用声明](api-remote.md)：Client 直接调用 Host 的正式写法。

## 导入公开类型

每个 Client 服务包的 /client 入口同时提供运行入口和公开类型，并合并 Cordis Context。插件应导入这些类型，不要复制本文里的接口定义。

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@eleckoi/dsh-client-character-configuration/client'
import type { SettingLibrary } from '@eleckoi/dsh-product-api/types'

export const inject = ['eleckoiSettingLibraries']

export function apply(ctx: Context) {
  const stop = ctx.eleckoiSettingLibraries.subscribe((kind, characterId, state) => {
    console.log(kind, characterId, state.status)
  })
  return stop
}

async function readLibrary(ctx: Context, characterId: string): Promise<SettingLibrary> {
  return ctx.eleckoiSettingLibraries.read(characterId)
}
```

Host 插件从 @eleckoi/dsh-product-api 导入 Context 贡献；业务数据类型从该包的 /types 导入。Client 不能注入 Host 服务，跨端使用 [DSH Remote](remote.md)。

## 各服务负责什么

| 服务 | 公开类型入口 | 做什么 |
| --- | --- | --- |
| eleckoiCharacters | @eleckoi/dsh-client-characters/client | 角色增删改、分组、角色卡导入导出及页面状态 |
| eleckoiSettingLibraries | @eleckoi/dsh-client-character-configuration/client | 读取和保存角色及聊天的完整设定库 |
| eleckoiVariables | @eleckoi/dsh-client-character-configuration/client | 读取和保存变量定义、初始值、版本及展开状态 |
| eleckoiRegexRules | @eleckoi/dsh-client-character-configuration/client | 读取、保存、导入导出和测试正则；没有 saveViewState |
| eleckoiConversations | @eleckoi/dsh-client-conversations/client | 聊天目录、消息显示、提交、停止、回退、归档、作者资料和变量修改 |
| eleckoiCreatorStudio | @eleckoi/dsh-client-creator-studio/client | 创作项目目录和官方目录选择器 |
| eleckoiModels | @eleckoi/dsh-client-models/client | 模型目录、显式能力配置、连接测试和用户主动查看密钥 |
| eleckoiPersona | @eleckoi/dsh-client-persona/client | 用户名称和头像资料 |
| eleckoiPresets | @eleckoi/dsh-client-presets/client | 完整预设、预设分组、选择、导入导出 |
| eleckoiWebSearch | @eleckoi/dsh-client-web-search/client | 搜索方式、Tavily 配置与连接测试 |
| eleckoiDisplayPreferences | @eleckoi/dsh-client-display-preferences/client | 界面和聊天显示偏好 |
| layout | @deepseek-ai/dsh-client-ui-layout/client | 官方主面板和右侧栏控制；当前桌面的 toggleSidebar 为空操作 |
| eleckoiSessionEditor（Host） | @eleckoi/dsh-product-api | 修改消息和回退轮次，保持原 Session 编号 |

这些 13 个服务对应插件中心的服务目录；Host 的产品 Remote 实现另外出现在完整 Host 参考中。

## 设定、消息和保存行为

设定库返回完整对象，不会只提取设定文本。必读、选读、关键词、EJS 模式、触发方式和提示词插入位置仍在原有字段中。读取完整设定库不等于已经为某个 Agent 执行触发或注入；正式请求准备仍由产品运行插件处理。这些读取接口也没有自动增加成员之间的资料权限限制。

角色设定与聊天设定分别保存。聊天只保存实际产生的设定改动和删除标记；读取时使用角色设定叠加聊天改动后的有效库。界面保存只编辑已有聊天设定，失败和只读操作不创建新的聊天设定分支。

聊天消息正文、分页、正在运行的请求和轨迹来自官方 Session。文件上传返回当前 Session 使用的 receipt 编号，send 的 files 参数使用这些编号组成的字符串列表。消息元数据在正文投影就绪前可能没有 content。rememberSession 等偏好方法只修改当前页面中的选择；持久选择使用 readSelection/saveSelection。

模型参数、显示偏好和搜索设置使用官方 Settings，密钥使用 Credentials。模型目录中的推理档位来自官方能力或显式配置。普通模型状态不包含密钥正文；revealApiKey 供用户主动查看。模型配置可用 clearCredential 清除密钥，用 clearConfiguration 清除配置覆盖；模型参数和图片配置字段见完整类型。

正则保存使用 revision 校验并发修改。预设保存需要提交调用方看到的正则规则列表。Client 方法成功时返回类型声明中的值，异步失败时拒绝 Promise；直接 Remote 调用则返回官方 RemoteResult，需要检查 ok。

预设按 `purpose` 区分 `roleplay` 与 `creator`，分组和全局选择各自独立，目录的 `activePresetIds` 分别返回两类选择。新建与导入明确指定当前用途，切换目录不改变启用状态。

AI 创作工作室通过 `eleckoiCreatorStudio.sessions` 创建、打开会话和选择编辑目标。Host 使用官方 Session Controller 管理会话，角色编号及创作预设编号由正式 Session 事件保存；消息、思考和工具调用使用 DSH 原生对话投影。创作操作直接修改所选角色的永久资料、设定库、变量及正则，不注入角色扮演身份。默认创作预设只启用创作能力；工具先发现能力组、读取准确操作参数，再执行操作。

订阅返回取消函数，应随插件停用或组件卸载释放。不要修改页面状态对象，不要把 Client 方法当作数据库事务。SessionEditor 的内部 transaction/deleteSession 方法不属于插件中心公开成员。

## 在运行时查接口

官方 cordis_inspect_list 会列出查询提供方。使用 cordis_inspect_query 的平台、provider、method 和 input 字段查询：

| platform / provider / method | input | 返回 |
| --- | --- | --- |
| host / ElecKoi.Service / api | {} | Host 产品服务目录 |
| host / ElecKoi.Service / api | { "key": "eleckoiCharacterConfigurationApi" } | 该服务的参数、返回值和引用类型 |
| client / ElecKoi.Service / api | { "key": "eleckoiConversations" } | 聊天服务的完整调用说明 |
| client / ElecKoi.Remote / api | {} | 产品 Remote namespace 和方法目录 |
| client / ElecKoi.Remote / api | { "namespace": "eleckoiCharacterConfiguration" } | 官方生成的调用声明和设定数据类型 |
| client / Service / api | { "key": "layout" } | 官方已有的布局服务说明 |

Client 查询需要连接中的页面。产品目录在官方 cordisInspect 就绪后注册，并随插件生命周期撤销；未启用官方查询能力时，正常产品功能继续运行。接口查询只返回调用说明和类型，不读取用户角色、聊天内容或密钥。
