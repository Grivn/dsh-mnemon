#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { link, mkdtemp, open, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as zlib from 'node:zlib'

const maximumBytes = 128 * 1024 * 1024
const summaries = {
  recall: 'Memory View snapshot',
  instructions: 'Optional memory recall and remember reminder',
}
const sha256 = value => createHash('sha256').update(value).digest('hex')

// Locate JSON object members without reserializing message content or numbers.
// JSON.parse validates each complete row before this scanner is used.
function objectMembers(text, start) {
  let cursor = start
  const space = () => { while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor++ }
  const stringEnd = () => {
    cursor++
    while (cursor < text.length) {
      if (text[cursor++] === '"') return
      if (text[cursor - 1] === '\\') cursor++
    }
  }
  const valueEnd = () => {
    if (text[cursor] === '"') return stringEnd()
    if (text[cursor] === '{' || text[cursor] === '[') {
      let depth = 0
      do {
        if (text[cursor] === '"') stringEnd()
        else {
          if ('{['.includes(text[cursor])) depth++
          if ('}]'.includes(text[cursor])) depth--
          cursor++
        }
      } while (depth > 0)
    } else {
      while (cursor < text.length && !/[\s,}\]]/.test(text[cursor])) cursor++
    }
  }
  space()
  if (text[cursor++] !== '{') throw new Error('Expected a JSON object in the legacy message path.')
  const members = []
  const names = new Set()
  space()
  while (text[cursor] !== '}') {
    const start = cursor
    stringEnd()
    const name = JSON.parse(text.slice(start, cursor))
    if (names.has(name)) throw new Error('Duplicate JSON property in the legacy message path; refusing ambiguous repair.')
    names.add(name)
    space()
    cursor++ // colon, already validated by JSON.parse
    space()
    const valueStart = cursor
    valueEnd()
    members.push({ name, start, end: cursor, valueStart })
    space()
    if (text[cursor] === '}') break
    cursor++ // comma
    space()
  }
  return members
}

function removeSummary(line) {
  const data = objectMembers(line, 0).find(member => member.name === 'data')
  const source = objectMembers(line, data.valueStart).find(member => member.name === 'source')
  const members = objectMembers(line, source.valueStart)
  const index = members.findIndex(member => member.name === 'summary')
  const member = members[index]
  const start = index === members.length - 1 && index > 0 ? members[index - 1].end : member.start
  const end = index < members.length - 1 ? members[index + 1].start : member.end
  return line.slice(0, start) + line.slice(end)
}

async function readBounded(path) {
  const chunks = []
  let length = 0
  for await (const chunk of createReadStream(path)) {
    length += chunk.length
    if (length > maximumBytes) throw new Error('Session exceeds the 128 MiB repair limit.')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// RFC 8878 framing: reject torn headers, blocks and checksums before Node's
// decoder (which can otherwise accept an unfinished frame) sees the bytes.
function frameLength(input, start) {
  const requireBytes = end => { if (end > input.length) throw new Error('Truncated Zstandard frame; no output written.') }
  requireBytes(start + 5)
  if (input.readUInt32LE(start) !== 0xfd2fb528) throw new Error('Unsupported Zstandard frame; only ordinary DSH frames are accepted.')
  const descriptor = input[start + 4]
  if (descriptor & 0x18) throw new Error('Reserved Zstandard frame header bits are set.')
  const single = (descriptor & 0x20) !== 0
  const sizeFlag = descriptor >>> 6
  const contentSizeBytes = sizeFlag === 0 ? (single ? 1 : 0) : [0, 2, 4, 8][sizeFlag]
  let offset = start + 5 + (single ? 0 : 1) + [0, 1, 2, 4][descriptor & 3] + contentSizeBytes
  requireBytes(offset)
  let last = false
  while (!last) {
    requireBytes(offset + 3)
    const block = input.readUIntLE(offset, 3)
    last = (block & 1) !== 0
    const type = (block >>> 1) & 3
    if (type === 3) throw new Error('Reserved Zstandard block type.')
    offset += 3 + (type === 1 ? 1 : block >>> 3)
    requireBytes(offset)
  }
  offset += descriptor & 4 ? 4 : 0
  requireBytes(offset)
  return offset - start
}

function decodeFrames(input) {
  const chunks = []
  let offset = 0
  let length = 0
  while (offset < input.length) {
    const lengthOnDisk = frameLength(input, offset)
    const { buffer, engine } = zlib.zstdDecompressSync(input.subarray(offset, offset + lengthOnDisk), {
      info: true, maxOutputLength: maximumBytes - length,
    })
    if (engine.bytesWritten !== lengthOnDisk) throw new Error('Invalid Zstandard frame length.')
    offset += engine.bytesWritten
    length += buffer.length
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function encodeFrames(text) {
  // DSH requires the first frame to contain exactly its header line.
  const end = text.indexOf('\n') + 1
  const options = { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } }
  return Buffer.concat([text.slice(0, end), text.slice(end)].filter(Boolean).map(part => zlib.zstdCompressSync(part, options)))
}

export async function repairLegacySession(input, output) {
  const original = await readBounded(input)
  const compressed = original.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))
  if (compressed && (typeof zlib.zstdDecompressSync !== 'function' || typeof zlib.zstdCompressSync !== 'function')) {
    throw new Error('Zstandard sessions require Node 22.19 or newer (or Node 24+).')
  }
  const decoded = compressed ? decodeFrames(original) : original
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(decoded)
  if (!text.endsWith('\n')) throw new Error('Session must end with a complete newline-terminated JSON record.')
  const lines = text.match(/[^\n]*\n/g) ?? []
  let changes = 0
  const repaired = lines.map((line, index) => {
    let row
    try { row = JSON.parse(line) } catch { throw new Error(`Invalid JSON at line ${index + 1}; no output written.`) }
    if (index === 0) {
      objectMembers(line, 0)
      if (row.type !== 'session' || row.version !== 0 || typeof row.id !== 'string' || !row.id ||
          !Number.isSafeInteger(row.createdAt) || row.createdAt < 0 ||
          !Number.isSafeInteger(row.delegationDepth) || row.delegationDepth < 0) {
        throw new Error('Only a legacy DSH format v0 Session header is supported.')
      }
      return line
    }
    const source = row?.data?.source
    if (row?.type !== 'user/message' || source?.kind !== 'plugin' || source.plugin !== 'dsh-mnemon' ||
        !Object.hasOwn(summaries, source.form) || source.summary !== summaries[source.form]) return line
    changes++
    return removeSummary(line)
  }).join('')
  const plain = Buffer.from(repaired)
  // A clean artifact stays byte-identical, including its existing frame layout.
  const result = changes === 0 ? original : compressed ? encodeFrames(repaired) : plain
  if (output !== undefined) {
    if (resolve(input) === resolve(output)) throw new Error('Output must be a new copy; the input cannot be overwritten.')
    const temporary = await mkdtemp(join(dirname(resolve(output)), '.mnemon-repair-'))
    try {
      const path = join(temporary, 'session')
      const file = await open(path, 'wx', 0o600)
      try { await file.writeFile(result); await file.sync() } finally { await file.close() }
      // Publish exclusively, including when output is a symlink or hard link.
      await link(path, output)
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
  return {
    mode: output === undefined ? 'preview' : 'copy',
    format: 0,
    encoding: compressed ? 'zstd' : 'jsonl',
    repairedMessages: changes,
    inputSha256: sha256(original),
    outputSha256: sha256(result),
    originalPreserved: true,
  }
}

async function main(args) {
  const usage = 'Usage: dsh-mnemon-repair-session --input FILE [--output NEW_FILE]\nWithout --output, only preview the two known Mnemon v0 metadata repairs. Stop DSH and work on a backup copy. The input and existing output files are never overwritten.'
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return }
  const options = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (!['--input', '--output'].includes(name) || !value || value.startsWith('--') || options.has(name)) throw new Error(usage)
    options.set(name, value)
  }
  if (!options.has('--input')) throw new Error(usage)
  console.log(JSON.stringify(await repairLegacySession(options.get('--input'), options.get('--output')), null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1 })
}
