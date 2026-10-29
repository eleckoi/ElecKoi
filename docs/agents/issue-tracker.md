# Issue tracker：本地 Markdown

本仓库的 spec 与实现工单是 `.scratch/` 下的 Markdown 文件，不建远端 issue。

## 约定

- 一个特性一个目录：`.scratch/<feature-slug>/`
- spec 是 `.scratch/<feature-slug>/spec.md`
- 实现工单是 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 起编号；**不要**合成一个 tickets 文件
- 三态记在工单文件靠上的 `Status:` 行：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`
- 讨论与新增信息追加到文件末尾的 `## Comments` 标题下

## 技能说"发布到 issue tracker"时

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在就建）。

## 技能说"取相关工单"时

直接读那个路径。用户通常会把路径或编号给过来。

## 和远端仓库的关系

- `origin`（`eleckoi/ElecKoi`）是上游，**只读**：任何 issue / PR / push 都要先问维护者。
- `fork`（`KuramiWan/ElecKoi`）是草稿仓库，不承载正式交付。
- 所以 spec 先在这里长，等改动定型、要开上游 PR 时再由维护者决定搬不搬。
