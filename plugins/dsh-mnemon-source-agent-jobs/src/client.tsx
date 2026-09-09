import { useCallback, useEffect, useMemo, useState } from 'react'
import { installMemorySourceUI, type MemorySourcePageProps, type MemorySourceUIContext } from 'dsh-mnemon/client'
import { collectionStyles, createCollectionPage } from 'dsh-mnemon-workspace-kit/client'
import type { RecordSnapshot } from 'dsh-mnemon-workspace-kit'
import type { MemoryJsonValue } from 'dsh-mnemon/contracts'
import type { ExecutionPlan } from './engine.ts'
export const inject = ['slots']
interface AdapterSummary { id: string; label: string; models: string[]; supportsImages: boolean; resumable: boolean }
function JobControls(props: MemorySourcePageProps) {
  const zh = props.locale.startsWith('zh'), [snapshot, setSnapshot] = useState<RecordSnapshot>({ revision: '', records: [] }), [selected, setSelected] = useState(''), [plan, setPlan] = useState<{ value: ExecutionPlan; revision: string } | null>(null), [log, setLog] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!props.management) return
    const response = await props.management.read('snapshot'), value = response.value as unknown as RecordSnapshot
    setSnapshot(value)
    setSelected(current => value.records.some(record => record.id === current) ? current : value.records.filter(record => record.state === 'active').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id ?? '')
  }, [props.management])
  useEffect(() => { void load().catch(reason => setError(String(reason))); const timer = setInterval(() => { void load().catch(reason => setError(String(reason))) }, 2000); return () => clearInterval(timer) }, [load])
  const record = snapshot.records.find(record => record.id === selected)
  useEffect(() => { setPlan(current => current?.value.jobId === selected && current.value.version === record?.version ? current : null); setLog('') }, [selected, record?.version])
  const readLog = useCallback(async () => {
    if (!props.management || !selected) return
    const value = (await props.management.read('lookup-job-log', { id: selected })).value as { items: Array<{ text: string }> }
    setLog(value.items.map(item => item.text).join('\n'))
  }, [props.management, selected])
  useEffect(() => { if (!record || !['running', 'queued'].includes(String(record.data.status))) return; const timer = setInterval(() => { void readLog().catch(reason => setError(String(reason))) }, 1500); return () => clearInterval(timer) }, [readLog, record?.data.status])
  async function preview() {
    if (!props.management) return
    setBusy(true); setError('')
    try { const response = await props.management.read('execution-plan', { id: selected }); setPlan({ value: response.value as unknown as ExecutionPlan, revision: response.revision }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  async function operate(operation: string, input: MemoryJsonValue, revision = snapshot.revision) {
    if (!props.management) return
    setBusy(true); setError('')
    try {
      const response = await props.management.mutate(operation, input, { confirmed: true, expectedRevision: revision }); setSnapshot(response.value as unknown as RecordSnapshot); setPlan(null)
      if (operation === 'retry-job') setSelected((response.value as unknown as RecordSnapshot).records.filter(value => value.data.previousJobId === selected).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id ?? selected)
      await load(); props.onRefresh?.()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); await load() }
    finally { setBusy(false) }
  }
  const status: Record<string, string> = zh ? { draft: '待执行', queued: '排队中', running: '执行中', succeeded: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断', 'timed-out': '超时' } : { draft: 'Draft', queued: 'Queued', running: 'Running', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted', 'timed-out': 'Timed out' }
  return <section data-mnemon-collection aria-label={zh ? '执行控制' : 'Execution controls'}><style>{collectionStyles}</style><h2>{zh ? '执行控制' : 'Execution controls'}</h2>
    <label>{zh ? '选择任务' : 'Select job'} <select value={selected} onChange={event => setSelected(event.target.value)}><option value="">{zh ? '请选择' : 'Choose a job'}</option>{snapshot.records.filter(record => record.state === 'active').map(record => <option key={record.id} value={record.id}>{record.title} · {status[String(record.data.status)] ?? String(record.data.status)}</option>)}</select></label>
    {record && <article style={{ marginTop: 16 }}><h3>{record.title}</h3><p role="status">{status[String(record.data.status)] ?? String(record.data.status)}{record.data.exitCode !== null && record.data.exitCode !== undefined && ` · exit ${String(record.data.exitCode)}`}</p><small>{record.id}</small>
      {typeof record.data.error === 'string' && <p role="alert">{record.data.error}</p>}{typeof record.data.deliveryError === 'string' && <p>{zh ? '结果投递失败：' : 'Result delivery failed: '}{String(record.data.deliveryError)}</p>}
      <footer>{record.data.status === 'draft' && <button disabled={busy || !props.writable} onClick={() => void preview()}>{zh ? '预览执行计划' : 'Preview execution plan'}</button>}
      {['queued', 'running'].includes(String(record.data.status)) && <button disabled={busy || !props.writable} onClick={() => void operate('stop-job', { id: selected })}>{zh ? '取消任务' : 'Cancel job'}</button>}
      {['succeeded', 'failed', 'cancelled', 'interrupted', 'timed-out'].includes(String(record.data.status)) && <><button disabled={busy || !props.writable} onClick={() => void operate('retry-job', { id: selected })}>{zh ? '复制为新任务' : 'Copy for retry'}</button>{typeof record.data.externalSessionId === 'string' && <button disabled={busy || !props.writable} onClick={() => void operate('retry-job', { id: selected, resume: true })}>{zh ? '继续外部会话' : 'Resume external session'}</button>}</>}
      <button disabled={busy} onClick={() => void readLog().catch(reason => setError(String(reason)))}>{zh ? '读取日志' : 'Read log'}</button></footer>
    </article>}
    {plan && <article aria-label={zh ? '待确认的执行计划' : 'Execution plan to confirm'} style={{ marginTop: 16 }}><h3>{zh ? '执行计划' : 'Execution plan'}</h3>
      <p>{zh ? '程序' : 'Program'}: <code>{plan.value.command}</code><br />{zh ? '工作目录' : 'Working directory'}: {plan.value.cwd}<br />{zh ? '时限' : 'Timeout'}: {plan.value.timeoutSeconds}s</p>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto' }}>{JSON.stringify(plan.value.args, null, 2)}</pre>
      {plan.value.stdin && <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{plan.value.prompt}</pre>}
      <footer><button data-primary="true" disabled={busy || !props.writable} onClick={() => void operate('start-job', { id: selected, plan: plan.value } as unknown as MemoryJsonValue, plan.revision)}>{zh ? '确认并执行' : 'Confirm and run'}</button><button onClick={() => setPlan(null)}>{zh ? '关闭计划' : 'Close plan'}</button></footer>
    </article>}
    {error && <p role="alert">{error}</p>}{log && <article style={{ marginTop: 16 }}><h3>{zh ? '最近日志' : 'Recent log'}</h3><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto' }}>{log}</pre></article>}
  </section>
}
export function Page(props: MemorySourcePageProps) {
  const [adapters, setAdapters] = useState<AdapterSummary[]>([]), [error, setError] = useState(''), zh = props.locale.startsWith('zh')
  useEffect(() => { let active = true; void props.management?.read('adapters').then(response => { if (active) setAdapters(response.value as unknown as AdapterSummary[]) }).catch(reason => { if (active) setError(String(reason)) }); return () => { active = false } }, [props.management])
  const Collection = useMemo(() => createCollectionPage({ title: { en: 'Job requests', 'zh-CN': '任务请求' }, description: { en: 'Write a prompt, approve the request and inspect its execution plan.', 'zh-CN': '填写提示词、采纳任务请求，再检查具体执行计划。' }, kinds: [{ value: 'job', label: { en: 'CLI job', 'zh-CN': 'CLI 任务' } }], scopes: ['project'], defaultScope: 'project', editable: record => record.data.status === 'draft', fields: [
    { key: 'adapter', label: { en: 'Adapter', 'zh-CN': '执行适配器' }, type: 'select', options: adapters.map(adapter => ({ value: adapter.id, label: { en: adapter.label, 'zh-CN': adapter.label } })), defaultValue: adapters[0]?.id ?? '' },
    { key: 'model', label: { en: 'Model (optional)', 'zh-CN': '模型（可选）' }, type: 'text' },
    { key: 'attachments', label: { en: 'Image paths (comma separated)', 'zh-CN': '图片路径（逗号分隔）' }, type: 'list' },
    { key: 'context', label: { en: 'Reference context', 'zh-CN': '参考上下文' }, type: 'textarea' },
    { key: 'notify', label: { en: 'Deliver result to the originating session', 'zh-CN': '将结果投递到来源会话' }, type: 'boolean', defaultValue: true },
  ] }), [adapters])
  return <><JobControls {...props} /><hr />{error && <p role="alert">{error}</p>}{adapters.length ? <Collection {...props} /> : <p>{zh ? '请在本插件配置中添加 CLI 适配器，然后刷新页面。' : 'Configure a CLI adapter in this plugin, then refresh the page.'}</p>}</>
}
export function apply(ctx: MemorySourceUIContext): void { installMemorySourceUI(ctx, { sourceTypeId: 'agent-jobs', pages: [{ id: 'jobs', label: '后台任务 / Jobs', order: 47, component: Page, navigation: { group: 'sources', primary: true } }] }) }
