import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { MemoryCompositionRunner } from 'dsh-mnemon/testing'
import { defineMemoryStrategy, installMemory } from 'dsh-mnemon/extension-sdk'
import { COMPOSABLE_MEMORY_API_VERSION } from 'dsh-mnemon/contracts'
import type { Context } from '@deepseek-ai/cordis'
import { createRecordSource, RecordStore, type RecordSnapshot } from '../src/index.ts'

const options = { typeId: 'test-records', role: 'test-records', label: 'Records', description: 'Test records', kinds: ['note'], scopes: ['project', 'global'] as const, defaultScope: 'project' as const, validate() {} }
const policy = { apply(ctx: Context) { installMemory(ctx, { strategies: [defineMemoryStrategy({
  manifest: { apiVersion: COMPOSABLE_MEMORY_API_VERSION, kind: 'strategy', typeId: 'records-policy', packageName: 'records-policy', deterministic: true, supportedSourceRoles: ['test-records'], maxSources: 5, maxRoutes: 5, maxActions: 5 },
  compose(request, sources) { return { strategyTypeId: 'records-policy', explanation: 'Test composition', sources: sources.map(source => ({ sourceInstanceKey: source.sourceInstanceKey, projection: { mode: 'eager', maxCharacters: Math.floor(request.budget.maxProjectionCharacters / sources.length) }, routeIds: source.routeIds, actionIds: source.actionIds })) } },
})] }) } }
async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'mnemon-records-'))
  const runner = new MemoryCompositionRunner()
  const source = { apply(ctx: Context) { installMemory(ctx, { sources: [createRecordSource(options, { dataDir })] }) } }
  const unmount = await runner.mount(source, { instanceId: 'notes' })
  await runner.mount(policy, { instanceId: 'policy' })
  return { runner, dataDir, source, unmount, scope: { storage: 'custom' as const, workspaceId: '/project-a', sessionId: 'test-session' } }
}

describe('scoped record Source', () => {
  it('keeps proposals inactive, deduplicates signals and requires a new View after approval', async () => {
    const { runner, scope } = await fixture()
    try {
      const turn = await runner.beginTurn({ scope })
      const input = { title: 'Deployment convention', content: 'Use port 8301.' }
      expect((await turn.executeAction(turn.view.actionOffers[0]!.id, input, () => true)).completion).toBe('candidate')
      await turn.executeAction(turn.view.actionOffers[0]!.id, input, () => true)
      const client = await runner.managementClient('source:notes', scope)
      const snapshot = (await client.read('snapshot')).value as unknown as RecordSnapshot
      expect(snapshot.records).toHaveLength(1)
      expect(snapshot.records[0]?.signals).toBe(2)
      const pending = await runner.beginTurn({ scope })
      expect((await pending.executeRoute(pending.view.routes[0]!.id, {})).items).toHaveLength(0)
      await client.mutate('approve', { id: snapshot.records[0]!.id, content: 'Use port 8302.' }, { confirmed: true })
      expect((await pending.executeRoute(pending.view.routes[0]!.id, {})).items).toHaveLength(0)
      const approved = await runner.beginTurn({ scope })
      expect((await approved.executeRoute(approved.view.routes[0]!.id, { query: '8302' })).items).toHaveLength(1)
      expect((await approved.executeRoute(approved.view.routes[0]!.id, { query: '8301' })).items).toHaveLength(0)
    } finally { await runner.dispose() }
  })
  it('isolates projects and instances and rejects denied, unconfirmed and stale writes', async () => {
    const { runner, scope, source } = await fixture()
    try {
      await runner.mount(source, { instanceId: 'other' })
      const a = await runner.managementClient('source:notes', scope)
      const stale = await runner.managementClient('source:notes', scope)
      await a.mutate('create', { title: 'A only' }, { confirmed: true })
      await expect(stale.mutate('create', { title: 'Stale' }, { confirmed: true })).rejects.toThrow(/revision/i)
      const b = await runner.managementClient('source:notes', { ...scope, workspaceId: '/project-b' })
      expect(((await b.read('snapshot')).value as unknown as RecordSnapshot).records).toHaveLength(0)
      const other = await runner.managementClient('source:other', scope)
      expect(((await other.read('snapshot')).value as unknown as RecordSnapshot).records).toHaveLength(0)
      const snapshot = (await a.read('snapshot')).value as unknown as RecordSnapshot
      await expect(b.mutate('update', { id: snapshot.records[0]!.id, title: 'Intrusion' }, { confirmed: true })).rejects.toThrow(/scope/)
      await expect(runner.executeManagement({ sourceInstanceKey: 'source:notes', scope, operation: 'create', input: { title: 'No confirmation' }, mode: 'mutate', confirmed: false, expectedRevision: a.revision })).rejects.toThrow(/confirm/i)
      const turn = await runner.beginTurn({ scope })
      await expect(turn.executeAction(turn.view.actionOffers[0]!.id, { title: 'Denied' }, () => false)).rejects.toThrow(/authoriz/i)
    } finally { await runner.dispose() }
  })
  it('retains history and data across archive, restore and unload/reload', async () => {
    const { runner, scope, source, unmount } = await fixture()
    try {
      const client = await runner.managementClient('source:notes', scope)
      let result = await client.mutate('create', { title: 'Keep me', content: 'Original' }, { confirmed: true })
      const id = (result.value as unknown as RecordSnapshot).records[0]!.id
      await client.mutate('update', { id, content: 'Edited' }, { confirmed: true })
      await client.mutate('archive', { id }, { confirmed: true })
      const turn = await runner.beginTurn({ scope })
      expect((await turn.executeRoute(turn.view.routes[0]!.id, {})).items).toHaveLength(0)
      expect((await turn.executeRoute(turn.view.routes[0]!.id, { archived: true })).items).toHaveLength(1)
      turn.release()
      await client.mutate('restore', { id }, { confirmed: true })
      await unmount(); await runner.mount(source, { instanceId: 'notes' })
      const restored = await runner.managementClient('source:notes', scope)
      result = await restored.read('snapshot')
      const record = (result.value as unknown as RecordSnapshot).records[0]!
      expect(record.content).toBe('Edited'); expect(record.state).toBe('active')
      expect(record.history[0]?.content).toBe('Original')
    } finally { await runner.dispose() }
  })
  it('preserves a damaged file and does not write after cancellation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mnemon-damaged-records-'))
    const store = new RecordStore(directory)
    await writeFile(store.file, '{broken')
    await expect(store.change(undefined, () => {})).rejects.toThrow(/damaged/)
    expect(await readFile(store.file, 'utf8')).toBe('{broken')
    const controller = new AbortController(); controller.abort()
    await expect(store.change(undefined, () => {}, controller.signal)).rejects.toThrow()
    expect(await readFile(store.file, 'utf8')).toBe('{broken')
  })
  it('serializes simultaneous writes and rejects the stale revision inside the lock', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mnemon-concurrent-records-'))
    const store = new RecordStore(directory)
    const initial = await store.read()
    const values = await Promise.allSettled([store.change(initial.revision, records => { records.push({ id: 'one', kind: 'note', title: 'one', content: '', scope: 'global', state: 'active', data: {}, signals: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, history: [] }) }), store.change(initial.revision, () => {})])
    expect(values.map(value => value.status)).toEqual(['fulfilled', 'rejected'])
    expect((await store.read()).records).toHaveLength(1)
  })
})
