import { reviseRecord, visibleRecord, type RecordSourceOptions } from 'dsh-mnemon-workspace-kit'
export const sourceOptions: RecordSourceOptions = {
  transfer: true,
  typeId: 'playbooks', role: 'instruction-library', label: 'Playbooks', description: 'Approved reusable skills and prompts with progressive disclosure.',
  kinds: ['skill', 'prompt', 'schedule'], scopes: ['global', 'project', 'session'], defaultScope: 'project',
  prepare(record) { if (record.kind === 'schedule') throw new Error('Use the session scheduling controls'); record.data.enabled ??= true; record.data.category ??= ''; record.data.uses ??= 0 },
  validate(record) {
    if (record.kind === 'schedule') {
      if (record.scope !== 'session' || typeof record.data.bookId !== 'string' || !['scheduled', 'delivering', 'completed', 'stopped', 'failed'].includes(String(record.data.status)) || !Number.isInteger(record.data.uses)) throw new Error('Invalid prompt schedule')
      return
    }
    for (const [key, limit] of [['summary', 500], ['tags', 1000]] as const) if (record.data[key] !== undefined && (typeof record.data[key] !== 'string' || record.data[key].length > limit)) throw new Error('Invalid prompt ' + key)
    if (typeof record.data.enabled !== 'boolean') throw new Error('Enabled must be boolean')
    if (record.kind === 'skill' && (typeof record.data.slug !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(record.data.slug) || record.data.slug.length > 100)) throw new Error('A skill needs a reusable kebab-case name')
    if (record.data.category !== undefined && (typeof record.data.category !== 'string' || record.data.category.length > 100)) throw new Error('Invalid category')
  },
  visible(record) { return record.data.enabled !== false },
  project(records) { return 'Approved playbooks (read the full content before use):\n' + records.filter(record => record.kind !== 'schedule' && record.data.enabled !== false).map(record => `${record.id} · ${record.kind} · ${record.title}${record.data.category ? ' · ' + String(record.data.category) : ''}`).join('\n') + '\nSession prompt schedules: ' + records.filter(record => record.kind === 'schedule').map(record => `${record.id}: ${String(record.data.status)}, uses=${String(record.data.uses)}`).join('; ') },
  mutate(operation, input, { records, scope }) {
    if (operation !== 'toggle') throw new Error('Unsupported playbook operation')
    const record = records.find(record => record.id === input.id && visibleRecord(record, scope))
    if (!record) throw new Error('Playbook not found')
    if (input.version !== undefined && input.version !== record.version) throw new Error('Playbook version changed')
    reviseRecord(record, 'toggle'); record.data.enabled = !record.data.enabled
  },
}
