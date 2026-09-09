import { randomUUID } from 'node:crypto'
import { open, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { lock } from 'proper-lockfile'
import { withMemoryStorageLock } from 'dsh-mnemon/extension-sdk'
import { allowedDirectories, allowedFile, digest, readBoundedFile, runBoundedProcess } from 'dsh-mnemon-workspace-kit'

export async function listSkillFiles(roots: string[], signal?: AbortSignal): Promise<string[]> {
  const allowed = await allowedDirectories(roots)
  if (!allowed.length) return []
  const result = await runBoundedProcess('rg', ['--no-config', '--files', '--glob', '*.md', '--', ...allowed], {
    ...(signal ? { signal } : {}), maxBytes: 256 * 1024, timeoutMs: 5000,
  })
  if (result.code !== 0 && result.code !== 1) throw new Error('Could not list configured skill files')
  return result.stdout.split('\n').filter(Boolean).slice(0, 300)
}

export async function readSkillFile(roots: string[], path: string, signal?: AbortSignal) {
  const allowed = await allowedDirectories(roots), filename = await allowedFile(allowed, path)
  if (!filename.endsWith('.md')) throw new Error('Only Markdown skill files can be edited')
  const content = (await readBoundedFile(allowed, filename, 256 * 1024, signal)).toString('utf8')
  return { path: filename, content, digest: digest(content) }
}

export async function saveSkillFile(roots: string[], path: string, content: string, expected: string, signal?: AbortSignal) {
  if (Buffer.byteLength(content) > 256 * 1024) throw new Error('Skill file exceeds 256 KiB')
  const filename = await allowedFile(await allowedDirectories(roots), path)
  return withMemoryStorageLock(filename, async () => {
    signal?.throwIfAborted()
    let compromised: Error | undefined
    const release = await lock(filename, {
      stale: 10000, update: 2000, retries: { retries: 12, minTimeout: 50, maxTimeout: 500 },
      onCompromised(error) { compromised = error },
    })
    const temporary = join(dirname(filename), '.skill-' + randomUUID() + '.tmp')
    try {
      const current = await readSkillFile(roots, path, signal)
      if (current.digest !== expected) throw new Error('Skill file changed; read it again before saving')
      const handle = await open(temporary, 'wx', (await stat(filename)).mode & 0o777)
      try { await handle.writeFile(content); await handle.sync() } finally { await handle.close() }
      signal?.throwIfAborted()
      if (compromised) throw compromised
      if ((await readSkillFile(roots, path, signal)).digest !== expected) throw new Error('Skill file changed before commit')
      await rename(temporary, filename)
      return { path: filename, content, digest: digest(content) }
    } finally {
      await rm(temporary, { force: true })
      await release()
    }
  })
}
