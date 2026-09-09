import { describe, expect, it } from 'vitest'
import type { RecordValue } from 'dsh-mnemon-workspace-kit'
import { sourceOptions } from '../src/source.ts'
const value = (data: Record<string, any> = {}): RecordValue => ({ id: 'sample', kind: 'skill', title: 'Sample', content: 'Content', scope: 'project', workspaceId: '/project-a', state: 'active', data, signals: 1, version: 1, createdAt: '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z', history: [] })
describe('playbooks', () => {
 it('requires a stable skill name and hides disabled content', () => {
   expect(() => sourceOptions.validate(value({ enabled: true, slug: '../bad' }))).toThrow(/name/)
   expect(sourceOptions.visible!(value({ enabled: false }), { storage: 'custom' })).toBe(false)
   expect(sourceOptions.project!([value({ enabled: true })], { storage: 'custom' })).not.toContain('Content')
 })
 it('records enablement history and rejects cross-project changes', async () => {
   const record = value({ enabled: true, slug: 'debugging-process' })
   await expect(async () => sourceOptions.mutate!('toggle', { id: record.id }, { records: [record], scope: { storage: 'custom', workspaceId: '/project-b' } })).rejects.toThrow(/not found/)
   await sourceOptions.mutate!('toggle', { id: record.id }, { records: [record], scope: { storage: 'custom', workspaceId: '/project-a' } })
   expect(record.data.enabled).toBe(false); expect(record.history[0]?.data.enabled).toBe(true)
 })
})
