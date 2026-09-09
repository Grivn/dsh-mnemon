import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import type { MemoryJsonValue, MemorySourceDefinition } from 'dsh-mnemon/contracts'
import { defineMemoryPlugin, installMemory, memoryConfigurationDigest, memoryInputInteger, memoryInputRecord, memoryInputText } from 'dsh-mnemon/extension-sdk'
import { allowedDirectories, createRecordSource, digest, json, withLookupRoutes, type LookupResult, type RecordSourceConfig } from 'dsh-mnemon-workspace-kit'
import { DshWorkspaceAdapter, type VisibleMessage } from 'dsh-mnemon-workspace-kit/dsh'
import { importedSessions } from './imported.ts'

export const name = 'dsh-mnemon-source-sessions'
export const inject = ['mnemonMemory', 'sessionQuery', 'agents', 'workspaceRegistry']
export interface Config extends RecordSourceConfig { historyRoots?: string[]; rgPath?: string }
export const Config = z.object({ dataDir: z.string(), historyRoots: z.array(z.string()).default([]), rgPath: z.string().default('rg') }) as z<Config>
export const memoryPlugin = defineMemoryPlugin({ packageName: name, label: { en: 'Conversations', 'zh-CN': '会话资料' }, description: { en: 'Visible conversation search, bookmarks and explicit session actions.', 'zh-CN': '可见对话检索、轮次书签和会话操作。' }, roles: ['source'], provides: [{ id: 'source' }, { id: 'source.session-history' }] })
const queryProperties = { query: { type: 'string', maxLength: 1000 }, sessionId: { type: 'string' }, origin: { type: 'string', enum: ['all', 'native', 'imported'] }, sort: { type: 'string', enum: ['relevance', 'newest', 'oldest'] }, limit: { type: 'integer', minimum: 1, maximum: 100 }, active: { type: 'boolean' }, requestId: { type: 'string' } }
export function createSessionsSource(config: Config = {}, adapter?: DshWorkspaceAdapter): MemorySourceDefinition {
  const base = createRecordSource({ typeId: 'sessions', role: 'session-history', label: 'Conversation bookmarks', description: 'Scoped conversation references and aliases.', kinds: ['bookmark', 'alias'], scopes: ['project'], defaultScope: 'project',
    validate(record) {
      if (typeof record.data.sessionId !== 'string' || !record.data.sessionId || record.data.sessionId.length > 200) throw new Error('A conversation id is required')
      if (record.kind === 'bookmark' && (!Number.isSafeInteger(record.data.seq) || Number(record.data.seq) < 0)) throw new Error('A valid conversation sequence is required')
    }, project() { return 'Conversation history is read-only and available on demand. Retrieve visible user/assistant messages or scoped bookmarks; use the standard DSH session tools for authorized agent operations.' },
  }, config)
  const source = withLookupRoutes(base, {
    routes: [
      { id: 'history', description: 'Search visible user and assistant messages within this workspace, including configured JSONL imports. Never returns thoughts or tool internals.', capability: 'recall', inputSchema: { type: 'object', additionalProperties: false, properties: queryProperties }, maxCalls: 6, maxResults: 20, maxCharacters: 14_000 },
      { id: 'conversation', description: 'Read visible neighboring messages or completed turns in a workspace conversation.', capability: 'recall', inputSchema: { type: 'object', additionalProperties: false, required: ['sessionId'], properties: { sessionId: { type: 'string' }, seq: { type: 'integer', minimum: 0 }, radius: { type: 'integer', minimum: 0, maximum: 10 }, turns: { type: 'boolean' }, requestId: { type: 'string' } } }, maxCalls: 6, maxResults: 21, maxCharacters: 16_000 },
      { id: 'list-sessions', description: 'List sessions in the current workspace and their live status.', capability: 'status', inputSchema: { type: 'object', additionalProperties: false, properties: { active: { type: 'boolean' }, requestId: { type: 'string' } } }, maxCalls: 3, maxResults: 30, maxCharacters: 6000 },
    ],
    async namespace(scope) { return { workspaceId: scope.workspaceId ?? null, historyRoots: await allowedDirectories(config.historyRoots ?? []) } },
    async run(operation, input, namespace, scope, signal): Promise<LookupResult> {
      const pinned = memoryInputRecord(namespace, 'history namespace')
      if (pinned.workspaceId !== (scope.workspaceId ?? null)) throw new Error('Conversation namespace changed')
      const sessions = adapter ? await adapter.list(scope, signal) : []
      if (operation === 'list-sessions') {
        const selected = sessions.filter(session => !input.active || session.live)
        return { items: selected.slice(0, 100).map(session => ({ id: session.id, text: `${session.id}\n${session.status} · ${session.createdAt}${session.parentId ? '\nParent: ' + session.parentId : ''}`, provenance: json({ sessionId: session.id, at: session.createdAt, status: session.status }) })), truncated: selected.length > 100 }
      }
      const origin = input.origin ?? 'all'
      if (!['all', 'native', 'imported'].includes(String(origin))) throw new Error('Unsupported history origin')
      const id = memoryInputText(input.sessionId, 'sessionId', 200, false)
      const imported = origin !== 'native' ? await importedSessions(pinned.historyRoots as string[], scope.workspaceId, signal, config.rgPath) : { sessions: [], truncated: false }
      const corpus: Array<{ id: string; messages: VisibleMessage[]; path?: string; turns?: Array<{ turn: number; seq: number }> }> = imported.sessions.map(session => ({ id: session.id, messages: session.messages, path: session.path }))
      let truncated = imported.truncated
      if (origin !== 'imported' && adapter) {
        const native = sessions.filter(session => (!id || session.id === id) && (!input.active || session.live))
        truncated ||= native.length > 100
        for (const session of native.slice(0, 100)) {
          signal.throwIfAborted()
          const transcript = await adapter.transcript(session.id, scope, signal)
          corpus.push({ id: session.id, messages: transcript.messages, turns: transcript.turns })
          truncated ||= transcript.truncated
        }
      }
      if (operation === 'conversation') {
        const session = corpus.find(session => session.id === id)
        if (!session) throw new Error('Conversation is not available in this workspace')
        if (input.turns === true) return { items: (session.turns ?? []).slice(-100).map(turn => ({ id: `${session.id}/${turn.seq}`, text: `Turn ${turn.turn} · sequence ${turn.seq}`, provenance: { sessionId: session.id, seq: turn.seq, turn: turn.turn } })), truncated: (session.turns?.length ?? 0) > 100 }
        const seq = memoryInputInteger(input.seq, session.messages[0]?.seq ?? 0, 0, Number.MAX_SAFE_INTEGER)
        const index = session.messages.findIndex(message => message.seq >= seq)
        const radius = memoryInputInteger(input.radius, 3, 0, 10)
        const selected = index < 0 ? [] : session.messages.slice(Math.max(0, index - radius), index + radius + 1)
        return { items: selected.map(message => ({ id: `${session.id}/${message.seq}`, text: message.text, provenance: json({ sessionId: session.id, seq: message.seq, role: message.role, at: message.at, path: session.path }) })), truncated: truncated || selected.length < session.messages.length }
      }
      const term = (memoryInputText(input.query, 'query', 1000, false) ?? '').toLocaleLowerCase()
      const hits = corpus.filter(session => !id || session.id === id).flatMap(session => session.messages.flatMap(message => {
        const lower = message.text.toLocaleLowerCase(), position = term ? lower.indexOf(term) : 0
        if (position < 0) return []
        return [{ session, message, position, score: term ? lower.split(term).length - 1 : 0 }]
      }))
      if (input.sort !== undefined && !['relevance', 'newest', 'oldest'].includes(String(input.sort))) throw new Error('Unsupported history sort')
      hits.sort((a, b) => input.sort === 'oldest' ? a.message.at.localeCompare(b.message.at) : input.sort === 'newest' ? b.message.at.localeCompare(a.message.at) : b.score - a.score || b.message.at.localeCompare(a.message.at))
      const limit = memoryInputInteger(input.limit, 30, 1, 100)
      return { items: hits.slice(0, limit).map(({ session, message, position }) => ({ id: digest([session.id, message.seq]), text: message.text.slice(Math.max(0, position - 120), Math.max(0, position - 120) + 1500), provenance: json({ sessionId: session.id, seq: message.seq, role: message.role, at: message.at, path: session.path, excerpt: message.text.length > 1500 }) })), truncated: truncated || hits.length > limit }
    },
  })
  return { ...source, create(context) {
    const runtime = source.create(context)
    return { ...runtime, async manage(request) {
      if (!request.operation.startsWith('session-')) return runtime.manage!(request)
      if (request.mode !== 'mutate' || !request.confirmed || request.expectedRevision === undefined) throw new Error('A confirmed session operation is required')
      if (!adapter) throw new Error('The DSH session adapter is unavailable')
      const current = await runtime.manage!({ ...request, mode: 'read', operation: 'snapshot', input: {} })
      if (current.revision !== request.expectedRevision) throw new Error('Conversation records changed; refresh before continuing')
      const input = memoryInputRecord(request.input, 'session operation')
      const id = memoryInputText(input.sessionId, 'sessionId', 200, false)
      let receipt: MemoryJsonValue
      if (request.operation === 'session-create' || request.operation === 'session-fork') {
        const handle = await adapter.create(request.scope, { ...(id ? { parentId: id } : {}), ...(request.operation === 'session-fork' ? { throughSeq: memoryInputInteger(input.seq, -1, 0, Number.MAX_SAFE_INTEGER) } : {}), ...(request.signal ? { signal: request.signal } : {}) })
        receipt = { sessionId: String(handle.agent.session.id), status: handle.agent.status }
      } else if (request.operation === 'session-send') {
        if (!id) throw new Error('Select a target conversation')
        receipt = json(await adapter.deliver(id, memoryInputText(input.text, 'message', 100_000)!, request.scope, { plugin: name, wake: input.wake === true, steering: input.steering === true, ...(request.signal ? { signal: request.signal } : {}) }))
      } else throw new Error('Unsupported session operation')
      return { revision: current.revision, value: { items: [{ id: 'session-operation', text: JSON.stringify(receipt, null, 2), provenance: receipt }] } }
    } }
  } }
}
export function apply(ctx: Context, config: Config = {}): void { installMemory(ctx, { plugin: memoryPlugin, sources: [createSessionsSource(config, new DshWorkspaceAdapter({ sessionQuery: ctx.sessionQuery, agents: ctx.agents, workspaceRegistry: ctx.workspaceRegistry }))] }, { effectiveDigest: memoryConfigurationDigest(config) }) }
