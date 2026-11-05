<!-- Generated from docs/plugins/contributions.md; run pnpm generate:plugin-docs. -->

# 能力贡献

Contribution 表示一个 bundle 向另一个包拥有的注册点增加实现。合同所有者定义接口、选择规则和生命周期，贡献方只实现该合同。

## 当前公开贡献点

ElecKoi 当前有一个已登记贡献：

| 接口 ID | 所有者 | 注册方法 | 实现 |
| --- | --- | --- | --- |
| `dsh.web.search-provider:tavily` | `@deepseek-ai/dsh-web` | `ctx.web.registerSearchProvider` | Tavily 搜索 provider |

它在 manifest 中使用：

```json
{
  "id": "dsh.web.search-provider:tavily",
  "kind": "contribution",
  "title": "Tavily 搜索提供器",
  "description": "向 DSH Web 注册 Tavily 联网搜索实现。",
  "mode": "register",
  "scope": "host",
  "relation": "contributes",
  "owner": "@deepseek-ai/dsh-web",
  "members": ["registerSearchProvider"]
}
```

## 搜索 provider 合同

正式类型来自 `@deepseek-ai/dsh-web`：

```ts
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult
} from '@deepseek-ai/dsh-web'
```

核心结构：

```ts
interface WebSearchProvider {
  id: string
  available(): boolean
  search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>
}
```

Host 插件示例：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'

export const inject = ['web']

export function apply(ctx: Context) {
  const provider: WebSearchProvider = {
    id: 'example-search',
    available: () => Boolean(process.env.EXAMPLE_SEARCH_KEY),
    async search(request, signal) {
      // 发起有界、可取消的 Host 网络请求并规范化结果。
      return { sources: [], truncated: false }
    }
  }

  ctx.web.registerSearchProvider(provider)
}
```

`registerSearchProvider` 将 disposer 绑定到调用它的 Cordis fiber；插件停用或卸载时 DSH 自动注销 provider。它也返回 disposer，供需要提前撤销的插件使用。不要把同一个 provider 注册到全局变量中。

## 贡献方规则

- `id` 必须稳定，且在同类 provider 中唯一。
- `available()` 只反映当前是否具备运行条件，不执行网络请求。
- 网络请求必须接受并传播 `AbortSignal`。
- 返回值必须符合所有者的规范化结果，不把供应商原始响应直接泄漏给调用方。
- 密钥只在 Host 读取，不进入 Client、错误详情、遥测或 manifest。
- 响应体、URL、文本长度和重定向策略必须有界。
- 供应商失败应转换为合同所有者定义的稳定错误。

## 什么时候新增公共注册点

当多个互不依赖的实现需要接入同一种能力，并且调用方不应知道具体实现时，才新增 provider registry。注册点应由领域 owner 包提供，而不是由第一个 provider 自己拥有。

新增注册点需要同时提供：

1. 稳定 TypeScript 接口；
2. 唯一 ID 与冲突规则；
3. 选择和 fallback 规则；
4. Cordis 生命周期与 disposer；
5. 错误、取消和并发语义；
6. 插件中心 manifest 条目；
7. 安装、停用和卸载测试。
