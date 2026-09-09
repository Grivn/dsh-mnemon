import type { Context } from '@deepseek-ai/cordis'
import type { MemoryJsonValue } from 'dsh-mnemon/contracts'
import { defineMemoryPlugin, defineMemoryStrategyConfiguration, installMemory } from 'dsh-mnemon/extension-sdk'
import { defineWorkspacePolicy } from 'dsh-mnemon-strategy-workspace/extension-sdk'
export const name = 'dsh-mnemon-strategy-journal-capture'
export const inject = ['mnemonMemory']
const instruction = "Record meaningful outcomes and exact user feedback in the journal Source. Propose stable project facts through the owning Source; keep preferences in Runtime and reusable methods in Playbooks. Never duplicate a record or infer a preference from one occurrence."
export const memoryPlugin = defineMemoryPlugin({ packageName: name, label: { en: 'Journal capture', 'zh-CN': '日志记录' }, description: { en: 'Prompt progress updates and preserve exact user feedback.', 'zh-CN': '提示记录工作进展，并保留用户的原始反馈。' }, roles: ['strategy-extension'], provides: [{ id: 'strategy-extension' }], requires: ['strategy.workspace'] })
export const memoryStrategyConfiguration = defineMemoryStrategyConfiguration({
 kind: 'strategy-extension', typeId: 'journal-capture', label: memoryPlugin.label, description: memoryPlugin.description,
 fields: [{ key: 'instruction', label: { en: 'Guidance', 'zh-CN': '指导说明' }, input: 'textarea', defaultValue: instruction, maximum: 4000 }],
 create: config => ({ plugin: memoryPlugin, strategyExtensions: [defineWorkspacePolicy({ typeId: 'journal-capture', packageName: name, slot: 'capture', contribute: (_request, sources) => ({ instruction: typeof config.instruction === 'string' ? config.instruction : instruction, reminders: sources.filter(source => source.role === 'activity-log' && source.actionIds.includes('append') && source.hints && typeof source.hints === 'object' && !Array.isArray(source.hints) && source.hints.journalWriteDue === true).map(source => ({ sourceKey: source.sourceInstanceKey, instruction: 'Journal progress is due after several completed human turns without a successful entry. Record the actual outcome through an offered journal append action. This reminder remains until a successful journal write; a pending proposal does not satisfy it.' })) }) })] }),
})
export function apply(ctx: Context, config: Record<string, MemoryJsonValue> = {}): void { installMemory(ctx, memoryStrategyConfiguration.create(config)) }
