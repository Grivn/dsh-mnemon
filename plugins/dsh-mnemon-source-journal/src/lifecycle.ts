import type {} from '@deepseek-ai/dsh-command-feedback'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { newRecord, RecordStore, type RecordValue } from 'dsh-mnemon-workspace-kit'
import { agentMemoryScope, visibleMessages } from 'dsh-mnemon-workspace-kit/dsh'
export async function captureJournalEvent(store: RecordStore, agent: Agent, event: SessionEvent, config: { captureTurns?: boolean; captureFeedback?: boolean }, signal?: AbortSignal): Promise<void> {
  if (!agent.session.header.cwd || agent.session.header.origin === 'subagent') return
  const scope = agentMemoryScope(agent), key = `${scope.sessionId}:${event.seq}:${event.type}`
  let record: RecordValue | undefined
  if (event.type === 'feedback/record' && config.captureFeedback !== false) {
    record = newRecord('feedback', 'Session feedback', event.data.text.slice(0, 30_000), 'project', scope, { sentiment: 'neutral', category: 'explicit-feedback', eventKey: key, sessionId: scope.sessionId!, seq: Number(event.seq), exactQuote: event.data.text.length <= 30_000, truncated: event.data.text.length > 30_000 })
  } else if (event.type === 'turn/end' && config.captureTurns === true) {
    const events = agent.session.ownEvents(), start = events.findLastIndex(value => value.type === 'turn/start' && value.data.turn === event.data.turn)
    const messages = visibleMessages(events.slice(Math.max(start, 0)).filter(value => value.seq <= event.seq), 30_000)
    if (!messages.messages.some(message => message.role === 'user')) return
    record = newRecord('result', `Conversation turn ${event.data.turn}`, messages.messages.map(message => `[${message.role} #${message.seq}] ${message.text}`).join('\n\n').slice(0, 30_000), 'project', scope, { category: 'conversation', eventKey: key, sessionId: scope.sessionId!, turn: event.data.turn, truncated: messages.truncated })
  }
  if (!record) return
  record.data.eventAt = new Date(event.time).toISOString()
  await store.change(undefined, records => { if (!records.some(value => value.data.eventKey === key)) records.push(record!) }, signal)
}
