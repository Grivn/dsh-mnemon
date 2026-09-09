import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { listSkillFiles, readSkillFile, saveSkillFile } from './files.ts'
import type { SkillCandidate } from '@deepseek-ai/dsh-skill'
import z from 'schemastery'
import type { MemoryJsonValue, MemorySourceDefinition } from 'dsh-mnemon/contracts'
import { defineMemoryPlugin, installMemory, memoryConfigurationDigest, memoryInputRecord } from 'dsh-mnemon/extension-sdk'
import { allowedDirectories, createRecordSource, digest, json, RecordStore, reviseRecord, sourceRecordDirectory, visibleRecord, type RecordSourceConfig } from 'dsh-mnemon-workspace-kit'
import { agentMemoryScope, DshWorkspaceAdapter, installAgentHooks } from 'dsh-mnemon-workspace-kit/dsh'
import { sourceOptions } from './source.ts'
import { advanceSchedules, makeSchedule, renderPrompt } from './schedule.ts'
export const name = 'dsh-mnemon-source-playbooks'
export const inject = ['mnemonMemory', 'agents', 'sessionQuery', 'workspaceRegistry', 'skills']
export interface Config extends RecordSourceConfig { providerName?: string; skillDirectories?: string[] }
export const Config = z.object({ dataDir: z.string(), providerName: z.string().default('workspace-playbooks'), skillDirectories: z.array(z.string()).default([]) }) as z<Config>
export const memoryPlugin = defineMemoryPlugin({ packageName: name, label: { en: 'Playbooks', 'zh-CN': '工作方法' }, description: { en: 'Reviewed skills, reusable prompts and explicit session schedules.', 'zh-CN': '经过审核的技能、可复用提示词与显式会话调度。' }, roles: ['source'], provides: [{ id: 'source' }, { id: 'source.instruction-library' }] })
interface Integration { ctx?: Context; attach?(store: RecordStore): void; changed?(): void; adapter?: DshWorkspaceAdapter }
export function createPlaybooksSource(config: Config = {}, integration: Integration = {}): MemorySourceDefinition {
  const base = createRecordSource(sourceOptions, config)
  return { ...base, create(context) {
    const runtime = base.create(context), store = new RecordStore(sourceRecordDirectory('playbooks', context, config))
    integration.attach?.(store)
    const stop = integration.ctx ? installAgentHooks(integration.ctx, { async beforeStep(input) {
      if (input.step !== 1 || !input.messages.some(message => message.source.kind === 'user')) return []
      const due = await advanceSchedules(store, agentMemoryScope(input.agent), input.turn, input.signal)
      if (due.length) integration.changed?.()
      return due.map(prompt => createUserMessage({ content: [{ type: 'text', text: `Scheduled prompt: ${prompt.title}\nInvocation: ${prompt.id}\n\n${prompt.text}` }], source: { kind: 'plugin', plugin: name, form: 'instructions' } }))
    } }) : undefined
    return { ...runtime,
      async manage(request) {
        if (request.mode === 'read' && ['native-skills', 'native-skill'].includes(request.operation)) {
          if (!integration.ctx) throw new Error('The native skill registry is unavailable')
          const input = memoryInputRecord(request.input ?? {}, 'native skill lookup'), lookup = { cwd: request.scope.workspaceId, signal: request.signal }
          const providerName = config.providerName ?? 'workspace-playbooks', snapshot = await store.read(request.signal)
          if (request.operation === 'native-skills') {
            const skills = (await integration.ctx.skills.list(lookup)).filter(skill => skill.provider === providerName).slice(0, 300)
            return { revision: snapshot.revision, value: json(skills.map(skill => ({ name: skill.name, description: skill.description.slice(0, 1000), provider: skill.provider }))) }
          }
          const skill = await integration.ctx.skills.get(String(input.name ?? ''), lookup)
          if (!skill || skill.provider !== providerName) throw new Error('The skill is not enabled in this Source and workspace')
          return { revision: snapshot.revision, value: { name: skill.name, content: skill.content.slice(0, 50000), truncated: skill.content.length > 50000 } }
        }
        if (['skill-files', 'skill-file', 'save-skill-file'].includes(request.operation)) {
          const input = memoryInputRecord(request.input ?? {}, 'skill file operation'), snapshot = await store.read(request.signal)
          if (request.operation === 'save-skill-file') {
            if (request.mode !== 'mutate' || !request.confirmed || request.expectedRevision !== snapshot.revision) throw new Error('Confirm the current skill file edit')
            const result = await saveSkillFile(config.skillDirectories ?? [], String(input.path ?? ''), String(input.content ?? ''), String(input.digest ?? ''), request.signal)
            integration.changed?.(); return { revision: snapshot.revision, value: json(result) }
          }
          if (request.mode !== 'read') throw new Error('Skill browsing is read-only')
          return { revision: snapshot.revision, value: json(request.operation === 'skill-files' ? await listSkillFiles(config.skillDirectories ?? [], request.signal) : await readSkillFile(config.skillDirectories ?? [], String(input.path ?? ''), request.signal)) }
        }
        if (request.mode === 'read' && request.operation === 'prompt-preview') {
          const input = memoryInputRecord(request.input, 'prompt preview'), snapshot = await store.read(request.signal), book = snapshot.records.find(record => record.id === input.id && visibleRecord(record, request.scope) && record.state === 'active')
          if (!book || book.data.enabled === false) throw new Error('Choose an enabled, approved playbook')
          const variables = typeof input.variables === 'string' ? memoryInputRecord(JSON.parse(input.variables || '{}'), 'prompt variables') : memoryInputRecord(input.variables ?? {}, 'prompt variables')
          return { revision: snapshot.revision, value: { text: renderPrompt(book.content, variables, request.scope), version: book.version } }
        }
        if (request.mode === 'mutate' && ['schedule', 'use-now', 'stop-schedule'].includes(request.operation)) {
          if (!request.confirmed || request.expectedRevision === undefined) throw new Error('Confirm the current playbook before using it')
          const input = memoryInputRecord(request.input, 'playbook invocation')
          let invoked: ReturnType<typeof makeSchedule> | undefined
          await store.change(request.expectedRevision, records => {
            const record = records.find(record => record.id === input.id && visibleRecord(record, request.scope))
            if (!record || input.version !== undefined && record.version !== input.version) throw new Error('Playbook version changed')
            if (request.operation === 'stop-schedule') { if (record.kind !== 'schedule') throw new Error('Choose a schedule'); reviseRecord(record, 'stop'); record.data.status = 'stopped'; return }
            const variables = typeof input.variables === 'string' ? memoryInputRecord(JSON.parse(input.variables || '{}'), 'prompt variables') : memoryInputRecord(input.variables ?? {}, 'prompt variables')
            invoked = makeSchedule(record, request.scope, { variables, count: Number(input.count ?? 1), interval: Number(input.interval ?? 1), startAfter: Number(input.startAfter ?? 1) })
            if (request.operation === 'use-now') { if (!integration.adapter) throw new Error('Live DSH session delivery is unavailable'); invoked.data.status = 'delivering' }
            records.push(invoked)
          }, request.signal)
          if (request.operation === 'use-now' && invoked) {
            try {
              await integration.adapter!.deliver(request.scope.sessionId!, `Playbook: ${invoked.title}\nInvocation: ${invoked.id}\n\n${invoked.content}`, request.scope, { plugin: name, wake: input.wake === true, ...(request.signal ? { signal: request.signal } : {}) })
              await store.change(undefined, records => { const invocation = records.find(record => record.id === invoked!.id)!; reviseRecord(invocation, 'delivered'); invocation.data.status = 'completed'; invocation.data.uses = 1; const book = records.find(record => record.id === invocation.data.bookId); if (book) { reviseRecord(book, 'use'); book.data.uses = Number(book.data.uses ?? 0) + 1 } })
            } catch (error) { await store.change(undefined, records => { const invocation = records.find(record => record.id === invoked!.id)!; reviseRecord(invocation, 'delivery-failed'); invocation.data.status = 'failed'; invocation.data.error = String(error).slice(0, 2000) }); throw error }
          }
          integration.changed?.()
          return runtime.manage!({ ...request, mode: 'read', operation: 'snapshot', input: {} })
        }
        const result = await runtime.manage!(request); if (request.mode === 'mutate') integration.changed?.(); return result
      },
      async mutate(request) { const result = await runtime.mutate!(request); integration.changed?.(); return result },
      async dispose() { await stop?.(); await runtime.dispose?.() },
    }
  } }
}
export function apply(ctx: Context, config: Config = {}): void {
  let store: RecordStore | undefined, invalidate: (() => void) | undefined
  const providerName = config.providerName ?? 'workspace-playbooks'
  ctx.skills.registerProvider(control => {
    let files: Promise<FileSystemSkillProvider> | undefined
    const fileProvider = () => files ??= allowedDirectories(config.skillDirectories ?? []).then(roots => { control.signal.throwIfAborted(); return new FileSystemSkillProvider(ctx, control, { providerName, includeDefaultRoots: false, customSkillDirs: roots, watch: false }) })
    ctx.effect(() => async () => { await (await files)?.dispose() }, 'dispose playbook file provider')
    invalidate = control.invalidate
    const list = async (cwd?: string, signal?: AbortSignal) => (await store?.read(signal))?.records.filter(record => record.kind === 'skill' && record.state === 'active' && record.data.enabled === true && visibleRecord(record, { storage: 'custom', ...(cwd ? { workspaceId: cwd } : {}) })) ?? []
    return { name: providerName, async list(options) {
      const observed = await (await fileProvider()).list({ ...options, signal: options.signal ? AbortSignal.any([options.signal, control.signal]) : control.signal })
      const fileCandidates = Array.isArray(observed) ? observed : observed.candidates
      const records = (await list(options.cwd, options.signal)).map(record => ({ name: String(record.data.slug), description: String(record.data.summary || record.title).slice(0, 1000), invocation: { modelInvocable: true, userInvocable: true }, source: 'custom', provider: providerName, rank: 250, locator: { recordId: record.id, version: record.version }, resourceBase: { kind: 'opaque', description: 'Approved playbook ' + record.id } } satisfies SkillCandidate))
      return { candidates: [...records, ...fileCandidates], complete: (config.skillDirectories ?? []).length === 0 }
    }, async get(candidate, options) {
      const locator = candidate.locator as { recordId?: string; version?: number }
      if (!locator.recordId) return (await fileProvider()).get(candidate, options)
      const record = (await list(options.cwd, options.signal)).find(record => record.id === locator.recordId && record.version === locator.version)
      return record ? { ...candidate, content: record.content } : undefined
    } }
  })
  installMemory(ctx, { plugin: memoryPlugin, sources: [createPlaybooksSource(config, { ctx, attach(value) { store = value; invalidate?.() }, changed() { invalidate?.() }, adapter: new DshWorkspaceAdapter({ sessionQuery: ctx.sessionQuery, agents: ctx.agents, workspaceRegistry: ctx.workspaceRegistry }) })] }, { effectiveDigest: memoryConfigurationDigest(config) })
}
export { sourceOptions }
