import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import type { MemoryJsonValue, MemorySourceDefinition, MemoryOperationScope } from 'dsh-mnemon/contracts'
import {
  createMemoryMutationReceipt,
  defineMemoryPlugin,
  installMemory,
  memoryConfigurationDigest,
  memoryInputRecord,
} from 'dsh-mnemon/extension-sdk'
import {
  allowedDirectories,
  allowedFile,
  createRecordSource,
  digest,
  json,
  RecordStore,
  reviseRecord,
  sourceRecordDirectory,
  visibleRecord,
  type RecordValue,
} from 'dsh-mnemon-workspace-kit'
import { DshWorkspaceAdapter } from 'dsh-mnemon-workspace-kit/dsh'
import {
  actor,
  changeMembership,
  members,
  prepareMessage,
  reserveFile,
  roomFor,
  validateCollaborationRecord,
} from './rooms.ts'
export const name = 'dsh-mnemon-source-collaboration'
export const inject = ['mnemonMemory', 'sessionQuery', 'agents', 'workspaceRegistry']
export interface Config {
  dataDir?: string
  attachmentRoots?: string[]
}
export const Config = z.object({ dataDir: z.string(), attachmentRoots: z.array(z.string()).default([]) }) as z<Config>
export const memoryPlugin = defineMemoryPlugin({
  packageName: name,
  label: { en: 'Collaboration', 'zh-CN': '会话协作' },
  description: {
    en: 'Project rooms, directed messages and shared file reservations.',
    'zh-CN': '项目协作空间、定向消息与共享文件预约。',
  },
  roles: ['source'],
  provides: [{ id: 'source' }, { id: 'source.collaboration' }],
})
export interface CollaborationPort {
  validate(id: string, scope: MemoryOperationScope, signal?: AbortSignal): Promise<void>
  deliver(id: string, text: string, scope: MemoryOperationScope, wake: boolean, signal?: AbortSignal): Promise<void>
  list(scope: MemoryOperationScope, signal?: AbortSignal): Promise<Array<{ id: string; status: string; live: boolean }>>
}
const idSchema: MemoryJsonValue = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
  additionalProperties: false,
}
const reservationSchema: MemoryJsonValue = {
  type: 'object',
  required: ['id', 'filename'],
  properties: {
    id: { type: 'string' },
    filename: { type: 'string' },
    minutes: { type: 'integer', minimum: 1, maximum: 120 },
  },
  additionalProperties: false,
}
const messageSchema: MemoryJsonValue = {
  type: 'object',
  required: ['id', 'recipients', 'message'],
  properties: {
    id: { type: 'string' },
    recipients: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    message: { type: 'string', maxLength: 10000 },
    attachments: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    wake: { type: 'boolean' },
  },
  additionalProperties: false,
}
async function changeReservation(
  operation: string,
  records: RecordValue[],
  input: Record<string, MemoryJsonValue>,
  scope: MemoryOperationScope,
) {
  if (operation === 'reserve-file') {
    const room = roomFor(records, input.id, scope)
    if (!members(room).includes(actor(scope))) throw new Error('Join the room before reserving files')
    const target = await allowedFile(await allowedDirectories([], scope.workspaceId), String(input.filename ?? ''))
    reserveFile(records, target, scope, Number(input.minutes ?? 30))
    return
  }
  const record = records.find(
    (record) =>
      record.id === input.id &&
      record.kind === 'reservation' &&
      record.state === 'active' &&
      visibleRecord(record, scope),
  )
  if (!record || record.data.owner !== actor(scope)) throw new Error('Only the reservation owner can release it')
  reviseRecord(record, 'release')
  record.state = 'archived'
}
export function createCollaborationSource(config: Config, port: CollaborationPort): MemorySourceDefinition {
  const base = createRecordSource(
    {
      typeId: 'collaboration',
      role: 'collaboration',
      label: 'Collaboration',
      description: 'Rooms, addressed messages and reservations within a project.',
      kinds: ['room', 'message', 'reservation'],
      scopes: ['project'],
      defaultScope: 'project',
      prepare(record, scope) {
        if (record.kind !== 'room') throw new Error('Use the messaging or reservation controls')
        record.data = {
          creator: actor(scope),
          members: [actor(scope)],
          openJoin: record.data.openJoin ?? false,
          status: 'open',
        }
      },
      validate: validateCollaborationRecord,
      visible(record, scope) {
        return (
          record.kind !== 'message' ||
          record.data.sender === scope.sessionId ||
          (record.data.recipients as string[]).includes(scope.sessionId ?? '')
        )
      },
      project(records, scope) {
        return (
          records
            .filter((record) => record.kind === 'room')
            .map(
              (record) =>
                `${record.id}: ${record.title}; ${String(record.data.status)}; ${members(record).includes(scope.sessionId ?? '') ? 'member' : 'not joined'}`,
            )
            .join('\n') +
          '\nUnread messages: ' +
          records.filter(
            (record) => record.kind === 'message' && !(record.data.readBy as string[]).includes(scope.sessionId ?? ''),
          ).length
        )
      },
      modelActions: [
        {
          id: 'reserve-file',
          description: 'Reserve an existing project file for this session, or renew its lease.',
          capability: 'write',
          inputSchema: reservationSchema,
        },
        {
          id: 'release-file',
          description: 'Release a file reservation owned by this session.',
          capability: 'write',
          inputSchema: idSchema,
        },
        { id: 'leave-room', description: 'Leave a collaboration room.', capability: 'write', inputSchema: idSchema },
        {
          id: 'join-room',
          description: 'Join a room that permits open membership.',
          capability: 'write',
          inputSchema: idSchema,
        },
        {
          id: 'mark-read',
          description: 'Mark an addressed message as read.',
          capability: 'write',
          inputSchema: idSchema,
        },
      ],
      async mutate(operation, input, { records, scope }) {
        if (operation === 'reserve-file' || operation === 'release-file') {
          await changeReservation(operation, records, input, scope)
          return
        }
        if (operation === 'mark-read') {
          const record = records.find(
            (record) => record.id === input.id && record.kind === 'message' && visibleRecord(record, scope),
          )
          if (!record || !(record.data.recipients as string[]).includes(actor(scope)))
            throw new Error('Message is not addressed to this session')
          reviseRecord(record, 'mark-read')
          record.data.readBy = [...new Set([...(record.data.readBy as string[]), actor(scope)])]
          return
        }
        changeMembership(operation, records, input, scope)
      },
    },
    config,
  )
  const manifest = {
    ...base.manifest,
    actions: [
      ...(base.manifest.actions ?? []),
      {
        id: 'send-message',
        description:
          'Send the displayed message and attachment references to selected room members. Wake only when explicitly requested.',
        capability: 'write' as const,
        authority: 'session-message',
        inputSchema: messageSchema,
      },
    ],
  }
  return {
    ...base,
    manifest,
    create(context) {
      const runtime = base.create(context),
        store = new RecordStore(sourceRecordDirectory('collaboration', context, config))
      async function send(
        input: Record<string, MemoryJsonValue>,
        scope: MemoryOperationScope,
        revision?: string,
        signal?: AbortSignal,
      ) {
        const attachmentInput = Array.isArray(input.attachments)
          ? input.attachments.map(String)
          : String(input.attachments ?? '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
        if (attachmentInput.length > 8) throw new Error('At most eight attachments')
        const roots = await allowedDirectories(config.attachmentRoots ?? [], scope.workspaceId),
          attachments = await Promise.all(attachmentInput.map((value) => allowedFile(roots, value)))
        let message: RecordValue | undefined
        await store.change(
          revision,
          async (records) => {
            message = prepareMessage(records, input, scope, attachments)
            for (const id of message.data.recipients as string[]) await port.validate(id, scope, signal)
            records.push(message)
          },
          signal,
        )
        const deliveries: Record<string, string> = {}
        for (const id of message!.data.recipients as string[]) {
          try {
            signal?.throwIfAborted()
            const current = (await store.read(signal)).records
            const room = roomFor(current, message!.data.roomId, scope)
            if (!members(room).includes(id) || !members(room).includes(actor(scope)))
              throw new Error('Room membership changed before delivery')
            await port.deliver(
              id,
              `Collaboration · ${message!.title}\nFrom session ${actor(scope)}\nMessage ${message!.id}\n\n${message!.content}${attachments.length ? '\n\nAttachment references:\n' + attachments.join('\n') : ''}`,
              scope,
              input.wake === true,
              signal,
            )
            deliveries[id] = 'delivered'
          } catch (error) {
            deliveries[id] = 'failed: ' + String(error).slice(0, 1000)
          }
          await store.change(undefined, (records) => {
            const record = records.find((record) => record.id === message!.id)!
            reviseRecord(record, 'delivery')
            record.data.deliveries = json(deliveries)
            record.data.status =
              Object.keys(deliveries).length < (message!.data.recipients as string[]).length
                ? 'delivering'
                : Object.values(deliveries).every((value) => value === 'delivered')
                  ? 'delivered'
                  : 'partial'
          })
        }
        return {
          messageId: message!.id,
          deliveries,
          completion: Object.values(deliveries).every((value) => value === 'delivered')
            ? ('committed' as const)
            : ('partial' as const),
        }
      }
      return {
        ...runtime,
        async facts(request, signal) {
          const value = await runtime.facts(request, signal)
          return { ...value, actionIds: [...value.actionIds, 'send-message'] }
        },
        async manage(request) {
          const input = memoryInputRecord(request.input ?? {}, 'collaboration operation')
          if (request.mode === 'read' && request.operation === 'room-history') {
            const snapshot = await store.read(request.signal),
              room = snapshot.records.find(
                (record) => record.id === input.id && record.kind === 'room' && visibleRecord(record, request.scope),
              )
            if (!room || !members(room).includes(actor(request.scope)))
              throw new Error('Join this room to read addressed history')
            const rows = snapshot.records
              .filter(
                (record) =>
                  record.kind === 'message' &&
                  record.data.roomId === room.id &&
                  (record.data.sender === actor(request.scope) ||
                    (record.data.recipients as string[]).includes(actor(request.scope))),
              )
              .slice(-50)
            return {
              revision: snapshot.revision,
              value: {
                items: rows.map((record) => ({
                  id: record.id,
                  text: `${String(record.data.sender)} → ${(record.data.recipients as string[]).join(', ')}\n${record.createdAt} · ${String(record.data.status)}\n${record.content}\n${(record.data.attachments as string[]).join('\n')}`,
                  unread: !(record.data.readBy as string[]).includes(actor(request.scope)),
                })),
              },
            }
          }
          if (request.mode === 'read' && request.operation === 'presence')
            return {
              revision: (await store.read()).revision,
              value: json(await port.list(request.scope, request.signal)),
            }
          if (request.mode === 'mutate') {
            if (!request.confirmed || request.expectedRevision === undefined)
              throw new Error('Confirm the current collaboration operation')
            if (request.operation === 'send-message') {
              const result = await send(input, request.scope, request.expectedRevision, request.signal)
              return { revision: (await store.read()).revision, value: json(result) }
            }
            if (
              [
                'invite-member',
                'remove-member',
                'join-room',
                'leave-room',
                'close-room',
                'reserve-file',
                'release-file',
              ].includes(request.operation)
            ) {
              await store.change(
                request.expectedRevision,
                async (records) => {
                  if (request.operation === 'invite-member')
                    await port.validate(String(input.memberId ?? ''), request.scope, request.signal)
                  if (request.operation === 'reserve-file' || request.operation === 'release-file') {
                    await changeReservation(request.operation, records, input, request.scope)
                    return
                  }
                  changeMembership(request.operation, records, input, request.scope)
                },
                request.signal,
              )
              return runtime.manage!({ ...request, mode: 'read', operation: 'snapshot', input: {} })
            }
            if (request.operation === 'restore') {
              await store.change(
                request.expectedRevision,
                (records) => {
                  const room = records.find(
                    (record) =>
                      record.id === input.id && record.kind === 'room' && visibleRecord(record, request.scope),
                  )
                  if (
                    !room ||
                    room.data.creator !== actor(request.scope) ||
                    !['archived', 'deleted', 'rejected'].includes(room.state)
                  )
                    throw new Error('Only the creator can reopen an archived room')
                  if (input.version !== undefined && input.version !== room.version)
                    throw new Error('Room version changed')
                  reviseRecord(room, 'reopen-room')
                  room.state = 'active'
                  room.data.status = 'open'
                },
                request.signal,
              )
              return runtime.manage!({ ...request, mode: 'read', operation: 'snapshot', input: {} })
            }
            if (['update', 'approve', 'reject', 'archive', 'delete', 'restore'].includes(request.operation)) {
              const record = (await store.read(request.signal)).records.find(
                (record) => record.id === input.id && visibleRecord(record, request.scope),
              )
              if (record?.kind !== 'room') throw new Error('Messages and reservations use their dedicated controls')
              if (record.data.creator !== actor(request.scope)) throw new Error('Only the room creator can change it')
              if (input.data !== undefined) {
                const data = memoryInputRecord(input.data, 'room settings')
                for (const [key, value] of Object.entries(data))
                  if (key !== 'openJoin' && digest(value) !== digest(record.data[key]))
                    throw new Error('Use membership controls to change room members')
                input.data = { ...record.data, ...data }
              }
            }
          }
          return runtime.manage!({ ...request, input })
        },
        async mutate(request) {
          if (request.offer.sourceActionId !== 'send-message') return runtime.mutate!(request)
          if (request.offer.authority !== 'session-message')
            throw new Error('Session delivery requires explicit authority')
          const result = await send(
            memoryInputRecord(request.input, 'message'),
            request.view.scope,
            undefined,
            request.signal,
          )
          return createMemoryMutationReceipt(
            request.view.id,
            request.offer.id,
            context.sourceInstanceKey,
            (await store.read()).revision,
            json(result),
            result.completion,
          )
        },
      }
    },
  }
}
export function apply(ctx: Context, config: Config = {}) {
  const adapter = new DshWorkspaceAdapter({
    sessionQuery: ctx.sessionQuery,
    agents: ctx.agents,
    workspaceRegistry: ctx.workspaceRegistry,
  })
  installMemory(
    ctx,
    {
      plugin: memoryPlugin,
      sources: [
        createCollaborationSource(config, {
          async validate(id, scope, signal) {
            const observation = await adapter.observe(id, scope, signal)
            observation[Symbol.dispose]()
          },
          async deliver(id, text, scope, wake, signal) {
            await adapter.deliver(id, text, scope, { plugin: name, wake, ...(signal ? { signal } : {}) })
          },
          list: (scope, signal) => adapter.list(scope, signal),
        }),
      ],
    },
    { effectiveDigest: memoryConfigurationDigest(config) },
  )
}
