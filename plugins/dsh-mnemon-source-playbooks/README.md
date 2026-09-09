# Playbooks

Reusable skills and prompts, reviewed before activation.

This independently installed Source owns its records, scope, review state and management page. Its public routes return View-pinned evidence. Model suggestions remain pending; explicit management edits are revision-fenced. Archives and edits retain history. Disabling the plugin retains its data.

Install alongside `dsh-mnemon-strategy-workspace` in an explicit DSH profile. Configure `dataDir` to choose a storage root. Run `pnpm verify` for this package.

## 简体中文

经审核后启用的可复用技能和提示词。 每个 Source 独立拥有数据、作用域、审核状态与管理页面。模型建议进入待审核队列，人工采纳后才生效；修改检查版本并保留历史。关闭插件不会删除数据。

## Session schedules and native skills

Enabled, approved skills are registered through DSH's public skill-provider interface and remain workspace-filtered. A distinct `providerName` is required when installing multiple instances. Catalogs invalidate after writes; disabled and pending skills cannot be loaded.

Use `{{name}}` variables in prompts; `date`, `time`, `workspace` and `session` are supplied by the Source. Preview resolves required variables before use. Immediate use creates an attributed session message, with an explicit optional wake. Schedules freeze the approved text and variables for this session, accept a start round, interval and use count (`0` means continuous), persist usage and can be stopped. Disabling their playbook stops future scheduled use. Each admitted human round may inject at most eight prompts and 40000 characters; a reservation is persisted before entering the DSH step and is not replayed after a crash.

已采纳并启用的技能接入 DSH 原生技能目录，按项目过滤；多个实例需配置不同的提供方名称。提示词支持变量预览、立即使用、下一轮或指定间隔/次数的会话调度，次数为 0 表示持续。调度固定已确认内容，记录使用次数，支持停止；停用原提示词会停止后续调用。每轮最多注入 8 条、共 40000 字符，带明确插件来源，不覆盖用户当前指令。

## Configured skill directories

`skillDirectories` adds explicit directories to the native DSH skill provider. Its public filesystem provider parses SKILL.md metadata; the Source also offers bounded Markdown browsing and editing in those directories. Reads resolve real paths, reject escaping symlinks and cap files at 256 KiB. Saving checks the observed digest, serializes cooperating writers across processes, writes atomically and preserves file permissions. Pending record suggestions remain separate from enabled skills. File edits invalidate the catalog; directory listings remain fresh even when initially empty.

`skillDirectories` 可配置额外的原生技能目录，复用 DSH 公开文件系统技能提供方解析元数据。页面支持目录检索和 Markdown 文件编辑，限制真实路径和 256 KiB 文件大小。保存检查已读取的内容摘要，协调并发写入，以原子替换保留权限；过期编辑会提示重新读取。目录技能与待审核的技能建议分别遵循自己的启用流程。

## Reviewed model operations

Model prompt creation and editing require `instruction-update` authority. Invoking, scheduling or stopping a prompt requires `session-instructions` authority and the exact record version. Skills retain their separate proposal/approval path. An immediate invocation always uses once; explicit wake steers a running conversation at its next step or wakes an idle one. An interval of zero also means one use, regardless of count. Duplicate active schedules for the same prompt and session are rejected. Failed variable expansion retains a failed record and does not block other schedules.

Prompt summaries and tags aid discovery. Built-in `date` and `time` use UTC and expand at each admitted invocation; the approved template and user variables remain frozen. Completed one-shot schedules show zero remaining uses.

模型创建和编辑提示词需要 `instruction-update` 授权；立即使用、安排和停止需要 `session-instructions` 授权及精确条目版本。技能仍经过独立的建议审核。立即使用固定一次，显式唤醒会在运行中会话的下一步生效，或启动空闲会话。间隔为 0 也只使用一次；同一提示词在同一会话中不能重复创建活跃调度。变量展开失败保留失败记录，不阻塞其他调度。

提示词支持简介与标签。内置 `date` 和 `time` 使用 UTC，在每次实际调用时展开；已确认模板和用户变量保持固定。一次调用完成后，剩余次数显示为 0。
