# Background jobs Source

An independent project-scoped Source for asynchronous CLI tasks. Install it beside `dsh-mnemon`; select it through a compatible Strategy such as Workspace. Configure each adapter with an absolute executable, an argument array and optional resume arguments. Supported placeholders are `{prompt}`, `{model}`, `{cwd}`, `{session}` and `{attachment}`. Input may use an argument or stdin. Shell parsing is never used.

Approved drafts have a concrete execution plan including the prompt, model, executable identity, arguments, attachments, working directory and timeout. The human page previews and confirms it. Model execution uses the Host's per-call DSH approval and rejects changed plans. Image paths must remain in the current workspace or configured attachment roots; URL references require an adapter that explicitly supports them.

The Source owns its queue, concurrency limit, logs, cancellation, output limit, timeout and durable outcomes. Copy a finished job to retry, or resume when the adapter returned a `session_id` or `thread_id` and supports resume arguments. Interrupted work is never automatically replayed. Result delivery is attributed to this plugin and does not wake the owner by default. The published `mnemon-jobs/completed` event lets other plugins subscribe without accessing this Source's store.

## 中文

独立的项目级后台任务 Source，通过 Workspace 等兼容 Strategy 使用。适配器配置包括绝对路径程序、参数数组、可选的恢复参数，以及模型和附件能力。支持参数或标准输入，不经过 shell。默认并发为 2，上限 4；单任务最多 1 小时，输出最多 2 MiB。

已采纳的请求需要先展示并确认具体执行计划；模型执行还需要 Host 的 DSH 逐次授权，计划发生变化即拒绝。任务状态、日志、取消和恢复均由本 Source 持久管理。中断不会自动重试。重试复制为新任务，保留原执行历史。结果投递带插件来源，默认不会唤醒会话。

The isolated development profile provides a deterministic local fixture adapter. It validates orchestration, not any third-party model's capabilities or authentication.
