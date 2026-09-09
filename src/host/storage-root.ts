import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ResolvedConfig } from './config.ts'
import { withMemoryStorageLock } from '../sdk/storage-lock.ts'
import workspacesStorage from 'dsh-mnemon-storage-workspaces'

export interface StorageRoot {
  effectiveDataDir(): string
  withExclusive<T>(operation: () => T | Promise<T>): Promise<T>
}

/** The default product's location preference; individual Sources own storage. */
export function createStorageRoot(config: Pick<ResolvedConfig, 'storageScope' | 'dataDir'>, workspaceRoot?: string): StorageRoot {
  const value = config.storageScope === 'workspace' ? resolve(workspaceRoot ?? process.cwd(), '.mnemon')
    : config.storageScope === 'custom' ? config.dataDir!
      : (config.storageScope === workspacesStorage.scope ? config.dataDir : undefined) ?? (process.env.MNEMON_DATA_DIR?.trim() || '~/.mnemon')
  const baseDirectory = resolve(value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value)
  const directory = config.storageScope === workspacesStorage.scope
    ? workspacesStorage.resolveDirectory({ baseDirectory, workspacePath: resolve(workspaceRoot ?? process.cwd()) })
    : baseDirectory
  return {
    effectiveDataDir: () => directory,
    withExclusive: operation => withMemoryStorageLock(directory, operation),
  }
}
