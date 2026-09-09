# Workspace Source utilities

Shared implementation utilities for independently installed Sources. This package is not a Source, a Strategy, a Loader or a storage registry. Each caller owns its schema, directory, scope, operations and presentation.

`RecordStore` provides atomic revision-fenced persistence and per-record history. `createRecordSource` adapts an owned collection to the public memory contracts. `./client` supplies a browser-only collection editor.

Run `pnpm verify` to typecheck, test and build the package in isolation.

The optional `./dsh` export adapts published DSH services for project-scoped transcript reads, session creation, completed-turn forks and provenance-preserving delivery. It does not register tools or grant external authority. Interprocess record writes use a renewable lock and flush the temporary file before atomic replacement.

可选的 `./dsh` 导出封装 DSH 公开服务，用于项目范围内的可见对话读取、会话创建、已完成轮次分叉和保留来源的消息投递；不会自行注册工具或授予外部操作权限。记录写入使用可续租的进程锁，并在原子替换前刷新临时文件。
