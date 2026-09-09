import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { MemorySourcePageFrame, type MemorySourcePageProps } from 'dsh-mnemon/client'
import type { MemoryJsonValue } from 'dsh-mnemon/contracts'
import type { RecordSnapshot, RecordValue, RecordScope, RecordState } from './records.ts'

export type Localized = { en: string; 'zh-CN': string }
export interface CollectionField {
  key: string; label: Localized; type: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'boolean' | 'list'
  options?: Array<{ value: string; label: Localized }>; defaultValue?: MemoryJsonValue
}
export interface CollectionPageOptions {
  title: Localized; description: Localized
  kinds: Array<{ value: string; label: Localized }>
  scopes: RecordScope[]; defaultScope: RecordScope
  scopeForKind?: Readonly<Record<string, RecordScope>>
  fields?: CollectionField[]
  renderExtras?(props: MemorySourcePageProps, snapshot: RecordSnapshot, reload: () => Promise<void>): ReactNode
  recordActions?: Array<{ label: Localized; operation: string; available?(record: RecordValue): boolean; data?(record: RecordValue): { [key: string]: MemoryJsonValue } }>
}

const copy = {
  en: { add: 'Add', proposal: 'Save for review', create: 'Save', cancel: 'Cancel', title: 'Title', content: 'Content', kind: 'Type', scope: 'Scope', query: 'Search records', active: 'Active', pending: 'Needs review', archived: 'Archived', rejected: 'Rejected', deleted: 'Removed', all: 'All', empty: 'No records in this view.', edit: 'Edit', approve: 'Approve', reject: 'Reject', archive: 'Archive', restore: 'Restore', remove: 'Remove', history: 'History', refresh: 'Refresh', global: 'Global', project: 'Project', session: 'Session', daily: 'Daily', date: 'Date', readOnly: 'Read only', saved: 'Saved', signals: 'signals', unavailable: 'Enable this Source to use this page.', busy: 'Saving…', activeNote: 'Approved records can participate in context. Proposals remain inactive until reviewed.' },
  'zh-CN': { add: '添加', proposal: '提交审核', create: '保存', cancel: '取消', title: '标题', content: '内容', kind: '类型', scope: '范围', query: '搜索条目', active: '已生效', pending: '待审核', archived: '已归档', rejected: '已拒绝', deleted: '已移除', all: '全部', empty: '当前视图暂无条目。', edit: '编辑', approve: '采纳', reject: '拒绝', archive: '归档', restore: '恢复', remove: '移除', history: '历史记录', refresh: '刷新', global: '全局', project: '项目', session: '会话', daily: '每日', date: '日期', readOnly: '只读', saved: '已保存', signals: '次建议', unavailable: '启用此 Source 后即可使用此页面。', busy: '保存中…', activeNote: '已采纳条目可参与上下文。待审核建议在采纳前不会生效。' },
}
const styles = `[data-mnemon-collection]{color:inherit;min-width:0;padding:4px 0 24px;font-size:14px}
[data-mnemon-collection] *{box-sizing:border-box}[data-mnemon-collection] header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}[data-mnemon-collection] h2{font-size:20px;margin:0 0 8px}[data-mnemon-collection] p{line-height:1.6;margin:8px 0;overflow-wrap:anywhere}[data-mnemon-collection] small{opacity:.7}
[data-mnemon-collection] button,[data-mnemon-collection] select,[data-mnemon-collection] input,[data-mnemon-collection] textarea{font:inherit;color:inherit;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:7px;background:color-mix(in srgb,currentColor 3%,transparent);padding:8px 10px;max-width:100%}[data-mnemon-collection] select option{color:CanvasText;background:Canvas}[data-mnemon-collection] button{cursor:pointer;white-space:nowrap}[data-mnemon-collection] button:disabled{opacity:.45;cursor:default}[data-mnemon-collection] button[data-primary=true]{background:#276653;color:#fff;border-color:#276653}
[data-mnemon-collection] .mc-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}[data-mnemon-collection] .mc-toolbar input{flex:1;min-width:140px}[data-mnemon-collection] .mc-toolbar button[aria-pressed=true]{border-color:#469c7c;background:color-mix(in srgb,#469c7c 16%,transparent)}
[data-mnemon-collection] .mc-list{display:grid;gap:12px}[data-mnemon-collection] article{border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:10px;padding:16px;background:color-mix(in srgb,currentColor 2%,transparent)}[data-mnemon-collection] article h3{font-size:16px;margin:0}[data-mnemon-collection] .mc-content{white-space:pre-wrap}[data-mnemon-collection] .mc-meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:9px 0;font-size:12px;opacity:.8}[data-mnemon-collection] .mc-badge{padding:3px 7px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:4px}[data-mnemon-collection] footer{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}[data-mnemon-collection] details{margin-top:12px}[data-mnemon-collection] summary{cursor:pointer}
[data-mnemon-collection] form{border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:10px;padding:20px;margin:16px 0}[data-mnemon-collection] form label{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}[data-mnemon-collection] form input,[data-mnemon-collection] form textarea{width:100%}[data-mnemon-collection] form input[type=checkbox]{width:auto;align-self:flex-start}[data-mnemon-collection] .mc-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}[data-mnemon-collection] [role=alert]{border-left:3px solid #c16c4d;padding:12px;background:color-mix(in srgb,#c16c4d 10%,transparent)}[data-mnemon-collection] [role=status]{color:#59a988;margin:12px 0}[data-mnemon-collection] .mc-empty{padding:36px;text-align:center;opacity:.7}@media(max-width:600px){[data-mnemon-collection] header{flex-wrap:wrap}[data-mnemon-collection] .mc-fields{grid-template-columns:1fr}[data-mnemon-collection] form{padding:14px}[data-mnemon-collection] .mc-toolbar{gap:6px}[data-mnemon-collection] .mc-toolbar button{padding:6px 8px}}
`

export function createCollectionPage(options: CollectionPageOptions): (props: MemorySourcePageProps) => ReactNode {
  return function CollectionPage(props) {
    const language = props.locale.startsWith('zh') ? 'zh-CN' : 'en'
    const t = copy[language]
    const label = (value: Localized) => value[language]
    const [snapshot, setSnapshot] = useState<RecordSnapshot>({ revision: '', records: [] })
    const [filter, setFilter] = useState<RecordState | 'all'>('active')
    const [query, setQuery] = useState('')
    const [limit, setLimit] = useState(25)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [busy, setBusy] = useState(false)
    const [editing, setEditing] = useState<RecordValue | 'new' | null>(null)
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [kind, setKind] = useState(options.kinds[0]!.value)
    const [scope, setScope] = useState(options.defaultScope)
    const [date, setDate] = useState('')
    const [data, setData] = useState<{ [key: string]: MemoryJsonValue }>({})
    const load = useCallback(async () => {
      if (!props.management) return
      try { const result = await props.management.read('snapshot'); setSnapshot(result.value as unknown as RecordSnapshot); setError('') }
      catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    }, [props.management])
    useEffect(() => { void load() }, [load])
    useEffect(() => { setLimit(25) }, [filter, query])
    const write = async (operation: string, input: { [key: string]: MemoryJsonValue }): Promise<boolean> => {
      if (!props.management || busy) return false
      setBusy(true); setError(''); setNotice('')
      try {
        const result = await props.management.mutate(operation, input, { confirmed: true, expectedRevision: snapshot.revision })
        setSnapshot(result.value as unknown as RecordSnapshot)
        setNotice(t.saved)
        return true
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); return false }
      finally { setBusy(false) }
    }
    const edit = (record: RecordValue | 'new') => {
      setEditing(record); setNotice('')
      setTitle(record === 'new' ? '' : record.title); setContent(record === 'new' ? '' : record.content)
      setKind(record === 'new' ? options.kinds[0]!.value : record.kind); setScope(record === 'new' ? options.defaultScope : record.scope)
      setDate(record === 'new' ? '' : record.date ?? '')
      setData(record === 'new' ? Object.fromEntries((options.fields ?? []).filter(field => field.defaultValue !== undefined).map(field => [field.key, field.defaultValue!])) : structuredClone(record.data))
    }
    const save = async (event: FormEvent, proposal = false) => {
      event.preventDefault()
      const normalized = { ...data }
      for (const field of options.fields ?? []) if (field.type === 'list' && typeof normalized[field.key] === 'string') normalized[field.key] = (normalized[field.key] as string).split(',').map(value => value.trim()).filter(Boolean)
      const input = { title, content, kind, scope, data: normalized, ...(date ? { date } : {}) }
      const ok = await write(editing === 'new' ? proposal ? 'propose' : 'create' : 'update', { ...input, ...(editing && editing !== 'new' ? { id: editing.id, version: editing.version } : {}) })
      if (ok) { setEditing(null); if (proposal) setFilter('pending') }
    }
    const fieldValue = (field: CollectionField) => data[field.key] ?? field.defaultValue ?? ''
    const setField = (key: string, value: MemoryJsonValue) => setData(current => ({ ...current, [key]: value }))
    const visible = snapshot.records.filter(record => (filter === 'all' || record.state === filter) && (!query || (record.title + '\n' + record.content + '\n' + JSON.stringify(record.data)).toLocaleLowerCase().includes(query.toLocaleLowerCase())))
      .sort((a, b) => filter === 'pending' ? b.signals - a.signals || b.updatedAt.localeCompare(a.updatedAt) : b.updatedAt.localeCompare(a.updatedAt))
    return <MemorySourcePageFrame locale={props.locale}><section data-mnemon-collection={props.sourceTypeId} aria-label={label(options.title)}><style>{styles}</style>
      <header><div><h2>{label(options.title)}</h2><p>{label(options.description)}</p><small>{t.activeNote}</small></div><div><button onClick={() => void load()}>{t.refresh}</button>{' '}<button data-primary="true" disabled={!props.writable || !props.management || busy} onClick={() => edit('new')}>{t.add}</button></div></header>
      {!props.management && <p>{t.unavailable}</p>}{props.management && !props.writable && <p>{t.readOnly}</p>}
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {editing && <form aria-label={editing === 'new' ? t.add : t.edit} onSubmit={event => void save(event)}>
        <label>{t.title}<input required maxLength={300} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>{t.content}<textarea rows={5} value={content} onChange={event => setContent(event.target.value)} /></label>
        <div className="mc-fields"><label>{t.kind}<select disabled={editing !== 'new'} value={kind} onChange={event => { setKind(event.target.value); if (options.scopeForKind?.[event.target.value]) setScope(options.scopeForKind[event.target.value]!) }}>{options.kinds.map(item => <option key={item.value} value={item.value}>{label(item.label)}</option>)}</select></label>
        <label>{t.scope}<select disabled={editing !== 'new' || options.scopeForKind !== undefined} value={scope} onChange={event => setScope(event.target.value as RecordScope)}>{options.scopes.map(value => <option key={value} value={value}>{t[value]}</option>)}</select></label>
        {scope === 'daily' && <label>{t.date}<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>}
        {(options.fields ?? []).map(field => <label key={field.key}>{label(field.label)}{field.type === 'boolean' ? <input type="checkbox" checked={fieldValue(field) === true} onChange={event => setField(field.key, event.target.checked)} />
          : field.type === 'select' ? <select value={String(fieldValue(field))} onChange={event => setField(field.key, event.target.value)}>{field.options?.map(option => <option key={option.value} value={option.value}>{label(option.label)}</option>)}</select>
          : field.type === 'textarea' ? <textarea rows={3} value={String(fieldValue(field))} onChange={event => setField(field.key, event.target.value)} />
          : <input type={field.type === 'date' || field.type === 'number' ? field.type : 'text'} value={Array.isArray(fieldValue(field)) ? (fieldValue(field) as string[]).join(', ') : String(fieldValue(field))}
            onChange={event => setField(field.key, field.type === 'number' ? Number(event.target.value) : event.target.value)} />}</label>)}
        </div><footer><button data-primary="true" disabled={busy || !props.writable}>{busy ? t.busy : t.create}</button>{editing === 'new' && <button type="button" disabled={busy || !title.trim()} onClick={event => void save(event, true)}>{t.proposal}</button>}<button type="button" disabled={busy} onClick={() => setEditing(null)}>{t.cancel}</button></footer>
      </form>}
      <div className="mc-toolbar" aria-label={label(options.title) + ' filters'}>{(['active', 'pending', 'archived', 'all'] as const).map(state => <button key={state} aria-pressed={filter === state} onClick={() => setFilter(state)}>{t[state]} {state === 'all' ? snapshot.records.length : snapshot.records.filter(record => record.state === state).length}</button>)}<input aria-label={t.query} placeholder={t.query} value={query} onChange={event => setQuery(event.target.value)} /></div>
      {options.renderExtras?.(props, snapshot, load)}
      <div className="mc-list">{visible.slice(0, limit).map(record => <article key={record.id} data-record-id={record.id}>
        <h3>{record.title}</h3><div className="mc-meta"><span className="mc-badge">{options.kinds.find(item => item.value === record.kind)?.label[language] ?? record.kind}</span>{record.kind !== record.scope && <span className="mc-badge">{t[record.scope]}</span>}<span className="mc-badge">{t[record.state]}</span><time dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleString(props.locale)}</time>{record.date && <span>{record.date}</span>}{record.signals > 1 && <span>{record.signals} {t.signals}</span>}</div>
        {record.content && <p className="mc-content">{record.content}</p>}
        <div className="mc-meta">{(options.fields ?? []).filter(field => record.data[field.key] !== undefined && record.data[field.key] !== '' && record.data[field.key] !== false).map(field => <span key={field.key} className="mc-badge">{label(field.label)}{field.type !== 'boolean' && <>: {field.options?.find(option => option.value === record.data[field.key])?.label[language] ?? (Array.isArray(record.data[field.key]) ? (record.data[field.key] as string[]).join(', ') : String(record.data[field.key]))}</>}</span>)}</div>
        {props.writable && <footer><button disabled={busy} onClick={() => edit(record)}>{t.edit}</button>{record.state === 'pending' && <><button data-primary="true" disabled={busy} onClick={() => void write('approve', { id: record.id, version: record.version })}>{t.approve}</button><button disabled={busy} onClick={() => void write('reject', { id: record.id, version: record.version })}>{t.reject}</button></>}
          {['active', 'pending'].includes(record.state) ? <button disabled={busy} onClick={() => void write('archive', { id: record.id, version: record.version })}>{t.archive}</button> : <button disabled={busy} onClick={() => void write('restore', { id: record.id, version: record.version })}>{t.restore}</button>}
          {options.recordActions?.filter(action => action.available?.(record) ?? true).map(action => <button key={action.operation} disabled={busy} onClick={() => void write(action.operation, { id: record.id, version: record.version, ...action.data?.(record) })}>{label(action.label)}</button>)}
        </footer>}
        {record.history.length > 0 && <details><summary>{t.history} ({record.history.length})</summary>{record.history.slice().reverse().map((entry, index) => <div key={index}><small>{new Date(entry.at).toLocaleString(props.locale)} · {entry.operation}</small><p className="mc-content">{entry.title}<br />{entry.content}</p></div>)}</details>}
      </article>)}</div>{visible.length === 0 && <p className="mc-empty">{t.empty}</p>}
      {visible.length > limit && <button onClick={() => setLimit(current => current + 25)}>{language === 'zh-CN' ? '加载更多' : 'Load more'}</button>}
    </section></MemorySourcePageFrame>
  }
}
