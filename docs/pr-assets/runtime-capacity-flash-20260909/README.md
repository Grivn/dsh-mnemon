# Runtime capacity pressure with DeepSeek V4 Flash

[简体中文](README.zh-CN.md) · [Measured results](results.json) · [Failures before the fixes](before-fixes.json)

On 2026-09-09, all three capacity and data-integrity scenarios passed: **240 writes and 38 automatic archives**, with no lost or changed committed content. A separate quoted-input diagnostic passed another **96 writes and 17 archives**. Every DSH model request and observed response used `deepseek-v4-flash`, with thinking disabled. Pro was never selected.

Topic classification was imperfect: the child-writer scenario ended with **10 of 95 cold rows in another authorized topic space and 3 duplicate cold copies**. These are reported quality limits, not evidence of perfect routing. The hard checks require exact data retention, capacity compliance, authorized destinations and task cleanup.

## Workload and results

The workload models [issue #203](https://github.com/omdsh-dev/dsh-mnemon/issues/203): four simultaneous workstreams share one project's default **10,240-byte MEMORY**. Synthetic Chinese facts describe backend, frontend, Android and operations, with distinct record ids, configuration keys and numeric constraints. Each concurrent writer submits three facts per wave, for eight waves. Native CLI `0.2.7`, published DSH `0.1.2-rc.1`, and Node `v25.1.0` ran on macOS arm64.

| Scenario | Writes | Archives | Maximum hot bytes | Final hot / cold rows | Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Four long-lived root sessions, one Native space | 96 | 16 | 10,235 | 11 / 94 | 67.5 s |
| Four concurrent child writers, four Native spaces | 96 | 16 | 10,229 | 13 / 95 | 244.0 s |
| No open user sessions, sequential browser RPC writes across four workstreams | 48 | 6 | 10,237 | 12 / 45 | 76.5 s |

The main run submitted 163,440 bytes of distinct facts. Each checkpoint checked all requested ids and the exact normalized text actually submitted to the tool against Runtime plus Native Recall. All 240 model/tool submissions matched the planned text. An archived fact can also remain hot, so hot and cold row counts must not be added as a count of unique facts.

Both concurrent scenarios reached four simultaneous model requests and four overlapping write dispatches. The child scenario used real delegated writers with `maxDepth: 1`; archival succeeded through 80 independent maintenance task Agents. The browser scenario disposed all four parent handles before writing, created 30 maintenance tasks, and checked that no root Agents remained after every wave. No maintenance tasks leaked; no routing fallback or tool error occurred.

The main run made 275 observed Flash calls, reporting 441,228 input tokens and 77,231 output tokens. Tool-write p95 latency was **834 ms** for the single-space scenario and **14,157 ms** for the multi-space child scenario. These timings include queueing and real model routing. RPC write latency was not individually instrumented. No production latency guarantee is implied.

## Defects found and repaired

1. **Native semantic deduplication blocked exact archival.** A standalone CLI probe imported only one of three similar but distinct facts and skipped two. The real child workload then stopped at 14 successful writes and zero completed archives: the Host correctly refused a skipped receipt without exact durable evidence. The Native Provider now reuses exact content from a readonly namespace snapshot, groups identical pending content and imports the remaining originals with `--no-diff`. It validates counts, indexes and exact receipts; ordinary `remember` retains normal CLI semantics.
2. **Subprocess output decoding corrupted split Chinese characters.** At 84 writes and 13 archives, the quoted-input diagnostic observed `backend.rule.4，验证端口` as `backend.rule.4���验证端口`. Both process helpers decoded each buffer separately. Each owning module now maintains separate UTF-8 decoders for stdout and stderr, flushes at close, and still bounds combined raw bytes. Deterministic tests split every byte of interleaved multibyte output and cover byte-limit rejection and incomplete final characters.

After the fixes, the same quoted-input diagnostic completed 96 writes and 17 archives with zero missing, changed or duplicate cold facts. Flash included surrounding quotes in all 96 tool submissions; that model-input difference is recorded separately. Storage preserved the actual submissions exactly.

The Native fix belongs to the Provider. The subprocess fixes stay in their respective Source and Host modules. No new cross-package private imports, Source/Provider contracts, storage formats or Core capacity policy were introduced. Patch changesets cover the changed artifacts.

## Reproduce

Use the [opt-in integration test](../../../tests/runtime-capacity-flash-stress.spec.ts) and the checked-in source hashes in [results.json](results.json). The baseline is `583842c2847bfb1f0bf4423cc41c261fd4b941d9` plus this PR's fixes. Supply the credential through `DEEPSEEK_API_KEY` and a verified binary through `MNEMON_NATIVE_TEST_CLI` before running:

```sh
MNEMON_RUN_FLASH_STRESS=1 MNEMON_FLASH_STRESS_ROUNDS=8 MNEMON_FLASH_STRESS_REPORT=/tmp/mnemon-flash-stress.json pnpm exec vitest run tests/runtime-capacity-flash-stress.spec.ts
MNEMON_RUN_FLASH_STRESS=1 MNEMON_FLASH_STRESS_ROUNDS=8 MNEMON_FLASH_STRESS_JSON_PROMPT=1 MNEMON_FLASH_STRESS_REPORT=/tmp/mnemon-flash-json.json pnpm exec vitest run tests/runtime-capacity-flash-stress.spec.ts -t 'four concurrent root'
```

The suite requires explicit live-API opt-in, rejects non-Flash requests before network dispatch, checks observed model ids, and caps each scenario at 240 model calls. It creates disposable Native stores and DSH sessions and cleans them up. Ordinary CI skips the three live tests. The report's `configuredRounds` is eight; the session-free case runs half as many waves. Latency percentiles use the nearest-rank method.

## Interpretation and limits

- Exact content, scope authorization and the default capacity limit passed. Topic matching is a separate model-quality measurement: 85/95 child-scenario cold rows matched their intended topic, and 45/45 session-free cold rows matched. Re-routing retained hot facts to another authorized space can produce cross-space duplicates. Exact deduplication is local to each Native namespace; it cannot enforce globally stable semantic choices.
- All data was synthetic and isolated. The test exercises real model tools and management RPC with automatic capacity maintenance; idle recall/distillation was disabled to control the workload. It does not establish natural-conversation capture quality.
- This is a macOS reproduction of the shared-memory workload, not a Windows execution. Other live Providers, separate DSH processes racing the same store, very large existing cold databases, prolonged uptime and remote account configurations were not tested.
- Results summarize successful final runs and two independently diagnosed defects. They exclude credentials, personal memory, local user paths and session transcripts. The script can emit full per-call measurements locally; the committed JSON retains aggregates, checkpoints, error counters and synthetic mismatch ids.

## Repository verification

Both commands completed with exit code 0 after the fixes:

```sh
pnpm_config_verify_deps_before_run=false pnpm run verify
pnpm_config_verify_deps_before_run=false pnpm run verify:plugins --skip-build
```

The full gate passed documentation checks, typechecks, deterministic builds, workspace plugin builds/tests, **834 root tests**, real isolated Headless activation and package validation. The three live Flash tests are skipped by this ordinary gate and were run separately above. Memory Spaces passed 163 tests, with its Windows-only and explicit Native smoke tests skipped in the ordinary run; the pressure suite separately used the real Native CLI. The Native Provider's eight tests and both modules' six UTF-8 tests passed.

The first full gate found one Source test fixture still expecting a semantic `updated` receipt. It now checks `--no-diff` and inserted receipts, while the Provider tests explicitly reject updated or skipped import receipts. The entire gate was rerun successfully. Existing upstream UI sourcemap warnings were non-fatal.

The independent-artifact gate verified **16 plugin repositories and 17 packed artifacts** outside the workspace, including standalone install/typecheck/test/build, an external public-SDK consumer, real packed Starter activation and all three optional Strategy plugins together. Relevant output, without terminal decoration or local paths:

```text
Test Files  77 passed | 1 skipped (78)
     Tests  834 passed | 3 skipped (837)
Verified Headless profile activation with 39 total tools and 8 representative Mnemon tools.
Verified buildin-to-builtin persistence, preservation of unrelated settings/comments, and an idempotent Headless restart.
Verified that disabling the legacy mnemon Entry disables the complete Starter without blocking DSH startup.
Verified 16 independent plugin repositories and 17 packed artifacts with 4 workers, public SDK-only composition and Client tests.
```
