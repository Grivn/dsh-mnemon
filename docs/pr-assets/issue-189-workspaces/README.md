# Issue #189: centralized workspace storage / 集中工作区存储

Captured on 2026-09-09 with the implementation at `fe405d3`, rebased onto `main` at `a1c500a`. All retained screenshots use that build. DSH `0.1.2-rc.1`, Starter/storage plugin `0.5.5`, Node `25.1.0`, pnpm `11.19.0`; default browser viewport 1280 × 720, plus a 390 × 844 responsive check. The last commit only adds evidence and makes a test path assertion portable.

截图日期为 2026-09-09，实现为 `fe405d3`，已 rebase 到 `main` 的 `a1c500a`。保留截图全部来自该构建。版本和视口如上；最后一次提交只补充验收记录，并修正一处测试路径断言的跨平台写法。

## Setup / 环境

`pnpm e2e:serve` runs the real published DSH Host and the local build with a disposable Profile, global root, workspace A, and loopback model endpoint. A second temporary workspace B and a separate central directory exercise routing. All content is synthetic. Only model replies are scripted; settings persistence, session creation, Source reads/writes and Host restarts are real. The original checkout and personal memory roots are untouched.

通过 `pnpm e2e:serve` 运行正式 DSH Host 和本地构建，使用一次性 Profile、全局根、工作区 A 和本机模型端点；另外创建临时工作区 B 与集中目录。所有内容均为合成数据，只有模型回复使用固定脚本；设置保存、会话创建、Source 读写和 Host 重启均走真实链路。原 checkout 和个人记忆根未被修改。

## Results / 结果

| Check / 检查 | Result / 结果 |
|---|---|
| Settings / 设置 | PASS: select Centralized workspaces, save an absolute central root and Global user profile; invalid relative roots block Save. Clear the root to use the default, then restore it. / 选择集中工作区，保存绝对集中根和全局用户档案；相对路径阻止保存，清空可切回默认根，再恢复原根。 |
| Isolation / 隔离 | PASS: A and B retain different project memories; both see the same global USER. A's document and Holographic mapping are absent from B. / A、B 分别保留自己的项目记忆，共享全局 USER；A 的档案与 Holographic 映射不出现在 B。 |
| Scope routing / 范围路由 | PASS: Sidebar follows the inspected registered workspace and displays the session mismatch; Align to conversation restores A. Builtin follows each owning session and hides the picker. / Sidebar 跟随查看工作区并提示与会话不一致；对齐会话恢复 A。Builtin 跟随所属会话，不显示选择器。 |
| Persistence / 持久化 | PASS: custom/default root switching and two Host restarts retain configuration and existing data. Disk assertions confirm all four areas under A's hash, separate B data, global USER, and no project-local `.mnemon`. / 集中根切换及两次 Host 重启后配置和数据保留；磁盘断言确认 A 的四个 area、B 独立数据、全局 USER，项目内没有 `.mnemon`。 |
| Local Provider / 本地 Provider | PASS: the browser enables Holographic and resolves its mapping under A's `state/`. Automated live-runtime tests also write a durable Holographic fact with both USER scopes. / 浏览器启用 Holographic，映射指向 A 的 `state/`；真实运行图测试在两种 USER 范围下另行写入持久事实。 |
| Full verification / 完整验证 | PASS: 820 root tests and 319 plugin tests, type checks, deterministic builds, Headless activation, public entries and package lint. Two opt-in tests are skipped in the aggregate command; the Native one passes separately below. / 根包 820 项、插件 319 项，类型、确定性构建、Headless、公开入口和包检查通过；汇总命令跳过两项可选测试，其中 Native 单独补测通过。 |
| Independent artifacts / 独立制品 | PASS: 17 independent plugin repositories and 18 packed artifacts, public SDK consumer, real DSH Starter activation and three optional Strategy plugins together. / 17 个独立插件仓库、18 个发布制品、公开 SDK 消费方、真实 DSH Starter 激活及三个可选 Strategy 同时启用通过。 |
| Runtime compatibility / 运行时兼容 | PASS: all 820 root tests on Node `22.19.0` with pnpm `10.13.1`. / Node `22.19.0`、pnpm `10.13.1` 下根包 820 项全部通过。 |
| Native CLI / 原生 CLI | PASS: installed Mnemon `0.2.7` creates a space, writes, lists, recalls and forgets in a disposable root. Windows-only smoke is not run on macOS. / 本机 Mnemon `0.2.7` 在临时根完成创建空间、写入、列举、召回与删除；macOS 未运行 Windows 专用测试。 |
| Presentation / 界面 | PASS: Chinese/Dark and English/Light; the long English storage option now occupies a full row. Sidebar Runtime remains usable at 390px with the sidebar collapsed. / 中文深色和英文浅色通过，新模式英文名称整行完整显示；收起侧栏后 390px 的 Sidebar 运行时页面可正常浏览。 |

[Sanitized disk assertions / 脱敏磁盘断言](./disk-assertions.json)

## Limits / 限制

The published DSH settings dialog retains a wide navigation column at 390px, leaving too little space for its settings content; screenshot 09 records this existing Host limitation. In Builtin mode, the Host's conversation resize handle can intercept the center of the Runtime tab; keyboard activation or its right edge works. No DSH source was modified. These checks do not claim mobile settings support.

正式 DSH 设置弹窗在 390px 下仍保留较宽导航栏，设置内容区过窄；截图 09 记录这一已有 Host 限制。Builtin 中，Host 的会话宽度拖动条可能截获“运行时”Tab 中间位置的点击，键盘或右侧边缘可正常激活。未修改 DSH 源码，也不将本次检查视为手机设置界面验收通过。

No browser errors were observed during the feature checks; connection-retry warnings occurred while deliberately restarting the Host. Vitest reports an existing missing-source-map warning from the published upstream UI package. The loopback model is not a quality evaluation of autonomous distillation. The browser created a Holographic mapping without distilling a fact; real provider writes are covered by the live-runtime tests.

功能检查期间未观察到浏览器错误，主动重启 Host 时出现连接重试警告。Vitest 中正式上游 UI 包存在已有的 source map 缺失警告。本机固定模型不用于评估自主沉淀质量；浏览器只创建 Holographic 映射，真实 Provider 写入由运行图测试覆盖。

## Reproduce / 复现

```sh
pnpm install --frozen-lockfile
pnpm run verify
node scripts/verify-plugin-artifacts.mjs --skip-build
npx --yes --package=node@22.19.0 --package=pnpm@10.13.1 --call 'pnpm run test:root'
MNEMON_NATIVE_TEST_CLI=/absolute/path/to/mnemon pnpm --filter dsh-mnemon-source-memory-spaces exec vitest run tests/native-integration.spec.ts
pnpm e2e:serve
```

In the printed disposable workspace, choose the Mnemon E2E preset and create a session. Set `storageScope: workspaces`, an isolated central root and `runtimeUserScope: global` in Settings. Add a project memory, user preference and document in A; enable Holographic. Register B, confirm A's project data is absent, and create a distinct B memory. Switch the inspected workspace, align to the conversation, then exercise Builtin sessions. Clear/restore the central root and restart the fixture with `SIGUSR2`. Confirm data reappears and stop the fixture when finished.

在输出的一次性工作区选择 Mnemon E2E 预设并创建会话。在设置中启用 `workspaces`、隔离的集中根和全局 USER。为 A 添加项目记忆、用户偏好及档案，并启用 Holographic。登记 B，确认没有 A 的项目数据，再添加不同的 B 记忆。切换查看工作区、对齐会话，然后验证 Builtin 会话。清空和恢复集中根，用 `SIGUSR2` 重启夹具，确认原数据重新出现，结束后停止夹具。

## Screenshots / 截图

| Evidence / 证据 | Screenshot / 截图 |
|---|---|
| Chinese configuration / 中文配置 | [01](./01-settings-zh.png) |
| A's project memory and global USER / A 项目记忆和全局 USER | [02](./02-workspace-a-memory.png) |
| A's retained document / A 保留的档案 | [03](./03-workspace-a-document.png) |
| B's own memory, shared USER and session mismatch / B 独立记忆、共享 USER 和会话差异提示 | [04](./04-workspace-b-isolated.png) |
| A's local Provider mapping / A 本地 Provider 映射 | [05](./05-workspace-a-provider.png) |
| English configuration / 英文配置 | [06](./06-settings-en.png) |
| Builtin after restart / 重启后的 Builtin | [07](./07-restarted-workspace-a.png) |
| Runtime at 390px / 390px 运行时页面 | [08](./08-narrow-runtime.png) |
| Host settings limitation at 390px / 390px Host 设置限制 | [09](./09-narrow-settings-host-limit.png) |
