import { installMemorySourceUI, type MemorySourcePageProps, type MemorySourceUIContext } from 'dsh-mnemon/client'
import { createCollectionPage, RecordActionPanel, type RecordActionPanelOptions } from 'dsh-mnemon-workspace-kit/client'
import type { MemoryJsonValue } from 'dsh-mnemon/contracts'
export const inject = ['slots']
const Rooms = createCollectionPage({
  title: { en: 'Project rooms', 'zh-CN': '项目协作空间' },
  description: {
    en: 'Invite project sessions, coordinate work and retain addressed conversation history.',
    'zh-CN': '邀请项目会话，协调工作并保留定向对话历史。',
  },
  kinds: [{ value: 'room', label: { en: 'Room', 'zh-CN': '协作空间' } }],
  scopes: ['project'],
  defaultScope: 'project',
  fields: [
    {
      key: 'openJoin',
      label: { en: 'Allow project sessions to join', 'zh-CN': '允许项目会话自行加入' },
      type: 'boolean',
      defaultValue: false,
    },
  ],
})
const result = (value: MemoryJsonValue, zh: boolean) => {
  if (Array.isArray(value))
    return (
      <ul>
        {value.map((row: any) => (
          <li key={row.id}>
            {row.id} · {row.status} · {row.live ? (zh ? '已加载' : 'Loaded') : zh ? '未加载' : 'Closed'}
          </li>
        ))}
      </ul>
    )
  if (value && typeof value === 'object' && Array.isArray(value.items))
    return (
      <div>
        {value.items.length ? (
          value.items.map((row: any) => (
            <article key={row.id} style={{ marginTop: 12 }}>
              <small>
                {row.unread ? (zh ? '未读' : 'Unread') : zh ? '已读' : 'Read'} · {row.id}
              </small>
              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.text}</pre>
            </article>
          ))
        ) : (
          <p>{zh ? '暂无发给本会话的消息。' : 'No messages addressed to this session.'}</p>
        )}
      </div>
    )
  if (value && typeof value === 'object' && 'deliveries' in value)
    return (
      <p>
        {zh ? '投递结果：' : 'Delivery results: '}
        {Object.entries(value.deliveries as object)
          .map(([id, status]) => `${id}: ${String(status)}`)
          .join('; ')}
      </p>
    )
  return <p>{zh ? '操作已完成。' : 'Operation completed.'}</p>
}
const roomControls: RecordActionPanelOptions = {
  title: { en: 'Room members and messages', 'zh-CN': '成员与消息' },
  filter: (record) => record.kind === 'room',
  details: (record, zh) => (
    <p>
      {zh ? '创建者' : 'Creator'}: {String(record.data.creator)}
      <br />
      {zh ? '成员' : 'Members'}: {(record.data.members as string[]).join(', ')}
      <br />
      {zh ? '状态' : 'Status'}: {record.state === 'archived' ? (zh ? '已关闭' : 'Closed') : zh ? '开放' : 'Open'}
    </p>
  ),
  fields: [
    { key: 'memberId', label: { en: 'Session to invite or remove', 'zh-CN': '要邀请或移除的会话 ID' }, type: 'text' },
    {
      key: 'recipients',
      label: {
        en: 'Recipients (comma separated; blank = other members)',
        'zh-CN': '收件会话（逗号分隔；留空为其他成员）',
      },
      type: 'text',
    },
    { key: 'message', label: { en: 'Message', 'zh-CN': '消息内容' }, type: 'textarea' },
    {
      key: 'attachments',
      label: { en: 'Attachment paths (comma separated)', 'zh-CN': '附件路径（逗号分隔）' },
      type: 'text',
    },
    {
      key: 'wake',
      label: { en: 'Wake recipients to respond', 'zh-CN': '唤醒收件会话进行回复' },
      type: 'boolean',
      defaultValue: false,
    },
  ],
  buttons: [
    { operation: 'presence', label: { en: 'List project sessions', 'zh-CN': '查看项目会话' }, read: true },
    { operation: 'join-room', label: { en: 'Join room', 'zh-CN': '加入空间' } },
    { operation: 'leave-room', label: { en: 'Leave room', 'zh-CN': '退出空间' } },
    { operation: 'invite-member', label: { en: 'Invite session', 'zh-CN': '邀请会话' } },
    { operation: 'remove-member', label: { en: 'Remove session', 'zh-CN': '移除会话' } },
    { operation: 'send-message', label: { en: 'Send to selected members', 'zh-CN': '发送给选定成员' } },
    { operation: 'room-history', label: { en: 'Read addressed history', 'zh-CN': '读取定向历史' }, read: true },
    { operation: 'close-room', label: { en: 'Close room and retain history', 'zh-CN': '关闭空间并保留历史' } },
  ],
  result,
}
const reservations: RecordActionPanelOptions = {
  title: { en: 'Reserve a file', 'zh-CN': '预约文件' },
  filter: (record) => record.kind === 'room' && record.state === 'active',
  fields: [
    { key: 'filename', label: { en: 'File path', 'zh-CN': '文件路径' }, type: 'text' },
    { key: 'minutes', label: { en: 'Lease minutes', 'zh-CN': '预约分钟数' }, type: 'number', defaultValue: 30 },
  ],
  buttons: [{ operation: 'reserve-file', label: { en: 'Reserve / Renew', 'zh-CN': '预约 / 续期' } }],
}
const leases: RecordActionPanelOptions = {
  title: { en: 'Current reservations', 'zh-CN': '当前文件预约' },
  filter: (record) => record.kind === 'reservation' && record.state === 'active',
  details: (record, zh) => (
    <p>
      {String(record.data.path)}
      <br />
      {zh ? '持有会话' : 'Owner'}: {String(record.data.owner)}
      <br />
      {zh ? '有效期至' : 'Expires'}: {String(record.data.expiresAt)}
    </p>
  ),
  buttons: [{ operation: 'release-file', label: { en: 'Release my reservation', 'zh-CN': '释放我的预约' } }],
}
const messages: RecordActionPanelOptions = {
  title: { en: 'Message receipts', 'zh-CN': '消息回执' },
  filter: (record) => record.kind === 'message',
  details: (record, zh) => (
    <p>
      {record.content}
      <br />
      {zh ? '状态' : 'Status'}: {String(record.data.status)}
    </p>
  ),
  buttons: [{ operation: 'mark-read', label: { en: 'Mark addressed message read', 'zh-CN': '标记发给我的消息已读' } }],
}
export function Page(props: MemorySourcePageProps) {
  return (
    <>
      <Rooms {...props} />
      <RecordActionPanel {...props} options={roomControls} />
      <RecordActionPanel {...props} options={reservations} />
      <RecordActionPanel {...props} options={leases} />
      <RecordActionPanel {...props} options={messages} />
    </>
  )
}
export function apply(ctx: MemorySourceUIContext) {
  installMemorySourceUI(ctx, {
    sourceTypeId: 'collaboration',
    pages: [
      {
        id: 'rooms',
        label: 'Collaboration',
        localizedLabel: { en: 'Collaboration', 'zh-CN': '会话协作' },
        order: 49,
        component: Page,
        navigation: { group: 'sources', primary: true },
      },
    ],
  })
}
