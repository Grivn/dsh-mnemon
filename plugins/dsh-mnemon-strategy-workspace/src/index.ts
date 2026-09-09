import type { Context } from '@deepseek-ai/cordis'
import { defineMemoryPlugin, defineMemoryStrategyConfiguration, installMemory } from 'dsh-mnemon/extension-sdk'
import { WORKSPACE_STRATEGY } from './strategy.ts'
export const name = 'dsh-mnemon-strategy-workspace'
export const inject = ['mnemonMemory']
export const memoryPlugin = defineMemoryPlugin({ packageName: name, label: { en: 'Workspace context', 'zh-CN': '工作区上下文' }, description: { en: 'Compose independent workspace Sources.', 'zh-CN': '组合独立的工作区 Source。' }, roles: ['strategy'], provides: [{ id: 'strategy' }, { id: 'strategy.workspace' }], requires: ['source'] })
export const memoryStrategyConfiguration = defineMemoryStrategyConfiguration({ kind: 'strategy', typeId: 'workspace', label: memoryPlugin.label, description: memoryPlugin.description, fields: [], create: () => ({ plugin: memoryPlugin, strategies: [WORKSPACE_STRATEGY] }) })
export function apply(ctx: Context): void { installMemory(ctx, memoryStrategyConfiguration.create({})) }
export { WORKSPACE_STRATEGY }
