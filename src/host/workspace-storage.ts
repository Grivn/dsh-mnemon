import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** Host workspace identity, including aliases with not-yet-created descendants. */
export function canonicalWorkspacePath(workspacePath: string): string {
  if (!isAbsolute(workspacePath) || workspacePath.includes('\0')) throw new Error('Workspace path must be absolute')
  let parent = resolve(workspacePath)
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

/** A rename or move selects a new directory; resolving identity never writes. */
export function workspaceStorageId(workspacePath: string): string {
  return createHash('sha256').update(canonicalWorkspacePath(workspacePath)).digest('hex')
}
