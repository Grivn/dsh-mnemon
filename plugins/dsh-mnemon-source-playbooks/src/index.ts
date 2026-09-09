import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import { defineMemoryPlugin, installMemory, memoryConfigurationDigest } from 'dsh-mnemon/extension-sdk'
import { createRecordSource, type RecordSourceConfig } from 'dsh-mnemon-workspace-kit'
import { sourceOptions } from './source.ts'
export const name = 'dsh-mnemon-source-playbooks'
export const inject = ['mnemonMemory']
export type Config = RecordSourceConfig
export const Config = z.object({ dataDir: z.string() }) as z<Config>
export const memoryPlugin = defineMemoryPlugin({
 packageName: name, label: { en: 'Playbooks', 'zh-CN': '工作方法' },
 description: { en: 'Reusable skills and prompts, reviewed before activation.', 'zh-CN': '经审核后启用的可复用技能和提示词。' }, roles: ['source'], provides: [{ id: 'source' }, { id: 'source.instruction-library' }],
})
export function apply(ctx: Context, config: Config = {}): void {
 installMemory(ctx, { plugin: memoryPlugin, sources: [createRecordSource(sourceOptions, config)] }, { effectiveDigest: memoryConfigurationDigest(config) })
}
export { sourceOptions }
