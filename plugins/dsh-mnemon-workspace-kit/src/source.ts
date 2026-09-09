import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { COMPOSABLE_MEMORY_API_VERSION, type MemoryJsonValue, type MemoryOperationScope, type MemorySourceDefinition, type MemorySourceManagementRequest } from 'dsh-mnemon/contracts'
import { createMemoryMutationReceipt, defineMemorySource, memoryInputInteger, memoryInputRecord, memoryInputText, truncateMemoryText } from 'dsh-mnemon/extension-sdk'
import { digest, json, RecordStore, recordScope, reviseRecord, visibleRecord, type RecordScope, type RecordSnapshot, type RecordValue } from './records.ts'

export interface RecordSourceConfig { dataDir?: string }
export interface RecordSourceOptions {
  typeId: string
  role: string
  label: string
  description: string
  kinds: readonly string[]
  scopes: readonly RecordScope[]
  defaultScope: RecordScope
  scopeForKind?: Readonly<Record<string, RecordScope>>
  modelWrites?: 'proposal' | 'append'
  validate(record: RecordValue): void
  prepare?(record: RecordValue, scope: MemoryOperationScope): Promise<void> | void
  visible?(record: RecordValue, scope: MemoryOperationScope): Promise<boolean> | boolean
  project?(records: RecordValue[], scope: MemoryOperationScope): string
  search?(records: RecordValue[], input: { [key: string]: MemoryJsonValue }, scope: MemoryOperationScope): RecordValue[]
  read?(operation: string, input: { [key: string]: MemoryJsonValue }, context: { snapshot: RecordSnapshot; scope: MemoryOperationScope; signal?: AbortSignal }): Promise<MemoryJsonValue> | MemoryJsonValue
  mutate?(operation: string, input: { [key: string]: MemoryJsonValue }, context: { records: RecordValue[]; scope: MemoryOperationScope; signal?: AbortSignal }): Promise<void> | void
}

const writeSchema: MemoryJsonValue = { type: 'object', additionalProperties: false, required: ['title'], properties: {
  title: { type: 'string', maxLength: 300 }, content: { type: 'string', maxLength: 100000 }, kind: { type: 'string' },
  scope: { type: 'string', enum: ['global', 'project', 'session', 'daily'] }, date: { type: 'string' }, data: { type: 'object' },
} }
const readSchema: MemoryJsonValue = { type: 'object', additionalProperties: false, properties: {
  id: { type: 'string' }, query: { type: 'string' }, kind: { type: 'string' }, since: { type: 'string' }, until: { type: 'string' },
  date: { type: 'string' }, status: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 },
  all: { type: 'boolean' }, recent: { type: 'boolean' }, archived: { type: 'boolean' },
} }

/** Adapts one Source's own schema to Core contracts; all domain policy stays with its author. */
export function createRecordSource(options: RecordSourceOptions, config: RecordSourceConfig = {}): MemorySourceDefinition {
  const packageName = 'dsh-mnemon-source-' + options.typeId
  const modelAction = options.modelWrites === 'append' ? 'append' : 'propose'
  return defineMemorySource({
    manifest: { apiVersion: COMPOSABLE_MEMORY_API_VERSION, kind: 'source', typeId: options.typeId, packageName, role: options.role,
      capabilities: ['status', 'project', 'recall', 'write', 'export', 'import'], consistency: 'exact-snapshot',
      management: { label: options.label, description: options.description },
      routes: [{ id: 'search', description: `Search and read ${options.label}.`, capability: 'recall', inputSchema: readSchema, maxCalls: 8, maxResults: 20, maxCharacters: 12_000 }],
      actions: [{ id: modelAction, description: modelAction === 'append' ? `Append a new ${options.label} record; existing records are preserved.` : `Propose a ${options.label} record for human approval; it stays inactive until approved.`, capability: 'write', inputSchema: writeSchema }],
    },
    create(context) {
      const dataDir = config.dataDir ?? (typeof context.configuration?.dataDir === 'string' ? context.configuration.dataDir : undefined)
        ?? process.env.MNEMON_DATA_DIR ?? join(homedir(), '.mnemon')
      const store = new RecordStore(join(dataDir, 'sources', options.typeId, digest(context.sourceInstanceKey).slice(0, 20)))
      const prepared = new WeakMap<object, RecordSnapshot>()
      const active = async (snapshot: RecordSnapshot, scope: MemoryOperationScope, archives = false): Promise<RecordValue[]> => {
        const records = snapshot.records.filter(record => visibleRecord(record, scope) && (record.state === 'active' || archives && record.state === 'archived'))
        const included = await Promise.all(records.map(record => options.visible?.(record, scope) ?? true))
        return records.filter((_record, index) => included[index])
      }
      function create(input: { [key: string]: MemoryJsonValue }, scope: MemoryOperationScope, state: RecordValue['state']): RecordValue {
        const kind = memoryInputText(input.kind, 'kind', 64, false) ?? options.kinds[0]!
        const selectedScope = (options.scopeForKind?.[kind] ?? memoryInputText(input.scope, 'scope', 20, false) ?? options.defaultScope) as RecordScope
        if (!options.kinds.includes(kind) || !options.scopes.includes(selectedScope)) throw new Error('Unsupported record kind or scope')
        const data = input.data === undefined ? {} : memoryInputRecord(input.data, 'record data')
        const now = new Date().toISOString()
        return { id: randomUUID(), kind, title: memoryInputText(input.title, 'title', 300)!, content: memoryInputText(input.content, 'content', 100_000, false) ?? '',
          ...recordScope(selectedScope, scope, memoryInputText(input.date, 'date', 10, false)), state, data: structuredClone(data),
          signals: 1, createdAt: now, updatedAt: now, version: 1, history: [] }
      }
      async function change(operation: string, input: { [key: string]: MemoryJsonValue }, scope: MemoryOperationScope, revision?: string, signal?: AbortSignal): Promise<RecordSnapshot> {
        return store.change(revision, async records => {
          if (['create', 'propose', 'append'].includes(operation)) {
            const item = create(input, scope, operation === 'propose' ? 'pending' : 'active')
            await options.prepare?.(item, scope)
            options.validate(item)
            const duplicate = records.find(record => record.state === item.state && visibleRecord(record, scope) && record.scope === item.scope && record.date === item.date
              && record.kind === item.kind && record.title.trim().toLowerCase() === item.title.trim().toLowerCase() && record.content.trim() === item.content.trim()
              && digest(record.data) === digest(item.data))
            if (operation === 'propose' && duplicate) { reviseRecord(duplicate, 'repeat-proposal'); duplicate.signals++; return }
            records.push(item)
            return
          }
          if (['update', 'approve', 'archive', 'reject', 'restore', 'delete'].includes(operation)) {
            const id = memoryInputText(input.id, 'id', 100)!
            const record = records.find(value => value.id === id && visibleRecord(value, scope))
            if (!record) throw new Error('Record is not available in this scope')
            if (input.version !== undefined && input.version !== record.version) throw new Error('Record version changed; refresh before saving')
            if (operation === 'approve' && record.state !== 'pending') throw new Error('Only pending records can be approved')
            if (operation === 'reject' && record.state !== 'pending') throw new Error('Only pending records can be rejected')
            if (operation === 'restore' && !['archived', 'deleted', 'rejected'].includes(record.state)) throw new Error('Record is not archived or removed')
            reviseRecord(record, operation)
            if (operation === 'update' || operation === 'approve') {
              if (input.title !== undefined) record.title = memoryInputText(input.title, 'title', 300)!
              if (input.content !== undefined) record.content = memoryInputText(input.content, 'content', 100_000, false) ?? ''
              if (input.data !== undefined) record.data = structuredClone(memoryInputRecord(input.data, 'record data'))
            }
            if (operation !== 'update') record.state = operation === 'approve' || operation === 'restore' ? 'active' : operation === 'archive' ? 'archived' : operation === 'reject' ? 'rejected' : 'deleted'
            options.validate(record)
            return
          }
          if (options.mutate) { await options.mutate(operation, input, { records, scope, ...(signal ? { signal } : {}) }); return }
          throw new Error('Unsupported management operation: ' + operation)
        }, signal)
      }
      const managed = (snapshot: RecordSnapshot, scope: MemoryOperationScope): RecordSnapshot => ({ revision: snapshot.revision, records: snapshot.records.filter(record => visibleRecord(record, scope)) })
      return {
        async facts(request, signal) {
          const snapshot = await store.read(signal)
          prepared.set(request.scope, snapshot)
          const scoped = managed(snapshot, request.scope).records
          return { sourceInstanceKey: context.sourceInstanceKey, sourceTypeId: options.typeId, role: options.role, availability: 'ready', revision: snapshot.revision,
            capabilities: ['status', 'project', 'recall', 'write', 'export', 'import'], routeIds: ['search'], actionIds: [modelAction],
            hints: { activeCount: scoped.filter(record => record.state === 'active').length, pendingCount: scoped.filter(record => record.state === 'pending').length } }
        },
        async project(request, signal) {
          const snapshot = prepared.get(request.scope) ?? await store.read(signal)
          prepared.delete(request.scope)
          if (snapshot.revision !== request.expectedRevision) throw new Error('Collection changed during View composition')
          const records = await active(snapshot, request.scope)
          const archived = await active(snapshot, request.scope, true)
          const text = options.project?.(records, request.scope) ?? `${options.label}: ${records.length} active records. Search this Source for details.`
          return { fragments: request.includeProjection ? [{ id: context.sourceInstanceKey + '/summary', sourceInstanceKey: context.sourceInstanceKey, mode: request.mode,
            text: truncateMemoryText(text, request.maxCharacters), revision: snapshot.revision }] : [],
            readGrant: { id: context.sourceInstanceKey + '/' + snapshot.revision, sourceInstanceKey: context.sourceInstanceKey, schema: 'mnemon-record-grant/v1',
              value: json(archived), revision: snapshot.revision, consistency: 'exact-snapshot' },
            presentation: { visibleItems: records.length, totalItems: managed(snapshot, request.scope).records.length,
              items: records.slice(0, 20).map(record => ({ id: record.id, title: record.title, ...(record.content.trim() ? { excerpt: truncateMemoryText(record.content, 160) } : {}) })) },
          }
        },
        query(request) {
          request.signal?.throwIfAborted()
          const input = memoryInputRecord(request.input, 'record query')
          const term = (memoryInputText(input.query, 'query', 1000, false) ?? '').toLocaleLowerCase()
          let records = (structuredClone(request.grant.value) as unknown as RecordValue[]).filter(record =>
            (record.state === 'active' || input.archived === true && record.state === 'archived')
            && (input.id === undefined || record.id === input.id) && (input.kind === undefined || record.kind === input.kind)
            && (input.date === undefined || record.date === input.date) && (input.status === undefined || record.data.status === input.status)
            && (input.since === undefined || (record.date ?? record.createdAt.slice(0, 10)) >= String(input.since))
            && (input.until === undefined || (record.date ?? record.createdAt.slice(0, 10)) <= String(input.until))
            && (!term || (record.title + '\n' + record.content + '\n' + JSON.stringify(record.data)).toLocaleLowerCase().includes(term)))
          records = options.search?.(records, input, request.view.scope) ?? records
          if (input.recent !== false) records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
          const limit = Math.min(memoryInputInteger(input.limit, 10, 1, 100), request.route.maxResults ?? 20)
          let remaining = request.route.maxCharacters ?? 12_000
          const items = records.slice(0, limit).flatMap(record => {
            const body = `${record.title}\n${record.content}\n${JSON.stringify(record.data)}`
            if (remaining < 100) return []
            const text = truncateMemoryText(body, remaining)
            remaining -= text.length
            return [{ id: record.id, text, revision: String(record.version), provenance: json({ kind: record.kind, scope: record.scope, date: record.date, createdAt: record.createdAt, state: record.state }) }]
          })
          return { id: randomUUID(), viewId: request.view.id, routeId: request.route.id, sourceInstanceKey: context.sourceInstanceKey,
            observedAt: new Date().toISOString(), items, truncated: items.length < records.length || remaining <= 0 }
        },
        async manage(request: MemorySourceManagementRequest) {
          const input = request.input === null ? {} : memoryInputRecord(request.input, 'record management')
          if (request.mode === 'read') {
            const snapshot = managed(await store.read(request.signal), request.scope)
            if (request.operation === 'snapshot' || request.operation === 'export') return { revision: snapshot.revision, value: json(snapshot) }
            if (options.read) return { revision: snapshot.revision, value: await options.read(request.operation, input, { snapshot, scope: request.scope, ...(request.signal ? { signal: request.signal } : {}) }) }
            throw new Error('Unsupported management read: ' + request.operation)
          }
          if (!request.confirmed || request.expectedRevision === undefined) throw new Error('A confirmed, revision-fenced management request is required')
          const snapshot = await change(request.operation, input, request.scope, request.expectedRevision, request.signal)
          return { revision: snapshot.revision, value: json(managed(snapshot, request.scope)) }
        },
        async mutate(request) {
          const snapshot = await change(modelAction, memoryInputRecord(request.input, 'record write'), request.view.scope, undefined, request.signal)
          return createMemoryMutationReceipt(request.view.id, request.offer.id, context.sourceInstanceKey, snapshot.revision,
            { message: modelAction === 'propose' ? 'Saved for approval; not active context.' : 'New record appended.', pending: modelAction === 'propose' }, modelAction === 'propose' ? 'candidate' : 'committed')
        },
      }
    },
  })
}
