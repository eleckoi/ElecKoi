# ElecKoi 贡献者记录

感谢每一位通过代码、架构设计、文档、测试、视觉设计、创作实践和公开讨论参与 ElecKoi 的贡献者。本文件用于记录能够明确说明范围的专项贡献；Git 提交与 Pull Request 所反映的代码贡献仍以 GitHub 历史记录为准。

## CoreForgeLab — 架构与数据库设计

[GitHub：@CoreForgeLab](https://github.com/CoreForgeLab)

CoreForgeLab 的贡献目前主要集中在项目架构与数据库方向：参与现有存储架构和数据生命周期的分析与审计，梳理 Character、角色动态状态、聊天、群聊和 Agent 等对象之间的关系与权限边界，并提出面向长期发展的数据库与持久化重构思路，包括 Character Card 与 Character Instance 分离、多实例与 Agent 强隔离、群聊 Multi-Agent 关系、资源 ID 与路径双重索引、Markdown 与 JSON 分工，以及删除恢复与备份策略等。

CoreForgeLab 同时参与相关设计文档、Issue 和后续演进方案的整理与讨论。这里记录的是架构审计、设计与规划方面的贡献，不表示所讨论的方案已经全部实现或最终确定；具体实现仍会根据项目后续讨论和开发进度继续调整。

## 记录原则

- 贡献者保留自己代码、设计、文档和其他原创作品的版权；具体授权以相应文件、提交和项目许可证为准。
- 本文件只描述已经能够明确确认的贡献范围，不以列名代替 Git 历史、Pull Request、Issue 或设计文档中的事实记录。
- 对尚在讨论中的设计，会明确区分“参与规划”与“已经实现”，避免把提案表述为既成事实。
