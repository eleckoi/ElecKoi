# DSH Remote

ElecKoi 的跨 Host/Client 业务调用只使用锁定版本 DSH 的 Typert Remote。权威规范是 [`api-gateway.zh.md`](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/docs/api-gateway.zh.md)；本文说明如何在 ElecKoi bundle 中落地该规范。

全部产品 namespace 的实际参数、返回值和变更流见 [完整 Remote 调用声明](api-remote.md)。该文件直接由官方生成器从 Host 的 @Remote 生成，不手写另一套签名。

## 什么时候使用 Remote

使用 Remote：

- Client 发起一次查询或命令，并取得一个结果；
- 调用需要 `AbortSignal` 协作取消；
- Host 向 Client 连续产出一条可取消的业务流，必要时 Client 还要向同一逻辑流发送上行项。

不要把以下能力包装成普通 Remote：

- Session 日志、会话 follow 和实时回复事件；
- 可恢复分页、增量 journal、projection 或实体子流；
- 已经由 DSH Connection 定义正式协议的能力。

这些能力继续使用同一条 DSH Connection，但由对应领域的正式协议拥有游标、重连和一致性语义。

## Host 包结构

当前联网搜索 Remote namespace 为 `eleckoiWebSearch`，由 `@eleckoi/dsh-product-api` 生成：

- `selection(): 'provider_native' | 'tavily'`：读取实际 profile 的搜索提供商；遇到其他提供商会明确报错。
- `select(mode): Promise<'provider_native' | 'tavily'>`：通过官方 ConfigEditor 保存 profile 并进行 Loader 重载；Tavily 未启用时拒绝选择。
- `testTavily(apiKey?, signal?): Promise<TavilyConnection>`：验证候选密钥或解析当前凭据引用，调用 Tavily 额度端点。支持 DSH Remote 协作取消，并设置 15 秒超时；不创建 Session。

Tavily 配置读写和凭据操作直接使用同版本官方 `settings`、`credentials` Remote namespace。Client 不另建这些领域的接口。


一个公开 Remote 的包至少包含：

```text
my-plugin/
├─ package.json
├─ cordis.patch.yml
├─ tsconfig.host.json
├─ tsconfig.client.json
└─ src/
   ├─ index.ts
   ├─ types.ts
   └─ client/index.ts
```

`package.json` 必须导出生成入口：

```json
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./types": { "types": "./lib/types/types.d.ts", "default": "./lib/types/types.js" },
    "./typert": { "types": "./lib/typert.host.d.ts", "default": "./lib/typert.host.js" },
    "./remote": { "types": "./lib/typert.remote-client.d.ts", "default": "./lib/typert.remote-client.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  }
}
```

`./typert` 由 Host Loader 消费；`./remote` 是 Client 可挂载的严格 contribution。两者都由生成器产生，不能手写。

## 声明 Host 方法

```ts
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export interface GreetingRequest {
  name: string
}

export interface GreetingResult {
  text: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    greetingApi: GreetingApi
  }
}

export class GreetingApi extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'greetingApi', { namespace: 'greeting' })
  }

  @Remote
  greet(request: GreetingRequest, signal: AbortSignal): GreetingResult {
    signal.throwIfAborted()
    return { text: `你好，${request.name}` }
  }
}

export default GreetingApi
```

约束：

- 方法必须公开、非静态、有具体实现且不能是泛型；
- 参数使用具名简单标识符，不能解构、设默认值或使用 rest；
- `AbortSignal` 只能作为最后一个名为 `signal` 的参数；
- wire 两侧使用的对象必须可由 Typert 严格生成 codec；
- Host 对象不能直接传输，需要正式 `TypertLookupMap` 或 `@RemoteScope` Context 解析；
- 业务类型从包的公开入口导出，不能引用私有源码路径。

## Host-first 生成顺序

构建必须按以下顺序执行：

1. `tsc -b tsconfig.host.json`；
2. `@deepseek-ai/dsh-typert-generator` 从唯一 Host aggregate 生成 `typert.host.*` 与 `typert.remote-client.*`；
3. `tsc -b tsconfig.client.json` 消费刚生成的 Remote 声明；
4. 打包 Client 插件与 Web 应用。

ElecKoi 根命令 `pnpm build:workspace-runtime` 已执行这一顺序。`@eleckoi/dsh-product-api` 是可运行参考实现；生成入口位于 `scripts/generate-dsh-product-remote.mjs`。

锁定的 DSH `0.2.1-rc.5` 生成器只识别 DSH 单仓中的协议源码，未识别安装在 `node_modules` 中的同版本 `@deepseek-ai/dsh-typert-protocol`。ElecKoi 使用版本锁定补丁 `patches/@deepseek-ai__dsh-typert-generator@0.2.1-rc.5.patch` 补充该包身份识别；补丁不修改 Remote 模型、codec 或 wire 协议。升级 DSH 时必须先对照新版本源码重新判断是否仍需该补丁。

## Client assembly 与调用

Client assembly 以运行时值导入生成 contribution，并在自身 fiber 中挂载：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import greetingRemote from 'my-plugin/remote'
import type {} from 'my-plugin/remote'

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return ctx.remote.$mount(greetingRemote)
}
```

实际调用方拥有依赖声明：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'my-plugin/remote'

export const inject = ['remote', 'remote.greeting']

export async function run(ctx: Context): Promise<string> {
  const result = await ctx.remote.greeting.greet({ name: 'Koi' })
  if (!result.ok) throw result.error
  return result.value.text
}
```

不要使用字符串 endpoint、JavaScript Proxy、`window` 全局对象或 Electron IPC 代替生成的方法。

## 错误、取消与流

一元调用始终返回：

```ts
type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RemoteFailure }
```

载体故障和取消进入 `error` 分支；参数个数错误、贡献未挂载等 Client 装配错误仍会 reject。业务失败应抛出带稳定 code 与 details 的 DSH `RemoteError`，调用方按 `code` 判断，不能依赖 `instanceof`。

流式方法使用 `@Remote({ mode: 'stream' })`，Host 返回 `Iterable`、`AsyncIterable` 或 `RemoteStream<Out, In>`，Client 获得 `RemoteStreamHandle<Out, In>`。调用方必须在 fiber 清理或提前退出时 `dispose()`；需要 Client 上行时使用同一 handle 的 `send()` 与 `end()`。

## ElecKoi 当前 Remote

`@eleckoi/dsh-product-api` 当前提供以下 namespace：

- `ctx.remote.eleckoiSystem`：Host 与协议状态；
- `ctx.remote.eleckoiPersona`：用户资料读取与保存；
- `ctx.remote.eleckoiCharacters`：角色目录、资料、导入导出与管理；
- `ctx.remote.eleckoiCharacterConfiguration`：设定库、变量、正则和分支设定的读取与保存；
- `ctx.remote.eleckoiAgentPresets`：Agent 预设目录与编辑；
- `ctx.remote.eleckoiCreatorStudio`：创作项目目录与文件；
- `ctx.remote.eleckoiWebSearch`：联网搜索设置；
- `ctx.remote.eleckoiDisplayPreferences`：显示偏好的读取与保存；Host 在写入 Settings 前处理全局壁纸媒体。
- `ctx.remote.eleckoiConversationModels`：聊天可用模型目录与当前选择；
- `ctx.remote.eleckoiModels.discoverModels`：使用草稿地址、请求头和临时凭据装配官方适配器；专用 Messages 读取官方目录，通用协议调用 pi-ai discovery。返回模型 ID、目录已声明的能力，不通过 ID 猜测推理档位，也不保存草稿；
- `ctx.remote.eleckoiConversations`：聊天目录、归档导入导出、消息操作与附件定位。

桌面 Host 启动时通过 `ctx.typertGateway.invoke()` 验证严格 Host 描述符，Client bundle 激活时挂载生成 contribution 并通过真实 `ctx.remote` 调用验证协议版本。旧 Desktop Gateway、业务 Preload bridge、`window.eleckoi` 与对应请求合同已经删除；架构检查会阻止这些路径回流。
