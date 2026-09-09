import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import { defineMemoryPlugin, installMemory, memoryConfigurationDigest } from 'dsh-mnemon/extension-sdk'
import { createRecordSource, type RecordSourceConfig } from 'dsh-mnemon-workspace-kit'
import { sourceOptions } from './source.ts'
export const name = 'dsh-mnemon-source-journal'
export const inject = ['mnemonMemory']
export type Config = RecordSourceConfig
export const Config = z.object({ dataDir: z.string() }) as z<Config>
export const memoryPlugin = defineMemoryPlugin({
 packageName: name, label: { en: 'Activity journal', 'zh-CN': '活动日志' },
 description: { en: 'Project progress, daily activity and feedback with durable history.', 'zh-CN': '项目进展、每日活动与反馈的持久记录。' }, roles: ['source'], provides: [{ id: 'source' }, { id: 'source.activity-log' }],
})
export function apply(ctx: Context, config: Config = {}): void {
 installMemory(ctx, { plugin: memoryPlugin, sources: [createRecordSource(sourceOptions, config)] }, { effectiveDigest: memoryConfigurationDigest(config) })
}
export { sourceOptions }
