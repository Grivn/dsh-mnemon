import type { Context } from '@deepseek-ai/cordis'
import { defineMemoryPlugin, defineMemoryStrategyConfiguration, installMemory } from 'dsh-mnemon/extension-sdk'
import { defineWorkspacePolicy, validateWorkspacePolicy } from 'dsh-mnemon-strategy-workspace/extension-sdk'

export const name = 'dsh-mnemon-strategy-focus'
export const inject = ['mnemonMemory']
export interface Config { sourceKeys?: string[]; writableSourceKeys?: string[]; maxProjectionCharacters?: number }
export const memoryPlugin = defineMemoryPlugin({
  packageName: name, label: { en: 'Focused context', 'zh-CN': '专注上下文' },
  description: { en: 'Choose Sources and reduce context for the current work.', 'zh-CN': '选择参与当前工作的 Source 并控制上下文长度。' },
  roles: ['strategy-extension'], provides: [{ id: 'strategy.workspace.focus', exclusive: true }], requires: ['strategy.workspace'],
})
export function createFocusExtension(config: Config = {}) {
  const captured = structuredClone(config)
  const selection = captured.sourceKeys === undefined ? undefined : validateWorkspacePolicy('focus', {
    sourceKeys: captured.sourceKeys, ...(captured.writableSourceKeys === undefined ? {} : { writableSourceKeys: captured.writableSourceKeys }), maxProjectionCharacters: captured.maxProjectionCharacters ?? 8192,
  })
  // Validate both the budget and an independent writable selection at installation.
  validateWorkspacePolicy('focus', { sourceKeys: captured.writableSourceKeys ?? [], maxProjectionCharacters: captured.maxProjectionCharacters ?? 8192 })
  return defineWorkspacePolicy({ typeId: 'focus', packageName: name, slot: 'focus', contribute: (_request, sources) => selection ?? {
    sourceKeys: sources.map(source => source.sourceInstanceKey).sort(),
    ...(captured.writableSourceKeys === undefined ? {} : { writableSourceKeys: captured.writableSourceKeys }),
    maxProjectionCharacters: captured.maxProjectionCharacters ?? 8192,
  } })
}
export const memoryStrategyConfiguration = defineMemoryStrategyConfiguration({
  kind: 'strategy-extension', typeId: 'focus', label: memoryPlugin.label, description: memoryPlugin.description,
  fields: [
    { key: 'sourceKeys', input: 'source-list', label: { en: 'Sources in priority order', 'zh-CN': '参与 Source（按优先顺序）' }, description: { en: 'Unset selects all installed Sources. An explicit empty list selects none.', 'zh-CN': '未设置时使用已安装的 Source；明确留空则不选择任何 Source。' } },
    { key: 'writableSourceKeys', input: 'source-list', label: { en: 'Writable Sources', 'zh-CN': '允许写入的 Source' }, description: { en: 'Unset preserves permissions. An empty list makes the View read-only.', 'zh-CN': '未设置时保留原有权限；明确留空使 View 只读。' } },
    { key: 'maxProjectionCharacters', input: 'number', label: { en: 'Context character budget', 'zh-CN': '上下文字符预算' }, defaultValue: 8192, minimum: 1, maximum: 65536 },
  ], create: config => ({ plugin: memoryPlugin, strategyExtensions: [createFocusExtension(config as Config)] }),
})
export function apply(ctx: Context, config: Config = {}): void { installMemory(ctx, { plugin: memoryPlugin, strategyExtensions: [createFocusExtension(config)] }) }
