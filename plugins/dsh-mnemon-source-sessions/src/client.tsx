import { useState } from 'react'
import { installMemorySourceUI, type MemorySourcePageProps, type MemorySourceUIContext } from 'dsh-mnemon/client'
import { collectionStyles, createCollectionPage, LookupPanel, RecordActionPanel, type LookupPanelOptions, type RecordActionPanelOptions } from 'dsh-mnemon-workspace-kit/client'
import type { MemoryJsonValue } from 'dsh-mnemon/contracts'
export const inject = ['slots']
const options: LookupPanelOptions = {
  title: { en: 'Search conversation history', 'zh-CN': '检索会话历史' }, operation: 'history', defaults: { query: '', origin: 'all', sort: 'relevance' },
  fields: [
    { key: 'query', label: { en: 'Search text', 'zh-CN': '检索文本' }, type: 'text' },
    { key: 'origin', label: { en: 'History source', 'zh-CN': '历史来源' }, type: 'select', options: [{ value: 'all', label: { en: 'All available', 'zh-CN': '全部可用来源' } }, { value: 'native', label: { en: 'DSH', 'zh-CN': 'DSH' } }, { value: 'imported', label: { en: 'Imported JSONL', 'zh-CN': '导入的 JSONL' } }] },
    { key: 'sort', label: { en: 'Order', 'zh-CN': '排序' }, type: 'select', options: [{ value: 'relevance', label: { en: 'Relevance', 'zh-CN': '相关性' } }, { value: 'newest', label: { en: 'Newest', 'zh-CN': '最新优先' } }, { value: 'oldest', label: { en: 'Oldest', 'zh-CN': '最早优先' } }] },
    { key: 'sessionId', label: { en: 'Conversation id (optional)', 'zh-CN': '会话标识（可选）' }, type: 'text' },
  ],
  itemActions: [
    { label: { en: 'Open conversation', 'zh-CN': '打开会话' }, operation: 'open-session', navigate: true, visible: item => !(item.provenance as { path?: string }).path, input: item => ({ sessionId: (item.provenance as { sessionId: string }).sessionId }) },
    { label: { en: 'Read surrounding messages', 'zh-CN': '阅读前后对话' }, operation: 'conversation', input(item) { const p = item.provenance as { sessionId: string; seq: number }; return { sessionId: p.sessionId, seq: p.seq, radius: 3 } } },
    { label: { en: 'Bookmark', 'zh-CN': '添加书签' }, operation: 'create', mutate: true, input(item) { const p = item.provenance as { sessionId: string; seq: number }; return { title: item.text.slice(0, 100), content: item.text, kind: 'bookmark', scope: 'project', data: { sessionId: p.sessionId, seq: p.seq } } } },
  ],
}
const Saved = createCollectionPage({ title: { en: 'Bookmarks and aliases', 'zh-CN': '书签与别名' }, description: { en: 'Keep a named reference to a conversation or a specific message.', 'zh-CN': '为会话或指定消息保存可检索的命名引用。' }, kinds: [{ value: 'bookmark', label: { en: 'Bookmark', 'zh-CN': '轮次书签' } }, { value: 'alias', label: { en: 'Alias', 'zh-CN': '会话别名' } }], scopes: ['project'], defaultScope: 'project', fields: [{ key: 'sessionId', label: { en: 'Conversation id', 'zh-CN': '会话标识' }, type: 'text' }, { key: 'seq', label: { en: 'Event sequence', 'zh-CN': '消息序号' }, type: 'number', defaultValue: 0 }] })
function SessionControls(props: MemorySourcePageProps) {
  const zh = props.locale.startsWith('zh'), [id, setId] = useState(props.sessionId ?? ''), [text, setText] = useState(''), [mode, setMode] = useState('context'), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  async function operate(operation: string, input: MemoryJsonValue) {
    if (!props.management) return
    setBusy(true); setNotice('')
    try { const result = await props.management.mutate(operation, input, { confirmed: true, expectedRevision: props.management.revision }); const value = result.value as { items?: Array<{ text: string }> }; setNotice(value.items?.map(item => item.text).join('\n') ?? (zh ? '已完成' : 'Completed')); props.onRefresh?.() }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <section data-mnemon-collection><style>{collectionStyles}</style><h2>{zh ? '会话操作' : 'Conversation actions'}</h2><p>{zh ? '创建时继承当前会话的模型与工作目录。投递内容保留插件来源，默认等待目标会话下一次运行。' : 'New conversations inherit the current model and workspace. Delivered content retains plugin provenance and waits for the next run by default.'}</p>
    <form onSubmit={event => { event.preventDefault(); void operate('session-send', { sessionId: id, text, wake: mode === 'wake', steering: mode === 'steering' }) }}>
      <label>{zh ? '目标会话标识' : 'Target conversation id'}<input value={id} onChange={event => setId(event.target.value)} /></label>
      <label>{zh ? '消息内容' : 'Message'}<textarea rows={3} value={text} onChange={event => setText(event.target.value)} /></label>
      <label>{zh ? '投递方式' : 'Delivery'}<select value={mode} onChange={event => setMode(event.target.value)}><option value="context">{zh ? '等待下次运行' : 'Wait for next run'}</option><option value="wake">{zh ? '发送并唤醒' : 'Send and wake'}</option><option value="steering">{zh ? '在最近一步接收' : 'Steer at the next step'}</option></select></label>
      <footer><button disabled={busy || !props.writable || !id || !text.trim()}>{zh ? '投递消息' : 'Deliver message'}</button><button type="button" disabled={busy || !props.writable} onClick={() => void operate('session-create', {})}>{zh ? '创建会话' : 'Create conversation'}</button></footer>
    </form>{notice && <pre role="status" style={{ whiteSpace: 'pre-wrap' }}>{notice}</pre>}
  </section>
}
const bookmarkActions: RecordActionPanelOptions = { title: { en: 'Open a saved conversation', 'zh-CN': '打开已保存的会话' }, filter: record => ['bookmark', 'alias'].includes(record.kind) && record.state === 'active', details: record => <p>{record.content}<br />{String(record.data.sessionId)} · #{String(record.data.seq ?? 0)}</p>, buttons: [{ operation: 'open-session', label: { en: 'Open conversation', 'zh-CN': '打开会话' }, openSession: record => String(record.data.sessionId), visible: record => !String(record.data.sessionId).startsWith('imported-') }] }
export function Page(props: MemorySourcePageProps) {
  const [page, setPage] = useState('history'), zh = props.locale.startsWith('zh')
  return <section data-mnemon-collection><style>{collectionStyles}</style><div className="mc-toolbar">{[['history', '历史检索', 'History'], ['sessions', '会话列表', 'Sessions'], ['turns', '按轮次分叉', 'Fork by turn'], ['saved', '书签与别名', 'Bookmarks'], ['actions', '会话操作', 'Actions']].map(([key, cn, en]) => <button key={key} aria-pressed={page === key} onClick={() => setPage(key!)}>{zh ? cn : en}</button>)}</div>
    {page === 'history' && <LookupPanel {...props} options={options} />}
    {page === 'sessions' && <LookupPanel {...props} options={{ title: { en: 'Workspace conversations', 'zh-CN': '工作区会话' }, operation: 'list-sessions', fields: [{ key: 'active', label: { en: 'Live sessions only', 'zh-CN': '仅显示已加载会话' }, type: 'boolean' }], itemActions: [{ label: { en: 'Read messages', 'zh-CN': '阅读对话' }, operation: 'conversation', input(item) { return { sessionId: item.id } } }] }} />}
    {page === 'turns' && <LookupPanel {...props} options={{ title: { en: 'Completed conversation turns', 'zh-CN': '已完成的对话轮次' }, operation: 'conversation', defaults: { sessionId: props.sessionId ?? '', turns: true }, fields: [{ key: 'sessionId', label: { en: 'Source conversation id', 'zh-CN': '来源会话标识' }, type: 'text' }], itemActions: [{ label: { en: 'Fork through this turn', 'zh-CN': '从此轮次分叉' }, operation: 'session-fork', mutate: true, input(item) { const p = item.provenance as { sessionId: string; seq: number }; return { sessionId: p.sessionId, seq: p.seq } } }] }} />}
    {page === 'saved' && <><Saved {...props} /><RecordActionPanel {...props} options={bookmarkActions} /></>}{page === 'actions' && <SessionControls {...props} />}
  </section>
}
export function apply(ctx: MemorySourceUIContext): void { installMemorySourceUI(ctx, { sourceTypeId: 'sessions', pages: [{ id: 'sessions', label: 'Conversations', localizedLabel: { en: 'Conversations', 'zh-CN': '会话资料' }, order: 46, component: Page, navigation: { group: 'sources', primary: true } }] }) }
