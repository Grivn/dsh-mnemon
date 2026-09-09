# dsh-mnemon-storage-workspaces

A stateless storage layout plugin for the Mnemon Starter. Select **Settings → Memory System → Memory scope → Centralized · isolated by workspace**. The optional central root is next to the scope selector.

```yaml
mnemon:
  storageScope: workspaces
  dataDir: ~/central-memory # optional; otherwise MNEMON_DATA_DIR or ~/.mnemon
  runtimeUserScope: global # optional; defaults to storage
```

The Starter consumes the package's default `MemoryStoragePlugin` export through the public `dsh-mnemon/extension-sdk` contract. It is a Host layout plugin, with no separate Cordis Entry or Source/Strategy contribution. Selecting `workspaces` activates its resolver; the existing modes retain their layouts. No extra enable switch is needed.

The layout is `<central-root>/workspaces/<sha256(canonical-workspace-path)>/`. Runtime, Documents, Memory Spaces and state share that workspace root. `runtimeUserScope: global` keeps only USER.md at the global root. Provider services with remote/global namespaces retain their own sharing semantics.

Existing path aliases resolve through `realpath`; missing descendants resolve through their closest existing ancestor. IDs contain 64 hexadecimal characters, avoiding workspace names and filesystem-reserved filename characters. Moving or renaming the workspace selects a new ID. Switching modes never moves, merges or deletes old roots. Back up the whole central directory to include every workspace; a Mnemon Pack exports only the selected workspace root.

The resolver accepts an absolute, trusted Host workspace path and absolute central directory, performs no writes and rejects malformed paths. Build and test independently with `pnpm install && pnpm verify`; unpublished SDK changes can be verified using the repository's packed-artifact harness.

## 简体中文

这是 Mnemon Starter 的无状态存储布局插件。在“设置 → 记忆系统 → 记忆范围”中选择“集中存储 · 按工作区隔离”，可在选择器旁配置集中根目录。上方 YAML 的 `dataDir` 可省略，按 `MNEMON_DATA_DIR`、`~/.mnemon` 的顺序取默认值；`runtimeUserScope` 默认为 `storage`。

Starter 通过公开的 `dsh-mnemon/extension-sdk` 契约使用本包默认导出的 `MemoryStoragePlugin`。插件属于 Host 目录布局，不单独增加 Cordis Entry、Source 或 Strategy；选择 `workspaces` 即启用，不需要额外开关。

目录为 `<集中根>/workspaces/<规范工作区路径的 SHA-256>/`，Runtime、Documents、Memory Spaces 和 state 都使用该工作区根。`runtimeUserScope: global` 只让 USER.md 保持全局。远端或全局 Provider 命名空间仍遵循自身共享语义。

现存路径用 `realpath` 归一化符号链接，不存在的后缀从最近存在的祖先解析。ID 固定为 64 位十六进制字符，不包含工作区名称或文件名保留字符。移动或重命名工作区会选择新 ID。切换模式不会移动、合并或删除旧根。备份整个集中目录可覆盖所有工作区；Mnemon Pack 仍只导出当前工作区根。

解析器只接受 Host 提供的可信绝对工作区路径和绝对集中根，拒绝非法路径，不写入任何文件。独立执行 `pnpm install && pnpm verify`；尚未发布的 SDK 改动使用仓库的打包制品验证夹具。
