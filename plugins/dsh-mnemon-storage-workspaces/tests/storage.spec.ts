import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import storage, { canonicalWorkspacePath, workspaceStorageId } from '../src/index.ts'

const roots: string[] = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mnemon-storage-plugin-'))
  roots.push(root)
  const workspace = join(root, 'workspace')
  mkdirSync(workspace)
  return { root, workspace }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('centralized workspace storage plugin', () => {
  it('returns a deterministic, bounded filename under the central root without writing files', () => {
    const { root, workspace } = fixture()
    const baseDirectory = join(root, 'memory')
    const id = workspaceStorageId(workspace)
    expect(id).toMatch(/^[0-9a-f]{64}$/u)
    expect(storage).toMatchObject({ apiVersion: 'dsh-mnemon/storage/v1', scope: 'workspaces' })
    expect(storage.resolveDirectory({ baseDirectory, workspacePath: workspace })).toBe(join(baseDirectory, 'workspaces', id))
    expect(workspaceStorageId(join(workspace, 'child', '..'))).toBe(id)
    expect(readdirSync(workspace)).toEqual([])
    expect(existsSync(baseDirectory)).toBe(false)
  })
  it('resolves symlink aliases including missing descendants to the same identity', () => {
    const { root, workspace } = fixture()
    const alias = join(root, 'alias')
    symlinkSync(workspace, alias, process.platform === 'win32' ? 'junction' : 'dir')
    expect(workspaceStorageId(alias)).toBe(workspaceStorageId(workspace))
    expect(workspaceStorageId(join(alias, 'missing', 'project'))).toBe(workspaceStorageId(join(workspace, 'missing', 'project')))
    expect(canonicalWorkspacePath(join(alias, 'missing'))).toBe(join(canonicalWorkspacePath(workspace), 'missing'))
  })
  it('isolates same-named workspaces and changes identity on a move without touching old storage', () => {
    const { root, workspace } = fixture()
    const other = join(root, 'other', 'workspace')
    mkdirSync(other, { recursive: true })
    expect(workspaceStorageId(other)).not.toBe(workspaceStorageId(workspace))
    const previous = storage.resolveDirectory({ baseDirectory: root, workspacePath: workspace })
    mkdirSync(previous, { recursive: true })
    writeFileSync(join(previous, 'sentinel'), 'retained')
    const moved = join(root, 'renamed')
    renameSync(workspace, moved)
    expect(storage.resolveDirectory({ baseDirectory: root, workspacePath: moved })).not.toBe(previous)
    expect(readdirSync(previous)).toEqual(['sentinel'])
  })
  it('rejects relative paths, embedded nulls and non-directory ancestors', () => {
    const { root } = fixture()
    for (const workspacePath of ['', '../escape', '/workspace\0']) {
      expect(() => storage.resolveDirectory({ baseDirectory: root, workspacePath })).toThrow()
    }
    expect(() => storage.resolveDirectory({ baseDirectory: 'relative', workspacePath: root })).toThrow('absolute')
    writeFileSync(join(root, 'file'), 'file')
    expect(() => workspaceStorageId(join(root, 'file', 'child'))).toThrow()
    expect(workspaceStorageId(resolve(root, '项目 with spaces'))).toMatch(/^[0-9a-f]{64}$/u)
  })
})
