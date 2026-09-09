import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { COMPOSABLE_MEMORY_API_VERSION } from 'dsh-mnemon/contracts'
import { defineMemoryStrategy, installMemory } from 'dsh-mnemon/extension-sdk'
import { MemoryCompositionRunner } from 'dsh-mnemon/testing'
import type { RecordSnapshot } from 'dsh-mnemon-workspace-kit'
import { createCollaborationSource } from '../src/index.ts'

it('enforces addressed evidence, external approval, membership and pinned reservation versions through Core', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mnemon-rooms-')),
    filename = join(directory, 'app.ts')
  await writeFile(filename, '// synthetic project file')
  const runner = new MemoryCompositionRunner(),
    delivered: string[] = []
  const scope = { storage: 'custom' as const, workspaceId: directory, sessionId: 'creator' }
  await runner.mount(
    {
      apply(ctx: Context) {
        installMemory(ctx, {
          sources: [
            createCollaborationSource(
              { dataDir: directory },
              {
                async validate(id) {
                  if (!['creator', 'member', 'outsider'].includes(id)) throw new Error('Unknown project session')
                },
                async deliver(id, text, _scope, wake) {
                  delivered.push(`${id}:${wake}:${text}`)
                },
                async list() {
                  return []
                },
              },
            ),
          ],
        })
      },
    },
    { instanceId: 'rooms' },
  )
  await runner.mount(
    {
      apply(ctx: Context) {
        installMemory(ctx, {
          strategies: [
            defineMemoryStrategy({
              manifest: {
                apiVersion: COMPOSABLE_MEMORY_API_VERSION,
                kind: 'strategy',
                typeId: 'test-policy',
                packageName: 'test-policy',
                deterministic: true,
                supportedSourceRoles: ['collaboration'],
                maxSources: 4,
                maxRoutes: 8,
                maxActions: 16,
              },
              compose(_request, sources) {
                return {
                  strategyTypeId: 'test-policy',
                  explanation: 'Test public operations',
                  sources: sources.map((source) => ({
                    sourceInstanceKey: source.sourceInstanceKey,
                    projection: { mode: 'routed', maxCharacters: 10000 },
                    routeIds: source.routeIds,
                    actionIds: source.actionIds,
                  })),
                }
              },
            }),
          ],
        })
      },
    },
    { instanceId: 'policy' },
  )
  try {
    const client = await runner.managementClient('source:rooms', scope)
    const created = await client.mutate('create', { kind: 'room', title: 'Synthetic room' }, { confirmed: true })
    const id = (created.value as unknown as RecordSnapshot).records[0]!.id
    await client.mutate('invite-member', { id, memberId: 'member' }, { confirmed: true })
    const turn = await runner.beginTurn({ scope }),
      send = turn.view.actionOffers.find((offer) => offer.sourceActionId === 'send-message')!
    const payload = { id, message: 'Directed evidence', recipients: ['member'], wake: false }
    await expect(turn.executeAction(send.id, payload, () => false)).rejects.toThrow(/authoriz/i)
    expect(delivered).toHaveLength(0)
    await turn.executeAction(send.id, payload, () => true)
    expect(delivered[0]).toContain('member:false:Collaboration')
    const memberTurn = await runner.beginTurn({ scope: { ...scope, sessionId: 'member' } })
    expect(
      (await memberTurn.executeRoute(memberTurn.view.routes[0]!.id, { kind: 'message' })).items[0]?.text,
    ).toContain('Directed evidence')
    const outsideTurn = await runner.beginTurn({ scope: { ...scope, sessionId: 'outsider' } })
    expect((await outsideTurn.executeRoute(outsideTurn.view.routes[0]!.id, { kind: 'message' })).items).toHaveLength(0)
    const reserve = memberTurn.view.actionOffers.find((offer) => offer.sourceActionId === 'reserve-file')!
    await memberTurn.executeAction(reserve.id, { id, filename, minutes: 30 }, () => true)
    await client.read('snapshot')
    await expect(client.mutate('reserve-file', { id, filename, minutes: 30 }, { confirmed: true })).rejects.toThrow(
      /another session/,
    )
    await client.mutate('remove-member', { id, memberId: 'member' }, { confirmed: true })
    await expect(memberTurn.executeAction(reserve.id, { id, filename, minutes: 30 }, () => true)).rejects.toThrow(
      /changed/,
    )
    await expect(turn.executeAction(send.id, payload, () => true)).rejects.toThrow(/members/)
    await client.mutate('close-room', { id }, { confirmed: true })
    expect(JSON.stringify((await client.read('room-history', { id })).value)).toContain('Directed evidence')
    await client.mutate('restore', { id }, { confirmed: true })
    const restored = (await client.read('snapshot')).value as unknown as RecordSnapshot
    expect(restored.records.find((record) => record.id === id)).toMatchObject({
      state: 'active',
      data: { status: 'open' },
    })
  } finally {
    await runner.dispose()
  }
})
