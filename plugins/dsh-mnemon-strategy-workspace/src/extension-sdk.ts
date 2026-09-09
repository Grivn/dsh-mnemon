import { defineMemoryStrategyExtension, memoryInputInteger, memoryInputRecord, memoryInputStringArray, memoryInputText } from 'dsh-mnemon/extension-sdk'
import { COMPOSABLE_MEMORY_API_VERSION, type MemoryAvailableSource, type MemoryJsonValue, type MemoryStrategyContribution, type MemoryStrategyExtensionDefinition, type MemoryViewRequest } from 'dsh-mnemon/contracts'

export type WorkspacePolicies = {
  focus: { sourceKeys: string[]; writableSourceKeys?: string[]; maxProjectionCharacters: number }
  capture: { instruction: string; reminders?: Array<{ sourceKey: string; instruction: string }> }
  review: { interval: number; instruction: string }
  prompts: { instruction: string }
  collaboration: { instruction: string }
}
export type WorkspacePolicySlot = keyof WorkspacePolicies
export function validateWorkspacePolicy<K extends WorkspacePolicySlot>(slot: K, value: MemoryJsonValue): WorkspacePolicies[K] {
  const input = memoryInputRecord(value, 'workspace policy')
  const allowed = slot === 'focus' ? ['sourceKeys', 'writableSourceKeys', 'maxProjectionCharacters'] : slot === 'review' ? ['interval', 'instruction'] : slot === 'capture' ? ['instruction', 'reminders'] : ['prompts', 'collaboration'].includes(slot) ? ['instruction'] : []
  if (!allowed.length || Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Unsupported workspace policy field or slot')
  if (slot === 'focus') {
    const sourceKeys = memoryInputStringArray(input.sourceKeys, 'sourceKeys', 32) ?? []
    const writableSourceKeys = input.writableSourceKeys === undefined ? undefined : memoryInputStringArray(input.writableSourceKeys, 'writableSourceKeys', 32) ?? []
    if (sourceKeys.some(key => !/^source:[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,292}$/.test(key)) || new Set(sourceKeys).size !== sourceKeys.length
      || writableSourceKeys?.some(key => !sourceKeys.includes(key))) throw new Error('Focus needs distinct Source keys and a writable subset')
    return { sourceKeys, ...(writableSourceKeys ? { writableSourceKeys } : {}), maxProjectionCharacters: memoryInputInteger(input.maxProjectionCharacters, 8192, 1, 65536) } as WorkspacePolicies[K]
  }
  if (slot === 'capture' && input.reminders !== undefined) {
    if (!Array.isArray(input.reminders) || input.reminders.length > 32) throw new Error('Capture reminders must be a bounded list')
    const reminders = input.reminders.map(value => { const item = memoryInputRecord(value, 'capture reminder'); if (Object.keys(item).some(key => !['sourceKey', 'instruction'].includes(key))) throw new Error('Unsupported capture reminder field'); return { sourceKey: memoryInputText(item.sourceKey, 'sourceKey', 300)!, instruction: memoryInputText(item.instruction, 'instruction', 1000)! } })
    return { instruction: memoryInputText(input.instruction, 'instruction', 4000)!, reminders } as WorkspacePolicies[K]
  }
  return { instruction: memoryInputText(input.instruction, 'instruction', 4000)!, ...(slot === 'review' ? { interval: memoryInputInteger(input.interval, 5, 1, 1000) } : {}) } as WorkspacePolicies[K]
}
export function defineWorkspacePolicy<K extends WorkspacePolicySlot>(value: {
  typeId: string; packageName: string; slot: K
  contribute(request: MemoryViewRequest, sources: readonly MemoryAvailableSource[]): WorkspacePolicies[K]
}): MemoryStrategyExtensionDefinition {
  return defineMemoryStrategyExtension({ manifest: { apiVersion: COMPOSABLE_MEMORY_API_VERSION, kind: 'strategy-extension', typeId: value.typeId, packageName: value.packageName, strategyTypeId: 'workspace', slot: value.slot, deterministic: true },
    contribute: (request, sources) => validateWorkspacePolicy(value.slot, value.contribute(request, sources)) })
}
export function workspacePolicies(contributions: readonly MemoryStrategyContribution[]): Partial<WorkspacePolicies> {
  const output: Partial<WorkspacePolicies> = {}
  for (const contribution of contributions) {
    const slot = contribution.slot as WorkspacePolicySlot
    if (Object.hasOwn(output, slot)) throw new Error('Duplicate workspace policy slot: ' + slot)
    Object.assign(output, { [slot]: validateWorkspacePolicy(slot, contribution.value) })
  }
  return output
}
