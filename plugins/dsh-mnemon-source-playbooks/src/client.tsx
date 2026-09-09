import { installMemorySourceUI, type MemorySourceUIContext } from 'dsh-mnemon/client'
import { createCollectionPage } from 'dsh-mnemon-workspace-kit/client'
export const inject = ['slots']
export const Page = createCollectionPage({
  "title": {
    "en": "Playbooks",
    "zh-CN": "工作方法"
  },
  "description": {
    "en": "Turn useful procedures into reviewed skills and reusable prompts. Read details only when needed.",
    "zh-CN": "将有效方法整理为经过审核的技能和可复用提示词，按需读取详情。"
  },
  "kinds": [
    {
      "value": "skill",
      "label": {
        "en": "Skill",
        "zh-CN": "技能"
      }
    },
    {
      "value": "prompt",
      "label": {
        "en": "Prompt",
        "zh-CN": "提示词"
      }
    }
  ],
  "scopes": [
    "project",
    "global"
  ],
  "defaultScope": "project",
  "fields": [
    {
      "key": "slug",
      "label": {
        "en": "Reusable name",
        "zh-CN": "通用名称"
      },
      "type": "text"
    },
    {
      "key": "category",
      "label": {
        "en": "Category",
        "zh-CN": "分类"
      },
      "type": "text"
    },
    {
      "key": "enabled",
      "label": {
        "en": "Enabled",
        "zh-CN": "已启用"
      },
      "type": "boolean",
      "defaultValue": true
    }
  ],
  "recordActions": [
    {
      "label": {
        "en": "Toggle enabled",
        "zh-CN": "切换启用状态"
      },
      "operation": "toggle"
    }
  ]
})
export function apply(ctx: MemorySourceUIContext): void { installMemorySourceUI(ctx, { sourceTypeId: 'playbooks', pages: [{ id: 'records', label: '工作方法 / Playbooks', order: 44, component: Page, navigation: { group: 'sources', primary: true } }] }) }
