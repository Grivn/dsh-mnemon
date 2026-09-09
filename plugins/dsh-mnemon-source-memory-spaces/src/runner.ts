import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { JsonValue } from './contracts.ts'
import type { ResolvedMemorySpacesConfig as ResolvedConfig } from './config.ts'
import { runProcess, type ProcessOptions, type ProcessRunner } from './providers/process.ts'
import { withMemoryStorageLock } from 'dsh-mnemon/extension-sdk'
import { findMnemonCommand, isMnemonExecutable, mnemonNpmLauncher, nodeLauncherEnvironment } from './native-cli.ts'

export { findMnemonCommand } from './native-cli.ts'
export type { CommandDiscoveryOptions } from './native-cli.ts'

function expandHome(path: string): string {
  return path === '~' ? homedir() : path.startsWith('~/') || path.startsWith('~\\') ? join(homedir(), path.slice(2)) : path
}

export class MnemonCliError extends Error {
  readonly exitCode: number | null
  readonly stderr: string

  constructor(message: string, exitCode: number | null = null, stderr = '') {
    super(message)
    this.name = 'MnemonCliError'
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

export interface MnemonRunOptions {
  signal?: AbortSignal
  globalFlags?: boolean
  store?: string
}

export interface MnemonTextCommand {
  args: readonly string[]
  options?: MnemonRunOptions
}

export interface MnemonRunner {
  readonly command: string
  readonly commandFound: boolean
  readonly config: ResolvedConfig
  runJson(args: readonly string[], options?: MnemonRunOptions): Promise<JsonValue>
  runText(args: readonly string[], options?: MnemonRunOptions): Promise<string>
  /** Run related CLI commands consecutively without allowing queued work between them. */
  runTextBatch(commands: readonly MnemonTextCommand[]): Promise<string[]>
  /** Run one operation after all CLI work and hold the same queue until it settles. */
  withExclusive<T>(operation: () => T | Promise<T>): Promise<T>
  effectiveDataDir(): string
  /** Read Mnemon's persisted active-file selection, ignoring config and environment overrides. */
  persistedStore(): string
  effectiveStore(): string
}

const EMBEDDING_ENVIRONMENT_KEYS = new Set(['MNEMON_EMBED_ENDPOINT', 'MNEMON_EMBED_MODEL', 'MNEMON_EMBED_API_KEY', 'MNEMON_EMBED_PROTOCOL'])

/** Preserve the Host environment while making saved embedding overrides authoritative. */
function processEnvironment(config: ResolvedConfig): NodeJS.ProcessEnv | undefined {
  if (!config.embedding.enabled) return undefined
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !EMBEDDING_ENVIRONMENT_KEYS.has(key.toUpperCase())))
  return {
    ...inherited,
    MNEMON_EMBED_ENDPOINT: config.embedding.endpoint,
    MNEMON_EMBED_MODEL: config.embedding.model,
    MNEMON_EMBED_API_KEY: config.embedding.apiKey,
    // 'auto' leaves the protocol to Mnemon's /v1 auto-detection.
    ...(config.embedding.protocol === 'auto' ? {} : { MNEMON_EMBED_PROTOCOL: config.embedding.protocol }),
  }
}

export function createRunner(config: ResolvedConfig, processRunner: ProcessRunner = runProcess, workspaceRoot?: string): MnemonRunner {
  // Installation can change while DSH stays running. Status and execution
  // must resolve the same current executable, not a boot-time availability flag.
  const currentCommand = (): string => findMnemonCommand(config) ?? config.cliPath ?? 'mnemon'
  // Mnemon 0.1.2 runs store migrations while opening the database. Serializing
  // CLI processes prevents parallel status/viz calls during WebUI mount from
  // racing that migration and surfacing a transient SQLITE_BUSY error.

  const globalArgs = (store?: string): string[] => {
    const args: string[] = []
    if (config.storageScope !== 'global' || config.dataDir !== undefined) args.push('--data-dir', effectiveDataDir())
    if (store !== undefined) args.push('--store', store)
    else if (config.store !== undefined) args.push('--store', config.store)
    return args
  }
  const effectiveDataDir = (): string => {
    if (config.storageScope === 'workspace') return resolve(workspaceRoot ?? process.cwd(), '.mnemon')
    if (config.storageScope === 'custom') return expandHome(config.dataDir!)
    return expandHome(process.env.MNEMON_DATA_DIR?.trim() || '~/.mnemon')
  }
  const persistedStore = (): string => {
    const active = join(effectiveDataDir(), 'active')
    if (existsSync(active)) {
      try {
        const value = readFileSync(active, 'utf8').trim()
        if (/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) return value
      } catch {
        // Fall through to Mnemon's own default.
      }
    }
    return 'default'
  }
  const launch = async (
    args: readonly string[],
    options: MnemonRunOptions = {},
  ): Promise<string> => {
    if (options.signal?.aborted === true) throw new MnemonCliError(`mnemon command aborted: ${String(options.signal.reason ?? 'cancelled')}`)
    const argv = options.globalFlags === false ? [...args] : [...globalArgs(options.store), ...args]
    const environment = processEnvironment(config)
    const processOptions: ProcessOptions = {
      timeoutMs: config.timeoutMs,
      ...(environment === undefined ? {} : { env: environment }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }
    let result
    try {
      const command = currentCommand()
      const launcher = mnemonNpmLauncher(command)
      result = await processRunner(launcher === undefined ? command : process.execPath, launcher === undefined ? argv : [launcher, ...argv],
        launcher === undefined ? processOptions : { ...processOptions, env: nodeLauncherEnvironment(processOptions.env) })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      const hint = process.platform === 'win32'
        ? 'Install the official Mnemon Windows release, ensure mnemon.exe is on PATH or under %LOCALAPPDATA%\\Programs\\mnemon, or set MNEMON_CLI_PATH or mnemon.cliPath to its absolute path.'
        : 'Install Mnemon and ensure "mnemon" is on PATH, or set MNEMON_CLI_PATH or mnemon.cliPath.'
      throw new MnemonCliError(
        `${detail}. ${hint}`,
      )
    }
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || 'no output'
      throw new MnemonCliError(`mnemon ${args.join(' ')} exited ${String(result.exitCode)}: ${detail}`, result.exitCode, result.stderr)
    }
    return result.stdout
  }

  const execute = (
    args: readonly string[],
    options: MnemonRunOptions = {},
  ): Promise<string> => {
    return withMemoryStorageLock(effectiveDataDir(), () => launch(args, options))
  }

  return {
    get command() { return currentCommand() },
    get commandFound() {
      const found = findMnemonCommand(config)
      return found !== undefined && isMnemonExecutable(found)
    },
    config,
    async runJson(args, options) {
      const stdout = await execute(args, options)
      try {
        return JSON.parse(stdout) as JsonValue
      } catch {
        throw new MnemonCliError(`mnemon ${args.join(' ')} returned invalid JSON`)
      }
    },
    runText: execute,
    runTextBatch(commands) {
      return withMemoryStorageLock(effectiveDataDir(), async () => {
        const outputs: string[] = []
        for (const command of commands) outputs.push(await launch(command.args, command.options))
        return outputs
      })
    },
    withExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
      return withMemoryStorageLock(effectiveDataDir(), operation)
    },
    effectiveDataDir() {
      return effectiveDataDir()
    },
    persistedStore() {
      return persistedStore()
    },
    effectiveStore() {
      if (config.store !== undefined) return config.store
      const fromEnvironment = process.env.MNEMON_STORE?.trim()
      if (fromEnvironment !== undefined && fromEnvironment !== '') return fromEnvironment
      return persistedStore()
    },
  }
}
