import { installMemorySourceUI, type MemorySourceUIContext } from 'dsh-mnemon/client'
import { createCollectionPage } from 'dsh-mnemon-workspace-kit/client'
import { JournalViews } from './views.tsx'
export const inject = ['slots']
export const Page = createCollectionPage({
  renderRecords: context => <JournalViews {...context} />,
  "title": {
    "en": "Activity journal",
    "zh-CN": "活动日志"
  },
  "description": {
    "en": "Recover project progress, daily outcomes and feedback across sessions.",
    "zh-CN": "跨会话回顾项目进展、每日成果和反馈。"
  },
  "kinds": [
    {
      "value": "progress",
      "label": {
        "en": "Progress",
        "zh-CN": "进展"
      }
    },
    {
      "value": "feedback",
      "label": {
        "en": "Feedback",
        "zh-CN": "反馈"
      }
    },
    {
      "value": "result",
      "label": {
        "en": "Outcome",
        "zh-CN": "成果"
      }
    }
  ],
  "scopes": [
    "project",
    "daily"
  ],
  "defaultScope": "project",
  "fields": [
    { key: "branch", type: "text", label: { en: "Git branch", "zh-CN": "Git 分支" }, readOnly: true },
    {
      "key": "category",
      "label": {
        "en": "Category",
        "zh-CN": "分类"
      },
      "type": "text"
    },
    {
      "key": "sentiment",
      "label": {
        "en": "Feedback",
        "zh-CN": "反馈倾向"
      },
      "type": "select",
      "defaultValue": "neutral",
      "options": [
        {
          "value": "neutral",
          "label": {
            "en": "Neutral",
            "zh-CN": "中性"
          }
        },
        {
          "value": "positive",
          "label": {
            "en": "Positive",
            "zh-CN": "积极"
          }
        },
        {
          "value": "negative",
          "label": {
            "en": "Negative",
            "zh-CN": "消极"
          }
        }
      ]
    }
  ]
})
export function apply(ctx: MemorySourceUIContext): void { installMemorySourceUI(ctx, { sourceTypeId: 'journal', pages: [{ id: 'records', label: 'Activity journal', localizedLabel: { en: 'Activity journal', 'zh-CN': '活动日志' }, order: 42, component: Page, navigation: { group: 'sources', primary: true } }] }) }
