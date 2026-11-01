# 快速入门

下面创建一个在角色资料页增加内容的 DSH bundle。它包含 Host 入口、Web Client 入口、本地化元数据和插件中心接口说明。

## 1. 目录结构

```text
example-eleckoi-plugin/
├─ package.json
├─ cordis.patch.yml
├─ locale/
│  ├─ zh.json
│  └─ en.json
└─ src/
   ├─ index.js
   └─ client.js
```

## 2. `package.json`

```json
{
  "name": "example-eleckoi-plugin",
  "version": "1.0.0",
  "description": "在角色资料页显示一个示例区域。",
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
      "inject": [
        "@deepseek-ai/dsh-client-ui-renderer",
        "@eleckoi/dsh-client-characters"
      ]
    }
  },
  "eleckoi": {
    "developerInterfaces": []
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "4.0.4",
    "@deepseek-ai/dsh-client-ui-slots": "0.2.1-rc.5",
    "@eleckoi/dsh-client-characters": "0.1.0",
    "react": "19.2.8"
  }
}
```

`dsh.client.inject` 保证 Client 依赖先装配完成。`peerDependencies` 让包管理器校验运行时版本；不要在插件内携带另一套 Cordis、React 或 DSH 核心。

## 3. Host patch 与入口

`cordis.patch.yml` 把 Host 插件加入 DSH 组合：

```yaml
- insert:
    - id: example-eleckoi-plugin
      name: example-eleckoi-plugin
```

如果插件只有界面能力，Host 入口可以为空：

```js
// src/index.js
export const name = 'example-eleckoi-plugin'

export function apply() {}
```

需要文件、网络、模型、Session 或其他 Host 能力时，在这里通过 Cordis `inject` 声明依赖。不要从 Client 直接调用 Node API。

## 4. Client 插件

下面使用 `eleckoi.character.page.profile` chain slot。`matched.fallback` 是 ElecKoi 原本的角色资料界面；保留它可以在原界面下方增加内容，省略它则会替换该区域。

```js
// src/client.js
window.__ModuleLoader__.load({
  id: 'example-eleckoi-plugin',
  factory(require) {
    const React = require('react')

    function ProfileExtra({ matched }) {
      return React.createElement(
        React.Fragment,
        null,
        matched.fallback,
        React.createElement('p', null, `当前角色：${matched.selectedCharacterId}`)
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('eleckoi.character.page.profile', () => ctx.slots.register({
          name: 'eleckoi.character.page.profile',
          priority: 10,
          select: owner => owner?.selectedCharacterId ? owner : null,
          registrant: 'example-eleckoi-plugin'
        }, ProfileExtra))
      }
    }
  }
})
```

TypeScript 项目应导入 owner 合同，让 `@deepseek-ai/dsh-client-ui-slots` 的 `SlotMap` 完成声明合并：

```ts
import type { CharacterProfileOwner } from '@eleckoi/dsh-client-characters/slots'
```

完整注册规则与全部入口见 [界面插槽](ui-slots.md)。

## 5. 插件中心名称

`locale/zh.json`：

```json
{
  "meta": {
    "title": "角色资料示例",
    "description": "在角色资料页显示示例内容。"
  }
}
```

`locale/en.json` 使用同样结构提供英文文案。manifest 的 `description` 是无本地化回退；插件中心优先显示当前语言的 `meta`。

## 6. 安装验证

从源码仓库运行：

```powershell
node scripts/probe-dsh-desktop-plugin-install.mjs D:\path\to\example-eleckoi-plugin
```

探针验证安装、中文元数据、Client 入口、重启恢复、停用、重新启用和卸载。随后在开发版插件中心选择该本地包，打开角色资料页验证界面。

## 7. 下一步

- 增加按钮或内容：查 [界面插槽](ui-slots.md)。
- 读取角色、预设或聊天数据：查 [服务接口](services.md)。
- 声明可由 Client 调用的 Host 方法：查 [DSH Remote](remote.md)。
- 提供新的搜索后端：查 [能力贡献](contributions.md)。
- 向其他插件开放自己的稳定合同：查 [Bundle manifest](manifest.md#开发接口声明)。
