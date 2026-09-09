import type { Context } from '@deepseek-ai/cordis'
import type { MemoryJsonValue } from 'dsh-mnemon/contracts'
import { defineMemoryPlugin, defineMemoryStrategyConfiguration, installMemory } from 'dsh-mnemon/extension-sdk'
import { defineWorkspacePolicy } from 'dsh-mnemon-strategy-workspace/extension-sdk'
export const name = 'dsh-mnemon-strategy-team-coordination'
export const inject = ['mnemonMemory']
const instruction = "Before editing shared project files, inspect and declare file reservations. Use directed messages and explicit team membership. Report job receipts and current presence; wake idle sessions only as part of an authorized task. Attribute reviewer and teammate messages to their actual sender."
export const memoryPlugin = defineMemoryPlugin({ packageName: name, label: { en: 'Team coordination', 'zh-CN': '团队协作' }, description: { en: 'Team coordination through the workspace Strategy.', 'zh-CN': '通过工作区策略提供团队协作。' }, roles: ['strategy-extension'], provides: [{ id: 'strategy-extension' }], requires: ['strategy.workspace'] })
export const memoryStrategyConfiguration = defineMemoryStrategyConfiguration({
 kind: 'strategy-extension', typeId: 'team-coordination', label: memoryPlugin.label, description: memoryPlugin.description,
 fields: [{ key: 'instruction', label: { en: 'Guidance', 'zh-CN': '指导说明' }, input: 'textarea', defaultValue: instruction, maximum: 4000 }],
 create: config => ({ plugin: memoryPlugin, strategyExtensions: [defineWorkspacePolicy({ typeId: 'team-coordination', packageName: name, slot: 'collaboration', contribute: () => ({ instruction: typeof config.instruction === 'string' ? config.instruction : instruction }) })] }),
})
export function apply(ctx: Context, config: Record<string, MemoryJsonValue> = {}): void { installMemory(ctx, memoryStrategyConfiguration.create(config)) }
