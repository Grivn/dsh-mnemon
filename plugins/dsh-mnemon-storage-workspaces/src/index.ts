import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { defineMemoryStoragePlugin } from 'dsh-mnemon/extension-sdk'

/** Resolve aliases even when the final workspace directory does not exist yet. */
export function canonicalWorkspacePath(workspacePath: string): string {
  if (!isAbsolute(workspacePath) || workspacePath.includes('\0')) throw new Error('Workspace path must be absolute')
  const absolute = resolve(workspacePath)
  let parent = absolute
  const suffix: string[] = []
  for (;;) {
    try { return join(realpathSync.native(parent), ...suffix) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const next = dirname(parent)
      if (next === parent) throw error
      suffix.unshift(parent.slice(next.length).replace(/^[/\\]+/u, ''))
      parent = next
    }
  }
}

/** Path-based identity: a rename or move deliberately selects a new directory. */
export function workspaceStorageId(workspacePath: string): string {
  return createHash('sha256').update(canonicalWorkspacePath(workspacePath)).digest('hex')
}

export default defineMemoryStoragePlugin({
  apiVersion: 'dsh-mnemon/storage/v1',
  packageName: 'dsh-mnemon-storage-workspaces',
  scope: 'workspaces',
  resolveDirectory({ baseDirectory, workspacePath }) {
    if (!isAbsolute(baseDirectory) || baseDirectory.includes('\0')) throw new Error('Storage base directory must be absolute')
    return join(baseDirectory, 'workspaces', workspaceStorageId(workspacePath))
  },
})
