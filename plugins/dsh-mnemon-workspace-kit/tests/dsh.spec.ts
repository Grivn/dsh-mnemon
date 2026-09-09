import { describe, expect, it, vi } from 'vitest'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import { DshWorkspaceAdapter, visibleMessages } from '../src/dsh.ts'
const user = createUserMessage({ content: [{ type: 'text', text: 'Visible user request' }], source: { kind: 'user' } })
const plugin = createUserMessage({ content: [{ type: 'text', text: 'Private injected instructions' }], source: { kind: 'plugin', plugin: 'test' } })
const assistant = createAssistantMessage({ content: [{ type: 'text', text: 'Visible assistant answer' }, { type: 'reasoning', text: 'Private thoughts' }], source: { provider: 'test', model: 'test' } })
const events = [
  { seq: 0, time: 1, type: 'turn/start', data: { turn: 1 } },
  { seq: 1, time: 2, type: 'user/message', surfaceOp: 'append', data: user },
  { seq: 2, time: 3, type: 'user/message', surfaceOp: 'append', data: plugin },
  { seq: 3, time: 4, type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, step: 1, message: assistant } },
  { seq: 4, time: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  { seq: 5, time: 6, type: 'user/message', surfaceOp: { op: 'replace', start: 1, end: 3 }, data: plugin },
] as unknown as SessionEvent[]
describe('public DSH adapter', () => {
  it('extracts only visible original user and assistant text', () => {
    const transcript = visibleMessages(events)
    expect(transcript.messages.map(message => message.text)).toEqual(['Visible user request', 'Visible assistant answer'])
    expect(JSON.stringify(transcript)).not.toMatch(/Private|thinking|injected/)
    expect(visibleMessages(events, 10).truncated).toBe(true)
  })
  it('forks exactly through a completed turn and preserves model and workspace', async () => {
    const dispose = vi.fn(), create = vi.fn(async (options: unknown) => options)
    const parent = { session: { header: { id: SessionId('parent'), cwd: '/project', agentPreset: 'focused' } }, options: { provider: 'test', model: 'custom' } }
    const adapter = new DshWorkspaceAdapter({ sessionQuery: { observeSession: vi.fn(async () => ({ events, header: parent.session.header, [Symbol.dispose]: dispose })) }, agents: { get: () => parent, create } } as any)
    await adapter.create({ storage: 'custom', workspaceId: '/project', sessionId: 'parent' }, { throughSeq: 4 })
    expect(create.mock.calls[0]?.[0]).toMatchObject({ meta: { cwd: '/project', agentPreset: 'focused', parentSession: 'parent', isSeeded: true }, inheritedEventCount: 5, agentOptions: parent.options, seed: events.slice(0, 5) })
    await expect(adapter.create({ storage: 'custom', workspaceId: '/project', sessionId: 'parent' }, { throughSeq: 3 })).rejects.toThrow(/completed turn/)
    expect(create).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(2)
    await expect(adapter.transcript('parent', { storage: 'custom', workspaceId: '/other' })).rejects.toThrow(/workspace/)
  })
  it('retains plugin provenance and does not wake a session by default', async () => {
    const inject = vi.fn(), followup = vi.fn(), steer = vi.fn()
    const agent = { status: 'idle', session: { header: { cwd: '/project' } }, inject, followup, steer }
    const adapter = new DshWorkspaceAdapter({ sessionQuery: { observeSession: async () => ({ header: { cwd: '/project' }, events: [], [Symbol.dispose]() {} }) }, agents: { get: () => agent } } as any)
    const scope = { storage: 'custom' as const, workspaceId: '/project' }
    await adapter.deliver('target', 'Context', scope, { plugin: 'reviewer' })
    expect(inject.mock.calls[0]?.[0].source).toEqual({ kind: 'plugin', plugin: 'reviewer', form: 'relay' }); expect(followup).not.toHaveBeenCalled()
    await adapter.deliver('target', 'Wake', scope, { plugin: 'team', wake: true }); expect(followup).toHaveBeenCalledTimes(1)
  })
})

it('restores recorded model options when concurrent deliveries resume a cold session', async () => {
  const dispose=vi.fn(), followup=vi.fn(), scope={storage:'custom' as const,workspaceId:'/project'}
  let loaded: any
  const agent={status:'idle',session:{header:{cwd:'/project'}},followup}
  const resume=vi.fn(async (_options: unknown)=>{ await Promise.resolve();loaded=agent;return{agent} })
  const services={sessionQuery:{observeSession:async()=>({header:{cwd:'/project'},events:[{type:'request/header',data:{header:{config:{provider:'fixture',model:'fixture-model',reasoningEffort:'high',maxTokens:2048}}}}],[Symbol.dispose]:dispose})},agents:{get:()=>loaded,resume}}
  const first=new DshWorkspaceAdapter(services as any),second=new DshWorkspaceAdapter(services as any)
  await Promise.all([first.deliver('cold','One',scope,{plugin:'one',wake:true}),second.deliver('cold','Two',scope,{plugin:'two',wake:true})])
  expect(resume).toHaveBeenCalledOnce()
  expect(resume.mock.calls[0]?.[0]).toMatchObject({resumeSessionId:'cold',agentOptions:{provider:'fixture',model:'fixture-model',reasoningEffort:'high',maxTokens:2048}})
  expect(followup).toHaveBeenCalledTimes(2);expect(dispose).toHaveBeenCalledTimes(2)
})

it('reads only images actually attached by the current session user', async () => {
  const image = (id: string, kind = 'user') => ({ seq: 1, time: 1, type: 'user/message', surfaceOp: 'append', data: { source: { kind }, content: [{ type: 'image', attachment: { attachmentId: id, name: id + '.png' } }] } })
  const readImage = vi.fn(async () => ({ data: Buffer.from('image') })), dispose = vi.fn()
  const adapter = new DshWorkspaceAdapter({ sessionQuery: { observeSession: async () => ({ header: { cwd: '/project' }, events: [image('first'), image('injected', 'plugin'), image('latest')], [Symbol.dispose]: dispose }) }, attachments: { readImage } } as any)
  const scope = { storage: 'custom' as const, workspaceId: '/project', sessionId: 'current' }
  expect((await adapter.readSessionImage(undefined, scope)).name).toBe('latest.png')
  expect((await adapter.readSessionImage('first', scope)).name).toBe('first.png')
  await expect(adapter.readSessionImage('injected', scope)).rejects.toThrow(/not referenced/)
  await expect(adapter.readSessionImage('unknown', scope)).rejects.toThrow(/not referenced/)
  await expect(adapter.readSessionImage('first', { ...scope, workspaceId: '/elsewhere' })).rejects.toThrow(/workspace/)
  expect(readImage).toHaveBeenCalledTimes(2); expect(dispose).toHaveBeenCalledTimes(5)
})
