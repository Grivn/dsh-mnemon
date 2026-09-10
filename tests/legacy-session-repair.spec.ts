import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, link, symlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'

const command = resolve('bin/repair-legacy-session.mjs')
const fixture = await readFile(new URL('./fixtures/issue-223-legacy-v0.jsonl', import.meta.url), 'utf8')
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'mnemon-legacy-repair-'))
  roots.push(root)
  return root
}
function cli(...args: string[]) { return spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' }) }
function compressFrames(text: string) { return Buffer.concat(text.match(/[^\n]+\n/g)!.map(line => zstdCompressSync(line, { params: { [constants.ZSTD_c_checksumFlag]: 1 } }))) }
function decompressFrames(data: Buffer) {
  const chunks: Buffer[] = []
  let offset = 0
  while (offset < data.length) {
    const result = zstdDecompressSync(data.subarray(offset), { info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } }
    chunks.push(result.buffer)
    offset += result.engine.bytesWritten
  }
  return Buffer.concat(chunks).toString()
}
const expected = fixture.replace(',"summary":"Optional memory recall and remember reminder"', '').replace(',"summary":"Memory View snapshot"', '')

describe('legacy Session copy repair', () => {
  it('previews and exclusively writes the two known repairs without changing the original', async () => {
    const root = await directory()
    const input = join(root, 'session.jsonl')
    const output = join(root, 'repaired.jsonl')
    await writeFile(input, fixture)
    const preview = cli('--input', input)
    expect(preview.status).toBe(0)
    expect(JSON.parse(preview.stdout)).toMatchObject({ mode: 'preview', repairedMessages: 2, originalPreserved: true })
    expect(await readdir(root)).toEqual(['session.jsonl'])
    const copied = cli('--input', input, '--output', output)
    expect(copied.status).toBe(0)
    expect(JSON.parse(copied.stdout)).toMatchObject({ ...JSON.parse(preview.stdout), mode: 'copy' })
    expect(await readFile(input, 'utf8')).toBe(fixture)
    expect(await readFile(output, 'utf8')).toBe(expected)
    if (process.platform !== 'win32') expect((await stat(output)).mode & 0o777).toBe(0o600)
    for (const target of [input, output]) expect(cli('--input', input, '--output', target).status).toBe(1)
    await link(input, join(root, 'hard-link'))
    expect(cli('--input', input, '--output', join(root, 'hard-link')).status).toBe(1)
    if (process.platform !== 'win32') {
      await symlink(input, join(root, 'symlink'))
      expect(cli('--input', input, '--output', join(root, 'symlink')).status).toBe(1)
    }
    expect(await readFile(input, 'utf8')).toBe(fixture)
    expect((await readdir(root)).some(name => name.startsWith('.mnemon-repair-'))).toBe(false)
  })

  it.each(['first', 'middle', 'last'] as const)('preserves every other byte when summary is the %s source property', async position => {
    const root = await directory()
    const input = join(root, 'input')
    const output = join(root, 'output')
    const keys = ['"kind": "plugin"', '"plugin":"dsh-mnemon"', '"form":"recall"']
    keys.splice(position === 'first' ? 0 : position === 'middle' ? 1 : 3, 0, '"summary" : "Memory View snapshot"')
    const row = '  { "type":"user/message", "seq":9007199254740993, "data":{"source":{ ' + keys.join(',  ') + ' }, "content":[{"text":"\\\"summary\\\": {} [] \\u4e2d", "n":1.2300e+42}]}}\r\n'
    const text = fixture.split('\n')[0] + '\r\n' + row
    await writeFile(input, text)
    expect(cli('--input', input, '--output', output).status).toBe(0)
    const result = await readFile(output, 'utf8')
    const removed = position === 'last' ? ',  "summary" : "Memory View snapshot"' : '"summary" : "Memory View snapshot",  '
    expect(result).toBe(text.replace(removed, ''))
  })

  it('leaves clean, unrelated and unknown metadata byte-identical', async () => {
    const root = await directory()
    for (const [index, text] of [expected, fixture.replaceAll('dsh-mnemon', 'other-plugin'), fixture.replaceAll('summary', 'differentField'), fixture.replaceAll('Memory View snapshot', 'unrecognized summary').replaceAll('Optional memory recall and remember reminder', 'another summary'), fixture.replaceAll('"form":"recall"', '"form":"notice"').replaceAll('"form":"instructions"', '"form":"notice"')].entries()) {
      const input = join(root, `${index}.jsonl`)
      const output = join(root, `${index}-copy.jsonl`)
      await writeFile(input, text)
      const result = cli('--input', input, '--output', output)
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout).repairedMessages).toBe(0)
      expect(await readFile(output, 'utf8')).toBe(text)
    }
  })

  it('handles actual concatenated Zstandard frames and preserves a clean compressed artifact', async () => {
    const root = await directory()
    const input = join(root, 'session.jsonl.zstd')
    const output = join(root, 'copy.jsonl.zstd')
    const compressed = compressFrames(fixture)
    await writeFile(input, compressed)
    const result = cli('--input', input, '--output', output)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ encoding: 'zstd', repairedMessages: 2 })
    expect(decompressFrames(await readFile(output))).toBe(expected)
    expect(await readFile(input)).toEqual(compressed)
    const clean = cli('--input', output, '--output', join(root, 'clean.zstd'))
    expect(clean.status).toBe(0)
    expect(await readFile(join(root, 'clean.zstd'))).toEqual(await readFile(output))
    const corrupt = Buffer.from(compressed)
    corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 0xff
    await writeFile(input, corrupt)
    expect(cli('--input', input).status).toBe(1)
    await writeFile(input, compressed.subarray(0, compressed.length - 5))
    expect(cli('--input', input).status).toBe(1)
  })

  it.each([
    fixture.replace('"version":0', '"version":3'),
    fixture.replace(/"createdAt":\d+/, '"createdAt":-1'),
    fixture.slice(0, -1),
    fixture + '{invalid}\n',
    fixture.replace('"plugin":"dsh-mnemon"', '"plugin":"other","plugin":"dsh-mnemon"'),
    Buffer.concat([Buffer.from(fixture), Buffer.from([0xff, 0x0a])]),
  ])('refuses invalid or ambiguous input without publishing output (%#)', async text => {
    const root = await directory()
    const input = join(root, 'input')
    const output = join(root, 'output')
    await writeFile(input, text)
    const before = await readFile(input)
    expect(cli('--input', input, '--output', output).status).toBe(1)
    expect(await readFile(input)).toEqual(before)
    expect(await readdir(root)).toEqual(['input'])
  })

  it('bounds decompressed input before parsing', async () => {
    const root = await directory()
    const input = join(root, 'oversized.zstd')
    await writeFile(input, zstdCompressSync(Buffer.alloc(128 * 1024 * 1024 + 1, 0x20)))
    expect(cli('--input', input).status).toBe(1)
  })

  it('rejects incomplete or duplicate CLI options', () => {
    expect(cli('--help').status).toBe(0)
    for (const args of [[], ['--input'], ['--wat', 'file'], ['--input', 'file', '--input', 'file']]) expect(cli(...args).status).toBe(1)
  })

  it.each(['none', 'zstd'] as const)('unblocks the real published DSH v0 → v3 migration and cold reopen (%s)', async compression => {
    const root = await directory()
    const suffix = compression === 'none' ? '.jsonl' : '.jsonl.zstd'
    const sessionDir = join(root, '--tmp-mnemon-issue-223-synthetic--', 'issue-223-legacy')
    await mkdir(sessionDir, { recursive: true })
    const original = join(sessionDir, `session${suffix}`)
    const before = compression === 'none' ? Buffer.from(fixture) : compressFrames(fixture)
    await writeFile(original, before)
    async function backend() {
      const ctx = new Context()
      await ctx.plugin(JsonlSessionPersistence, { root, compression })
      return ctx
    }
    let ctx = await backend()
    try {
      await expect(ctx.sessionPersistence.open(SessionId('issue-223-legacy'), 'read')).rejects.toThrow('source summary requires notice form')
    } finally { await ctx.fiber.dispose() }
    const copy = join(root, `repaired${suffix}`)
    expect(cli('--input', original, '--output', copy).status).toBe(0)
    expect(await readFile(original)).toEqual(before)
    // Explicit operator replacement in this disposable fixture only. The CLI
    // leaves this decision to the owner; the original backup stays intact.
    await writeFile(join(root, `backup${suffix}`), before)
    await writeFile(original, await readFile(copy))
    const repairedV0 = await readFile(original)
    ctx = await backend()
    try {
      const handle = await ctx.sessionPersistence.open(SessionId('issue-223-legacy'), 'write')
      const restored = await handle.read()
      expect(restored.events.filter(event => event.type === 'user/message').map(event => event.data)).toEqual(expected.trim().split('\n').slice(1).map(line => JSON.parse(line)).filter(event => event.type === 'user/message').map(event => event.data))
      await handle.close()
      expect((await readdir(sessionDir)).some(name => name.startsWith('session.v3.'))).toBe(true)
    } finally { await ctx.fiber.dispose() }
    ctx = await backend()
    try {
      const handle = await ctx.sessionPersistence.open(SessionId('issue-223-legacy'), 'read')
      expect((await handle.read()).events.filter(event => event.type === 'user/message')).toHaveLength(3)
      await handle.close()
    } finally { await ctx.fiber.dispose() }
    expect(await readFile(original)).toEqual(repairedV0)
    expect(await readFile(join(root, `backup${suffix}`))).toEqual(before)
  })
})
