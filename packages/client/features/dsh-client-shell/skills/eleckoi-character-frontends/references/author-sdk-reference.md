<!-- Generated from docs/plugins/author-sdk-reference.md; run pnpm generate:plugin-docs. -->

<!-- 由 pnpm generate:author-docs 生成，请勿手工编辑。 -->

# 原生作者 SDK 接口参考

从正式 `ElecKoiAuthorApi`、方法目录及其引用类型生成。调用时机、作用域和失败处理见 [开发教程](author-sdk.md)。浏览器中先等待 `window.ElecKoiReady`，不导入 Host 或兼容接口。

返回 `Promise<T>` 的方法必须等待实际结果。函数注册及事件监听是本地操作，不能把函数作为 `call` 参数发送。当前页面的业务能力用 `app.getCapabilities()` 核对；同名方法存在不代表该页面拥有脚本设置或面板能力。

## call

### call

按明确方法名调用同一 SDK；优先使用有类型的命名空间方法

作用域：当前页面绑定的原生服务。本地函数操作，不经过通用方法请求。

```ts
call<TResult = unknown>(method: string, params?: Record<string, unknown>): Promise<TResult>;
```

## app

### app.getInfo

读取应用与作者 API 版本信息

作用域：当前页面绑定的原生服务。权限标识：`app.read`。

```ts
getInfo(): Promise<AuthorAppInfo>;
```

### app.getCapabilities

读取当前页面可调用的完整 API 清单

作用域：当前页面绑定的原生服务。权限标识：`app.read`。

```ts
getCapabilities(): Promise<AuthorCapability[]>;
```

## context

### context.current

读取当前页面上下文

作用域：当前页面绑定的原生服务。权限标识：`context.read`。

```ts
current(): Promise<AuthorContext>;
```

## script

### script.getSettings

读取当前脚本的设置与修改版本

作用域：所属运行脚本及其面板。权限标识：`script.read`。

```ts
/** Only installed for an explicitly owned running script. */
getSettings(): Promise<AuthorScriptSettings>;
```

### script.setSettings

保存当前脚本设置，不重新启动程序

作用域：所属运行脚本及其面板。权限标识：`script.write`。

```ts
setSettings(values: Record<string, unknown>, expectedRevision: number): Promise<AuthorScriptSettings>;
```

### script.getLibrarySettings

读取当前脚本所属库的共享设置

作用域：所属运行脚本及其面板。权限标识：`script.read`。

```ts
getLibrarySettings(): Promise<AuthorScriptSettings>;
```

### script.setLibrarySettings

保存当前脚本所属库的共享设置

作用域：所属运行脚本及其面板。权限标识：`script.write`。

```ts
setLibrarySettings(values: Record<string, unknown>, expectedRevision: number): Promise<AuthorScriptSettings>;
```

## scripts

### scripts.list

查询当前聊天运行脚本的明确身份及已登记操作

作用域：当前页面绑定的原生服务。权限标识：`script.read`。

```ts
/** Lists running scripts and their explicitly registered actions in this chat. */
list(): Promise<{
    items: AuthorScriptEndpoint[];
}>;
```

### scripts.registerHandler

运行脚本登记自定义操作及处理函数，返回撤回函数

作用域：仅运行脚本。本地函数操作，不经过通用方法请求。

```ts
/** Running script only; each action has exactly one handler within that script. */
registerHandler(action: string, handler: (context: AuthorScriptRequestContext) => AuthorScriptData | Promise<AuthorScriptData>): () => void;
```

### scripts.request

调用当前聊天指定脚本的操作并等待结果

作用域：当前页面绑定的原生服务。权限标识：`scripts.call`。

```ts
/** Calls one exact script and action. Use null when no data is needed. */
request(target: AuthorScriptIdentity, action: string, data: AuthorScriptData): Promise<AuthorScriptData>;
```

## ui

### ui.registerButton

运行脚本同步注册聊天按钮，返回撤回函数

作用域：仅运行脚本。本地函数操作，不经过通用方法请求。

```ts
/** Running script only. IDs are unique within that script, not across scopes. */
registerButton(button: AuthorScriptButton): () => void;
```

### ui.openPanel

打开所属脚本的原生作者面板

作用域：所属运行脚本及其面板。权限标识：`ui.write`。

```ts
/** Accepts a native document; relative resources resolve against the owning script file. */
openPanel(panel: AuthorScriptPanel): Promise<{
    id: string;
}>;
```

### ui.closePanel

关闭所属脚本的原生作者面板

作用域：所属运行脚本及其面板。权限标识：`ui.write`。

```ts
closePanel(id: string): Promise<{
    closed: boolean;
}>;
```

## variables

### variables.getState

读取当前变量状态

作用域：当前页面绑定的原生服务。权限标识：`variables.read`。

```ts
getState(options?: {
    messageId?: string;
}): Promise<Record<string, unknown>>;
```

### variables.getConfig

读取角色变量结构与初始配置

作用域：当前页面绑定的原生服务。权限标识：`variables.read`。

```ts
getConfig(): Promise<unknown>;
```

### variables.setState

替换当前聊天变量状态

作用域：当前页面绑定的原生服务。权限标识：`variables.write`。

```ts
setState(state: Record<string, unknown>): Promise<Record<string, unknown>>;
```

### variables.merge

合并更新当前聊天变量状态

作用域：当前页面绑定的原生服务。权限标识：`variables.write`。

```ts
merge(state: Record<string, unknown>): Promise<Record<string, unknown>>;
```

### variables.applyPatch

按操作清单更新当前聊天变量状态

作用域：当前页面绑定的原生服务。权限标识：`variables.write`。

```ts
applyPatch(patch: AuthorVariablePatch[]): Promise<Record<string, unknown>>;
```

### variables.reset

重置当前聊天变量状态

作用域：当前页面绑定的原生服务。权限标识：`variables.write`。

```ts
reset(): Promise<Record<string, unknown>>;
```

### variables.registerRule

运行脚本同步注册候选处理规则，返回撤回函数

作用域：仅运行脚本。本地函数操作，不经过通用方法请求。

```ts
registerRule(rule: AuthorVariableRule): () => void;
```

## openings

### openings.list

读取当前聊天的全部开场白选项

作用域：当前页面绑定的原生服务。权限标识：`openings.read`。

```ts
list(): Promise<{
    items: AuthorOpening[];
}>;
```

### openings.current

读取当前选中的开场白

作用域：当前页面绑定的原生服务。权限标识：`openings.read`。

```ts
current(): Promise<AuthorOpening | null>;
```

### openings.select

切换当前聊天的开场白

作用域：当前页面绑定的原生服务。权限标识：`openings.write`。

```ts
select(id: string): Promise<{
    selectedId: string;
}>;
```

## messages

### messages.list

读取当前聊天的消息列表

作用域：当前页面绑定的原生服务。权限标识：`messages.read`。

```ts
/** Messages currently loaded by the native conversation view. */
list(): Promise<AuthorMessage[]>;
```

### messages.getPage

读取已加载消息与历史分页游标

作用域：当前页面绑定的原生服务。权限标识：`messages.read`。

```ts
getPage(): Promise<AuthorMessagePage>;
```

### messages.pageOlder

按当前游标加载更早的消息

作用域：当前页面绑定的原生服务。权限标识：`messages.read`。

```ts
pageOlder(beforeSequence: number): Promise<AuthorMessagePage>;
```

### messages.get

按消息 ID 读取一条消息

作用域：当前页面绑定的原生服务。权限标识：`messages.read`。

```ts
get(id: string): Promise<AuthorMessage>;
```

### messages.current

读取当前最后一条消息

作用域：当前页面绑定的原生服务。权限标识：`messages.read`。

```ts
current(): Promise<AuthorMessage>;
```

### messages.setContent

改写指定消息正文

作用域：当前页面绑定的原生服务。权限标识：`messages.write`。

```ts
setContent(id: string, text: string): Promise<AuthorMessage>;
```

### messages.deleteFrom

删除指定消息以及它之后的全部消息

作用域：当前页面绑定的原生服务。权限标识：`messages.write`。

```ts
deleteFrom(id: string): Promise<{
    ok: true;
    deletedMessageCount: number;
    remainingMessageCount: number;
}>;
```

### messages.regenerate

从指定 AI 消息重新生成

作用域：当前页面绑定的原生服务。权限标识：`messages.write`。

```ts
regenerate(id: string): Promise<AuthorRunAccepted>;
```

### messages.editAndRegenerate

修改用户消息并从该处重新生成

作用域：当前页面绑定的原生服务。权限标识：`messages.write`。

```ts
editAndRegenerate(id: string, text: string): Promise<AuthorRunAccepted>;
```

## chat

### chat.current

读取当前聊天会话摘要

作用域：当前页面绑定的原生服务。权限标识：`chat.read`。

```ts
current(): Promise<AuthorChatSummary>;
```

### chat.list

读取当前角色的聊天会话列表

作用域：当前页面绑定的原生服务。权限标识：`chat.read`。

```ts
list(): Promise<{
    items: AuthorChatSummary[];
}>;
```

### chat.getGenerationState

读取 AI 生成状态

作用域：当前页面绑定的原生服务。权限标识：`chat.read`。

```ts
getGenerationState(): Promise<AuthorGenerationState>;
```

### chat.getAgentTrajectory

读取当前聊天的完整 Agent 处理轨迹

作用域：当前页面绑定的原生服务。权限标识：`chat.read`。

```ts
/** Reads current loaded history, or loads the exact preceding history cursor first. */
getAgentTrajectory(options?: {
    beforeSequence?: number;
}): Promise<AuthorAgentTrajectory>;
```

### chat.getModels

读取模型目录与全局生效的模型

作用域：当前页面绑定的原生服务。权限标识：`chat.read`。

```ts
getModels(): Promise<AuthorChatModelCatalog>;
```

### chat.send

发送消息并开始 AI 回复

作用域：当前页面绑定的原生服务。权限标识：`chat.send`。

```ts
send(text: string, options?: {
    attachments?: AuthorSendAttachment[];
}): Promise<AuthorRunAccepted>;
```

### chat.stopGeneration

停止当前 AI 回复

作用域：当前页面绑定的原生服务。权限标识：`chat.write`。

```ts
stopGeneration(): Promise<{
    cancelled: boolean;
}>;
```

### chat.create

为角色创建新对话

作用域：当前页面绑定的原生服务。权限标识：`chat.write`。

```ts
create(options?: {
    title?: string;
}): Promise<{
    chat: AuthorChatSummary;
}>;
```

### chat.open

切换当前对话

作用域：当前页面绑定的原生服务。权限标识：`chat.write`。

```ts
/** Opens an explicitly identified chat belonging to the same role. */
open(conversationId: string): Promise<{
    chat: AuthorChatSummary;
}>;
```

### chat.delete

删除指定对话

作用域：当前页面绑定的原生服务。权限标识：`chat.write`。

```ts
/** Does not select or create a replacement chat after deleting the current one. */
delete(conversationId: string): Promise<{
    deletedId: string;
    chat: AuthorChatSummary | null;
}>;
```

### chat.selectModel

选择全局模型与明确的推理档位

作用域：当前页面绑定的原生服务。权限标识：`chat.write`。

```ts
selectModel(options: {
    configId: string;
    model: string;
    reasoningEffort?: string;
}): Promise<{
    configId: string;
    model: string;
    reasoningEffort?: string;
}>;
```

## character

### character.current

读取当前角色摘要

作用域：当前页面绑定的原生服务。权限标识：`character.read`。

```ts
current(): Promise<Record<string, unknown> | null>;
```

## settingLibrary

### settingLibrary.current

读取所属角色的设定库原稿

作用域：当前页面绑定的原生服务。权限标识：`setting_library.read`。

```ts
/** The bound character's original unexpanded library, without story overrides or preset entries. */
current(): Promise<AuthorSettingLibrary | null>;
```

### settingLibrary.getSummary

读取所属角色设定库摘要

作用域：当前页面绑定的原生服务。权限标识：`setting_library.read`。

```ts
getSummary(): Promise<{
    characterId: string;
    name: string;
    activeVersionId: string;
    entryCount: number;
    groupCount: number;
} | null>;
```

### settingLibrary.replace

替换所属角色的当前设定库内容

作用域：当前页面绑定的原生服务。权限标识：`setting_library.write`。

```ts
/** Replaces the bound character's current library content, preserving other versions and management settings. */
replace(library: AuthorSettingLibrary): Promise<AuthorSettingLibrary>;
```

### settingLibrary.getEntry

按编号读取角色设定条目原稿

作用域：当前页面绑定的原生服务。权限标识：`setting_library.read`。

```ts
getEntry(id: string): Promise<AuthorSettingLibraryEntry>;
```

### settingLibrary.updateEntry

修改角色设定库的指定条目

作用域：当前页面绑定的原生服务。权限标识：`setting_library.write`。

```ts
updateEntry(id: string, changes: AuthorSettingEntryChanges): Promise<AuthorSettingLibraryEntry>;
```

### settingLibrary.updateEntries

原子修改角色设定库的一组条目

作用域：当前页面绑定的原生服务。权限标识：`setting_library.write`。

```ts
/** Atomically edits the character's ordinary entries and active version, leaving story overrides unchanged. */
updateEntries(updates: AuthorSettingEntryUpdate[]): Promise<AuthorSettingLibraryEntry[]>;
```

## editorVersions

### editorVersions.read

读取共享全局、所属角色或当前扮演预设的完整配置版本

作用域：当前页面绑定的原生服务。权限标识：`editor_versions.read`。

```ts
/** 角色作用域固定为本页角色；预设作用域固定为当前扮演预设。 */
read(kind: AuthorEditorLibraryVersions['kind'], scope: AuthorEditorLibraryVersions['scope']): Promise<AuthorEditorLibraryVersions>;
```

### editorVersions.save

原子保存正则或脚本的配置及命名版本

作用域：当前页面绑定的原生服务。权限标识：`editor_versions.write`。

```ts
/** 配置正文和命名版本原子保存；documents 为相同类型的正式配置 JSON。 */
save(kind: AuthorEditorLibraryVersions['kind'], documents: string[], versions: AuthorEditorLibraryVersions[]): Promise<AuthorEditorLibrarySaveResult>;
```

## presets

### presets.list

读取预设目录及全局选中的预设编号

作用域：当前页面绑定的原生服务。权限标识：`presets.read`。

```ts
list(): Promise<AuthorPresetCatalog>;
```

### presets.current

读取全局选中的预设原稿

作用域：当前页面绑定的原生服务。权限标识：`presets.read`。

```ts
current(): Promise<AuthorPreset | null>;
```

### presets.get

按编号读取预设原稿

作用域：当前页面绑定的原生服务。权限标识：`presets.read`。

```ts
get(presetId: string): Promise<AuthorPreset>;
```

### presets.getEntry

按编号读取预设条目

作用域：当前页面绑定的原生服务。权限标识：`presets.read`。

```ts
getEntry(presetId: string, id: string): Promise<AuthorSettingLibraryEntry>;
```

### presets.updateEntry

修改指定预设原稿的条目

作用域：当前页面绑定的原生服务。权限标识：`presets.write`。

```ts
/** Edits the stored preset and active version, affecting all chats using that preset. */
updateEntry(presetId: string, id: string, changes: AuthorSettingEntryChanges): Promise<AuthorSettingLibraryEntry>;
```

### presets.updateEntries

原子修改指定预设原稿的一组条目

作用域：当前页面绑定的原生服务。权限标识：`presets.write`。

```ts
updateEntries(presetId: string, updates: AuthorSettingEntryUpdate[]): Promise<AuthorSettingLibraryEntry[]>;
```

### presets.select

选择全部聊天后续请求使用的预设

作用域：当前页面绑定的原生服务。权限标识：`presets.write`。

```ts
/** Selects the global preset for subsequent requests, not just the current chat. */
select(presetId: string): Promise<AuthorPresetCatalog>;
```

## media

### media.getMessageAttachments

读取一条消息里的全部媒体附件

作用域：当前页面绑定的原生服务。权限标识：`media.read`。

```ts
getMessageAttachments(messageId?: string): Promise<{
    items: AuthorMediaResource[];
}>;
```

### media.getMessageAttachment

读取一条消息里的指定媒体附件

作用域：当前页面绑定的原生服务。权限标识：`media.read`。

```ts
getMessageAttachment(messageId: string, attachmentId: string): Promise<AuthorMediaResource>;
```

## audio

### audio.play

播放背景音乐、环境音、语音或音效

作用域：当前页面绑定的原生服务。权限标识：`audio.write`。

```ts
play(options: {
    channel?: AuthorAudioChannel;
    track: AuthorAudioTrackInput;
    loop?: boolean;
    volume?: number;
    startAt?: number;
}): Promise<AuthorAudioState>;
```

### audio.pause

暂停一个音频频道

作用域：当前页面绑定的原生服务。权限标识：`audio.write`。

```ts
pause(channel?: AuthorAudioChannel): Promise<AuthorAudioState>;
```

### audio.resume

继续播放一个音频频道

作用域：当前页面绑定的原生服务。权限标识：`audio.write`。

```ts
resume(channel?: AuthorAudioChannel): Promise<AuthorAudioState>;
```

### audio.stop

停止一个音频频道

作用域：当前页面绑定的原生服务。权限标识：`audio.write`。

```ts
stop(channel?: AuthorAudioChannel): Promise<AuthorAudioState>;
```

### audio.seek

跳转一个音频频道的播放位置

作用域：当前页面绑定的原生服务。权限标识：`audio.write`。

```ts
seek(seconds: number, channel?: AuthorAudioChannel): Promise<AuthorAudioState>;
```

### audio.getState

读取一个音频频道的播放状态

作用域：当前页面绑定的原生服务。权限标识：`audio.read`。

```ts
getState(channel?: AuthorAudioChannel): Promise<AuthorAudioState>;
```

### audio.getPlaylist

读取一个音频频道的播放列表

作用域：当前页面绑定的原生服务。权限标识：`audio.read`。

```ts
getPlaylist(channel?: AuthorAudioChannel): Promise<{
    channel: AuthorAudioChannel;
    items: AuthorAudioTrack[];
    currentIndex: number;
}>;
```

### audio.setPlaylist

替换一个音频频道的播放列表

作用域：当前页面绑定的原生服务。权限标识：`audio.write`。

```ts
setPlaylist(channel: AuthorAudioChannel, items: AuthorAudioTrackInput[], options?: {
    currentIndex?: number;
    autoplay?: boolean;
    loop?: boolean;
    shuffle?: boolean;
}): Promise<AuthorAudioState>;
```

### audio.appendPlaylist

向一个音频频道追加曲目

作用域：当前页面绑定的原生服务。权限标识：`audio.write`。

```ts
appendPlaylist(channel: AuthorAudioChannel, items: AuthorAudioTrackInput[]): Promise<AuthorAudioState>;
```

### audio.getSettings

读取宿主音频设置

作用域：当前页面绑定的原生服务。权限标识：`audio.read`。

```ts
getSettings(): Promise<AuthorAudioSettings>;
```

### audio.setSettings

修改宿主音频设置

作用域：当前页面绑定的原生服务。权限标识：`audio.write`。

```ts
setSettings(settings: AuthorAudioSettingsUpdate): Promise<AuthorAudioSettings>;
```

## input

### input.get

读取当前聊天输入框内容

作用域：当前页面绑定的原生服务。权限标识：`input.read`。

```ts
get(): Promise<{
    text: string;
}>;
```

### input.set

设置当前聊天输入框内容

作用域：当前页面绑定的原生服务。权限标识：`input.write`。

```ts
set(text: string): Promise<{
    text: string;
}>;
```

### input.append

向当前聊天输入框追加内容

作用域：当前页面绑定的原生服务。权限标识：`input.write`。

```ts
append(text: string): Promise<{
    text: string;
}>;
```

### input.clear

清空当前聊天输入框内容

作用域：当前页面绑定的原生服务。权限标识：`input.write`。

```ts
clear(): Promise<{
    text: '';
}>;
```

### input.send

发送当前输入框内容

作用域：当前页面绑定的原生服务。权限标识：`chat.write`。

```ts
/** Requests submission of the official composer; submitted is not a generation receipt. */
send(): Promise<{
    submitted: boolean;
}>;
```

## events

### events.list

读取作者前端可订阅的事件名称

作用域：当前页面绑定的原生服务。权限标识：`events.read`。

```ts
list(): Promise<{
    items: readonly AuthorEventName[];
}>;
```

### events.on

注册事件监听，返回撤回函数

作用域：当前页面绑定的原生服务。本地函数操作，不经过通用方法请求。

```ts
on<TName extends AuthorEventName>(name: TName, listener: (payload: AuthorEventMap[TName]) => void): () => void;
```

### events.off

撤回指定事件与函数的监听

作用域：当前页面绑定的原生服务。本地函数操作，不经过通用方法请求。

```ts
off<TName extends AuthorEventName>(name: TName, listener: (payload: AuthorEventMap[TName]) => void): boolean | undefined;
```

## 数据类型

以下字段来自源码；`null`、可选字段和数组不代表另一份可保存业务数据。标准平台类型如 `AbortSignal` 使用浏览器合同。

### AuthorAgentProcessItem

```ts
export interface AuthorAgentProcessItem {
    id: string;
    kind: AuthorAgentProcessKind;
    status: AuthorAgentProcessStatus;
    toolName: string;
    arguments: string;
    summary: string;
    detail: string;
    startedAtMillis: number;
    completedAtMillis?: number;
    parentId?: string;
    delegatedModel?: string;
}
```

### AuthorAgentProcessKind

```ts
export type AuthorAgentProcessKind = 'tool' | 'command' | 'file_change' | 'compaction' | 'subagent' | 'action' | 'narrative' | 'reasoning';
```

### AuthorAgentProcessStatus

```ts
export type AuthorAgentProcessStatus = 'running' | 'complete' | 'error' | 'cancelled';
```

### AuthorAgentState

```ts
export type AuthorAgentState = 'idle' | 'starting' | 'streaming' | 'stopping' | 'error';
```

### AuthorAgentTrajectory

```ts
/** A copied loaded-history view, not another persisted trajectory or request cache. */
export interface AuthorAgentTrajectory {
    conversationId: string;
    runtimeSessionId: string;
    history: {
        hasMore: boolean;
        beforeSequence: number | null;
    };
    snapshot: {
        events: readonly AuthorAgentTrajectoryRecord[];
        locations: ReadonlyMap<number, AuthorTrajectoryLocation>;
        requests: readonly AuthorAgentTrajectoryRequest[];
        toolSchemas: ReadonlyMap<string, unknown>;
        systemPrompts?: readonly {
            seq: number;
            time: number;
            turn: number;
            step: number;
            text: string;
            update: boolean;
        }[];
        partial: {
            turn: number;
            step: number;
            blocks: readonly AuthorTrajectoryAssistantBlock[];
        } | null;
        runningTools: readonly AuthorTrajectoryRunningTool[];
    };
}
```

### AuthorAgentTrajectoryRecord

```ts
export type AuthorAgentTrajectoryRecord = {
    kind: 'user' | 'steering';
    seq: number;
    time: number;
    content: readonly AuthorTrajectoryBlock[];
    source: unknown;
    messageId?: string;
} | {
    kind: 'context';
    seq: number;
    time: number;
    content: readonly AuthorTrajectoryBlock[];
    source: unknown;
    producer: unknown;
    form: unknown;
} | {
    kind: 'assistant';
    seq: number;
    time: number;
    messageId?: string;
    turn: number;
    step: number;
    blocks: readonly AuthorTrajectoryAssistantBlock[];
    usage?: unknown;
    interrupted?: true;
    providerMetadata?: {
        provider: string;
        model: string;
    };
    requestConfig?: AuthorTrajectoryRequestConfig;
    timing?: {
        stepStartTime: number | null;
        firstTokenTime: number | null;
        completedTime: number;
    };
} | AuthorTrajectoryToolResult | {
    kind: 'model-retry';
    seq: number;
    time: number;
    retryState: 'scheduled' | 'started' | 'cancelled';
    [field: string]: unknown;
} | {
    kind: 'turn-error';
    seq: number;
    time: number;
    turn: number;
    step: number;
    message: string;
    code?: string;
} | {
    kind: 'turn-max-tokens';
    seq: number;
    time: number;
    turn: number;
    step: number;
} | {
    kind: 'command';
    seq: number;
    time: number;
    commandId: string;
    name: string | null;
    args: string | null;
    outcome: {
        kind: 'success' | 'error';
        text?: string;
        sourceEventSeq?: number;
    } | null;
} | {
    kind: 'compaction';
    seq: number;
    time: number;
    summary: string | null;
    summaryEventSeq: number | null;
    shadowedItemCount: number | null;
    shadowedTokenCount: number | null;
} | {
    kind: 'unknown';
    seq: number;
    time: number;
    type: string;
    data: unknown;
};
```

### AuthorAgentTrajectoryRequest

```ts
export type AuthorAgentTrajectoryRequest = {
    startSeq: number;
    startedAt: number;
    completedAt: number | null;
    status: 'running' | 'complete' | 'error';
    error?: string;
    errorCode?: string;
    providerMetadata?: {
        provider: string;
        model: string;
    };
    requestConfig?: AuthorTrajectoryRequestConfig;
    usage?: unknown;
    resultSeq?: number;
} & ({
    purpose: 'assistant';
    turn: number;
    step: number;
    prompt?: AuthorTrajectoryPrompt;
    promptChange?: {
        seq: number;
        time: number;
        kind: 'initial' | 'system' | 'tools' | 'system-and-tools';
        previous?: AuthorTrajectoryPrompt;
    };
    retry?: number;
    maxRetries?: number;
    retryDelayMs?: number;
} | {
    purpose: 'compaction';
    turn: number | null;
    step: 0;
    replacementSeq?: number;
    summary?: readonly AuthorTrajectoryBlock[];
    rawOutput?: readonly AuthorTrajectoryBlock[];
});
```

### AuthorAppInfo

```ts
export interface AuthorAppInfo {
    name: 'ElecKoi';
    apiVersion: string;
    stage: 'preview';
}
```

### AuthorAudioChannel

```ts
export type AuthorAudioChannel = 'bgm' | 'ambient' | 'voice' | 'sfx';
```

### AuthorAudioSettings

```ts
export interface AuthorAudioSettings {
    masterVolume: number;
    muted: boolean;
    channels: Record<AuthorAudioChannel, {
        volume: number;
        muted: boolean;
    }>;
}
```

### AuthorAudioSettingsUpdate

```ts
export interface AuthorAudioSettingsUpdate {
    masterVolume?: number;
    muted?: boolean;
    channels?: Partial<Record<AuthorAudioChannel, {
        volume?: number;
        muted?: boolean;
    }>>;
}
```

### AuthorAudioState

```ts
export interface AuthorAudioState {
    conversationId: string;
    channel: AuthorAudioChannel;
    status: AuthorAudioStatus;
    playlist: AuthorAudioTrack[];
    currentIndex: number;
    currentTrack: AuthorAudioTrack | null;
    currentTime: number;
    duration: number | null;
    loop: boolean;
    shuffle: boolean;
    volume: number;
    muted: boolean;
    error: string;
}
```

### AuthorAudioStatus

```ts
export type AuthorAudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
```

### AuthorAudioTrack

```ts
export interface AuthorAudioTrack {
    id: string;
    url: string;
    name: string;
    mimeType: string;
    metadata: Record<string, unknown>;
}
```

### AuthorAudioTrackInput

```ts
export type AuthorAudioTrackInput = string | (Partial<AuthorAudioTrack> & {
    url: string;
});
```

### AuthorCapability

```ts
export interface AuthorCapability {
    method: string;
    namespace: string;
    description: string;
    permission: string;
    stage: 'preview';
    since: string;
}
```

### AuthorChatModelCatalog

```ts
export interface AuthorChatModelCatalog {
    current: {
        configId: string;
        model: string;
        reasoningEffort?: string;
    };
    items: Array<{
        configId: string;
        name: string;
        provider: string;
        defaultModel: string;
        enabled?: boolean;
        models: Array<{
            id: string;
            name: string;
            contextWindowTokens?: number | null;
            autoCompactTokenLimit?: number | null;
            maxOutputTokens?: number | null;
            temperature?: number | null;
            topP?: number | null;
            reasoningEffort?: string | null;
            reasoningEfforts?: false | Record<string, string | null>;
            inputModalities?: ('text' | 'image')[];
            supportsImageInput?: boolean;
        }>;
    }>;
}
```

### AuthorChatSummary

```ts
export interface AuthorChatSummary {
    id: string;
    title: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
    characterId: string;
    characterName: string;
    characterAvatar: string;
}
```

### AuthorContext

```ts
export interface AuthorContext {
    surface: AuthorSurface;
    scope: 'current-character' | 'application';
    conversationId: string;
    conversationTitle: string;
    messageId: string;
    characterId: string;
    projectId?: string;
    entryFile?: string;
    view?: string;
}
```

### AuthorEditorLibrarySaveResult

```ts
export interface AuthorEditorLibrarySaveResult {
    documents: string[];
    versions: AuthorEditorLibraryVersions[];
}
```

### AuthorEditorLibraryVersions

```ts
/** 完整命名版本；content 是对应配置类型的 JSON，脚本版本包含源码及资源，正则版本包含整体 enabled 与 rules。 */
export interface AuthorEditorLibraryVersions {
    kind: 'scripts' | 'regex';
    scope: 'global' | 'character' | 'preset';
    ownerId: string;
    revision: number;
    resourceRevision: string;
    activeVersionId: string;
    versions: Array<{
        id: string;
        name: string;
        content: string;
    }>;
}
```

### AuthorEventMap

```ts
export interface AuthorEventMap {
    'messages.changed': {
        conversationId: string;
        reason: AuthorMessagesChangedReason;
        messageIds: string[];
    };
    'agent.output.delta': AuthorGenerationIdentity & {
        messageId: string;
        sequence: number;
        operation: 'append' | 'replace';
        delta: string;
        accumulated: string;
    };
    'agent.run.finished': AuthorGenerationIdentity & {
        reason: 'completed' | 'output-limit' | 'blocked';
        message: AuthorMessage | null;
    };
    'agent.run.cancelled': AuthorGenerationIdentity & {
        messageId: string;
        reason: 'cancelled' | 'interrupted';
    };
    'agent.run.failed': AuthorGenerationIdentity & {
        messageId: string;
        code: string;
        message: string;
    };
    'agent.state.changed': AuthorGenerationIdentity & {
        state: AuthorAgentState;
        detail?: string;
    };
    'agent.process.updated': AuthorGenerationIdentity & {
        messageId: string;
        item: AuthorAgentProcessItem;
    };
    'agent.generation.stats': AuthorGenerationIdentity & {
        stats: AuthorGenerationStats;
    };
    'audio.state.changed': {
        conversationId: string;
        state: AuthorAudioState;
    };
    'audio.time.updated': {
        conversationId: string;
        state: AuthorAudioState;
    };
}
```

### AuthorEventName

```ts
export type AuthorEventName = keyof AuthorEventMap;
```

### AuthorGenerationIdentity

```ts
export interface AuthorGenerationIdentity {
    conversationId: string;
    /** The owning native runtime Session. */
    runId: string;
    /** Unique for this live observation, including regeneration in the same Session. */
    generationId: string;
    turn: number;
}
```

### AuthorGenerationState

```ts
export type AuthorGenerationState = {
    active: false;
    conversationId: string;
    stats: AuthorGenerationStats | null;
} | {
    active: true;
    conversationId: string;
    runId: string;
    /** Client observation identity; null before a formal turn is observable. */
    generationId: string | null;
    turn: number | null;
    messageId: string;
    accumulated: string;
    sequence: number;
    stats: AuthorGenerationStats | null;
};
```

### AuthorGenerationStats

```ts
export interface AuthorGenerationStats {
    turns?: number;
    steps?: number;
    llmMs?: number;
    toolMs?: number;
    ttftMs?: number;
    ttftSteps?: number;
    decodeMs?: number;
    decodeTokens?: number;
    tokenUsage?: AuthorTokenUsage;
    contextPressure?: {
        pressureTokens?: number;
        projectedTokens?: number;
        contextWindow?: number;
    };
    contextBreakdown?: {
        systemTokens: number;
        toolsTokens: number;
        messageTokens: number;
    };
}
```

### AuthorMediaResource

```ts
/** Media metadata; URL is null when browser delivery is not available. */
export interface AuthorMediaResource {
    id: string;
    type: AuthorMediaType;
    url: string | null;
    mimeType: string | null;
    name: string;
    size: number | null;
    width: number | null;
    height: number | null;
    duration: number | null;
    metadata: Record<string, unknown>;
}
```

### AuthorMediaType

```ts
export type AuthorMediaType = 'image' | 'audio' | 'video' | 'file';
```

### AuthorMessage

```ts
export interface AuthorMessage {
    id: string;
    conversationId: string;
    role: AuthorMessageRole;
    content: string;
    displayContent: string;
    /** Exact native history, or null when no historical snapshot is available. */
    variableState: Record<string, unknown> | null;
    status: AuthorMessageStatus;
    createdAt: string;
    turnId: string;
    speakerId: string;
    speakerName: string;
    speakerAvatar: string;
    sequence: number | null;
    responseIndex: number | null;
    process: AuthorAgentProcessItem[];
    attachments: AuthorMediaResource[];
    openingOptions: AuthorOpening[];
    selectedOpeningId: string;
}
```

### AuthorMessagePage

```ts
export interface AuthorMessagePage {
    items: AuthorMessage[];
    hasMore: boolean;
    beforeSequence: number | null;
}
```

### AuthorMessageRole

```ts
export type AuthorMessageRole = 'user' | 'assistant';
```

### AuthorMessageStatus

```ts
export type AuthorMessageStatus = 'complete' | 'streaming' | 'error' | 'cancelled';
```

### AuthorMessagesChangedReason

```ts
export type AuthorMessagesChangedReason = 'sent' | 'edited' | 'deleted' | 'regenerated';
```

### AuthorOpening

```ts
export interface AuthorOpening {
    id: string;
    title: string;
    content: string;
    displayContent?: string;
    initialVariableState: Record<string, unknown>;
}
```

### AuthorPreset

```ts
export interface AuthorPreset {
    id: string;
    name: string;
    activeVersionId: string;
    entries: AuthorSettingLibraryEntry[];
    groups: AuthorSettingLibrary['groups'];
    promptPositions: AuthorSettingLibrary['promptPositions'];
}
```

### AuthorPresetCatalog

```ts
export interface AuthorPresetCatalog {
    activePresetId: string;
    items: Array<{
        id: string;
        name: string;
        activeVersionId: string;
        entryCount: number;
    }>;
}
```

### AuthorRunAccepted

```ts
export interface AuthorRunAccepted {
    accepted: true;
    conversationId: string;
    runId: string;
    messageId: string;
}
```

### AuthorScriptButton

```ts
export interface AuthorScriptButton {
    id: string;
    label: string;
    /** Use this invocation's API for user actions; it never joins a rule's pending candidate. */
    onClick(context: {
        api: ElecKoiAuthorApi;
        signal: AbortSignal;
    }): void | Promise<void>;
}
```

### AuthorScriptCaller

```ts
export interface AuthorScriptCaller {
    surface: AuthorSurface | 'script' | 'script-panel';
    conversationId: string;
    messageId: string;
    script: AuthorScriptIdentity | null;
    projectId?: string;
    entryFile?: string;
    view?: string;
}
```

### AuthorScriptData

```ts
export type AuthorScriptData = null | boolean | number | string | AuthorScriptData[] | {
    [key: string]: AuthorScriptData;
};
```

### AuthorScriptEndpoint

```ts
export interface AuthorScriptEndpoint {
    identity: AuthorScriptIdentity;
    name: string;
    actions: string[];
}
```

### AuthorScriptIdentity

```ts
export interface AuthorScriptIdentity {
    scope: 'global' | 'character' | 'preset';
    /** Shared global scripts use the empty string. Other owners are explicit IDs. */
    ownerId: string;
    scriptId: string;
}
```

### AuthorScriptPanel

```ts
export interface AuthorScriptPanel {
    id: string;
    title: string;
    html: string;
}
```

### AuthorScriptProgram

```ts
export type AuthorScriptProgram = (context: AuthorScriptProgramContext) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>;
```

### AuthorScriptProgramContext

```ts
export interface AuthorScriptProgramContext {
    api: ElecKoiAuthorApi;
    signal: AbortSignal;
    readonly settings: Record<string, unknown>;
    readonly librarySettings: Record<string, unknown>;
    scope: 'global' | 'character' | 'preset';
    ownerId: string;
    scriptId: string;
}
```

### AuthorScriptRequestContext

```ts
export interface AuthorScriptRequestContext {
    /** Use this invocation's API; requests do not join a pending variable-rule candidate. */
    api: ElecKoiAuthorApi;
    signal: AbortSignal;
    readonly caller: AuthorScriptCaller;
    data: AuthorScriptData;
}
```

### AuthorScriptSettings

```ts
export interface AuthorScriptSettings {
    revision: number;
    values: Record<string, unknown>;
}
```

### AuthorSendAttachment

```ts
/** An image passed to the Agent with a user message. Use either base64 data or a readable URL. */
export interface AuthorSendAttachment {
    type: 'image';
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
    name?: string;
    data?: string;
    url?: string;
}
```

### AuthorSettingEntryChanges

```ts
export type AuthorSettingEntryChanges = Partial<Omit<AuthorSettingLibraryEntry, 'id' | 'kind' | 'openingMessages' | 'defaultOpeningMessageId' | 'createdAt' | 'updatedAt'>>;
```

### AuthorSettingEntryUpdate

```ts
export interface AuthorSettingEntryUpdate {
    id: string;
    changes: AuthorSettingEntryChanges;
}
```

### AuthorSettingLibrary

```ts
export interface AuthorSettingLibrary {
    characterId: string;
    name: string;
    entries: AuthorSettingLibraryEntry[];
    groups: Array<{
        id: string;
        name: string;
        parentId: string;
        order: number;
        treeViewOrder: number;
        createdAt: string;
        updatedAt: string;
    }>;
    promptPositions: Array<{
        id: string;
        name: string;
        anchor: NonNullable<AuthorSettingLibraryEntry['position']>;
        side: 'before_setting_position' | 'after_setting_position';
        order: number;
        createdAt: string;
        updatedAt: string;
    }>;
}
```

### AuthorSettingLibraryEntry

```ts
export interface AuthorSettingLibraryEntry {
    id: string;
    title: string;
    iconId: string;
    kind: 'normal' | 'opening' | 'history_compaction' | 'hidden_tool_timeline';
    groupId: string;
    content: string;
    openingMessages: Array<{
        id: string;
        title: string;
        content: string;
        variableVersionId?: string;
    }>;
    defaultOpeningMessageId: string;
    agentSelectionHint: string;
    agentReadStrategy: 'required' | 'keyword' | 'normal';
    dynamicMode: 'standard' | 'ejs_reference';
    contentMode: 'plain_text' | 'ejs';
    keywords: string[];
    keywordScanDepth: number;
    conditionKeywords: string[];
    keywordCondition: 'none' | 'any' | 'all' | 'not_any';
    keywordUseRegex: boolean;
    keywordIgnoreCase: boolean;
    keywordWholeWord: boolean;
    keywordRecursionDepth: number;
    triggerMode: 'always' | 'agent_tool' | null;
    enabled: boolean;
    position: 'instructions' | 'insert_point_1' | 'insert_point_2' | 'insert_point_3' | 'insert_point_4' | 'insert_point_5' | null;
    promptPositionId: string;
    insertRole: 'system' | 'user' | 'assistant';
    order: number;
    viewOrder: number;
    groupViewOrder: number;
    treeViewOrder: number;
    createdAt: string;
    updatedAt: string;
}
```

### AuthorSurface

```ts
export type AuthorSurface = 'message-renderer' | 'chat-ui' | 'application-frontend' | 'character-frontend';
```

### AuthorTokenUsage

```ts
export interface AuthorTokenUsage {
    uncachedInputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}
```

### AuthorTrajectoryAssistantBlock

```ts
export type AuthorTrajectoryAssistantBlock = {
    kind: 'text' | 'reasoning';
    text: string;
} | {
    kind: 'tool-call';
    callId: string;
    name: string;
    argsRaw: string;
} | {
    kind: 'image';
    attachment: unknown;
} | {
    kind: 'other';
    block: unknown;
};
```

### AuthorTrajectoryBlock

```ts
export interface AuthorTrajectoryBlock {
    type: string;
    [field: string]: unknown;
}
```

### AuthorTrajectoryLocation

```ts
export type AuthorTrajectoryLocation = {
    kind: 'session' | 'unresolved';
} | {
    kind: 'turn';
    turn: number;
    turnStatus: 'open' | 'closed' | 'unknown';
} | {
    kind: 'step';
    turn: number;
    step: number;
    turnStatus: 'open' | 'closed' | 'unknown';
    stepStatus: 'open' | 'closed' | 'unknown';
};
```

### AuthorTrajectoryPrompt

```ts
export interface AuthorTrajectoryPrompt {
    config: AuthorTrajectoryRequestConfig;
    system: string;
    tools: readonly unknown[];
}
```

### AuthorTrajectoryRequestConfig

```ts
export interface AuthorTrajectoryRequestConfig {
    provider: string;
    model: string;
    purpose?: string;
    thinking?: string;
    reasoningEffort?: string;
    temperature?: number;
    maxTokens?: number;
    stop?: readonly string[];
}
```

### AuthorTrajectoryRunningTool

```ts
export type AuthorTrajectoryRunningTool = {
    callId: string;
    parentCallId?: string;
    name: string;
    turn: number;
    step: number;
    time: number;
    subCalls: readonly AuthorTrajectoryTool[];
} & ({
    phase: 'preparing';
} | {
    phase: 'start';
    argsRaw: string;
});
```

### AuthorTrajectoryTool

```ts
export type AuthorTrajectoryTool = AuthorTrajectoryToolResult | AuthorTrajectoryRunningTool;
```

### AuthorTrajectoryToolResult

```ts
export interface AuthorTrajectoryToolResult {
    kind: 'tool-result';
    seq: number;
    time: number;
    callId: string;
    parentCallId?: string;
    call: {
        name: string;
        argsRaw: string;
    } | null;
    callTime: number | null;
    content: readonly AuthorTrajectoryBlock[];
    isError: boolean;
    error?: {
        name: string;
        code: string;
        reason?: string;
    };
    meta?: unknown;
    subCalls: readonly AuthorTrajectoryTool[];
}
```

### AuthorVariablePatch

```ts
export type AuthorVariablePatch = {
    op: 'add' | 'replace';
    path: string;
    value: unknown;
} | {
    op: 'remove';
    path: string;
};
```

### AuthorVariableRule

```ts
export interface AuthorVariableRule {
    id: string;
    stage: AuthorVariableRuleStage;
    run(context: AuthorVariableRuleContext): void | Promise<void>;
}
```

### AuthorVariableRuleContext

```ts
export interface AuthorVariableRuleContext {
    readonly conversationId: string;
    readonly stage: AuthorVariableRuleStage;
    readonly before: AuthorVariableState;
    readonly signal: AbortSignal;
    state: AuthorVariableState;
}
```

### AuthorVariableRuleStage

```ts
export type AuthorVariableRuleStage = 'before' | 'after' | 'afterSchema';
```

### AuthorVariableState

```ts
export type AuthorVariableState = Record<string, unknown>;
```

### ElecKoiAuthorApi

```ts
export interface ElecKoiAuthorApi {
    readonly api: {
        readonly stage: 'preview';
        readonly version: string;
    };
    call<TResult = unknown>(method: string, params?: Record<string, unknown>): Promise<TResult>;
    readonly app: {
        getInfo(): Promise<AuthorAppInfo>;
        getCapabilities(): Promise<AuthorCapability[]>;
    };
    readonly context: {
        current(): Promise<AuthorContext>;
    };
    readonly script: {
        /** Only installed for an explicitly owned running script. */
        getSettings(): Promise<AuthorScriptSettings>;
        setSettings(values: Record<string, unknown>, expectedRevision: number): Promise<AuthorScriptSettings>;
        getLibrarySettings(): Promise<AuthorScriptSettings>;
        setLibrarySettings(values: Record<string, unknown>, expectedRevision: number): Promise<AuthorScriptSettings>;
    };
    readonly scripts: {
        /** Lists running scripts and their explicitly registered actions in this chat. */
        list(): Promise<{
            items: AuthorScriptEndpoint[];
        }>;
        /** Running script only; each action has exactly one handler within that script. */
        registerHandler(action: string, handler: (context: AuthorScriptRequestContext) => AuthorScriptData | Promise<AuthorScriptData>): () => void;
        /** Calls one exact script and action. Use null when no data is needed. */
        request(target: AuthorScriptIdentity, action: string, data: AuthorScriptData): Promise<AuthorScriptData>;
    };
    readonly ui: {
        /** Running script only. IDs are unique within that script, not across scopes. */
        registerButton(button: AuthorScriptButton): () => void;
        /** Accepts a native document; relative resources resolve against the owning script file. */
        openPanel(panel: AuthorScriptPanel): Promise<{
            id: string;
        }>;
        closePanel(id: string): Promise<{
            closed: boolean;
        }>;
    };
    readonly variables: {
        getState(options?: {
            messageId?: string;
        }): Promise<Record<string, unknown>>;
        getConfig(): Promise<unknown>;
        setState(state: Record<string, unknown>): Promise<Record<string, unknown>>;
        merge(state: Record<string, unknown>): Promise<Record<string, unknown>>;
        applyPatch(patch: AuthorVariablePatch[]): Promise<Record<string, unknown>>;
        reset(): Promise<Record<string, unknown>>;
        registerRule(rule: AuthorVariableRule): () => void;
    };
    readonly openings: {
        list(): Promise<{
            items: AuthorOpening[];
        }>;
        current(): Promise<AuthorOpening | null>;
        select(id: string): Promise<{
            selectedId: string;
        }>;
    };
    readonly messages: {
        /** Messages currently loaded by the native conversation view. */
        list(): Promise<AuthorMessage[]>;
        getPage(): Promise<AuthorMessagePage>;
        pageOlder(beforeSequence: number): Promise<AuthorMessagePage>;
        get(id: string): Promise<AuthorMessage>;
        current(): Promise<AuthorMessage>;
        setContent(id: string, text: string): Promise<AuthorMessage>;
        deleteFrom(id: string): Promise<{
            ok: true;
            deletedMessageCount: number;
            remainingMessageCount: number;
        }>;
        regenerate(id: string): Promise<AuthorRunAccepted>;
        editAndRegenerate(id: string, text: string): Promise<AuthorRunAccepted>;
    };
    readonly chat: {
        current(): Promise<AuthorChatSummary>;
        list(): Promise<{
            items: AuthorChatSummary[];
        }>;
        getGenerationState(): Promise<AuthorGenerationState>;
        /** Reads current loaded history, or loads the exact preceding history cursor first. */
        getAgentTrajectory(options?: {
            beforeSequence?: number;
        }): Promise<AuthorAgentTrajectory>;
        getModels(): Promise<AuthorChatModelCatalog>;
        send(text: string, options?: {
            attachments?: AuthorSendAttachment[];
        }): Promise<AuthorRunAccepted>;
        stopGeneration(): Promise<{
            cancelled: boolean;
        }>;
        create(options?: {
            title?: string;
        }): Promise<{
            chat: AuthorChatSummary;
        }>;
        /** Opens an explicitly identified chat belonging to the same role. */
        open(conversationId: string): Promise<{
            chat: AuthorChatSummary;
        }>;
        /** Does not select or create a replacement chat after deleting the current one. */
        delete(conversationId: string): Promise<{
            deletedId: string;
            chat: AuthorChatSummary | null;
        }>;
        selectModel(options: {
            configId: string;
            model: string;
            reasoningEffort?: string;
        }): Promise<{
            configId: string;
            model: string;
            reasoningEffort?: string;
        }>;
    };
    readonly character: {
        current(): Promise<Record<string, unknown> | null>;
    };
    readonly settingLibrary: {
        /** The bound character's original unexpanded library, without story overrides or preset entries. */
        current(): Promise<AuthorSettingLibrary | null>;
        getSummary(): Promise<{
            characterId: string;
            name: string;
            activeVersionId: string;
            entryCount: number;
            groupCount: number;
        } | null>;
        /** Replaces the bound character's current library content, preserving other versions and management settings. */
        replace(library: AuthorSettingLibrary): Promise<AuthorSettingLibrary>;
        getEntry(id: string): Promise<AuthorSettingLibraryEntry>;
        updateEntry(id: string, changes: AuthorSettingEntryChanges): Promise<AuthorSettingLibraryEntry>;
        /** Atomically edits the character's ordinary entries and active version, leaving story overrides unchanged. */
        updateEntries(updates: AuthorSettingEntryUpdate[]): Promise<AuthorSettingLibraryEntry[]>;
    };
    readonly editorVersions: {
        /** 角色作用域固定为本页角色；预设作用域固定为当前扮演预设。 */
        read(kind: AuthorEditorLibraryVersions['kind'], scope: AuthorEditorLibraryVersions['scope']): Promise<AuthorEditorLibraryVersions>;
        /** 配置正文和命名版本原子保存；documents 为相同类型的正式配置 JSON。 */
        save(kind: AuthorEditorLibraryVersions['kind'], documents: string[], versions: AuthorEditorLibraryVersions[]): Promise<AuthorEditorLibrarySaveResult>;
    };
    readonly presets: {
        list(): Promise<AuthorPresetCatalog>;
        current(): Promise<AuthorPreset | null>;
        get(presetId: string): Promise<AuthorPreset>;
        getEntry(presetId: string, id: string): Promise<AuthorSettingLibraryEntry>;
        /** Edits the stored preset and active version, affecting all chats using that preset. */
        updateEntry(presetId: string, id: string, changes: AuthorSettingEntryChanges): Promise<AuthorSettingLibraryEntry>;
        updateEntries(presetId: string, updates: AuthorSettingEntryUpdate[]): Promise<AuthorSettingLibraryEntry[]>;
        /** Selects the global preset for subsequent requests, not just the current chat. */
        select(presetId: string): Promise<AuthorPresetCatalog>;
    };
    readonly media: {
        getMessageAttachments(messageId?: string): Promise<{
            items: AuthorMediaResource[];
        }>;
        getMessageAttachment(messageId: string, attachmentId: string): Promise<AuthorMediaResource>;
    };
    readonly audio: {
        play(options: {
            channel?: AuthorAudioChannel;
            track: AuthorAudioTrackInput;
            loop?: boolean;
            volume?: number;
            startAt?: number;
        }): Promise<AuthorAudioState>;
        pause(channel?: AuthorAudioChannel): Promise<AuthorAudioState>;
        resume(channel?: AuthorAudioChannel): Promise<AuthorAudioState>;
        stop(channel?: AuthorAudioChannel): Promise<AuthorAudioState>;
        seek(seconds: number, channel?: AuthorAudioChannel): Promise<AuthorAudioState>;
        getState(channel?: AuthorAudioChannel): Promise<AuthorAudioState>;
        getPlaylist(channel?: AuthorAudioChannel): Promise<{
            channel: AuthorAudioChannel;
            items: AuthorAudioTrack[];
            currentIndex: number;
        }>;
        setPlaylist(channel: AuthorAudioChannel, items: AuthorAudioTrackInput[], options?: {
            currentIndex?: number;
            autoplay?: boolean;
            loop?: boolean;
            shuffle?: boolean;
        }): Promise<AuthorAudioState>;
        appendPlaylist(channel: AuthorAudioChannel, items: AuthorAudioTrackInput[]): Promise<AuthorAudioState>;
        getSettings(): Promise<AuthorAudioSettings>;
        setSettings(settings: AuthorAudioSettingsUpdate): Promise<AuthorAudioSettings>;
    };
    readonly input: {
        get(): Promise<{
            text: string;
        }>;
        set(text: string): Promise<{
            text: string;
        }>;
        append(text: string): Promise<{
            text: string;
        }>;
        clear(): Promise<{
            text: '';
        }>;
        /** Requests submission of the official composer; submitted is not a generation receipt. */
        send(): Promise<{
            submitted: boolean;
        }>;
    };
    readonly events: ElecKoiAuthorEvents;
}
```

### ElecKoiAuthorEvents

```ts
export interface ElecKoiAuthorEvents {
    list(): Promise<{
        items: readonly AuthorEventName[];
    }>;
    on<TName extends AuthorEventName>(name: TName, listener: (payload: AuthorEventMap[TName]) => void): () => void;
    off<TName extends AuthorEventName>(name: TName, listener: (payload: AuthorEventMap[TName]) => void): boolean | undefined;
}
```
