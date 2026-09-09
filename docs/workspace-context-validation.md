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

## Notifications and attachments checkpoint

Notifications is an independent Source with its own inbox, attachment store and reviewed delivery plans. Six integration tests cover exact-plan and workspace checks, claims across independent engines, actual loopback HTTP delivery, corrupted attachments, configuration changes, partial or uncertain receipts, interrupted claims, event deduplication and unloading a transport that ignores abort. The shared utility package now has 18 tests, including path/URL/base64 bounds, redirects, tamper detection, asset retention and native image ownership. Root Source-page, client mounting and overlay binding tests total 21; the new binding tests reject a late catalog from the previous session and keep open UI state stable during revision refresh.

Real WebUI tests saved a local notice with a file, previewed text and PNG attachments, combined search with unread filters, marked a notice read, archived and restored a delivery, and opened its associated native session. A concrete direct-message plan selected two loopback receivers; each received exactly one request with the same delivery ID and attachment hash, confirmed independently in the receiver ledger. No third-party account or human recipient was contacted.

The floating bell was dragged from the left edge to the right, retained its position after reload, and remained usable at a 390 × 844 viewport. Both its popup and the full Source page were checked in the current dark theme. Real testing found and fixed a periodic catalog refresh that reset open forms, and a text contrast issue in the full page. A native image paste was correctly rejected by a text-only model; selecting the image-capable route in the same loopback model fixture accepted it. The Notifications Source then copied and previewed that actual user image through the public native attachment service.

Screenshots: [inbox](assets/workspace-context/notification-inbox.png), [file preview](assets/workspace-context/notification-attachment.png), [send plan](assets/workspace-context/notification-delivery-plan.png), [channel receipts](assets/workspace-context/notification-delivery-receipts.png), [PNG preview](assets/workspace-context/notification-image.png), [native user image](assets/workspace-context/notification-session-image.png), [retained position](assets/workspace-context/notification-position.png), [narrow viewport](assets/workspace-context/notification-mobile.png). The full native service status image was refreshed as well.

通知与附件已通过服务端集成测试和真实页面验收，涵盖本地收件箱、搜索与未读筛选、归档恢复、文件和图片预览、关联会话跳转、按钮拖动与刷新保留，以及 390 × 844 窄屏布局。两个本机接收器各收到一次相同发送计划中的消息，附件哈希一致；没有连接第三方账号或向实际人员发送消息。

页面测试发现并修正了轮询导致表单重置和深色主题文字对比度问题。原生会话先验证纯文本模型拒绝图片，再选用同一本机模型适配器中的图片路由，成功提交图片并由通知 Source 通过公开附件服务复制、预览。模型响应仍为固定合成结果；全仓库检查、独立制品安装、完整能力补齐与最终验收仍在进行。

## Material board and composition configuration checkpoint

The independent Canvas Source passed four integration tests covering live files, missing files, symlink and private-directory rejection, scope filtering, revision fences, asset integrity, persistence and real Core composition grants. Notes and registered file bodies remain outside the automatic projection. The real WebUI created session, project and global cards; dragged and resized a note; preserved pan and zoom after reload; copied a stable material reference; and archived and restored a card. File edits appeared on reload, a missing file retained its card, and an uploaded PNG remained readable after its original local file was moved. Actual audio and video controls reached their ended state; malformed media showed a recoverable error. Another session excluded the private note in its default view and included it only in the explicit project-wide human view.

The generic composition editor discovers installed Strategy descriptors without a business-plugin whitelist. Real preview reported 14 Sources, 26 routes and 29 actions. Enabling the independent Focus enhancement with Tasks and Canvas and an empty writable list produced 2 Sources, 3 routes and 0 actions. Saving and restoring the full composition both succeeded. Host route/action budgets now apply consistently to previews, new turns and pinned turns; positive limits and fair operation selection are covered by configuration, runtime and Strategy tests. The default budget remains 16 and the optional development profile uses 96.

Root client checks passed 52 tests, alongside root type checking/build, Focus tests and Canvas verification. A 390 × 844 viewport had a document width and scroll width of exactly 390 pixels, with a 282-pixel board after collapsing native navigation. Service-host file opening is opt-in and was not exercised; binary model reads return metadata, while the human page renders supported media. Screenshots: [material board](assets/workspace-context/canvas-media.png), [missing file](assets/workspace-context/canvas-missing-file.png), [narrow viewport](assets/workspace-context/canvas-mobile.png), [read-only composition](assets/workspace-context/focus-preview.png).

素材画布已通过文件边界、作用域、并发版本、持久化、附件完整性和真实 Core 组合测试。WebUI 实测了便签、实时文件和上传副本，拖动与尺寸修改，平移缩放的刷新保留，跨会话视角，归档恢复，以及真实音视频播放。文件更新可以重读，文件缺失保留卡片，上传副本不依赖原文件。窄屏下没有页面横向溢出；截图保留在上述路径。

通用策略配置界面根据独立插件声明展示字段，无业务插件白名单。默认预览含 14 个 Source；启用“专注上下文”并仅选择任务、画布及空写入集合后，预览变为 2 个 Source、3 条读取路由、0 个操作。保存与恢复完整组合均成功。Host 的预算同时约束预览和实际轮次，并保留旧轮次的原预算；默认值保持不变。服务主机打开文件功能没有在本轮测试中执行，模型读取二进制素材返回元信息，人类页面负责媒体展示。
