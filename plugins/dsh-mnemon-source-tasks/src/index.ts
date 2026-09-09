import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import { defineMemoryPlugin, installMemory, memoryConfigurationDigest } from 'dsh-mnemon/extension-sdk'
import { createRecordSource, type RecordSourceConfig } from 'dsh-mnemon-workspace-kit'
import { sourceOptions } from './source.ts'
export const name = 'dsh-mnemon-source-tasks'
export const inject = ['mnemonMemory']
export type Config = RecordSourceConfig
export const Config = z.object({ dataDir: z.string() }) as z<Config>
export const memoryPlugin = defineMemoryPlugin({
 packageName: name, label: { en: 'Tasks', 'zh-CN': '任务清单' },
 description: { en: 'Personal, work, project and daily tasks with review and deadlines.', 'zh-CN': '个人、工作、项目和每日任务，支持审核与截止日期。' }, roles: ['source'], provides: [{ id: 'source' }, { id: 'source.task-context' }],
})
export function apply(ctx: Context, config: Config = {}): void {
 installMemory(ctx, { plugin: memoryPlugin, sources: [createRecordSource(sourceOptions, config)] }, { effectiveDigest: memoryConfigurationDigest(config) })
}
export { sourceOptions }
