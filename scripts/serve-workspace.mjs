#!/usr/bin/env node
// Persistent, isolated development profile using the actual DSH and Mnemon binaries.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { constants, createWriteStream } from 'node:fs'
import { access, copyFile, chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({ options: {
  'state-dir': { type: 'string' },
  mnemon: { type: 'string' },
  port: { type: 'string', default: '0' },
  model: { type: 'string', default: 'fixture' },
  'workspace-plugins': { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
} })
if (values.help) { console.log('Usage: node scripts/serve-workspace.mjs --state-dir /directory --mnemon /binary [--port 0] [--model fixture|configured] [--workspace-plugins]'); process.exit(0) }
if (!values['state-dir'] || !values.mnemon) throw new Error('Required: --state-dir /absolute/directory --mnemon /absolute/binary')
if (!['fixture', 'configured'].includes(values.model)) throw new Error('--model must be fixture or configured')
if (!/^\d{1,5}$/.test(values.port) || Number(values.port) > 65535) throw new Error('Invalid port')
const state = resolve(values['state-dir'])
if (state === root || root.startsWith(state + '/')) throw new Error('State directory must be separate from the source checkout')
const dshHome = join(state, 'dsh-home')
const memory = join(state, 'memory')
const workspace = join(state, 'workspace')
const bin = join(state, 'bin')
const logs = join(state, 'logs')
await Promise.all([dshHome, memory, workspace, bin, logs].map(directory => mkdir(directory, { recursive: true })))
await access(resolve(values.mnemon), constants.X_OK)
const native = join(bin, 'mnemon')
if (resolve(values.mnemon) !== native) await copyFile(resolve(values.mnemon), native)
await chmod(native, 0o700)
const model = values.model === 'fixture' ? createServer(async (request, response) => {
  const chunks = []; let bytes = 0
  for await (const chunk of request) { bytes += chunk.length; if (bytes <= 2 * 1024 * 1024) chunks.push(chunk) }
  if (bytes > 2 * 1024 * 1024) { response.writeHead(413); response.end('Fixture input limit exceeded'); return }
  let review = false
  try { review = JSON.parse(Buffer.concat(chunks).toString('utf8')).messages?.some(message => message.role === 'system' && typeof message.content === 'string' && message.content.includes('Conversation review contract v1')) === true } catch {}
  const content = review ? JSON.stringify({ severity: 'info', summary: '本地审核链路已完成；这是合成结果，仅用于验证流程。', issues: [{ severity: 'info', text: '审核输入来自用户可见对话，未请求工具或私有推理。' }], proposals: [] }) : 'The isolated workspace is ready. This is a deterministic local test response.'
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  for (const choice of [
    { index: 0, delta: { role: 'assistant', content }, finish_reason: null },
    { index: 0, delta: {}, finish_reason: 'stop' },
  ]) response.write(`data: ${JSON.stringify({ id: 'workspace-fixture', choices: [choice] })}\n\n`)
  response.end('data: [DONE]\n\n')
}) : undefined
if (model) await new Promise((fulfill, reject) => { model.once('error', reject); model.listen(0, '127.0.0.1', fulfill) })
const env = {
  ...process.env, DSH_HOME: dshHome, DSH_TELEMETRY_DISABLED: '1',
  MNEMON_DATA_DIR: memory, MNEMON_CLI_PATH: native,
  ...(model ? { DEEPSEEK_API_KEY: 'local-fixture', DEEPSEEK_BASE_URL: `http://127.0.0.1:${model.address().port}` } : {}),
}
const dshBin = join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
async function run(command, args) {
  const child = spawn(command, args, { cwd: workspace, env, stdio: 'inherit' })
  await new Promise((fulfill, reject) => {
    child.once('error', reject)
    child.once('exit', code => code === 0 ? fulfill() : reject(new Error(`Command failed with code ${code}`)))
  })
}
let web
let stopping = false
let restarting = false
const output = createWriteStream(join(logs, 'dsh.log'), { flags: 'a', mode: 0o600 })
function launch() {
  web = spawn(process.execPath, [dshBin, 'web', '--no-open', '--host', '127.0.0.1', '--port', values.port], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] })
  web.stdout.pipe(output, { end: false }); web.stderr.pipe(output, { end: false })
  web.stdout.pipe(process.stdout); web.stderr.pipe(process.stderr)
  web.once('error', error => { console.error(error); process.exitCode = 1; void stop() })
  web.once('exit', code => { if (!stopping && !restarting) { process.exitCode = code ?? 1; void stop() } })
}
async function stop() {
  if (stopping) return
  stopping = true
  if (web && web.exitCode === null) { web.kill('SIGTERM'); await new Promise(fulfill => web.once('exit', fulfill)) }
  if (model) { model.closeAllConnections(); await new Promise(fulfill => model.close(fulfill)) }
  output.end()
  console.log('Stopped this workspace. Its data and logs are retained at ' + state)
}
process.once('SIGINT', () => { void stop() })
process.once('SIGTERM', () => { void stop() })
process.on('SIGUSR2', async () => {
  if (stopping || restarting || !web || web.exitCode !== null) return
  restarting = true
  web.kill('SIGTERM'); await new Promise(fulfill => web.once('exit', fulfill))
  if (!stopping) launch()
  restarting = false
})
try {
  await run(native, ['--version'])
  await run(native, ['--data-dir', memory, 'status'])
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const legacyEnhancements = new Set(['dsh-mnemon-strategy-auto-capture', 'dsh-mnemon-strategy-light-context', 'dsh-mnemon-strategy-scoped'])
  const packages = Object.keys(manifest.dependencies).filter(name => name.startsWith('dsh-mnemon-') && !legacyEnhancements.has(name))
  await run(process.execPath, [dshBin, 'plugin', '--profile', 'web', 'add', `link:${root}`,
    ...packages.map(name => `link:${join(root, 'plugins', name)}`)])
  const preset = join(dshHome, '.agent-presets/workspace-validation')
  await mkdir(preset, { recursive: true })
  await writeFile(join(preset, 'preset.yml'), 'name: Workspace Validation\ndescription: Local service validation.\norder: 0\n')
  await writeFile(join(preset, 'agent.cordis.yml'), "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: You are helping validate a local memory workspace.\n")
  let patch = `- id: mnemon
  config:
    storageScope: custom
    dataDir: ${JSON.stringify(memory)}
    cliPath: ${JSON.stringify(native)}
    writeEnabled: true
    lifecycleEnabled: true
    displayMode: sidebar
${values['workspace-plugins'] ? '    memoryTopology:\n      strategyId: workspace\n' : ''}
- id: agent-presets
  config:
    default: workspace-validation
- id: directory-picker
  disabled: true
- insert:
    - id: workspace-directory-picker
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: workspace-directory-picker-ui
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
`
  if (values['workspace-plugins']) patch += await readFile(join(root, 'scripts/workspace-plugins.patch.yml'), 'utf8')
  if (values['workspace-plugins']) patch += `- id: mnemon-source-agent-jobs\n  disabled: false\n  config:\n    adapters:\n      - id: local-fixture\n        label: Local validation\n        command: ${JSON.stringify(process.execPath)}\n        args: [${JSON.stringify(join(root, 'scripts/fixture-worker.mjs'))}, '{prompt}']\n        resumeArgs: [${JSON.stringify(join(root, 'scripts/fixture-worker.mjs'))}, '{prompt}', '{session}']\n        timeoutSeconds: 60\n`
  await writeFile(join(dshHome, 'profiles/web/cordis.patch.yml'), patch)
  await writeFile(join(workspace, 'README.md'), '# Memory workspace validation\n\nSynthetic content used to validate local services and plugin composition.\n')
  await writeFile(join(state, 'workspace.code-workspace'), JSON.stringify({ folders: [{ path: root }, { path: workspace }] }, null, 2) + '\n')
  await writeFile(join(state, 'instance.json'), JSON.stringify({ pid: process.pid, root, state, workspace, dshHome, memory, native, model: values.model, port: Number(values.port) }, null, 2) + '\n', { mode: 0o600 })
  console.log('Workspace state: ' + state)
  console.log('Workspace directory: ' + workspace)
  console.log('Supervisor PID: ' + process.pid + '; SIGUSR2 restarts DSH with retained state')
  launch()
} catch (error) { console.error(error); process.exitCode = 1; await stop() }
