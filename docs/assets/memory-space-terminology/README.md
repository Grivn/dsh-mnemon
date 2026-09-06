# Memory space terminology UI evidence

Captured on 2026-09-07 from the real local DSH WebUI, using the `codex/memory-space-terminology` working tree based on v0.5.3 (`7e6216094a9361e9abb091a5edb2b83cb7ed05df`). The version badge identifies the base package version; these captures include the unpublished terminology update.

## Environment and scope

- Node.js 25.1.0, DSH 0.1.2-rc.1, and the existing Mnemon CLI 0.2.7 on macOS.
- `node scripts/serve-e2e.mjs` supplied a disposable DSH Profile, workspace, and data directory. The fixture linked the local Starter, Sources, and Providers.
- Synthetic Atlas data: one native memory space, two memories, one Runtime item, and one managed Document. Some earlier screenshots precede creation of the Runtime item and Document. User-authored sample content is intentionally bilingual and does not change with the interface language.
- Desktop viewport: 1365 × 1000. Narrow viewport: 390 × 844.
- Screenshots are unchanged JPEG bytes returned by browser capture. [The manifest](./manifest.json) records their sizes and SHA-256 hashes. [Layout measurements](./layout-checks.json) record the final narrow-layout checks.
- No production memory, cloud Provider calls, or LLM requests were used. Creation, editing, activation, browsing, language switching, and form cancellation were exercised; AI metadata and semantic archiving were not invoked. The disposable fixture was removed after verification.

## Captures

| Surface | English | 中文 |
|---|---|---|
| Status | [Status](./en/status.jpg) | [状态](./zh-CN/status.jpg) |
| Runtime | [Runtime](./en/runtime.jpg) | [运行时](./zh-CN/runtime.jpg) |
| Documents | [Documents](./en/documents.jpg) | [档案](./zh-CN/documents.jpg) |
| Memory Spaces | [Directory](./en/spaces.jpg) | [记忆空间目录](./zh-CN/spaces.jpg) |
| Content | [Content](./en/content.jpg) | [内容](./zh-CN/content.jpg) |
| Create | [Form](./en/create.jpg) | [创建表单](./zh-CN/create.jpg) |
| Settings | [Layers and enhancements](./en/enhancements.jpg) | [记忆层与增强](./zh-CN/enhancements.jpg) |
| Narrow directory | [390 px directory](./en/spaces-mobile.jpg) | [390 像素目录](./zh-CN/spaces-mobile.jpg) |
| Narrow create | [390 px form](./en/create-mobile.jpg) | [390 像素表单](./zh-CN/create-mobile.jpg) |

## Layout findings

The longer labels exposed a directory header that exceeded its available width. The header now has a bounded grid column, the directory path truncates within that column, and action buttons wrap. Provider metadata badges also wrap. Compact navigation uses tighter spacing, and the storage badge can move below the title. Both locales keep the directory and page canvas within their widths, with creation buttons inside the viewport after the sheet animation completes.

## 中文说明

本组截图来自真实 DSH WebUI 与临时测试数据，展示基于 v0.5.3 的用语更新；界面统一使用“记忆空间 / memory space”。截图中的包版本号仍是基础版本，并不表示这些改动已经发布。

桌面与窄屏分别按 1365 × 1000、390 × 844 检查。实测覆盖创建、编辑、激活、浏览、语言切换和取消表单；没有调用模型、云端 Provider 或生产记忆。窄屏目录按钮、Provider 状态标签和顶部存储标识可以换行，创建表单的底部按钮保持可见。截图保留浏览器原始 JPEG 数据，哈希与布局测量见上方记录。

The [v0.5.2 showcase](../showcase/README.md) remains historical evidence with its original screenshot pixels and recording.
