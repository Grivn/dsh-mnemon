# 开发与验证

**简体中文** | [English](../../en/development/README.md) | [文档中心](../README.md)

## 环境与命令

插件的 Node engine 下限为 20；锁定的完整 DSH 开发 Profile 是稳定版 0.1.2-rc.1，需要 Node `^22.19.0 || >=24.0.0`，建议开发使用 Node 24。Root、Source Client 测试和外部制品消费者均使用该 rc.1 依赖族；`dsh-invariants` 闭合 peer 图，`dsh-client-store` 则提供子 Agent projection 适配器使用的公开 selector 类型。CI 另在 Node 20 冒烟导入公开 Node 入口；直接前序版本 0.1.2-alpha.5 保留显式源码覆盖流程。

pnpm 11 可能在 rc.1 仍处于发布时间隔离窗口时安装这组已审核制品，因此 `minimumReleaseAgeExclude` 逐项列出精确版本。组合测试要求该列表与 lockfile 中的 rc.1 包完全一致，并拒绝 scope 通配符，使后续发布的 `@deepseek-ai` 包仍受隔离策略约束。

```sh
pnpm install --frozen-lockfile
pnpm run verify
pnpm run verify:plugins
```

`verify` 包含类型检查、根包确定性构建、独立插件构建、完整测试集、真实隔离 DSH Headless 和包出口/内容验证。独立插件检查在所有公开制品构建完成后分阶段执行。不要用 `pnpm -r verify` 同时清理重建制品和运行读取它们的测试；整个工作区使用 `pnpm verify`。`verify:plugins` 在工作区**外部**，基于 semver 安装的 tarball 重复验证，并测试外部 Source/Strategy/Provider/Client 消费者；还向真实 DSH 仅安装根包 tarball，从 loopback registry 解析全部十六个官方插件，不使用工作区链接或改写 manifest，再单独验证三个随附增强从默认停用到同时启用。外部消费者还通过完整 Strategy 的打包 SDK 编译自己实现的策略贡献。

## 仓库归属

```text
src/
  core/       contracts, View compilation, generations, turn leases
  sdk/        installMemory, validation, test fixtures
  host/       DSH lifecycle, settings, tools, RPC, worker coordination
  client/     shared workspace, settings, Source-page SDK
plugins/
  dsh-mnemon-source-runtime/
  dsh-mnemon-source-documents/
  dsh-mnemon-source-memory-spaces/
  dsh-mnemon-strategy-default-three-tier/
  dsh-mnemon-strategy-scoped/         # 随附、默认关闭的选择贡献
  dsh-mnemon-strategy-light-context/  # 随附、默认关闭的投影贡献
  dsh-mnemon-strategy-auto-capture/   # 随附、默认关闭的对话内记录贡献
  dsh-mnemon-provider-*/
tests/        Host/Core/UI composition and boundary tests
scripts/      reproducible build, artifacts, Headless and Web fixtures
cordis.patch.yml   default Starter composition
```

根包拥有 Core/SDK、DSH Host 和默认 Starter，不拥有 Source 存储实现。`plugins/` 下每个目录都是可独立发布的项目。默认发行包按公开 semver 依赖全部十六个官方插件；三个增强包由 Starter 安装但其 Entry 默认停用。Source/Strategy 通过 peer 使用 Core SDK，策略贡献使用其完整 Strategy 的公开 SDK，Provider 使用 Memory Spaces SDK。peer/开发关系会产生包管理器环依赖提示；生产代码导入边界另有独立检查。

不再保留私有工作区包、控制器转发文件、业务 binding 或 compatibility 目录。兼容指用户配置、数据与使用流程，不是延续历史内部符号。

插件 Client 测试需要根包的公开浏览器制品时，先构建根包：

```sh
pnpm build
pnpm --workspace-concurrency=1 -r build
pnpm --filter dsh-mnemon-source-runtime verify
```

声明的 peer 版本可用后，任意插件可复制到新仓库，运行自己的 `pnpm install && pnpm verify`。未发布开发使用打包制品及本地 registry 验收，不以仓库源码路径代替公开依赖。

## 测试归属与覆盖

| 边界 | 测试 |
|---|---|
| Core/SDK | 不可变 View、预算、Strategy 校验、并发回合、grant、租约、换代、清理与性能 |
| 策略贡献 | 独立槽、组合/顺序、卸载、冲突、只读范围、共享配额与真实 Host 激活 |
| Source | 自己的控制器/存储、修订、快照、JSON 操作、Client 点击与实例隔离 |
| Provider | 驱动、凭据、真实能力与故障响应 |
| Memory Spaces | Provider 子节点生命周期、跨 Provider conformance、合并/路由/召回质量、Native 进程串行化 |
| Host | 默认组合、配置/数据范围、工具、监督流程、RPC 权限、回执与体验 |
| 制品 | 所有公开入口、独立安装/构建/测试、外部组合与浏览器制品 |

远程 Provider 使用可控 HTTP 响应；Native 进程测试使用可控命令 runner，另有可选 Windows 二进制冒烟。额外的 opt-in 测试接受经过官方 checksum 校验的 Native 二进制，创建临时记忆空间，通过 View 写入、召回并删除：

```sh
MNEMON_NATIVE_TEST_CLI=/absolute/path/to/mnemon pnpm --filter dsh-mnemon-source-memory-spaces exec vitest run tests/native-integration.spec.ts
```

该测试不会发现个人数据根或安装二进制。这些检查不等于验证过所有真实远端服务或账号配置。Provider Lab 是需要明确启动的独立集成环境。

可选的 Flash 压力测试使用四个真实 DSH 会话、委派写入者、独立维护任务和临时 Native 存储，保留默认 10 KiB 上限，验证反复归档后的精确原文、命名空间路由和无会话 Web 管理。通过 `DEEPSEEK_API_KEY` 提供 DeepSeek 凭据，通过 `MNEMON_NATIVE_TEST_CLI` 提供已验证的 CLI，然后运行：

```sh
MNEMON_RUN_FLASH_STRESS=1 MNEMON_FLASH_STRESS_ROUNDS=8 MNEMON_FLASH_STRESS_REPORT=/tmp/mnemon-flash-stress.json pnpm exec vitest run tests/runtime-capacity-flash-stress.spec.ts
```

测试逐一核对出站请求与返回模型均为 `deepseek-v4-flash`，使用非思考模式，始终不选择 Pro。模型提交前的文本变化与存储后的变化分别计数，所有项目事实均为合成数据，临时存储和会话在完成后清理。目标授权范围是硬性断言，主题归类匹配度单独作为模型质量指标报告。设置 `MNEMON_FLASH_STRESS_JSON_PROMPT=1` 可重跑带引号 JSON 输入诊断。普通 CI 默认跳过，需要明确授权使用真实 API。

另一组自动记忆验收在四个并发 DSH 会话中模拟后端、前端、Android 和运维工作。开发提示包含已确定的决策、纠正和临时诊断，由模型自行选择记忆操作。开发任务实际读写临时 JSON 文件，默认生命周期真实执行空闲审阅；新的召回会话无法访问开发会话历史或配置文件。提供相同的凭据和 CLI 环境变量后运行：

```sh
MNEMON_RUN_FLASH_QUALITY=1 MNEMON_FLASH_QUALITY_REPORT=/tmp/mnemon-flash-quality.json pnpm exec vitest run tests/runtime-memory-flash-quality.spec.ts
MNEMON_RUN_FLASH_QUALITY=1 MNEMON_FLASH_QUALITY_WAVES=24 MNEMON_FLASH_QUALITY_REPORT=/tmp/mnemon-flash-quality-long.json pnpm exec vitest run tests/runtime-memory-flash-quality.spec.ts -t 'four preconfigured'
```

默认每会话 12 轮，扩展工作负载为 24 轮。两者均使用关闭思考的 Flash、guided 召回与写回，以及默认 10,240 字节记忆上限。只将空闲防抖从 30 秒缩短为 5 秒，审阅资格规则不变。测试记录保留事实、临时标记、纠正后的回答、模块归属、禁止写入回合、工具错误和归档。Vitest 成功仅表示实验执行完成：应检查 `finalEvaluation.automatedVerdict`，并逐条审阅过期文档、重复与归属错误，才能判断质量是否验收通过。[2026-09-09 验收报告](../../pr-assets/runtime-memory-quality-flash-20260909/README.zh-CN.md) 同时记录失败发现与通过项。普通 CI 跳过两个真实 API 用例。该模拟不能替代完整应用构建、真人半天工作流或 Windows 验证。

生成的真实运行数据放在仓库外，上述命令已采用这种方式。遵循[证据存放规范](../../pr-assets/README.md)：提交摘要、复现输入与最小样例，完整脱敏数据作为 PR 附件保存，并注明 revision 和 SHA-256。

性能回归对 100 次三 Source View 组合约束 wall/CPU 时间；确定性构建比较所有生成文件 hash。二者不承诺生产网络延迟或 LLM 质量。

默认组合和三插件组合均运行上述性能门槛。
[2026-09-01 策略贡献验证](../../pr-assets/strategy-extensions-20260901/README.md)
记录了共存、独立制品、真实 Headless 激活结果及其边界。

## 真实 WebUI

```sh
pnpm build
pnpm --workspace-concurrency=1 -r build
pnpm e2e:serve
```

夹具输出临时工作区及 loopback URL，隔离 `DSH_HOME`、`MNEMON_DATA_DIR`、工作区和模型端点。会话选择 **Mnemon E2E**：该测试自有 preset 去除 Shell 依赖，保留 Host 记忆工具。模型固定回复，因此这里只检查 UI/传输，不评价真实模型沉淀质量。Ctrl-C 停止并清理合成测试数据。

检查无会话 Sidebar、所有一级/二级页面、Runtime 增改删与清空分支、Documents 创建/搜索/读取、Provider 设置与发现、激活、故障态、取消弹窗、存入记忆、布局切换、locale、返回聊天后交互恢复。读写/删除使用临时 Provider 或受控夹具，不能对个人记忆做实验。

验证内嵌 Electron Host 时，使用 `pnpm e2e:serve --electron=/absolute/path/to/electron`（macOS 指向 `Electron.app/Contents/MacOS/Electron`）。单独安装测试用 Electron，并通过 `MNEMON_CLI_PATH` 和 `npm_config_prefix` 指定隔离的 npm 安装。夹具将正式发布的 DSH Web 栈运行在 Electron 主进程内，Host 不设置 `ELECTRON_RUN_AS_NODE`。它为正式 Cordis loader 开放 Node internals，无需重新编译或修改 DSH 包。照常用 Ctrl-C 停止。

另检查 `displayMode` 实时切换：Sidebar 与 Builtin 不得同时挂载，二者使用同一组 Source 页面。Builtin 的全局/工作区/自定义范围读写及任务遵循所属会话，隐藏范围控件，切换会话时清理旧数据与编辑器。验证旧 `buildin` 规范化，以及原生 Sidebar 皮肤和已支持布局插件下的折叠图标。

[2026-09-04 main rebase 验证记录](../../pr-assets/main-rebase-20260904/README.md)列明精确的 v0.4.7/DSH rc.1 revision、registry 与源码覆盖完整测试、独立制品、插件组合重启持久化和真实双入口验证及其限制。

[2026-08-30 npm 回归记录](../../pr-assets/npm-sidebar-cli/README.md#简体中文)保留了旧 Taskboard/SSH 与 CLI 调查。已移除的历史夹具不是当前 checkout 的命令；当前 WebUI 验证使用 `pnpm e2e:serve`。

上一条 DSH 0.1.1-rc.2 版本线对 Bundle 变化的 Client 卸载并不完整；验证该回滚目标并修改 Client 包/locale 注册后应刷新页面。Mnemon 普通设置仍实时生效。区分上游 Profile/传输告警与 Mnemon 故障，不隐藏控制台。

## 手动 DSH 0.1.2-alpha.5 源码兼容

需要按需验证源码版 `dsh-v0.1.2-alpha.5` 时，先准备已构建的 Harness 目录：

```sh
DSH_SOURCE_ROOT=/absolute/path/to/deepseek-harness pnpm dsh:link-source
pnpm_config_verify_deps_before_run=false pnpm verify
pnpm dsh:restore-registry
```

Harness 先运行自己的 `pnpm install --frozen-lockfile && pnpm build:lib`。链接仅更改生成的 `node_modules`，不改提交的依赖版本；它会覆盖 Starter 的完整 DSH 依赖图，包括 Store、Invariants 和新增的 Layout 依赖，并统一每个已安装插件 workspace 的 Cordis 身份；原 pnpm 链接逐项记录并恢复。插件 Client 测试依赖仍以 rc.1 留在各自 workspace 内，构建后的 Starter 负责验证 alpha.5 Client API。本次调用关闭 pnpm 的运行前依赖验证，避免嵌套脚本自动恢复 registry 链接。该覆盖流程是维护者显式执行的兼容检查，不属于最小化的每 PR CI 图；[隔离的 rc.1/rc.2 WebUI 证据](../../pr-assets/dsh-rc1-compat/README.md)记录了正式 Host 行为。

## 发布

官方包采用独立版本，Starter 固定经过验证的组合。Changeset、冻结制品、Registry 验证与失败恢复见[发布流程](./releasing.md)。

## 文档、存储与历史证据

保持中英文页面一致、公开示例可执行。Mermaid 表达归属和流程；真实截图位于 `docs/assets`。不保留空目录占位或历史转发文件。

没有明确迁移方案与测试前，保留持久格式及配置键。存储改动须验证锁、原子 rename、修订、损坏输入和复制数据根上的升级/回退。

v0.3 benchmark 是冻结的历史结果，不是本架构的性能证明。失效的可执行评估框架已移出工作树；[发布记录](../releases/v0.3.0.md) 链接到固定版本历史源码。当前验收入口为上述脚本。
