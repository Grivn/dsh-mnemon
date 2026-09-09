# DeepSeek V4 Flash Runtime 容量压力测试

[English](README.md) · [实测结果](results.json) · [修复前故障](before-fixes.json)

2026-09-09，三组容量与数据完整性场景全部通过：**240 次写入、38 次自动归档**，已提交原文没有丢失或改变。另一次带引号输入诊断完成 **96 次写入、17 次归档**。全部 DSH 模型请求及观测到的响应均为 `deepseek-v4-flash`，关闭思考模式，从未选择 Pro。

主题分类并不完美：子代理场景结束时，**95 条冷记忆中有 10 条位于同项目的其他授权主题空间，并有 3 个重复副本**。这是单独报告的质量限制，不代表路由完全准确。硬性检查要求原文保留、容量合规、目标已授权以及任务释放。

## 工作负载与结果

测试模拟 [issue #203](https://github.com/omdsh-dev/dsh-mnemon/issues/203)：四个并行工作流共享一个项目的默认 **10,240 字节 MEMORY**。合成中文事实覆盖后端、前端、安卓和运维，包含独立记录标识、配置键和数字约束。每个并发写入者每轮提交三条事实，共八轮。环境为 macOS arm64、Native CLI `0.2.7`、正式发布的 DSH `0.1.2-rc.1` 和 Node `v25.1.0`。

| 场景 | 写入 | 归档 | 热记忆最高字节数 | 最终热 / 冷条目 | 耗时 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 四个持续存在的主会话，一个 Native 空间 | 96 | 16 | 10,235 | 11 / 94 | 67.5 秒 |
| 四个并发子代理，四个 Native 空间 | 96 | 16 | 10,229 | 13 / 95 | 244.0 秒 |
| 关闭所有用户会话，通过 Web RPC 依次写入四类事实 | 48 | 6 | 10,237 | 12 / 45 | 76.5 秒 |

主测试共提交 163,440 字节不同事实。每轮检查全部记录标识，并把工具实际收到的规范化原文与 Runtime、Native Recall 的合并结果逐条比较。240 次提交均与计划文本一致。已经归档的事实仍可能保留在热记忆中，所以冷热条目数之和不等于独立事实总数。

两个并发场景均达到四路模型请求和四个重叠的写入调用。子代理使用真实委派写入，`maxDepth: 1`，由 80 个独立维护任务 Agent 完成归档。Web 场景在写入前释放四个父会话，创建了 30 个维护任务，并在每轮结束后检查没有残留根 Agent。维护任务全部释放，未出现路由降级或工具错误。

主测试共观测到 275 次 Flash 调用，报告输入 441,228 tokens、输出 77,231 tokens。工具写入 p95 延迟为：单空间场景 **834 毫秒**，多空间子代理场景 **14,157 毫秒**，包含排队和真实模型路由时间。RPC 写入没有单独测量每次延迟，这些结果不构成生产延迟承诺。

## 发现并修复的问题

1. **Native 语义去重阻塞精确归档。** 独立 CLI 探针输入三条相似但不同的事实，只导入一条、跳过两条。真实子代理场景随后停在 14 次成功写入、零次完成归档：Host 正确拒绝了缺少精确持久化证据的跳过回执。Native Provider 现在从只读命名空间快照复用完全相同的内容，合并批内重复项，再用 `--no-diff` 导入剩余原文；导入数量、索引和精确回执仍须通过验证，普通 `remember` 保持 CLI 原有语义。
2. **进程输出逐块解码损坏中文。** 带引号输入诊断在 84 次写入、13 次归档后，把 `backend.rule.4，验证端口` 读成了 `backend.rule.4���验证端口`。两个进程辅助模块原先都逐个解码缓冲区。现在各模块分别维护 stdout、stderr 的 UTF-8 解码状态，在关闭时完成解码，输出限制仍按两路原始字节合计计算。确定性测试逐字节拆分交错输出，同时覆盖超限拒绝和末尾不完整字符。

修复后，同样的带引号输入诊断完成 96 次写入、17 次归档，没有缺失、改变或重复的冷记忆。Flash 在全部 96 次工具提交中都保留了外围引号，这种模型输入变化单独计数；存储完整保留了实际提交内容。

Native 修复归 Provider 所有；进程修复分别留在 Source 和 Host。没有增加跨包私有导入、Source/Provider 契约、持久化格式或 Core 容量策略。发生变化的制品均有 patch changeset。

## 复现

使用[可选集成测试](../../../tests/runtime-capacity-flash-stress.spec.ts)，[results.json](results.json) 中记录了被测源文件哈希。基线为 `583842c2847bfb1f0bf4423cc41c261fd4b941d9` 加上本 PR 的修复。先通过 `DEEPSEEK_API_KEY` 提供凭据，通过 `MNEMON_NATIVE_TEST_CLI` 提供已验证的二进制，再执行：

```sh
MNEMON_RUN_FLASH_STRESS=1 MNEMON_FLASH_STRESS_ROUNDS=8 MNEMON_FLASH_STRESS_REPORT=/tmp/mnemon-flash-stress.json pnpm exec vitest run tests/runtime-capacity-flash-stress.spec.ts
MNEMON_RUN_FLASH_STRESS=1 MNEMON_FLASH_STRESS_ROUNDS=8 MNEMON_FLASH_STRESS_JSON_PROMPT=1 MNEMON_FLASH_STRESS_REPORT=/tmp/mnemon-flash-json.json pnpm exec vitest run tests/runtime-capacity-flash-stress.spec.ts -t 'four concurrent root'
```

测试需要明确开启真实 API 使用，在网络发出前拒绝非 Flash 请求，核对观测到的模型 id，并把每个场景限制在 240 次模型调用内。测试创建并清理临时 Native 存储和 DSH 会话，普通 CI 跳过这三项真实测试。报告中的 `configuredRounds` 为八；无会话场景运行一半轮数。延迟分位数采用最近秩方法。

## 结果解释与限制

- 原文完整性、范围授权和默认容量限制通过。主题匹配单独计量：子代理场景为 85/95 条冷记忆匹配预期主题，无会话场景为 45/45。保留在热记忆中的事实再次归档到其他授权空间时可能产生跨空间副本。精确去重以 Native 命名空间为边界，不能保证全局语义选择稳定。
- 所有数据都是隔离的合成数据。测试覆盖真实模型工具、管理 RPC 和自动容量维护；为控制负载，关闭了空闲召回和提炼，不代表自然对话中的自动记忆捕获质量。
- 这是在 macOS 上复现共享记忆负载，没有执行 Windows 测试。未验证其他真实 Provider、多个独立 DSH 进程争用同一存储、超大历史冷记忆库、长时间运行或不同远端账号配置。
- 结果记录最终成功测试及两项独立诊断的缺陷，不包含凭据、个人记忆、本机用户路径或会话记录。测试脚本可在本地输出逐次调用测量；提交的 JSON 保留汇总、检查点、错误计数和合成数据的错配标识。

## 仓库验证

修复后，下列命令均以退出码 0 完成：

```sh
pnpm_config_verify_deps_before_run=false pnpm run verify
pnpm_config_verify_deps_before_run=false pnpm run verify:plugins --skip-build
```

完整验证通过文档检查、类型检查、确定性构建、工作区插件构建和测试、**834 项根项目测试**、真实隔离 Headless 激活和包检查。普通验证跳过三项真实 Flash 测试，这三项已按上文独立执行。Memory Spaces 通过 163 项测试，普通运行中跳过 Windows 专属测试和显式 Native smoke；压力测试另使用了真实 Native CLI。Native Provider 的八项测试和两个模块的六项 UTF-8 测试均通过。

首次完整验证发现一个 Source 测试夹具仍预期语义更新回执，现在改为核对 `--no-diff` 和新增回执，Provider 测试明确拒绝导入中的更新或跳过回执；修改后完整重跑通过。上游 UI 的既有 sourcemap 提示没有影响结果。

独立制品验证在工作区外验证了 **16 个插件仓库、17 个打包制品**，包括独立安装、类型检查、测试、构建，外部公开 SDK 消费者，真实打包 Starter 激活，以及三个可选 Strategy 同时启用。相关输出如下，已移除终端装饰和本机路径：

```text
Test Files  77 passed | 1 skipped (78)
     Tests  834 passed | 3 skipped (837)
Verified Headless profile activation with 39 total tools and 8 representative Mnemon tools.
Verified buildin-to-builtin persistence, preservation of unrelated settings/comments, and an idempotent Headless restart.
Verified that disabling the legacy mnemon Entry disables the complete Starter without blocking DSH startup.
Verified 16 independent plugin repositories and 17 packed artifacts with 4 workers, public SDK-only composition and Client tests.
```
