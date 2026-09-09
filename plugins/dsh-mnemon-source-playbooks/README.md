# Playbooks

Reusable skills and prompts, reviewed before activation.

This independently installed Source owns its records, scope, review state and management page. Its public routes return View-pinned evidence. Model suggestions remain pending; explicit management edits are revision-fenced. Archives and edits retain history. Disabling the plugin retains its data.

Install alongside `dsh-mnemon-strategy-workspace` in an explicit DSH profile. Configure `dataDir` to choose a storage root. Run `pnpm verify` for this package.

## 简体中文

经审核后启用的可复用技能和提示词。 每个 Source 独立拥有数据、作用域、审核状态与管理页面。模型建议进入待审核队列，人工采纳后才生效；修改检查版本并保留历史。关闭插件不会删除数据。

## Session schedules and native skills

Enabled, approved skills are registered through DSH's public skill-provider interface and remain workspace-filtered. A distinct `providerName` is required when installing multiple instances. Catalogs invalidate after writes; disabled and pending skills cannot be loaded.

Use `{{name}}` variables in prompts; `date`, `workspace` and `session` are supplied by the Source. Preview resolves required variables before use. Immediate use creates an attributed session message, with an explicit optional wake. Schedules freeze the approved text and variables for this session, accept a start round, interval and use count (`0` means continuous), persist usage and can be stopped. Disabling their playbook stops future scheduled use. Each admitted human round may inject at most eight prompts and 40000 characters; a reservation is persisted before entering the DSH step and is not replayed after a crash.

已采纳并启用的技能接入 DSH 原生技能目录，按项目过滤；多个实例需配置不同的提供方名称。提示词支持变量预览、立即使用、下一轮或指定间隔/次数的会话调度，次数为 0 表示持续。调度固定已确认内容，记录使用次数，支持停止；停用原提示词会停止后续调用。每轮最多注入 8 条、共 40000 字符，带明确插件来源，不覆盖用户当前指令。
