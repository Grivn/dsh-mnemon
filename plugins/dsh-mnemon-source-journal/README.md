# Activity journal

Project progress, daily activity and feedback with durable history.

This independently installed Source owns its records, scope, review state and management page. Its public routes return View-pinned evidence. Model suggestions remain pending; explicit management edits are revision-fenced. Archives and edits retain history. Disabling the plugin retains its data.

Install alongside `dsh-mnemon-strategy-workspace` in an explicit DSH profile. Configure `dataDir` to choose a storage root. Run `pnpm verify` for this package.

## 简体中文

项目进展、每日活动与反馈的持久记录。 每个 Source 独立拥有数据、作用域、审核状态与管理页面。模型建议进入待审核队列，人工采纳后才生效；修改检查版本并保留历史。关闭插件不会删除数据。

`captureTurns` explicitly enables completed human-turn excerpts; `captureFeedback` captures DSH's public `/feedback` records. Both use stable session-event references to prevent duplicate capture and exclude private reasoning and injected plugin messages. Source-owned timestamps and truncation markers describe what was captured.

`captureTurns` 显式开启用户轮次完成记录；`captureFeedback` 记录 DSH 公开的 `/feedback` 事件。稳定的会话事件引用防止重复写入，私有推理及注入消息不进入日志，保留时间、来源与截断标记。
