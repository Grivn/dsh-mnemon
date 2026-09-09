import { describe, expect, it } from 'vitest'
import { DEFAULT_MEMORY_VIEW_BUDGET, type MemoryAvailableSource } from 'dsh-mnemon/contracts'
import { WORKSPACE_STRATEGY, WORKSPACE_SOURCE_ROLES } from '../src/strategy.ts'
import { validateWorkspacePolicy } from '../src/extension-sdk.ts'
const source = (role: string, index: number): MemoryAvailableSource => ({ sourceInstanceKey: 'source:item-' + index, sourceTypeId: role, role, availability: 'ready', revision: 'r1', capabilities: ['project', 'recall', 'write'], routeIds: ['search'], actionIds: ['propose'],
  routes: [{ id: 'search', description: 'Search', capability: 'recall', inputSchema: {}, maxCalls: 2 }],
  actions: [{ id: 'propose', description: 'Propose', capability: 'write', inputSchema: {} }] })
const request = { scope: { storage: 'custom' as const }, scenario: 'test', budget: DEFAULT_MEMORY_VIEW_BUDGET }
describe('workspace composition', () => {
  it('keeps source-specific capture reminders inside actual write selections and budgets', () => {
    const journal = source('activity-log', 1), capture = { instanceKey: 'strategy-extension:capture', typeId: 'journal-capture', slot: 'capture', value: { instruction: 'Capture outcomes.', reminders: [{ sourceKey: journal.sourceInstanceKey, instruction: 'Journal entry due.' }, { sourceKey: 'source:foreign', instruction: 'Never include this.' }] } }
    const result = WORKSPACE_STRATEGY.compose(request, [journal], [capture])
    expect(result.guidance?.system).toContain('Journal entry due.')
    expect(result.guidance?.system).not.toContain('Never include')
    const budget = WORKSPACE_STRATEGY.compose({ ...request, budget: { ...request.budget, maxActions: 0 } }, [journal], [capture])
    expect(budget.guidance?.system).not.toContain('Journal entry due.')
    const readonly = WORKSPACE_STRATEGY.compose(request, [journal], [capture, { instanceKey: 'strategy-extension:focus', typeId: 'focus', slot: 'focus', value: { sourceKeys: [journal.sourceInstanceKey], writableSourceKeys: [], maxProjectionCharacters: 100 } }])
    expect(readonly.guidance?.system).not.toContain('Journal entry due.')
    expect(() => validateWorkspacePolicy('capture', { instruction: 'Capture', reminders: [{ sourceKey: 'source:one', instruction: 'Due', execute: true }] })).toThrow('Unsupported capture reminder')
  })
  it('composes all supported roles deterministically within one budget', () => {
    const sources = WORKSPACE_SOURCE_ROLES.map(source)
    const result = WORKSPACE_STRATEGY.compose(request, sources)
    expect(result).toEqual(WORKSPACE_STRATEGY.compose(request, sources.slice().reverse()))
    expect(result.sources).toHaveLength(sources.length)
    expect(result.sources.reduce((sum, value) => sum + (value.projection?.maxCharacters ?? 0), 0)).toBeLessThanOrEqual(request.budget.maxProjectionCharacters)
    expect(result.sources.every(value => value.routeIds?.length === 1 && value.actionIds?.length === 1)).toBe(true)
  })
  it('rejects ambiguity and honors explicit Source order and read-only subsets', () => {
    const sources = [source('task-context', 1), source('task-context', 2)]
    expect(() => WORKSPACE_STRATEGY.compose(request, sources)).toThrow(/Ambiguous/)
    const result = WORKSPACE_STRATEGY.compose(request, sources, [{ instanceKey: 'strategy-extension:focus', typeId: 'focus', slot: 'focus', value: { sourceKeys: ['source:item-2', 'source:item-1'], writableSourceKeys: ['source:item-1'], maxProjectionCharacters: 512 } }])
    expect(result.sources[0]?.sourceInstanceKey).toBe('source:item-2')
    expect(result.sources[0]?.actionIds).toEqual([])
    expect(result.sources[1]?.actionIds).toEqual(['propose'])
    expect(() => validateWorkspacePolicy('focus', { sourceKeys: ['source:one'], writableSourceKeys: ['source:two'], maxProjectionCharacters: 500 })).toThrow(/subset/)
  })
  it('does not let early Sources consume every route or action', () => {
    const first = source('working-context', 1)
    first.routes.push(...Array.from({ length: 10 }, (_, index) => ({ ...first.routes[0]!, id: 'extra-' + index })))
    first.routeIds = first.routes.map(route => route.id)
    const result = WORKSPACE_STRATEGY.compose({ ...request, budget: { ...request.budget, maxRoutes: 3, maxActions: 1 } }, [first, source('task-context', 2), source('activity-log', 3)])
    expect(result.sources.every(value => value.routeIds?.length === 1)).toBe(true)
    expect(result.sources.flatMap(value => value.actionIds ?? [])).toHaveLength(1)
  })
})

it('supports a larger explicit budget without discarding later Source operations', () => {
  const sources = WORKSPACE_SOURCE_ROLES.map(source)
  for (const item of sources) {
    item.routes = Array.from({ length: 4 }, (_, index) => ({ ...item.routes[0]!, id: 'read-' + index }))
    item.actions = Array.from({ length: 4 }, (_, index) => ({ ...item.actions[0]!, id: 'write-' + index }))
  }
  const result = WORKSPACE_STRATEGY.compose({ ...request, budget: { ...request.budget, maxRoutes: 96, maxActions: 96 } }, sources)
  expect(result.sources.flatMap(source => source.routeIds ?? [])).toHaveLength(60)
  expect(result.sources.flatMap(source => source.actionIds ?? [])).toHaveLength(60)
  const empty = WORKSPACE_STRATEGY.compose(request, sources, [{ instanceKey: 'strategy-extension:focus', typeId: 'focus', slot: 'focus', value: { sourceKeys: [], maxProjectionCharacters: 100 } }])
  expect(empty.sources).toEqual([])
})
