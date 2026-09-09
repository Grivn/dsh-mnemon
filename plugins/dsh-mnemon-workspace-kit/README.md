# Workspace Source utilities

Shared implementation utilities for independently installed Sources. This package is not a Source, a Strategy, a Loader or a storage registry. Each caller owns its schema, directory, scope, operations and presentation.

`RecordStore` provides atomic revision-fenced persistence and per-record history. `createRecordSource` adapts an owned collection to the public memory contracts. `./client` supplies a browser-only collection editor.

Run `pnpm verify` to typecheck, test and build the package in isolation.

The optional `./dsh` export adapts published DSH services for project-scoped transcript reads, session creation, completed-turn forks and provenance-preserving delivery. It does not register tools or grant external authority. Interprocess record writes use a renewable lock and flush the temporary file before atomic replacement.

可选的 `./dsh` 导出封装 DSH 公开服务，用于项目范围内的可见对话读取、会话创建、已完成轮次分叉和保留来源的消息投递；不会自行注册工具或授予外部操作权限。记录写入使用可续租的进程锁，并在原子替换前刷新临时文件。

`AssetStore` provides bounded ingestion, content-addressed storage and verified reads. Callers supply explicit roots, URL origins and a complete reference ledger for retention; the utility owns no cross-Source asset registry. The optional native image adapter accepts only images referenced by original user messages in the selected session. `WorkspaceActivity` is an optional completed-fact event contract; each observer owns its own deduplication, storage and lifecycle.

`AssetStore` 提供有大小限制的附件导入、内容寻址存储和读取校验；允许的路径、URL 来源以及保留策略所需的完整引用清单由调用方提供，不建立跨 Source 附件注册表。原生图片适配器只接受当前会话原始用户消息引用的图片。`WorkspaceActivity` 仅描述已完成的事实，各观察方自行负责去重、持久化和生命周期。
