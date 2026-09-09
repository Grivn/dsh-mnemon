# Workspace context validation

This log records completed checks as the optional workspace composition is implemented. The full capability inventory remains in [the delivery plan](plans/composable-workspace-context.md).

## Isolated instance

The branch starts from committed `main` in a separate Git worktree. `scripts/serve-workspace.mjs` owns a separate DSH home, copied Mnemon executable, data directory, synthetic workspace, local model fixture and service logs. The original checkout and its uncommitted work are not used by this instance.

DSH is served on loopback port 5279 for this validation. The installed DSH release is `0.1.2-rc.1`; the real Mnemon executable reports `0.2.7`. The model fixture returns a deterministic response and validates service orchestration, not model quality. Native record writes and WebUI reads use the same isolated Mnemon database; embedding coverage is not implied by this check.

## Completed workflows

- Project notes: propose, approve, archive and restore a branch-scoped fact; pending proposals remain inactive.
- Tasks: create a project task with importance/urgency, edit its deadline, restart DSH, verify persistence, complete it and inspect history.
- Files: find actual text in the synthetic workspace README and read a line-numbered excerpt through the Source page.
- Conversations: search the original visible user message, read its neighboring assistant answer, save a bookmark, fork through completed turn 1, and open the actual child. The child preserves the two visible messages, workspace, preset and model/reasoning selection.
- Native memory: write a synthetic fact using the isolated Mnemon CLI, then read that same record in the Memory Spaces content page (`d44cf977-e2e9-4b25-a1ba-f7e783c6f403`).
- Package checks: workspace utilities (12 tests), files (2), conversations (2), tasks (2), plus type checking and separate client/server artifacts. The root build and type check pass at this checkpoint.

The WebUI caught two integration defects that unit composition alone did not expose: management operation names must use the Host's hyphenated identifier vocabulary, and newly created sessions must be attached through DSH's workspace registry. Both were fixed and retested in the running instance.

## Screenshots

- [File search and excerpt](assets/workspace-context/file-search.png)
- [Conversation search and neighboring messages](assets/workspace-context/conversation-history.png)
- [Completed-turn fork in its workspace](assets/workspace-context/conversation-fork.png)
- [Native memory record](assets/workspace-context/native-record.png)

## 中文

此日志仅记录已经完成的验收。完整能力清单见[实施计划](plans/composable-workspace-context.md)，其余插件与最终整体验收仍在进行。

开发分支从已提交的 `main` 建立，使用独立 worktree、DSH 主目录、Mnemon 可执行文件与数据目录。原检出目录及其中未提交的改动没有参与测试。当前验证服务监听本机 5279 端口，DSH 为 `0.1.2-rc.1`，实际 Mnemon 为 `0.2.7`。固定响应的本地模型验证编排流程，不代表真实模型质量；原生记忆验收覆盖实际数据库写入及 WebUI 读取，不代表已启用向量生成。

已通过的 WebUI 流程包括：项目笔记提交审核、采纳、归档与恢复；任务优先级和截止日期编辑、重启保留、完成及历史查看；真实文件检索与行号片段；可见对话检索、相邻消息阅读、保存书签、按已完成轮次分叉并打开子会话；以及同一原生数据库中验收事实的写入和读取。

会话分叉保留原始可见消息、工作目录、预设、模型与推理等级。真实页面测试发现并修正了管理操作命名及子会话工作区归属问题。上述截图保留了对应结果；完整仓库检查、独立安装产物检查和后续插件验收将在功能补齐后继续执行。
