# Issue #203 automatic memory acceptance

**English** | [简体中文](./README.zh-CN.md)

**Verdict: full memory-quality acceptance failed.** Four sessions kept working, most current facts were retained and recalled, and every tested formal correction was answered correctly. However, automatic maintenance performed lossy replacements, removed module attribution, retained obsolete documents and persisted transient examples. This reproduces part of the “messy memory” complaint in [issue #203](https://github.com/omdsh-dev/dsh-mnemon/issues/203). Passing the capacity repair does not establish overall automatic-memory quality.

This report tests production commit `fce3873e9669c9a9eefb902b76ca8d0ddbf68700` in [PR #212](https://github.com/omdsh-dev/dsh-mnemon/pull/212), dated 2026-09-09. This addition contains experiments, evidence and documentation; the quality defects below remain unfixed. Every outgoing model request was restricted to `deepseek-v4-flash`, and Flash was the only model observed in responses. Thinking was disabled; Pro was never used.

## Results

Each condition has concurrent backend, frontend, Android and operations sessions sharing project Runtime. Developer prompts request configuration work; the model chooses its memory actions. The actual default lifecycle performs idle review. Developer sessions are then closed and fresh sessions answer questions without their transcripts or development-file access.

| Metric | One space, 12 waves | Four spaces, 12 waves | Four spaces, 24 waves |
|---|---:|---:|---:|
| Developer turns / fresh reader sessions | 48 / 12 | 48 / 12 | 96 / 28 |
| Current facts covered across all memory sources | 35/36, 97.2% | 36/36, 100% | 80/80, 100% |
| Correct fresh answers | 34/36, 94.4% | 36/36, 100% | 74/80, 92.5% |
| Correct answers to formal corrections | 4/4 | 4/4 | 8/8 |
| Stale / cross-module / unsupported answers | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Distinct exact transient markers retained | 0 | 1 | 3 |
| Base config documents still presenting old values | 4 | 4 | 4 |
| Final hot entries / project documents | 22 / 6 | 29 / 5 | 13 / 23 |
| Peak / final hot-memory bytes | 7,095 / 7,095 | 6,684 / 6,684 | 10,079 / 5,615 |
| Automatic idle reviews / model requests | 40 / 321 | 41 / 299 | 85 / 654 |
| Rejected memory tool calls | 1 | 3 | 4 |
| Experiment duration | 4m 34s | 4m 9s | 12m 5s |

The experiments completed 192 developer turns, 52 fresh sessions, 152 answer cells and 166 automatic reviews. Every developer turn's final configuration check passed. Two intermediate test-before-edit checks failed and then recovered in the short four-space condition. Its original scorer labeled these `development-workload-incomplete`; manual adjudication found the work complete. The original flag remains in the evidence, and the committed reporter now distinguishes intermediate failure from final incompletion.

Coverage inspects complete Runtime, Documents and cold-memory content. It does not establish that every source is current, each row is independently understandable, or a fresh reader can retrieve it. All three Vitest experiments completed successfully; all three recorded `automatedVerdict` values are `fail`.

## Comparison with the complaint

| Concern | Acceptance finding |
|---|---|
| Four sessions writing together make memory messy | **Partly reproduced.** No fresh answer borrowed another module's value, but one hot row lost its module label and replacements removed other fields from existing rows. |
| Unwanted material is captured | **Reproduced.** Transient examples were retained inside instructions saying not to save them. The long run reintroduced examples from an earlier explicit no-write turn. |
| Old information survives a correction | **Reproduced.** Runtime updates succeeded while active base documents continued presenting old settings. The long run kept creating supplements. |
| Filling 10K requires manual deletion | **No capacity blockage reproduced here.** No human cleanup occurred; the long run peaked at 10,079 bytes and the model consolidated entries. Some consolidation was lossy. |
| Automatic archival resolves capacity | All three runs recorded zero archive cycles and empty cold stores. Post-archive quality and cold-topic routing are untested here. Repeated archival evidence is in the earlier [capacity pressure report](../runtime-capacity-flash-20260909/README.md). |

## Concrete findings

1. **The maintenance model treated whole-entry replacement as substring editing.** In long-run wave 21, a frontend row contained the module label and 11 fields. The model selected a substring as `old_text` but supplied only the tail plus a new field as `content`, removing the module name and seven original fields from that row. In wave 23, its port correction supplied only port and retry fields, removing `timeout_ms=1800`. Successful calls and before/after snapshots establish this directly. The [Action replaces a complete entry](../../../plugins/dsh-mnemon-source-runtime/src/source.ts); Source applied the submitted content. Capacity archival was not invoked. See `long-four.lossyReplacements` in [observations.json](./observations.json).
2. **Retention and usable recall diverged.** The short single-space frontend port existed, yet a fresh session answered unknown. Operations handoff was never captured, although the review receipt claimed it had been saved. All six long-run unknowns concern frontend timeout, cache TTL, queue, batch size, backoff and health path. Those values remain in documents. Readers searched empty cold memory for several missing values without proceeding to document search, while document search recovered retention, partition and audit values. These unknowns cannot all be attributed to storage-engine data loss.
3. **Old documents conflict with current memory.** Both short runs retained four base documents presenting retry limits 3/5/7/9 while Runtime held 11/13/17/19. The long run also changed ports, leaving both old ports and retry limits in its four base documents. Reviewers respected the [create-only document boundary](../../../src/host/subagent.ts), sometimes explicitly acknowledging obsolete documents. Supplements accumulated to 23 documents. Effective supersession and correction relationships remain a gap.
4. **Do-not-persist examples were persisted.** The short four-space run retained `TEMP_USER_android` in a negative rule. A frontend document created in long-run wave 13 described `NO_MEMORY_frontend` and `FAKE_CREDENTIAL_frontend` as do-not-persist artifacts while retaining the literal strings. They came from explicit no-write wave 10. They were not accepted as real configuration or credentials, but are unnecessary retained material. No successful mutation occurred during the no-write turn or fresh questions themselves; that per-turn metric missed later reintroduction from history.
5. **Guards rejected invalid calls, but model operations were inconsistent.** Eight errors included an old result-tool name, an unavailable tool, missing fields, malformed branch names and deletion of nonexistent entries. All runs continued to completion; those rejected calls did not visibly delete data. The single-space run had two duplicated hot facts. The long run duplicated backend port, frontend handoff/retry and checkpoint information, and left one hot row without module attribution. All 98 final rows were inspected; see [final-memory.json](./final-memory.json).

## Method, thresholds and limits

The frozen thresholds required at least 90% current-fact coverage and fresh-answer accuracy, all corrected facts answered correctly, and zero transient markers, stale answers, cross-module answers, unsupported guesses, successful mutations in no-write turns, exact cold duplicates or capacity overruns. Execution errors additionally failed the automated verdict. Manual review inspected all final content and wrong/unknown answers. [protocol.json](./protocol.json) preserves the preregistered setup, initial harness hashes and extension rationale; [workload.json](./workload.json) holds actual inputs; [results.json](./results.json) and [observations.json](./observations.json) hold wave metrics and answers. The two-wave calibration pilot is excluded from scored results.

Environment: macOS arm64, Node v25.1.0, published DSH 0.1.2-rc.1 and Native CLI 0.2.7. The suite uses real Flash API calls, DSH AgentLoop/sessions/public fork provider, the default Mnemon lifecycle and independent Sources/Provider. Developer tools read and write temporary JSON configurations and validate all accepted settings. They simulate configuration development, not full frontend/backend/Android builds. Facts, logs and credential examples are synthetic; stores and sessions use disposable directories.

Guided recall/writeback and the default 10,240-byte limit are unchanged. Only idle debounce is shortened from production's 30 seconds to 5; eligibility scoring is unchanged. Each wave runs four sessions concurrently and then waits for automatic review. The short natural workload stayed below capacity, so the extension was defined before a separate 24-wave run. No hot-memory preload was used. Natural consolidation prevented archival even in that run, so these results do not evaluate cold-topic placement.

This bounded simulation uses four sessions in one DSH process and one scored run per condition. It does not establish Windows behavior, independent multi-process operation, a half-day human workflow or general accuracy. Configuration facts remain recoverable from code; denying fresh readers file access isolates the memory system. The short and extended conditions are not a causal comparison of space counts. There were 1,274 model requests; the adapter reported 4,557,451 input tokens and 292,774 output tokens. No billing estimate is inferred.

## Reproduction and follow-up

Provide authorized `DEEPSEEK_API_KEY` and `MNEMON_NATIVE_TEST_CLI` environment variables. The committed suite does not discover personal credentials:

```sh
MNEMON_RUN_FLASH_QUALITY=1 MNEMON_FLASH_QUALITY_REPORT=/tmp/mnemon-flash-quality.json pnpm exec vitest run tests/runtime-memory-flash-quality.spec.ts
MNEMON_RUN_FLASH_QUALITY=1 MNEMON_FLASH_QUALITY_WAVES=24 MNEMON_FLASH_QUALITY_REPORT=/tmp/mnemon-flash-quality-long.json pnpm exec vitest run tests/runtime-memory-flash-quality.spec.ts -t 'four preconfigured'
```

Ordinary CI skips live API experiments. Inspect quality verdicts and retained content after execution. The committed reporter adds whole-report redaction, dynamic revision/hash recording and correct classification of intermediate development checks. Historical verdicts remain unchanged; the workload and production behavior were not modified to improve scores.

Prioritize preserving fields and module attribution during whole-entry replacement, filtering do-not-persist material across later reviews, and connecting base documents with corrections during retrieval. Reduce fragmented documents from routine configuration tasks. These changes belong in Strategy orchestration, explicit Source Action contracts and bounded document supersession/correction cooperation. Core and Provider responsibilities and document protection should remain intact. This acceptance addition does not implement those follow-up fixes.
