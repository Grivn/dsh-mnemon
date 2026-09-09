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

The later input checkpoint saved one native PNG and a Runtime Source export into job `92600232-788a-44d2-a6f9-4f0c8855c571`. WebUI displayed the image and the Source revision. The fixture model read the plan through the actual View route and requested its external-authority action; DSH paused for human approval. After allowing once, the process succeeded and printed the exact snapshot plus 1,158 image bytes with SHA-256 `d78f97f5cc60842d1e5e74c3e7116bc9184595e1d8dabc3a527cc3722b2d0332`, matching the retained native image. A separate request for job `91403d1c-f855-4cb4-b8c2-54bf7b24380d` was rejected in WebUI; the record remained a draft with no run id or log.

Seven package tests passed, including real Core composition, stale-copy rejection, denied execution, immutable image/context inputs, tamper rejection, lifecycle cancellation and scoped 90-day cleanup. Integration testing found a capability mismatch after disabling raw execution-history import; the manifest and runtime facts now agree and a Core regression covers their composition. Cleanup was tested on synthetic expired records; current WebUI has zero eligible records, so its cleanup button remains disabled. Screenshots: [saved job inputs](assets/workspace-context/job-input-copies.png), [model approval](assets/workspace-context/job-model-approval.png), [retained-input execution log](assets/workspace-context/job-copied-input-result.png).

后续验收已在页面保存原生图片和 Runtime Source 快照，再由模型通过真实 View 路由读取计划并触发 DSH 审批。允许一次后任务成功，进程打印的上下文、图片字节数及哈希与副本一致；另一任务拒绝审批后仍为草稿，没有执行编号或日志。7 项测试覆盖 Core 组合、版本冲突、拒绝授权、输入固定、损坏拒绝、取消和按项目清理。清理使用合成过期记录测试；当前页面没有到期记录，按钮正确禁用。

The [job input mobile view](assets/workspace-context/job-input-mobile.png) was inspected at 390 × 844 with the saved context and image expanded. The document width and scroll width were both 390 pixels. 窄屏下快照内容正常折行，图片和操作按钮可达，页面没有横向溢出。

## Prompt, review and journal checkpoint

Prompt scheduling tests cover variable substitution, inactive-playbook rejection, session isolation, start/interval/count, duplicate-turn fencing and stopping a disabled playbook. The real WebUI scheduled a variable-expanded prompt for the next human round and verified exactly one use and zero remaining uses. The same real turn produced a Source-owned journal entry containing only visible user/assistant text.

Review tests cover sticky due state, replay fencing, proposal/severity validation, separate persistent reviewer identity, scoped constraints, follow-up history and reset. WebUI verification exercised a manual reviewer question, enabled a one-round automatic review, observed two persisted review results, confirmed the due flag remained set, completed the cycle, and reset reviewer context while retaining both results. The model adapter returned explicit synthetic review output; these checks establish workflow behavior, not review accuracy.

Screenshots: `prompt-schedule.png`, `review-cycle.png`, `review-history.png`, `journal-capture.png`.

提示词调度、独立审核和活动日志已组合运行。真实用户轮次消费一次提示词、生成可见对话日志并推进审核计数；自动审核后到期状态保留，显式完成与重置均保留历史。审核使用本地合成模型，仅验证流程，不评价模型审核质量。

## Collaboration, native skills and suggestion transfer checkpoint

The subsequent collaboration checkpoint added copied image delivery, addressed asset access, filtered message history and resource ownership. Native `read`/`write` tools registered a successful owner write. Another session's write was rejected while ownership was active; reading the actual file confirmed its contents were unchanged. After the owner released its declaration in WebUI, the second session wrote successfully. Future-file declarations were saved without creating the file. Resource type and name filters selected exactly one expected declaration. A native image was copied, admitted as an attributed image message, previewed by the recipient, marked read, archived by its sender and restored. The mobile page had no horizontal overflow at 390 × 844.

This test exposed two integration issues: the development preset lacked DSH's standard coding tools, and an appended filesystem listener ran after a terminal policy. The profile now copies the shipped standard preset into its isolated home, offering the native coding and memory tools. The Source wraps the public intent event with `prepend: true` and preserves the existing policy by awaiting the continuation. The conflict, release and successful-write checks passed after both fixes. Nine collaboration tests and 22 shared utility tests passed; final repository verification remains pending.

Screenshots: [automatic file registration](assets/workspace-context/collaboration-auto-file.png), [conflicting write rejection](assets/workspace-context/collaboration-write-conflict.png), [resource filters](assets/workspace-context/collaboration-resource-filter.png), [copied image](assets/workspace-context/collaboration-image-delivery.png), [mobile image history](assets/workspace-context/collaboration-mobile.png).

后续协作验收覆盖真实文件冲突、释放后写入恢复、未来文件声明、资源组合筛选、原生图片复制投递、收件预览、已读、归档与恢复。实测发现并修正了开发预设缺少编码工具、文件监听晚于终止型策略的问题；当前实例加载标准编码工具，协作 Source 在公开意图事件前检查，并继续执行原有文件版本策略。390 × 844 页面无横向溢出。图片回执不等同于模型已消费图片，固定模型也不代表视觉能力验证。

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

## Reviewed synchronization checkpoint

The independent Sync Source passed seven integration tests: real divergent Git histories and three conflict decisions, persisted plans, stale/configuration/scope rejection, malformed records and destinations, explicit tombstones, an interrupted receipt after a successful ref update, foreign project identity rejection, and real Core composition with independent instances. It exposes no model routes or actions. Workspace utilities passed 19 tests and Runtime passed 41, including transfer scope rebinding, history preservation, idempotency, separate user storage, capacity rejection and Source-wide revision fencing.

The real WebUI created a project target with notes, tasks, journal and playbooks. The first local commit left the remote empty until the separate reviewed push. A synthetic second device then changed three records in the local bare remote. The page displayed the common/local/remote values; notes kept both versions, tasks kept the local value and feedback adopted the remote value. Actual Source pages confirmed both notes and retained history. The pushed merge has both the previous local commit and fetched remote commit as parents. The development code branch was unchanged.

A second UI target selected six global tracks. Its next import changed working memory and user preferences and added personal tasks, daily tasks and a daily journal entry. All six tracks returned receipts; the Runtime page displayed the imported content and both prior Runtime documents were retained in the transfer-history directory. Git independently confirmed a separate global branch with a two-parent merge. Destinations were local synthetic repositories; no account or production remote was contacted.

Screenshots: [three-way conflicts](assets/workspace-context/sync-conflicts.png), [both note versions](assets/workspace-context/sync-merged-notes.png), [global import receipts](assets/workspace-context/sync-global-receipts.png).

独立同步 Source 已通过真实 Git 分叉历史、三种冲突决策、计划持久化、作用域和版本拒绝、格式与地址校验、墓碑记录、中断恢复及真实 Core 多实例测试。它不提供模型动作；记录工具包与 Runtime 的同步校验分别包含在 19 项和 41 项测试中。

WebUI 实测了四类项目数据的首次快照，确认应用不会自动推送，再分别对笔记、任务与反馈使用两者保留、采用本机、采用远端。导入结果保留本机历史，Git 合并提交具有两个父提交，代码分支保持原样。另一个全局目标实测六条轨道，导入工作记忆、用户偏好、个人任务、每日任务和每日日志，回执全部完成，Runtime 旧内容保留于恢复目录。远端仅为本机合成裸仓库；没有向正式仓库发送数据。

## Task views and result capture checkpoint

Task checks cover all four priority groups, combined type/category/date/deadline filters, deterministic ordering and exclusion of completed work from overdue results. The WebUI populated four groups, filtered a single overdue task, marked it complete and observed zero overdue matches. Daily-only filtering returned exactly one task. At 390 × 844, document and scroll width were both 390 pixels and all filters remained reachable.

Journal tests use a real Git repository to confirm branch provenance and deduplication for feedback and project/daily job results. The WebUI ran a copied local job, observed successful exit 0 and its retained log, then filtered two new results by date and background-job category. Notifications independently recorded the completion. The fixture workspace has no Git branch, so those UI records have no invented branch.

Two React race tests reject a late read from a previous workspace and prevent an old pending save from overwriting the new workspace or restoring its draft. Workspace utilities passed 21 tests; Tasks and Journal passed four each, plus type checks and separate builds. Screenshots: [priority matrix](assets/workspace-context/tasks-priority-matrix.png), [mobile task filters](assets/workspace-context/tasks-mobile.png), [project and daily results](assets/workspace-context/job-journal-capture.png).

任务视图实测四个象限、组合筛选、每日任务，以及完成逾期任务后计数从 1 变为 0。390 × 844 窄屏下控件可达，页面没有横向溢出。日志测试使用真实 Git 仓库验证分支来源和去重；WebUI 中的新任务成功完成，随后实际生成项目、每日两份日志和独立站内通知。普通目录不伪造 Git 分支。

共享集合页面通过两个异步竞争测试，保证旧工作区的响应与草稿不会覆盖新页面。工具包共 21 项测试通过，任务与日志各 4 项通过，独立类型检查与构建完成。

## Independent artifacts and prompt scheduling checkpoint

All 35 independent plugin repositories passed standalone tarball installation, workspace-link rejection, type checking, tests and builds. The external consumer passed its public SDK composition and Client tests against 36 packed artifacts. Real DSH passed installation of only the packed Starter, upgrade from 0.4.7, and concurrent activation of three optional Strategy packages. The consumer now declares every tested plugin explicitly and derives the expected artifact set from that manifest, replacing an obsolete fixed package count.

WebUI created a continuous prompt schedule, used it in two consecutive human turns, stopped it, and completed a third turn. The durable record remained stopped with exactly two uses. A separate immediate invocation previewed its expanded variables and completed once with explicit wake; the native conversation produced another assistant response at 18:15. These checks validate delivery and turn accounting with the local deterministic model. Screenshots: [stopped after two uses](assets/workspace-context/prompt-schedule-stopped.png), [immediate invocation](assets/workspace-context/prompt-immediate.png).

35 个独立插件逐一通过制品安装、禁止工作区链接、类型检查、测试和构建；外部消费者用 36 个打包制品通过公开 SDK 组合与前端测试。真实 DSH 验证仅安装 Starter、从 0.4.7 升级，以及同时启用三个可选策略。消费者清单现在明确声明全部插件，制品数量随清单校验。

提示词持续调度在两个人类轮次中各触发一次；手动停止后的下一轮保持两次使用。另一次立即调用预览变量展开结果后完成一次，并显式唤醒会话，原生会话在 18:15 产生新回复。实际模型仍是本机固定响应，验证范围是投递、计数和停止行为。

## Ordinary conversations, presets and exact bookmarks checkpoint

The session Source now publishes separately authorized create, fork, rename and delivery actions, with durable request claims and receipts. Its metadata routes read the native model and preset registries, preserve unknown image capability, and resolve unlisted exact models without treating discovery as an allowlist. The public adapter mounts the selected preset during unpublished create and cold resume setup. A failed preset mount cannot publish a half-composed agent.

WebUI read the native catalog, including image capability, context capacity and four reasoning levels. A saved message at sequence 7 opened in the Source's focused reader, and its completed turn produced a native one-turn fork. The fork's model requested another ordinary conversation through the offered action; DSH paused for the exact request's approval. Allowing it created and woke a new session, which appeared in its workspace and produced a real fixture response. A subsequent Source action renamed it; native identity confirmed its parent, preset, model and idle status. Both new sessions' persisted request headers contained 42 tools, including read, write, edit, bash and skill. No native subagent was launched.

The exact reader locates an old message before budgeting its body, rejects missing or non-visible anchors, and focuses only Source-owned markup. It does not patch or inspect the native conversation DOM. The native conversation remains available through a separate navigation action. At 390 × 844 the controls remained reachable and document width equaled scroll width. Twenty-five utility tests and six session tests passed, followed by all 35 plugin builds.

Screenshots: [model capability](assets/workspace-context/session-model-capabilities.png), [exact bookmark](assets/workspace-context/bookmark-exact-location.png), [native fork](assets/workspace-context/bookmark-native-fork.png), [reviewed creation](assets/workspace-context/session-create-approval.png), [created conversation](assets/workspace-context/session-created-response.png), [native identity](assets/workspace-context/session-identity.png), [mobile actions](assets/workspace-context/session-actions-mobile.png).

会话 Source 提供独立授权的创建、分叉、改名和投递动作，执行前持久登记请求；中断结果不会静默重复执行。模型与预设目录来自 DSH 的公开注册表，未知图片能力保持未知。创建及恢复时通过公开 setup 挂载预设，避免仅保存名称而缺少工具。

WebUI 精确定位消息 7，并从该轮创建原生分支；分支中的模型请求经过原生审批后，创建并唤醒一个普通协作会话，实际产生回复。改名与身份读取确认了父会话、预设和模型。两个会话的持久请求头均包含 42 个工具，包含读取、写入、编辑、Shell 和技能；未启动原生子代理。书签定位使用 Source 自己的阅读区，原生对话通过独立按钮打开，没有改动宿主 DOM。25 项工具包测试、6 项会话测试以及 35 个插件构建通过，移动页面没有横向溢出。
