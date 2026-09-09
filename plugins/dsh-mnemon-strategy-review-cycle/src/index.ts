import type { Context } from '@deepseek-ai/cordis'
import type { MemoryJsonValue } from 'dsh-mnemon/contracts'
import { defineMemoryPlugin, defineMemoryStrategyConfiguration, installMemory } from 'dsh-mnemon/extension-sdk'
import { defineWorkspacePolicy } from 'dsh-mnemon-strategy-workspace/extension-sdk'
export const name = 'dsh-mnemon-strategy-review-cycle'
export const inject = ['mnemonMemory']
const instruction = "Check the review Source for due reviews. Distill at most two durable proposals and one reusable skill after repeated evidence. Preserve the due flag until review is completed. Do not automatically activate, delete or overwrite existing records."
export const memoryPlugin = defineMemoryPlugin({ packageName: name, label: { en: 'Periodic review', 'zh-CN': '定期审查' }, description: { en: 'Periodic review through the workspace Strategy.', 'zh-CN': '通过工作区策略提供定期审查。' }, roles: ['strategy-extension'], provides: [{ id: 'strategy-extension' }], requires: ['strategy.workspace'] })
export const memoryStrategyConfiguration = defineMemoryStrategyConfiguration({
 kind: 'strategy-extension', typeId: 'review-cycle', label: memoryPlugin.label, description: memoryPlugin.description,
 fields: [{ key: 'instruction', label: { en: 'Guidance', 'zh-CN': '指导说明' }, input: 'textarea', defaultValue: instruction, maximum: 4000 }, { key: 'interval', label: { en: 'Review interval', 'zh-CN': '审查间隔' }, input: 'number' as const, defaultValue: 5, minimum: 1, maximum: 1000 }],
 create: config => ({ plugin: memoryPlugin, strategyExtensions: [defineWorkspacePolicy({ typeId: 'review-cycle', packageName: name, slot: 'review', contribute: () => ({ instruction: typeof config.instruction === 'string' ? config.instruction : instruction, interval: typeof config.interval === 'number' ? config.interval : 5 }) })] }),
})
export function apply(ctx: Context, config: Record<string, MemoryJsonValue> = {}): void { installMemory(ctx, memoryStrategyConfiguration.create(config)) }
