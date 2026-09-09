import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { newRecord, RecordStore } from 'dsh-mnemon-workspace-kit'
import { advanceSchedules, makeSchedule, renderPrompt } from '../src/schedule.ts'
const scope = { storage: 'custom' as const, workspaceId: '/project', sessionId: 'one' }
describe('explicit prompt schedules', () => {
  it('expands literal variables, rejects missing input and inactive playbooks', () => {
    expect(renderPrompt('Hello {{who}}, {{workspace}}', { who: '<literal>' }, scope)).toBe('Hello <literal>, /project')
    expect(() => renderPrompt('{{missing}}', {}, scope)).toThrow(/Missing/)
    const pending = newRecord('prompt', 'Prompt', 'Text', 'project', scope, { enabled: true }, 'pending')
    expect(() => makeSchedule(pending, scope, { variables: {}, count: 1, interval: 1, startAfter: 1 })).toThrow(/approved/)
  })
  it('counts only admitted caller rounds, fences replay, honors interval, session isolation and stop', async () => {
    const store = new RecordStore(await mkdtemp(join(tmpdir(), 'mnemon-schedule-'))), book = newRecord('prompt', 'Plan', 'Do {{task}}', 'project', scope, { enabled: true, uses: 0 })
    const schedule = makeSchedule(book, scope, { variables: { task: 'validation' }, count: 2, interval: 2, startAfter: 2 })
    await store.change(undefined, records => { records.push(book, schedule) })
    expect(await advanceSchedules(store, scope, 1)).toEqual([])
    expect(await advanceSchedules(store, { ...scope, sessionId: 'other' }, 2)).toEqual([])
    expect(await advanceSchedules(store, scope, 2)).toMatchObject([{ text: 'Do validation' }])
    expect(await advanceSchedules(store, scope, 2)).toEqual([])
    expect(await advanceSchedules(store, scope, 3)).toEqual([])
    expect(await advanceSchedules(store, scope, 4)).toHaveLength(1)
    expect(await advanceSchedules(store, scope, 5)).toEqual([])
    const final = await store.read(); expect(final.records[0]?.data.uses).toBe(2); expect(final.records[1]?.data.status).toBe('completed')
    const continuous = makeSchedule(book, scope, { variables: { task: 'x' }, count: 0, interval: 1, startAfter: 1 }); await store.change(undefined, records => { records.push(continuous); records[0]!.data.enabled = false })
    expect(await advanceSchedules(store, scope, 6)).toEqual([])
    expect((await store.read()).records[2]?.data.status).toBe('stopped')
  })
})
