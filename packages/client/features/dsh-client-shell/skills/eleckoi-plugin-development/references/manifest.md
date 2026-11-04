<!-- Generated from docs/plugins/manifest.md; run pnpm generate:plugin-docs. -->

# Bundle manifest

## 基本结构

```json
{
  "name": "example-eleckoi-plugin",
  "version": "1.0.0",
  "description": "插件的无本地化回退说明。",
  "type": "module",
  "engines": {
    "dsh": "0.2.1-rc.5"
  },
  "exports": {
    ".": "./src/index.js",
    "./client": "./src/client.js",
    "./locale/*.json": "./locale/*.json",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-ui-renderer"]
    }
  },
  "eleckoi": {
    "developerInterfaces": []
  }
}
```

| 字段 | 作用 |
| --- | --- |
| `name` | bundle 的稳定包名，也是安装与依赖标识 |
| `version` | bundle 版本 |
| `engines.dsh` | 可运行的 DSH 版本；应与 ElecKoi 当前锁定版本一致 |
| `exports["."]` | Host 入口 |
| `exports["./client"]` | Web Client 入口 |
| `exports["./locale/*.json"]` | 插件中心本地化资源 |
| `dsh.bundle.patch` | 将 Host 插件接入组合的 patch |
| `dsh.client.platform` | 当前桌面 Client 使用 `web` |
| `dsh.client.inject` | Client 模块加载前必须存在的包级依赖 |

只有 Host 能力的 bundle 可以不导出 `./client`；只有 Client 能力的 bundle 仍需一个可加载的 Host 入口与 bundle patch，以便 PluginManager 统一管理。

## `cordis.patch.yml`

最小 patch：

```yaml
- insert:
    - id: example-eleckoi-plugin
      name: example-eleckoi-plugin
```

`id` 是组合中的插件实例 ID，`name` 是 Loader 解析的模块。多个 Host 组件可以在同一个 bundle patch 中插入，但每个 ID 必须稳定且不冲突。依赖关系由插件入口的 `inject` 与 DSH 组合共同决定，不要用导入顺序碰运气。

## 本地化元数据

`locale/zh.json`：

```json
{
  "meta": {
    "title": "示例插件",
    "description": "插件中心显示的中文说明。"
  }
}
```

`locale/en.json` 使用相同键。缺少当前语言时，插件中心使用 manifest 的 `description` 作为回退。

## 开发接口声明

`eleckoi.developerInterfaces` 是插件中心的接口目录。它不会自动创建 Slot 或 service；代码必须实际实现对应合同。

```json
{
  "eleckoi": {
    "developerInterfaces": [
      {
        "id": "example.character.badge",
        "kind": "ui-slot",
        "title": "角色徽标",
        "description": "允许其他插件向角色资料增加徽标。",
        "mode": "append",
        "scope": "root",
        "relation": "provides"
      },
      {
        "id": "exampleCatalog",
        "kind": "service",
        "title": "示例目录服务",
        "description": "读取并订阅示例条目。",
        "mode": "call",
        "scope": "client",
        "relation": "provides",
        "members": ["getSnapshot", "subscribe", "refresh"]
      }
    ]
  }
}
```

### 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 稳定接口 ID；整个桌面组合内唯一，最多 160 字符 |
| `kind` | 是 | `ui-slot`、`service`、`event`、`contribution` 或 `remote` |
| `title` | 是 | 插件中心展示名称，最多 120 字符 |
| `description` | 是 | 接口用途，最多 500 字符 |
| `mode` | 是 | 组合方式，例如 `replace`、`append`、`register`、`call` |
| `scope` | 是 | `root`、`session`、`client`、`host` 等实际作用域 |
| `relation` | 是 | `provides` 或 `contributes` |
| `members` | 否 | service、event、remote 或 contribution 的公开成员，最多 64 项，每项最多 100 字符 |
| `owner` | 条件 | `contributes` 时写合同所有者的包名，最多 160 字符 |

PluginManager 最多读取 256 个条目。无效、重复或超长条目不会出现在插件中心；仓库内置 bundle 的生成检查会进一步直接失败。

### `mode` 的使用

| 接口 | 常用 mode | 含义 |
| --- | --- | --- |
| chain/single UI Slot | `replace` | 包装或替换一个区域 |
| list UI Slot | `append` | 向有序列表增加条目 |
| keyed UI Slot | `register` | 以唯一 key 注册页面或实现 |
| service/remote | `call` | 调用公开方法 |
| provider contribution | `register` | 向所有者的注册表增加实现 |

`mode` 是面向开发者的说明字段。真正的 Slot kind 与运行约束仍由 DSH `SlotMap` 决定。

## 依赖声明

- DSH、Cordis、React 和 ElecKoi 公共合同优先放在 `peerDependencies`，避免插件打包重复运行时。
- `dsh.client.inject` 只写 Client 装配依赖；Host 的依赖写在 Host 插件导出的 `inject` 中。
- 不要依赖 `src/`、`lib/` 内部路径。只使用包的 `exports` 公开入口。
- 不要声明或调用插件中心未列出的 ElecKoi 内部 service。
