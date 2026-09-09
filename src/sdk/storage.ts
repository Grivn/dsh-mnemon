export interface MemoryStorageLocation {
  /** Absolute central directory, after the Host resolves dataDir, environment and home. */
  baseDirectory: string
  /** Trusted Host workspace path, never a client-supplied filesystem path. */
  workspacePath: string
}

/** Stateless Host layout plugin. Sources continue to own every persisted area. */
export interface MemoryStoragePlugin {
  apiVersion: 'dsh-mnemon/storage/v1'
  packageName: string
  scope: string
  resolveDirectory(location: MemoryStorageLocation): string
}

export function defineMemoryStoragePlugin(plugin: MemoryStoragePlugin): Readonly<MemoryStoragePlugin> {
  if (plugin.apiVersion !== 'dsh-mnemon/storage/v1' || !/^[a-z][a-z0-9-]*$/u.test(plugin.scope)
    || !plugin.packageName.trim() || typeof plugin.resolveDirectory !== 'function') throw new Error('Invalid memory storage plugin')
  return Object.freeze({ ...plugin })
}
