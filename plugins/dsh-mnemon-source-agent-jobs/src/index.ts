import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import type { MemoryJsonValue, MemoryOperationScope, MemorySourceDefinition, MemorySourceManagementRequest } from 'dsh-mnemon/contracts'
import { createMemoryMutationReceipt, defineMemoryPlugin, installMemory, memoryConfigurationDigest, memoryInputRecord, memoryInputText } from 'dsh-mnemon/extension-sdk'
import { createRecordSource, digest, json, reviseRecord, sourceRecordDirectory, visibleRecord, withLookupRoutes, type LookupResult, type RecordValue } from 'dsh-mnemon-workspace-kit'
import { DshWorkspaceAdapter } from 'dsh-mnemon-workspace-kit/dsh'
import { JobEngine, preparePlan, terminalStates, validateJobConfig, type ExecutionPlan, type JobConfig } from './engine.ts'
export type { CliAdapter, ExecutionPlan, JobConfig } from './engine.ts'
export const name = 'dsh-mnemon-source-agent-jobs'
export const inject = ['mnemonMemory', 'sessionQuery', 'agents', 'workspaceRegistry']
export type Config = JobConfig
export const Config = z.object({ dataDir: z.string(), maxParallel: z.number().default(2), attachmentRoots: z.array(z.string()).default([]), notifyOwner: z.boolean().default(true),
  adapters: z.array(z.object({ id: z.string(), label: z.string(), command: z.string(), args: z.array(z.string()), resumeArgs: z.array(z.string()), input: z.union(['argument', 'stdin']), attachmentArgs: z.array(z.string()), supportsImages: z.boolean(), supportsUrls: z.boolean(), models: z.array(z.string()), defaultModel: z.string(), timeoutSeconds: z.number() })).default([]),
}) as z<Config>
export const memoryPlugin = defineMemoryPlugin({ packageName: name, label: { en: 'Background jobs', 'zh-CN': '后台任务' }, description: { en: 'Reviewed CLI execution with durable status, logs and recovery.', 'zh-CN': '经审核的 CLI 执行，支持持久状态、日志和恢复。' }, roles: ['source'], provides: [{ id: 'source' }, { id: 'source.agent-jobs' }] })
export interface CompletedJob { sourceInstanceKey: string; record: RecordValue; scope: MemoryOperationScope }
declare module '@deepseek-ai/cordis' { interface Events { 'mnemon-jobs/completed'(event: CompletedJob): void } }
interface Integration { completed?(event: CompletedJob): Promise<void> }
const engines = new Map<string, { engine: JobEngine; refs: number }>()
const idSchema: MemoryJsonValue = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string' } } }
const planSchema: MemoryJsonValue = { type: 'object', additionalProperties: false, required: ['id', 'plan'], properties: { id: { type: 'string' }, plan: { type: 'object', additionalProperties: true } } }

export function createAgentJobsSource(config: Config = {}, integration: Integration = {}): MemorySourceDefinition {
  validateJobConfig(config)
  const base = createRecordSource({ typeId: 'agent-jobs', role: 'agent-jobs', label: 'Background jobs', description: 'Approved project jobs and their execution history.', kinds: ['job'], scopes: ['project'], defaultScope: 'project',
    prepare(record, scope) {
      const data = record.data
      record.data = { adapter: String(data.adapter ?? ''), model: String(data.model ?? ''), attachments: data.attachments ?? [], context: data.context ?? '', status: 'draft', ownerSessionId: scope.sessionId ?? '', notify: data.notify ?? true }
    },
    validate(record) {
      if (!config.adapters?.some(adapter => adapter.id === record.data.adapter)) throw new Error('Choose a configured CLI adapter')
      if (record.content.length > 30_000 || typeof record.data.context !== 'string' || record.data.context.length > 10_000 || typeof record.data.model !== 'string' || !Array.isArray(record.data.attachments) || record.data.attachments.length > 8) throw new Error('Invalid prompt, model, context or attachments')
    },
    project(records) { return `Background jobs: ${records.filter(record => ['running', 'queued'].includes(String(record.data.status))).length} active, ${records.filter(record => terminalStates.includes(String(record.data.status))).length} finished. Read status and logs on demand. Preview a concrete execution plan before requesting external execution.` },
    modelActions: [{ id: 'cancel-job', description: 'Request cancellation of an owned queued/running job from this View.', capability: 'write', inputSchema: idSchema }],
    mutate(operation, input, { records, scope }) {
      const record = records.find(record => record.id === input.id && visibleRecord(record, scope))
      if (!record) throw new Error('Job is outside this project')
      if (operation === 'cancel-job') {
        if (!['queued', 'running'].includes(String(record.data.status))) throw new Error('Job is not running')
        reviseRecord(record, 'cancel-requested'); record.data.cancelRequested = true; return
      }
      if (operation !== 'retry-job' || !terminalStates.includes(String(record.data.status))) throw new Error('Only finished jobs can be copied for retry or resume')
      const now = new Date().toISOString()
      const data = { adapter: record.data.adapter!, model: record.data.model!, attachments: structuredClone(record.data.attachments!), context: record.data.context!, status: 'draft', ownerSessionId: scope.sessionId ?? '', notify: record.data.notify ?? true, previousJobId: record.id,
        ...(input.resume === true ? { resumeSessionId: memoryInputText(record.data.externalSessionId, 'external session id', 200)! } : {}) }
      records.push({ ...structuredClone(record), id: randomUUID(), title: record.title.slice(0, 280) + ' · retry', data, state: 'active', version: 1, signals: 1, createdAt: now, updatedAt: now, history: [] })
    },
  }, config)
  const manifest = { ...base.manifest, actions: [...base.manifest.actions ?? [], { id: 'run-job', description: 'Start an approved draft using the exact displayed execution plan. The plan includes command, argv, workspace, prompt and attachments.', capability: 'write' as const, authority: 'process-execution', inputSchema: planSchema }] }
  return { manifest: { ...manifest, consistency: 'namespace-pinned-live-read', routes: [
    { id: 'job-plan', description: 'Preview an approved job as a concrete JSON execution plan; oversized plans require the management page.', capability: 'recall', inputSchema: idSchema, maxCalls: 4, maxResults: 1, maxCharacters: 12_000 },
    { id: 'job-log', description: 'Read the recent log output for one project job.', capability: 'recall', inputSchema: idSchema, maxCalls: 8, maxResults: 1, maxCharacters: 12_000 }, ...base.manifest.routes ?? [],
  ] }, create(context) {
    const directory = sourceRecordDirectory('agent-jobs', context, config), key = digest([directory, config])
    let entry = engines.get(key)
    if (!entry) { entry = { refs: 0, engine: new JobEngine(directory, config, async (record, scope) => { await integration.completed?.({ sourceInstanceKey: context.sourceInstanceKey, record, scope }) }) }; engines.set(key, entry) }
    entry.refs++
    const engine = entry.engine
    const wrapped = withLookupRoutes({ ...base, manifest }, {
      routes: [
        { id: 'job-plan', description: 'Preview a concrete execution plan.', capability: 'recall', inputSchema: idSchema, maxCalls: 4, maxResults: 1, maxCharacters: 12_000 },
        { id: 'job-log', description: 'Read a job log.', capability: 'recall', inputSchema: idSchema, maxCalls: 8, maxResults: 1, maxCharacters: 12_000 },
      ],
      async namespace(scope) { return { workspaceId: scope.workspaceId ?? null, adapterDigest: digest(config.adapters ?? []) } },
      async run(operation, input, namespace, scope): Promise<LookupResult> {
        const grant = memoryInputRecord(namespace, 'job namespace')
        if (grant.workspaceId !== (scope.workspaceId ?? null) || grant.adapterDigest !== digest(config.adapters ?? [])) throw new Error('The job namespace changed')
        const id = memoryInputText(input.id, 'id', 100)!
        if (operation === 'job-log') return { items: [{ id, text: await engine.log(id, scope), provenance: { kind: 'process-log', jobId: id } }] }
        const record = (await engine.store.read()).records.find(record => record.id === id && visibleRecord(record, scope) && record.state === 'active')
        if (!record) throw new Error('An approved project job is required')
        const plan = await preparePlan(record, scope, config), text = JSON.stringify(plan, null, 2)
        return { items: [{ id, text: text.length <= 11_000 ? text : 'This plan exceeds the model review budget. Review and start it in the Background jobs page.', provenance: { kind: 'execution-plan', jobId: id } }], truncated: text.length > 11_000 }
      },
    }).create(context)
    const snapshot = (request: MemorySourceManagementRequest) => wrapped.manage!({ ...request, operation: 'snapshot', mode: 'read', input: {} })
    return { ...wrapped,
      async facts(request, signal) { await engine.ready; const facts = await wrapped.facts(request, signal); return { ...facts, actionIds: [...facts.actionIds, 'run-job'] } },
      async manage(request) {
        await engine.ready
        if (request.mode === 'mutate' && request.operation === 'update') {
          const input = memoryInputRecord(request.input, 'job update'), record = (await engine.store.read()).records.find(record => record.id === input.id && visibleRecord(record, request.scope))
          if (!record || record.data.status !== 'draft') throw new Error('Execution records are immutable after queueing; copy the job to retry')
          if (input.data !== undefined) {
            const data = memoryInputRecord(input.data, 'job fields'), editable = new Set(['adapter', 'model', 'attachments', 'context', 'notify'])
            for (const [key, value] of Object.entries(data)) if (!editable.has(key) && digest(value) !== digest(record.data[key])) throw new Error('Execution metadata cannot be edited')
            return wrapped.manage!({ ...request, input: { ...input, data: { ...record.data, ...data } } })
          }
        }
        if (request.mode === 'read' && request.operation === 'adapters') return { revision: (await snapshot(request)).revision, value: json((config.adapters ?? []).map(adapter => ({ id: adapter.id, label: adapter.label, models: adapter.models ?? [], supportsImages: adapter.supportsImages === true, resumable: !!adapter.resumeArgs }))) }
        if (request.mode === 'read' && request.operation === 'execution-plan') {
          const input = memoryInputRecord(request.input, 'job plan'), record = (await engine.store.read()).records.find(record => record.id === input.id && visibleRecord(record, request.scope) && record.state === 'active')
          if (!record) throw new Error('An approved job is required')
          return { revision: (await snapshot(request)).revision, value: json(await preparePlan(record, request.scope, config)) }
        }
        if (request.mode === 'mutate' && ['start-job', 'stop-job'].includes(request.operation)) {
          if (!request.confirmed || request.expectedRevision === undefined) throw new Error('Confirm the current execution plan before starting')
          const input = memoryInputRecord(request.input, 'job control'), id = memoryInputText(input.id, 'id', 100)!
          if (request.operation === 'start-job') await engine.enqueue(id, input.plan as unknown as ExecutionPlan, request.scope, request.expectedRevision, request.signal)
          else await engine.cancel(id, request.scope, request.expectedRevision, request.signal)
          return snapshot(request)
        }
        return wrapped.manage!(request)
      },
      async mutate(request) {
        if (request.offer.sourceActionId !== 'run-job') return wrapped.mutate!(request)
        if (request.offer.authority !== 'process-execution') throw new Error('External execution authority is required')
        const input = memoryInputRecord(request.input, 'job execution'), id = memoryInputText(input.id, 'id', 100)!
        await engine.enqueue(id, input.plan as unknown as ExecutionPlan, request.view.scope, undefined, request.signal)
        return createMemoryMutationReceipt(request.view.id, request.offer.id, context.sourceInstanceKey, (await engine.store.read()).revision, { jobId: id, state: 'queued', message: 'Accepted by the background runner. Read its status and logs for the final outcome.' }, 'accepted')
      },
      async dispose() { await wrapped.dispose?.(); entry!.refs--; if (entry!.refs === 0) { engines.delete(key); await engine.dispose() } },
    }
  } }
}
export function apply(ctx: Context, config: Config = {}): void {
  const adapter = new DshWorkspaceAdapter({ sessionQuery: ctx.sessionQuery, agents: ctx.agents, workspaceRegistry: ctx.workspaceRegistry })
  installMemory(ctx, { plugin: memoryPlugin, sources: [createAgentJobsSource(config, { async completed(event) {
    ctx.emit('mnemon-jobs/completed', event)
    if (config.notifyOwner !== false && event.record.data.notify !== false && typeof event.record.data.ownerSessionId === 'string' && event.record.data.ownerSessionId) {
      await adapter.deliver(event.record.data.ownerSessionId, `Background job ${event.record.title} (${event.record.id}) ${String(event.record.data.status)}.\n${String(event.record.data.output ?? event.record.data.error ?? '').slice(-6000)}`, event.scope, { plugin: name })
    }
  } })] }, { effectiveDigest: memoryConfigurationDigest(config) })
}
