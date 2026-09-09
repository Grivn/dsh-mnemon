import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import { defineMemoryPlugin, installMemory, memoryConfigurationDigest } from 'dsh-mnemon/extension-sdk'
import { createRecordSource, RecordStore, sourceRecordDirectory, type RecordSourceConfig } from 'dsh-mnemon-workspace-kit'
import { installAgentHooks } from 'dsh-mnemon-workspace-kit/dsh'
import { captureJournalEvent } from './lifecycle.ts'
import { sourceOptions } from './source.ts'
export const name = 'dsh-mnemon-source-journal'
export const inject = ['mnemonMemory', 'agents']
export interface Config extends RecordSourceConfig { captureTurns?: boolean; captureFeedback?: boolean }
export const Config = z.object({ dataDir: z.string(), captureTurns: z.boolean().default(false), captureFeedback: z.boolean().default(true) }) as z<Config>
export const memoryPlugin = defineMemoryPlugin({
 packageName: name, label: { en: 'Activity journal', 'zh-CN': '活动日志' },
 description: { en: 'Project progress, daily activity and feedback with durable history.', 'zh-CN': '项目进展、每日活动与反馈的持久记录。' }, roles: ['source'], provides: [{ id: 'source' }, { id: 'source.activity-log' }],
})
export function apply(ctx: Context, config: Config = {}): void {
 const base = createRecordSource(sourceOptions, config)
 const source = { ...base, create(context: Parameters<typeof base.create>[0]) {
   const runtime = base.create(context), store = new RecordStore(sourceRecordDirectory('journal', context, config))
   const stop = installAgentHooks(ctx, { event: (agent, event, signal) => captureJournalEvent(store, agent, event, config, signal), error(error) { ctx.logger(name).warn('Journal capture: %s', String(error)) } })
   return { ...runtime, async dispose() { await stop(); await runtime.dispose?.() } }
 } }
 installMemory(ctx, { plugin: memoryPlugin, sources: [source] }, { effectiveDigest: memoryConfigurationDigest(config) })
}
export { sourceOptions }
