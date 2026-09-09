import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { COMPOSABLE_MEMORY_API_VERSION, type MemoryJsonValue, type MemoryOperationScope, type MemorySourceActionManifest, type MemorySourceDefinition, type MemorySourceManagementRequest } from 'dsh-mnemon/contracts'
import { createMemoryMutationReceipt, defineMemorySource, memoryInputInteger, memoryInputRecord, memoryInputText, truncateMemoryText } from 'dsh-mnemon/extension-sdk'
import { digest, json, RecordStore, recordScope, reviseRecord, validateRecord, visibleRecord, type RecordScope, type RecordSnapshot, type RecordValue } from './records.ts'

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
  /** Memory-only operations handled by mutate. Existing records must belong to the pinned View. */
  modelActions?: readonly MemorySourceActionManifest[]
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
      actions: [{ id: modelAction, description: modelAction === 'append' ? `Append a new ${options.label} record; existing records are preserved.` : `Propose a ${options.label} record for human approval; it stays inactive until approved.`, capability: 'write', inputSchema: writeSchema }, ...options.modelActions ?? []],
    },
    create(context) {
      const dataDir = config.dataDir ?? (typeof context.configuration?.dataDir === 'string' ? context.configuration.dataDir : undefined)
        ?? process.env.MNEMON_DATA_DIR ?? join(homedir(), '.mnemon')
      const store = new RecordStore(join(dataDir, 'sources', options.typeId, digest(context.sourceInstanceKey).slice(0, 20)))
      const prepared = new WeakMap<object, RecordSnapshot>()
      // Bounded opaque snapshots keep large collections out of Core's JSON grants.
      // Eviction fails closed; it never substitutes a newer collection for an old View.
      const snapshots = new Map<string, RecordValue[]>()
      let snapshotBytes = 0
      const pin = (records: RecordValue[]): string => {
        const key = digest(records)
        if (!snapshots.has(key)) {
          snapshots.set(key, records); snapshotBytes += Buffer.byteLength(JSON.stringify(records))
          while (snapshots.size > 16 || snapshotBytes > 64 * 1024 * 1024 && snapshots.size > 1) {
            const oldest = snapshots.keys().next().value!
            snapshotBytes -= Buffer.byteLength(JSON.stringify(snapshots.get(oldest)))
            snapshots.delete(oldest)
          }
        }
        return key
      }
      const pinned = (grant: MemoryJsonValue): RecordValue[] => {
        const key = memoryInputText(memoryInputRecord(grant, 'record grant').snapshot, 'snapshot', 64)!
        const records = snapshots.get(key)
        if (!records) throw new Error('The pinned record snapshot expired; compose a new View')
        return structuredClone(records)
      }
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
      async function change(operation: string, input: { [key: string]: MemoryJsonValue }, scope: MemoryOperationScope, revision?: string, signal?: AbortSignal, modelRecords?: RecordValue[]): Promise<RecordSnapshot> {
        return store.change(revision, async records => {
          if (modelRecords && operation !== modelAction) {
            const before = modelRecords.find(record => record.id === input.id && record.state === 'active')
            const current = records.find(record => record.id === input.id && visibleRecord(record, scope))
            if (!before || !current || current.version !== before.version) throw new Error('Record is not active in this View or has changed; read it in a new View')
          }
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
          if (operation === 'import') {
            if (!Array.isArray(input.records) || input.records.length > 10_000) throw new Error('Import requires a bounded records array')
            if (input.conflicts !== undefined && !['skip', 'replace'].includes(String(input.conflicts))) throw new Error('Choose skip or replace for import conflicts')
            const imported = new Set<string>()
            for (const value of input.records) {
              const item: unknown = structuredClone(value)
              validateRecord(item)
              if (imported.has(item.id)) throw new Error('Duplicate imported record id')
              imported.add(item.id)
              if (!options.kinds.includes(item.kind) || !options.scopes.includes(item.scope) || !visibleRecord(item, scope)) throw new Error('Imported record is outside this Source or scope')
              options.validate(item)
              const index = records.findIndex(record => record.id === item.id)
              if (index < 0) { records.push(item); continue }
              const existing = records[index]!
              if (!visibleRecord(existing, scope)) throw new Error('Imported id belongs to another scope')
              if (digest(existing) === digest(item) || input.conflicts === 'skip') continue
              if (input.conflicts !== 'replace') throw new Error('Import conflict: ' + item.id)
              reviseRecord(existing, 'import')
              records[index] = { ...item, version: existing.version, updatedAt: existing.updatedAt, history: existing.history }
            }
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
            capabilities: ['status', 'project', 'recall', 'write', 'export', 'import'], routeIds: ['search'], actionIds: [modelAction, ...options.modelActions?.map(action => action.id) ?? []],
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
              value: { snapshot: pin(archived) }, revision: snapshot.revision, consistency: 'exact-snapshot' },
            presentation: { visibleItems: records.length, totalItems: managed(snapshot, request.scope).records.length,
              items: records.slice(0, 20).map(record => ({ id: record.id, title: record.title, ...(record.content.trim() ? { excerpt: truncateMemoryText(record.content, 160) } : {}) })) },
          }
        },
        query(request) {
          request.signal?.throwIfAborted()
          const input = memoryInputRecord(request.input, 'record query')
          const term = (memoryInputText(input.query, 'query', 1000, false) ?? '').toLocaleLowerCase()
          let records = pinned(request.grant.value).filter(record =>
            (record.state === 'active' || input.archived === true && record.state === 'archived')
            && (input.id === undefined || record.id === input.id) && (input.kind === undefined || record.kind === input.kind)
            && (input.date === undefined || record.date === input.date) && (input.status === undefined || record.data.status === input.status)
            && (input.since === undefined || (record.date ?? record.createdAt.slice(0, 10)) >= String(input.since))
            && (input.until === undefined || (record.date ?? record.createdAt.slice(0, 10)) <= String(input.until))
            && (!term || (record.title + '\n' + record.content + '\n' + JSON.stringify(record.data)).toLocaleLowerCase().includes(term)))
          if (input.recent !== false) records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
          records = options.search?.(records, input, request.view.scope) ?? records
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
          const operation = request.offer.sourceActionId
          if (operation !== modelAction && !options.modelActions?.some(action => action.id === operation)) throw new Error('Unsupported record action')
          const input = memoryInputRecord(request.input, 'record write')
          if (operation !== modelAction && !request.grant) throw new Error('The action needs this Source\'s pinned read grant')
          const snapshot = await change(operation, input, request.view.scope, undefined, request.signal, operation !== modelAction ? pinned(request.grant!.value) : undefined)
          const affected = snapshot.records.filter(record => visibleRecord(record, request.view.scope) && (input.id ? record.id === input.id : record.title === input.title)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          return createMemoryMutationReceipt(request.view.id, request.offer.id, context.sourceInstanceKey, snapshot.revision,
            { message: operation === 'propose' ? 'Saved for approval; not active context.' : 'Record saved.', pending: operation === 'propose', recordId: affected[0]?.id ?? null, version: affected[0]?.version ?? null }, operation === 'propose' ? 'candidate' : 'committed')
        },
        dispose() { snapshots.clear(); snapshotBytes = 0 },
      }
    },
  })
}
