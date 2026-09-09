import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClientConnectionHandle } from '../host/protocol.ts'
import type { MemoryJsonValue } from '../core/contracts/index.ts'
import type { MemoryPluginEntryView, MemoryPluginPreference, MemoryViewConfigurationRequest, MemoryViewDashboard, MemoryViewInspection } from '../host/view-protocol.ts'
import type { MemoryStrategyConfigurationField } from '../sdk/strategy-configuration.ts'
import { MnemonClient } from './api.ts'
import css from './MemoryCompositionEditor.module.css'

export function MemoryCompositionEditor(props: { connection?: ClientConnectionHandle; sessionId?: string; workspaceId?: string; locale: string }) {
  const [open, setOpen] = useState(false), zh = props.locale.startsWith('zh')
  if (!props.connection) return null
  return <details className={css.root} onToggle={event => setOpen(event.currentTarget.open)}><summary>{zh ? '组合策略配置' : 'Composition settings'}</summary>{open && <Editor {...props} connection={props.connection} />}</details>
}
function Field(props: { field: MemoryStrategyConfigurationField; value: MemoryJsonValue | undefined; sources: MemoryViewDashboard['sources']; disabled: boolean; locale: string; onChange(value: MemoryJsonValue | undefined): void }) {
  const { field, value } = props, zh = props.locale.startsWith('zh'), label = field.label[zh ? 'zh-CN' : 'en'], t = (en: string, cn: string) => zh ? cn : en
  const list = Array.isArray(value) ? value as string[] : []
  return <fieldset disabled={props.disabled}><legend>{label}</legend>{field.description && <small>{field.description[zh ? 'zh-CN' : 'en']}</small>}
    {['source-list', 'string-list'].includes(field.input) ? <><div className={css.row}><label><input type="checkbox" checked={value !== undefined} onChange={event => props.onChange(event.target.checked ? [] : undefined)} />{t('Set explicitly', '手动设置')} {label}</label></div>{value !== undefined && <>{field.input === 'string-list' ? <textarea aria-label={label} value={list.join('\n')} onChange={event => props.onChange([...new Set(event.target.value.split('\n').map(value => value.trim()).filter(Boolean))])} /> : <><div className={css.sourceList}>{props.sources.filter(source => !field.sourceRoles || field.sourceRoles.includes(source.role)).map(source => <label key={source.sourceInstanceKey}><input type="checkbox" checked={list.includes(source.sourceInstanceKey)} onChange={event => props.onChange(event.target.checked ? [...list, source.sourceInstanceKey] : list.filter(key => key !== source.sourceInstanceKey))} />{source.label} <small>{source.sourceInstanceKey}</small></label>)}</div>{list.map((key, index) => <div className={css.order} key={key}><span>{index + 1}. {props.sources.find(source => source.sourceInstanceKey === key)?.label ?? key}</span><button type="button" disabled={!index} aria-label={t('Move up ', '上移 ') + key} onClick={() => { const next = [...list]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; props.onChange(next) }}>↑</button><button type="button" disabled={index === list.length - 1} aria-label={t('Move down ', '下移 ') + key} onClick={() => { const next = [...list]; [next[index + 1], next[index]] = [next[index]!, next[index + 1]!]; props.onChange(next) }}>↓</button></div>)}</>}</>}</> : field.input === 'textarea' ? <textarea aria-label={label} value={String(value ?? field.defaultValue ?? '')} maxLength={field.maximum ?? 4000} onChange={event => props.onChange(event.target.value)} /> : <input aria-label={label} type={field.input === 'number' ? 'number' : 'text'} value={String(value ?? field.defaultValue ?? '')} {...(field.minimum === undefined ? {} : { min: field.minimum })} {...(field.maximum === undefined ? {} : { max: field.maximum, maxLength: field.maximum })} onChange={event => props.onChange(field.input === 'number' ? event.target.value === '' ? undefined : Number(event.target.value) : event.target.value)} />}
    {value !== undefined && <button type="button" onClick={() => props.onChange(undefined)}>{t('Use default', '恢复默认')} · {label}</button>}
  </fieldset>
}
function Editor(props: { connection: ClientConnectionHandle; sessionId?: string; workspaceId?: string; locale: string }) {
  const client = useMemo(() => new MnemonClient(props.connection, props.sessionId, props.workspaceId), [props.connection, props.sessionId, props.workspaceId])
  const zh = props.locale.startsWith('zh'), t = (en: string, cn: string) => zh ? cn : en, label = (entry: MemoryPluginEntryView) => entry.label[zh ? 'zh-CN' : 'en']
  const [dashboard, setDashboard] = useState<MemoryViewDashboard>(), [draft, setDraft] = useState<Record<string, MemoryPluginPreference>>({}), [strategy, setStrategy] = useState(''), [editing, setEditing] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ request: MemoryViewConfigurationRequest; result: MemoryViewInspection }>()
  const epoch = useRef(0), serial = useRef(0), pending = useRef(false)
  const load = async () => {
    const current = ++serial.current, generation = epoch.current
    try { const next = await client.viewDashboard(); if (current !== serial.current || generation !== epoch.current) return; setDashboard(next); setDraft({}); setStrategy(next.strategyTypeId); setPreview(undefined); setError('') }
    catch (error) { if (current === serial.current && generation === epoch.current) setError(String(error)) }
  }
  useEffect(() => { epoch.current++; setDashboard(undefined); setDraft({}); setEditing(''); setPreview(undefined); setBusy(false); pending.current = false; void load(); return () => { epoch.current++; serial.current++ } }, [client])
  const entries = dashboard?.entries.filter(entry => entry.roles.includes('strategy') || entry.roles.includes('strategy-extension')) ?? []
  const selected = entries.find(entry => entry.entryId === editing), state = selected ? draft[selected.entryId] ?? selected : undefined
  const strategies = entries.filter(entry => entry.roles.includes('strategy') && entry.typeId)
  const disabled = busy || !dashboard?.writable
  const edit = (entry: MemoryPluginEntryView, value: MemoryPluginPreference) => { setDraft(old => ({ ...old, [entry.entryId]: value })); setPreview(undefined); setStatus(''); setError('') }
  const request = (): MemoryViewConfigurationRequest => {
    if (!dashboard) throw new Error('Composition settings are unavailable')
    const edits = structuredClone(draft)
    if (strategy !== dashboard.strategyTypeId) {
      for (const entry of entries) {
        const previous = edits[entry.entryId] ?? entry
        if (entry.roles.includes('strategy')) edits[entry.entryId] = { enabled: entry.typeId === strategy, config: previous.config }
        else if (entry.strategyTypeId !== strategy && previous.enabled) edits[entry.entryId] = { enabled: false, config: previous.config }
      }
    }
    return { expectedRevision: dashboard.revision, strategyTypeId: strategy, entries: edits }
  }
  const inspect = async () => {
    if (pending.current || !dashboard) return
    const generation = epoch.current; pending.current = true; setBusy(true); setError(''); setStatus(''); setPreview(undefined)
    try { const value = request(), result = await client.previewView(value); if (generation === epoch.current) setPreview({ request: value, result }) }
    catch (error) { if (generation === epoch.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (generation === epoch.current) { pending.current = false; setBusy(false) } }
  }
  const apply = async () => {
    if (pending.current || !preview || disabled || JSON.stringify(preview.request) !== JSON.stringify(request())) return
    const generation = epoch.current; pending.current = true; setBusy(true); setError(''); setStatus('')
    let committed = false
    try {
      await client.applyView(preview.request); committed = true
      const next = await client.viewDashboard()
      if (generation !== epoch.current) return
      setDashboard(next); setDraft({}); setPreview(undefined); setStrategy(next.strategyTypeId); setStatus(t('Composition saved. New turns use these settings.', '组合配置已保存，新轮次将使用这些设置。'))
    } catch (error) {
      if (generation !== epoch.current) return
      setPreview(undefined)
      if (committed) { setDashboard(old => old ? { ...old, writable: false } : old); setError(t('Saved, but refresh failed. Reload settings before editing again.', '已保存，但状态刷新失败。请重新加载后再编辑。')) }
      else setError(error instanceof Error ? error.message : String(error))
    } finally { if (generation === epoch.current) { pending.current = false; setBusy(false) } }
  }
  return <div className={css.body} aria-label={t('Composition editor', '组合策略编辑器')}><p>{t('Installed Strategies and enhancements publish their own configuration fields. Preview the resulting Sources and operations before saving.', '已安装的策略和增强插件声明各自的配置字段。保存前可预览参与的 Source 和可用操作。')}</p>
    {error && <p role="alert" className={css.error}>{error}</p>}{status && <p role="status" className={css.success}>{status}</p>}
    {!dashboard ? <button disabled={busy} onClick={() => void load()}>{t('Load composition', '加载组合配置')}</button> : <>
      <label>{t('Composition Strategy', '组合策略')}<select disabled={disabled} value={strategy} onChange={event => { setStrategy(event.target.value); setPreview(undefined); setStatus('') }}>{!strategies.some(entry => entry.typeId === strategy) && <option value={strategy}>{strategy}</option>}{strategies.map(entry => <option key={entry.entryId} value={entry.typeId}>{label(entry)}</option>)}</select></label>
      <label>{t('Configure an installed component', '配置已安装组件')}<select value={editing} disabled={busy} onChange={event => setEditing(event.target.value)}><option value="">{t('Choose a component', '选择组件')}</option>{entries.filter(entry => entry.roles.includes('strategy') ? entry.typeId === strategy : entry.strategyTypeId === strategy).map(entry => <option key={entry.entryId} value={entry.entryId}>{label(entry)} · {(draft[entry.entryId] ?? entry).enabled ? t('Enabled', '已启用') : t('Disabled', '已关闭')}</option>)}</select></label>
      {selected && state && <><small>{selected.description[zh ? 'zh-CN' : 'en']}<br />{selected.packageName} · {selected.entryId}</small>{selected.diagnostic && <p className={css.error}>{selected.diagnostic}</p>}{selected.roles.includes('strategy-extension') && <div className={css.row}><label><input type="checkbox" checked={state.enabled} disabled={disabled || !selected.writable} onChange={event => edit(selected, { enabled: event.target.checked, config: structuredClone(state.config) })} />{t('Enable this enhancement', '启用此增强')}</label></div>}<div className={css.fields}>{selected.fields.map(field => <Field key={selected.entryId + '/' + field.key} field={field} value={state.config[field.key]} sources={dashboard.sources} disabled={disabled || !selected.writable} locale={props.locale} onChange={value => { const config = structuredClone(state.config); if (value === undefined) delete config[field.key]; else config[field.key] = value; edit(selected, { enabled: state.enabled, config }) }} />)}</div></>}
      <div className={css.row}><button disabled={busy} onClick={() => void inspect()}>{t('Preview composition', '预览组合')}</button><button disabled={busy} onClick={() => { setStatus(''); setEditing(''); void load() }}>{t('Reload configuration', '重新加载配置')}</button></div>
      {preview && <div className={css.preview} aria-label={t('Composition preview', '组合预览')}><strong>{t('Composition preview', '组合预览')}</strong><span>{new Set([...preview.result.projection, ...preview.result.routes, ...preview.result.actions].map(item => item.sourceInstanceKey)).size} Source · {preview.result.routes.length} {t('routes', '读取路由')} · {preview.result.actions.length} {t('actions', '操作')} · {preview.result.projection.reduce((n, fragment) => n + fragment.text.length, 0)} {t('context characters', '上下文字符')}</span><small>{t('Preview does not write memory or run actions. Current turns keep their original View.', '预览不会写入记忆或执行动作，当前进行中的轮次保留原 View。')}</small>{preview.result.diagnostics.map((diagnostic, index) => <p key={index} className={css.error}>{diagnostic}</p>)}<details><summary>{t('Sources and available operations', '参与来源和可用操作')}</summary>{[...new Set([...preview.result.projection, ...preview.result.routes, ...preview.result.actions].map(item => item.sourceInstanceKey))].map(key => <p key={key}><strong>{dashboard.sources.find(source => source.sourceInstanceKey === key)?.label ?? key}</strong><br />{preview.result.routes.filter(route => route.sourceInstanceKey === key).map(route => route.operationId).join(', ')}<br />{preview.result.actions.filter(action => action.sourceInstanceKey === key).map(action => action.operationId).join(', ')}</p>)}</details><button data-primary disabled={disabled} onClick={() => void apply()}>{t('Save this composition', '保存这份组合')}</button></div>}
    </>}
  </div>
}
