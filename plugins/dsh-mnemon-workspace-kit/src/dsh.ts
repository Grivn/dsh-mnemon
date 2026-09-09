import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type { Agent, AgentHandle, AgentOptions, AgentRegistry } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { isAppendSurfaceEvent, SessionId, SessionLogOffset, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { MemoryOperationScope } from 'dsh-mnemon/contracts'

export interface VisibleMessage { seq: number; role: 'user' | 'assistant'; text: string; at: string }
/** Human transcript only: no replacement summaries, injected context, thoughts or tool blocks. */
export function visibleMessages(events: readonly SessionEvent[], maxCharacters = 200_000): { messages: VisibleMessage[]; truncated: boolean } {
  let remaining = maxCharacters
  const messages: VisibleMessage[] = []
  for (const event of events.slice().reverse()) {
    if (!isAppendSurfaceEvent(event) || event.type !== 'user/message' && event.type !== 'assistant/message') continue
    if (event.type === 'user/message' && event.data.source.kind !== 'user') continue
    const message = event.type === 'user/message' ? event.data : event.data.message
    const text = message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
    if (!text.trim()) continue
    if (remaining < text.length) return { messages: messages.reverse(), truncated: true }
    remaining -= text.length
    messages.push({ seq: event.seq, role: event.type === 'user/message' ? 'user' : 'assistant', text, at: new Date(event.time).toISOString() })
  }
  return { messages: messages.reverse(), truncated: false }
}
export function assertSessionScope(header: SessionHeader, scope: MemoryOperationScope): void {
  if (!scope.workspaceId || !header.cwd || resolve(header.cwd) !== resolve(scope.workspaceId)) throw new Error('Session is outside the selected workspace')
}

/** Public DSH services only. Callers own all authorization, intent and domain state. */
export class DshWorkspaceAdapter {
  constructor(readonly services: { sessionQuery: SessionQueryEngine; agents: AgentRegistry; workspaceRegistry?: WorkspaceRegistry }) {}
  async list(scope: MemoryOperationScope, signal?: AbortSignal) {
    if (!scope.workspaceId) return []
    const rows = await this.services.sessionQuery.listSessions(signal)
    return rows.filter(row => row.header.cwd && resolve(row.header.cwd) === resolve(scope.workspaceId!)).map(row => ({
      id: String(row.header.id), cwd: row.header.cwd!, createdAt: new Date(row.header.createdAt).toISOString(), status: this.services.agents.get(row.header.id)?.status ?? 'closed',
      live: row.live, ...(row.header.parentSession ? { parentId: String(row.header.parentSession) } : {}),
    }))
  }
  async observe(id: string, scope: MemoryOperationScope, signal?: AbortSignal) {
    const observation = await this.services.sessionQuery.observeSession(SessionId(id), { projectionMode: 'none', ...(signal ? { signal } : {}) })
    try { assertSessionScope(observation.header, scope); signal?.throwIfAborted(); return observation }
    catch (error) { observation[Symbol.dispose](); throw error }
  }
  async transcript(id: string, scope: MemoryOperationScope, signal?: AbortSignal, maxCharacters = 200_000) {
    const observation = await this.observe(id, scope, signal)
    try { return { ...visibleMessages(observation.events, maxCharacters), turns: observation.events.flatMap(event => event.type === 'turn/end' ? [{ turn: event.data.turn, seq: Number(event.seq) }] : []) } }
    finally { observation[Symbol.dispose]() }
  }
  async live(id: string, scope: MemoryOperationScope, signal?: AbortSignal): Promise<Agent> {
    const observation = await this.observe(id, scope, signal)
    observation[Symbol.dispose]()
    const current = this.services.agents.get(SessionId(id))
    if (current) { assertSessionScope(current.session.header, scope); return current }
    return (await this.services.agents.resume({ resumeSessionId: SessionId(id), ...(signal ? { signal } : {}) })).agent
  }
  async create(scope: MemoryOperationScope, options: { parentId?: string; throughSeq?: number; preset?: string; agentOptions?: AgentOptions; signal?: AbortSignal } = {}): Promise<AgentHandle> {
    if (!scope.workspaceId) throw new Error('Select a workspace before creating a session')
    const parentId = options.parentId ?? scope.sessionId
    const parent = parentId ? this.services.agents.get(SessionId(parentId)) : undefined
    if (parent) assertSessionScope(parent.session.header, scope)
    let seed: readonly SessionEvent[] | undefined
    let preset = options.preset ?? parent?.session.header.agentPreset
    let inheritedOptions = parent?.options
    if (options.throughSeq !== undefined && (!parentId || !Number.isSafeInteger(options.throughSeq) || options.throughSeq < 0)) throw new Error('A valid parent and completed-turn boundary are required')
    if (parentId) {
      const observation = await this.observe(parentId, scope, options.signal)
      try {
        if (options.throughSeq !== undefined) {
          const index = observation.events.findIndex(event => event.seq === options.throughSeq && event.type === 'turn/end')
          if (index < 0) throw new Error('Choose the end of a completed turn for a fork')
          seed = observation.events.slice(0, index + 1)
        }
        preset ??= observation.header.agentPreset
        const header = observation.events.findLast(event => event.type === 'request/header')
        if (header?.type === 'request/header') {
          const config = header.data.header.config
          inheritedOptions = { provider: config.provider, model: config.model, ...(config.reasoningEffort !== undefined ? { reasoningEffort: config.reasoningEffort } : {}), ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}) }
        }
      } finally { observation[Symbol.dispose]() }
    }
    const workspace = await this.services.workspaceRegistry?.resolveByPath(scope.workspaceId)
    const handle = await this.services.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: resolve(scope.workspaceId), ...(parentId ? { parentSession: SessionId(parentId) } : {}), ...(preset ? { agentPreset: preset } : {}), ...(seed ? { isSeeded: true } : {}) },
      ...(seed ? { seed, inheritedEventCount: SessionLogOffset(seed.length) } : {}), ...(options.agentOptions ?? inheritedOptions ? { agentOptions: options.agentOptions ?? inheritedOptions! } : {}), ...(options.signal ? { signal: options.signal } : {}) })
    if (workspace) {
      try { await workspace.attachSession(handle.agent.session.id) }
      catch (error) { throw new Error(`Session ${handle.agent.session.id} was created but could not be attached to its workspace: ${error instanceof Error ? error.message : String(error)}`) }
    }
    return handle
  }
  async deliver(id: string, text: string, scope: MemoryOperationScope, options: { plugin: string; wake?: boolean; steering?: boolean; signal?: AbortSignal }): Promise<{ status: string; delivery: string }> {
    if (!text.trim() || text.length > 100_000) throw new Error('Message must contain 1–100000 characters')
    const agent = await this.live(id, scope, options.signal)
    options.signal?.throwIfAborted()
    const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: options.plugin, form: 'relay' } })
    if (options.steering) agent.steer(message)
    else if (options.wake) agent.followup(message)
    else agent.inject(message)
    return { status: agent.status, delivery: options.steering ? 'steering' : options.wake ? 'followup' : 'context' }
  }
}
