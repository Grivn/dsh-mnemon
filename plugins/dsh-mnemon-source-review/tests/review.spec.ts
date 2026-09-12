import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { RecordStore, newRecord } from 'dsh-mnemon-workspace-kit'
import { countReviewRound, parseReview, ReviewEngine, type ReviewPort } from '../src/engine.ts'
const scope = { storage: 'custom' as const, workspaceId: '/project', sessionId: 'session' }
const answer = JSON.stringify({ severity: 'concern', summary: 'Check the claimed outcome', issues: [{ severity: 'concern', text: 'No visible test result is supplied.' }], proposals: [] })
async function until(check: () => Promise<boolean>) { for (let n=0;n<100;n++) { if (await check()) return; await new Promise(resolve=>setTimeout(resolve,10)) } throw new Error('Review did not settle') }
describe('independent conversation review', () => {
  it('keeps due state through further user rounds and fences replay', async () => {
    const store = new RecordStore(await mkdtemp(join(tmpdir(), 'mnemon-review-cycle-')))
    await countReviewRound(store, scope, 1, 2); await countReviewRound(store, scope, 1, 2); await countReviewRound(store, scope, 2, 2); await countReviewRound(store, scope, 3, 2)
    expect((await store.read()).records[0]?.data).toMatchObject({ rounds: 3, due: true, completedRound: 0 })
    await countReviewRound(store, { ...scope, sessionId: 'other' }, 1, 2)
    expect((await store.read()).records).toHaveLength(2)
  })
  it('limits suggestions and rejects unstructured or fabricated severity values', () => {
    expect(parseReview(answer).severity).toBe('concern')
    expect(() => parseReview('plain prose')).toThrow(/structured/)
    expect(() => parseReview(JSON.stringify({ ...JSON.parse(answer), severity: 'success' }))).toThrow(/severity/)
    expect(() => parseReview(JSON.stringify({ ...JSON.parse(answer), proposals: Array(3).fill({kind:'fact',title:'x',content:'x'}) }))).toThrow(/at most two/)
  })
  it('retains a separate review session, filtered constraints, structured history and explicit reset', async () => {
    const requests: Parameters<ReviewPort['complete']>[0][] = [], delivered: string[] = []
    const engine = new ReviewEngine(await mkdtemp(join(tmpdir(), 'mnemon-review-')), {
      async transcript() { return { messages: [{seq:1,role:'user',text:'Visible question',at:new Date().toISOString()}], truncated:false } },
      async complete(input) { requests.push(input); return answer }, async deliver(_scope, text) { delivered.push(text) },
    })
    try {
      await countReviewRound(engine.store, scope, 1, 1)
      await engine.store.change(undefined, records=>{ records.push(newRecord('constraint','Global rule','Be precise','global',scope),newRecord('constraint','Other project','DO NOT LEAK','project',{...scope,workspaceId:'/other'})) })
      await engine.queue(scope); await until(async()=> (await engine.store.read()).records.some(record=>record.kind==='review'))
      expect(requests[0]?.prompt).toContain('Visible question'); expect(requests[0]?.prompt).toContain('Be precise'); expect(requests[0]?.prompt).not.toContain('DO NOT LEAK')
      expect(delivered[0]).toContain('Conversation reviewer · concern')
      await engine.queue(scope,'What evidence is missing?'); await until(async()=> (await engine.store.read()).records.filter(record=>record.kind==='review').length===2)
      expect(requests[1]?.reviewerId).toBe(requests[0]?.reviewerId); expect(requests[1]?.history).toHaveLength(1)
      await engine.reset(scope); expect((await engine.store.read()).records[0]?.data.reviewerId).not.toBe(requests[0]?.reviewerId)
      expect((await engine.store.read()).records.filter(record=>record.kind==='review')).toHaveLength(2)
    } finally { await engine.dispose() }
  })
})
