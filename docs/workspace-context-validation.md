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

## Background jobs checkpoint

The independent Jobs Source passed four process integration tests: literal argv and UTF-8 logs, stale/modified plans, scoped log access and duplicate execution, queued/running cancellation and unload, failures and timeout. Host authorization tests bind external actions to a live agent and per-call approval, and recheck cancellation and write permissions after approval.

The real WebUI created and saved a project job, displayed its complete execution plan, ran the local synthetic adapter, read its durable log and successful exit code, resumed the adapter's session reference, and cancelled a waiting process. A concurrent completion invalidated an editor revision; refreshing preserved the draft and allowed the save. Screenshots: `job-plan.png`, `job-completion.png`, `job-cancellation.png`. External model accuracy, account authentication and the model-initiated approval UI are not covered by this checkpoint.

后台任务已通过进程集成测试，并在真实 WebUI 验证了保存、计划确认、运行日志、继续外部会话及取消。并发更新使过期保存被拒绝，刷新后原草稿可以继续保存。测试仅使用本地合成适配器，不代表任何第三方模型或账号已验证。

## Prompt, review and journal checkpoint

Prompt scheduling tests cover variable substitution, inactive-playbook rejection, session isolation, start/interval/count, duplicate-turn fencing and stopping a disabled playbook. The real WebUI scheduled a variable-expanded prompt for the next human round and verified exactly one use and zero remaining uses. The same real turn produced a Source-owned journal entry containing only visible user/assistant text.

Review tests cover sticky due state, replay fencing, proposal/severity validation, separate persistent reviewer identity, scoped constraints, follow-up history and reset. WebUI verification exercised a manual reviewer question, enabled a one-round automatic review, observed two persisted review results, confirmed the due flag remained set, completed the cycle, and reset reviewer context while retaining both results. The model adapter returned explicit synthetic review output; these checks establish workflow behavior, not review accuracy.

Screenshots: `prompt-schedule.png`, `review-cycle.png`, `review-history.png`, `journal-capture.png`.

提示词调度、独立审核和活动日志已组合运行。真实用户轮次消费一次提示词、生成可见对话日志并推进审核计数；自动审核后到期状态保留，显式完成与重置均保留历史。审核使用本地合成模型，仅验证流程，不评价模型审核质量。

## Collaboration, native skills and suggestion transfer checkpoint

Real WebUI checks created a project room, invited existing test sessions, sent directed messages with an explicit wake, read addressed history, inspected presence and reserved a real project file. Core integration tests also reject unauthorized delivery, non-member recipients, stale membership, conflicting reservations and malformed imported receipts. Closed room history is retained.

The first cold-session wake exposed a missing model-options restoration: message delivery succeeded but the resumed agent failed during prompt assembly. The shared public DSH adapter now restores the last recorded model/reasoning configuration and serializes concurrent resume requests. A fresh UI test first observed another session as unloaded, sent an explicit wake and verified its new assistant response at 14:01. Delivery receipts describe message acceptance; they do not promise a successful model response.

The skills page listed and edited a configured SKILL.md, and the native DSH registry returned its updated body. A synthetic review supplied a fact and a skill; each was explicitly transferred to its selected Source's pending queue. The skill was absent from the native catalog before approval, appeared after approval, and disappeared after disabling. Source-owned skill records and configured directory skills share the native discovery interface. A native `/feedback` command was captured with its exact quote, without expansion or guessed sentiment. Session search excluded injected collaboration text and opened a selected native session through public navigation.

At this checkpoint the utility package has 13 passing tests, collaboration 4, playbooks 6, review 3, sessions 2 and the root Source-page integration 9. Root and all Source artifacts build. Full repository and isolated package verification remain part of final acceptance.

Screenshots: [directed message](assets/workspace-context/collaboration-message.png), [file reservation](assets/workspace-context/file-reservation.png), [native skills](assets/workspace-context/native-skill-catalog.png), [skill editor](assets/workspace-context/skill-file-editor.png), [review transfer](assets/workspace-context/review-proposals.png), [pending fact](assets/workspace-context/project-review.png), [pending skill](assets/workspace-context/skill-proposal.png), [exact feedback](assets/workspace-context/journal-feedback.png), and [successful cold-session wake](assets/workspace-context/cold-session-resume.png). The initial failure is retained in `cold-session-resume-before.png` for comparison.

真实页面已验证项目协作空间、成员邀请、定向消息、显式唤醒、历史阅读、在线状态与文件预约。首次唤醒未加载会话时发现模型配置未恢复，已在公开 DSH 适配层修复，并通过另一个未加载会话的新回复验证。投递回执仅表示消息被接收，不将其等同于模型成功完成。

技能文件读取与编辑、原生目录加载、审核建议转入目标待审核队列，以及技能采纳和停用对原生目录的影响均已验证。原生反馈命令被逐字记录；会话检索排除注入的协作内容，并能打开选定的原生会话。截图保存于上述路径，最终整体验收仍在继续。
