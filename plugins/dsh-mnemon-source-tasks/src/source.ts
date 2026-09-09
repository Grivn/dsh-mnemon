import { recordScope, reviseRecord, today, visibleRecord, type RecordSourceOptions } from 'dsh-mnemon-workspace-kit'
export const sourceOptions: RecordSourceOptions = {
  typeId: 'tasks', role: 'task-context', label: 'Tasks', description: 'Scoped tasks, priorities, deadlines and completion history.',
  kinds: ['personal', 'work', 'project', 'daily'], scopes: ['global', 'project', 'daily'], defaultScope: 'project',
  scopeForKind: { personal: 'global', work: 'global', project: 'project', daily: 'daily' },
  prepare(record, scope) {
    const target = record.kind === 'project' ? 'project' : record.kind === 'daily' ? 'daily' : 'global'
    delete record.workspaceId; delete record.sessionId
    Object.assign(record, recordScope(target, scope, record.date))
    record.data.status ??= 'pending'
    record.data.important ??= false
    record.data.urgent ??= false
  },
  validate(record) {
    if (!['pending', 'in-progress', 'done', 'blocked', 'cancelled'].includes(String(record.data.status ?? 'pending'))) throw new Error('Unsupported task status')
    for (const key of ['important', 'urgent']) if (record.data[key] !== undefined && typeof record.data[key] !== 'boolean') throw new Error(key + ' must be boolean')
    const due = record.data.due
    if (due !== undefined && due !== '' && (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) || new Date(due).toISOString().slice(0, 10) !== due)) throw new Error('Due date must be YYYY-MM-DD')
  },
  project() { return 'Tasks are available on demand. Search the due view before finishing work; do not assign new tasks without the user adopting a proposal.' },
  search(records, input) {
    if (input.all === true || input.id || input.query || input.status || input.date || input.kind) return records
    const day = today()
    return records.filter(record => !['done', 'cancelled'].includes(String(record.data.status))
      && (record.scope === 'project' || record.scope === 'daily' && record.date === day || typeof record.data.due === 'string' && record.data.due !== '' && record.data.due <= day || record.data.important === true))
      .sort((a, b) => String(a.data.due || '9999').localeCompare(String(b.data.due || '9999')) || Number(b.data.urgent === true) - Number(a.data.urgent === true)).slice(0, 8)
  },
  mutate(operation, input, { records, scope }) {
    if (operation !== 'complete') throw new Error('Unsupported task operation')
    const record = records.find(record => record.id === input.id && visibleRecord(record, scope))
    if (!record || record.state !== 'active') throw new Error('Active task not found')
    if (input.version !== undefined && input.version !== record.version) throw new Error('Task version changed')
    if (record.data.status === 'done') return
    reviseRecord(record, 'complete'); record.data.status = 'done'; record.data.completedAt = new Date().toISOString()
  },
}
