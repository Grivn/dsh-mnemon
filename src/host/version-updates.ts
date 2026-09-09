import { accessSync, constants, existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findMnemonCommand, mnemonNpmLauncher, nodeLauncherEnvironment } from 'dsh-mnemon-source-memory-spaces/native-cli'
import { runProcess, type ProcessOptions, type ProcessResult, type ProcessRunner } from './process.ts'
import type { VersionComponentId, VersionComponentStatus, VersionInstallMode, VersionPackageId, VersionPackageStatus, VersionStatus, VersionUpdateResult } from "./protocol.ts"

export type { VersionComponentId, VersionComponentStatus, VersionInstallMode, VersionStatus, VersionUpdateResult } from "./protocol.ts"

interface PackageManifest {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  bin?: Record<string, string>
}

interface DshInstall {
  mode: Extract<VersionInstallMode, 'npm' | 'link' | 'manual'>
  locationDir: string
  profileName?: string
  profileDir?: string
}

interface MnemonInstall {
  mode: Extract<VersionInstallMode, 'homebrew' | 'go' | 'npm' | 'manual' | 'missing'>
  command?: string
  hint?: string
  updateCommand?: string
  updateArgs?: string[]
  updateEnv?: NodeJS.ProcessEnv
}

export interface VersionUpdateDependencies {
  packageManifestPath?: string
  dshHome?: string
  mnemonCliPath?: () => string | undefined
  processRunner?: ProcessRunner
  resolveExecutable?: (command: string) => string | undefined
  fetchNpmLatest?: (name: string, tag?: string) => Promise<string | undefined>
  fetchMnemonLatest?: () => Promise<string | undefined>
}

const DSH_MNEMON_PACKAGE = 'dsh-mnemon'
const MNEMON_NPM_PACKAGE = '@mnemon-dev/mnemon'
const SUBPACKAGE = /^dsh-mnemon-(source|strategy|provider)-[a-z0-9][a-z0-9._-]*$/

export function isVersionComponentId(value: unknown): value is VersionComponentId {
  return typeof value === 'string' && (value === 'mnemon' || value === DSH_MNEMON_PACKAGE || SUBPACKAGE.test(value))
}
const MNEMON_MODULE = 'github.com/mnemon-dev/mnemon'
const PACKAGE_MANIFEST_PATH = [new URL('../package.json', import.meta.url), new URL('../../package.json', import.meta.url)]
  .map(url => fileURLToPath(url)).find(path => manifest(path)?.name === DSH_MNEMON_PACKAGE) ?? fileURLToPath(new URL('../package.json', import.meta.url))
const CHECK_TIMEOUT_MS = 10_000
const UPDATE_TIMEOUT_MS = 10 * 60_000
const MAX_UPDATE_OUTPUT_BYTES = 16 * 1024

async function settledWithin<T>(promise: Promise<T>, fallback: T, timeoutMs = CHECK_TIMEOUT_MS + 1_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), timeoutMs) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function manifest(path: string): PackageManifest | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as PackageManifest : undefined
  } catch {
    return undefined
  }
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Resolve one executable without invoking a shell. */
export function resolveExecutable(command: string): string | undefined {
  if (command.includes('/') || command.includes('\\')) {
    const path = command.startsWith('~/') ? join(homedir(), command.slice(2)) : resolve(command)
    return executable(path) ? path : undefined
  }
  const names = process.platform === 'win32' ? [`${command}.exe`, `${command}.cmd`, command] : [command]
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (directory === '') continue
    for (const name of names) {
      const path = join(directory, name)
      if (executable(path)) return path
    }
  }
  return undefined
}

export interface SemverParts {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export function parseSemver(value: string): SemverParts | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim())
  if (match === null) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split('.'),
  }
}

export function compareVersions(a: string, b: string): number {
  const left = parseSemver(a)
  const right = parseSemver(b)
  if (left === undefined && right === undefined) return 0
  if (left === undefined) return -1
  if (right === undefined) return 1
  for (const field of ['major', 'minor', 'patch'] as const) {
    if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
  if (left.prerelease.length === 0) return 1
  if (right.prerelease.length === 0) return -1
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index++) {
    const aPart = left.prerelease[index]
    const bPart = right.prerelease[index]
    if (aPart === undefined) return -1
    if (bPart === undefined) return 1
    if (aPart === bPart) continue
    const aNumber = /^\d+$/.test(aPart)
    const bNumber = /^\d+$/.test(bPart)
    if (aNumber && bNumber) return Number(aPart) < Number(bPart) ? -1 : 1
    if (aNumber) return -1
    if (bNumber) return 1
    return aPart < bPart ? -1 : 1
  }
  return 0
}

function versionFrom(text: string): string | undefined {
  return text.match(/\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\b/)?.[1]
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => { controller.abort() }, CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'dsh-mnemon-version-check' },
    })
    if (!response.ok) return undefined
    return await response.json()
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchNpmLatest(name: string, tag = 'latest'): Promise<string | undefined> {
  const body = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)
  if (typeof body !== 'object' || body === null) return undefined
  const version = (body as Record<string, unknown>).version
  return typeof version === 'string' ? version : undefined
}

function dependencySpec(profile: PackageManifest | undefined, name = DSH_MNEMON_PACKAGE): string | undefined {
  return profile?.dependencies?.[name] ?? profile?.devDependencies?.[name]
}

function isLinkSpec(spec: string | undefined): boolean {
  return spec !== undefined && /^(?:link|file|workspace):|^\.{1,2}(?:[/\\]|$)/.test(spec)
}

function linkedTarget(profileDir: string, spec: string): string | undefined {
  const value = spec.replace(/^(?:link|file):/, '')
  if (value.startsWith('workspace:')) return undefined
  return isAbsolute(value) ? resolve(value) : resolve(profileDir, value)
}

function profileFromAncestor(packageManifestPath: string): DshInstall | undefined {
  let directory = dirname(packageManifestPath)
  for (let depth = 0; depth < 12; depth++) {
    const profile = manifest(join(directory, 'package.json'))
    if (profile?.name?.startsWith('dsh-profile-') === true) {
      const spec = dependencySpec(profile)
      if (spec === undefined) return undefined
      const linked = isLinkSpec(spec)
      return {
        mode: linked ? 'link' : 'npm',
        locationDir: linked && spec !== undefined ? linkedTarget(directory, spec) ?? resolve(dirname(packageManifestPath)) : directory,
        profileName: profile.name.slice('dsh-profile-'.length),
        profileDir: directory,
      }
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return undefined
}

function linkedProfile(packageManifestPath: string, dshHome: string): DshInstall | undefined {
  const profilesDir = join(dshHome, 'profiles')
  if (!existsSync(profilesDir)) return undefined
  const packageRoot = realpathSync(dirname(packageManifestPath))
  const matches: Array<{ name: string; dir: string; locationDir: string }> = []
  for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const profileDir = join(profilesDir, entry.name)
    const spec = dependencySpec(manifest(join(profileDir, 'package.json')))
    if (!isLinkSpec(spec)) continue
    const target = spec === undefined ? undefined : linkedTarget(profileDir, spec)
    if (target === undefined || !existsSync(target)) continue
    try {
      if (realpathSync(target) === packageRoot) matches.push({ name: entry.name, dir: profileDir, locationDir: target })
    } catch {
      // A stale link belongs to neither the running package nor an update target.
    }
  }
  const match = matches[0]
  return match === undefined ? undefined : { mode: 'link', locationDir: match.locationDir, profileName: match.name, profileDir: match.dir }
}

function inspectDshInstall(packageManifestPath: string, dshHome: string): DshInstall {
  return profileFromAncestor(packageManifestPath) ?? linkedProfile(packageManifestPath, dshHome) ?? { mode: 'manual', locationDir: resolve(dirname(packageManifestPath)) }
}

async function resultOrThrow(runner: ProcessRunner, command: string, args: readonly string[], timeoutMs: number, options: Pick<ProcessOptions, 'cwd' | 'env'> = {}): Promise<ProcessResult> {
  const result = await runner(command, args, { timeoutMs, maxOutputBytes: MAX_UPDATE_OUTPUT_BYTES, ...options })
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${String(result.exitCode)}`
    throw new Error(detail)
  }
  return result
}

function updateOutput(result: ProcessResult): string | undefined {
  const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n').trim()
  return output === '' ? undefined : output.slice(-4_000)
}

/** Follow public package links afresh after an update, without Node's resolution cache. */
function packageAt(directory: string, name: string): string | undefined {
  for (let depth = 0; depth < 16; depth++) {
    const path = join(directory, 'node_modules', name, 'package.json')
    if (manifest(path)?.name === name) return path
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return undefined
}

function samePath(left: string, right: string): boolean {
  try { return realpathSync(left) === realpathSync(right) } catch { return false }
}

export class VersionUpdateManager {
  private dshMnemonVersion: string
  private readonly packageManifestPath: string
  private readonly dshHome: string
  private readonly mnemonCliPath: () => string | undefined
  private readonly processRunner: ProcessRunner
  private readonly executable: (command: string) => string | undefined
  private readonly fetchNpmLatest: (name: string, tag?: string) => Promise<string | undefined>
  private readonly fetchMnemonLatest: () => Promise<string | undefined>
  private readonly pendingRestart = new Set<VersionComponentId>()
  private updating = false

  constructor(dependencies: VersionUpdateDependencies = {}) {
    this.packageManifestPath = dependencies.packageManifestPath ?? PACKAGE_MANIFEST_PATH
    this.dshMnemonVersion = manifest(this.packageManifestPath)?.version ?? '0.0.0'
    this.dshHome = dependencies.dshHome ?? (process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'))
    this.mnemonCliPath = dependencies.mnemonCliPath ?? (() => findMnemonCommand({}))
    this.processRunner = dependencies.processRunner ?? runProcess
    this.executable = dependencies.resolveExecutable ?? resolveExecutable
    this.fetchNpmLatest = dependencies.fetchNpmLatest ?? fetchNpmLatest
    this.fetchMnemonLatest = dependencies.fetchMnemonLatest ?? (() => this.fetchNpmLatest(MNEMON_NPM_PACKAGE))
  }

  get currentDshMnemonVersion(): string {
    return this.dshMnemonVersion
  }

  private async latestPackageVersion(name: string, current?: string): Promise<string | undefined> {
    const channel = current === undefined ? undefined : parseSemver(current)?.prerelease[0]
    const tags = channel !== undefined && ['alpha', 'beta', 'rc'].includes(channel) ? ['latest', channel] : ['latest']
    const candidates = await Promise.all(tags.map(async tag => {
      const version = await settledWithin(this.fetchNpmLatest(name, tag), undefined)
      const parsed = version === undefined ? undefined : parseSemver(version)
      if (parsed === undefined) return undefined
      // Stable users never opt in implicitly, even if a registry tag is wrong.
      if (parsed.prerelease.length > 0 && (tag === 'latest' || parsed.prerelease[0] !== tag)) return undefined
      return version
    }))
    return candidates.filter((version): version is string => version !== undefined).sort(compareVersions).at(-1)
  }

  private latestDshMnemonVersion(): Promise<string | undefined> {
    return this.latestPackageVersion(DSH_MNEMON_PACKAGE, this.currentDshMnemonVersion)
  }

  private async latestMnemonVersion(): Promise<string | undefined> {
    const version = await settledWithin(this.fetchMnemonLatest(), undefined)
    const parsed = version === undefined ? undefined : parseSemver(version)
    return parsed !== undefined && parsed.prerelease.length === 0 ? version : undefined
  }

  private npmInvocation(): { command: string; args: string[]; env?: NodeJS.ProcessEnv } | undefined {
    const npm = this.executable('npm')
    if (npm === undefined) return undefined
    if (!/\.cmd$/i.test(npm)) return { command: npm, args: [] }
    const cli = join(dirname(npm), 'node_modules/npm/bin/npm-cli.js')
    return existsSync(cli) ? { command: process.execPath, args: [cli], env: nodeLauncherEnvironment() } : undefined
  }

  private async inspectMnemon(): Promise<{ install: MnemonInstall; current?: string }> {
    const configured = this.mnemonCliPath() ?? findMnemonCommand({})
    const command = configured === undefined ? undefined : this.executable(configured)
    if (command === undefined) return { install: { mode: 'missing' } }
    const launcher = mnemonNpmLauncher(command)
    let current: string | undefined
    try {
      current = versionFrom((await resultOrThrow(this.processRunner, launcher === undefined ? command : process.execPath, launcher === undefined ? ['--version'] : [launcher, '--version'], CHECK_TIMEOUT_MS,
        launcher === undefined ? {} : { env: nodeLauncherEnvironment() })).stdout)
    } catch {
      return { install: { mode: launcher === undefined ? 'manual' : 'npm', command, hint: 'cli-unreadable' } }
    }
    if (launcher !== undefined) {
      const install: MnemonInstall = { mode: 'npm', command, hint: 'npm-unmanaged' }
      const npm = this.npmInvocation()
      if (npm === undefined) install.hint = 'npm-missing'
      else {
        try {
          const globalRoot = (await resultOrThrow(this.processRunner, npm.command, [...npm.args, 'root', '--global'], CHECK_TIMEOUT_MS, { env: npm.env })).stdout.trim()
          if (isAbsolute(globalRoot) && samePath(dirname(dirname(launcher)), join(globalRoot, MNEMON_NPM_PACKAGE))) {
            install.hint = 'npm'
            install.updateCommand = process.execPath
            install.updateArgs = [launcher, 'update']
            install.updateEnv = nodeLauncherEnvironment()
          }
        } catch { /* Keep npm provenance, but do not offer an unverified update target. */ }
      }
      return { install, ...(current === undefined ? {} : { current }) }
    }
    let realCommand = command
    try { realCommand = realpathSync(command) } catch {}
    const normalizedCommand = realCommand.replaceAll('\\', '/')
    if (normalizedCommand.includes('/Caskroom/mnemon/')) {
      const brew = this.executable('brew')
      return { ...(current === undefined ? {} : { current }), install: { mode: 'homebrew', command, ...(brew === undefined ? {} : { updateCommand: brew, updateArgs: ['upgrade', '--cask', 'mnemon'] }) } }
    }
    if (normalizedCommand.includes('/Cellar/mnemon/')) {
      const brew = this.executable('brew')
      return { ...(current === undefined ? {} : { current }), install: { mode: 'homebrew', command, ...(brew === undefined ? {} : { updateCommand: brew, updateArgs: ['upgrade', 'mnemon-dev/tap/mnemon'] }) } }
    }
    const go = this.executable('go')
    if (go !== undefined) {
      try {
        // Release archives also contain Go build metadata. Only offer go install
        // when its actual output would replace the executable we are using.
        const environment = JSON.parse((await resultOrThrow(this.processRunner, go, ['env', '-json', 'GOBIN', 'GOPATH', 'GOOS', 'GOARCH', 'GOHOSTOS', 'GOHOSTARCH'], CHECK_TIMEOUT_MS)).stdout) as Record<string, unknown>
        const goPath = typeof environment.GOPATH === 'string' ? environment.GOPATH.split(delimiter)[0] : undefined
        const bin = typeof environment.GOBIN === 'string' && environment.GOBIN !== '' ? environment.GOBIN : goPath === undefined || goPath === '' ? undefined : join(goPath, 'bin')
        if (bin === undefined || !isAbsolute(bin)
          || typeof environment.GOOS !== 'string' || environment.GOOS !== environment.GOHOSTOS
          || typeof environment.GOARCH !== 'string' || environment.GOARCH !== environment.GOHOSTARCH
          || realpathSync(join(bin, process.platform === 'win32' ? 'mnemon.exe' : 'mnemon')) !== realCommand) {
          return { ...(current === undefined ? {} : { current }), install: { mode: 'manual', command } }
        }
        const metadata = await resultOrThrow(this.processRunner, go, ['version', '-m', command], CHECK_TIMEOUT_MS)
        const mainPath = metadata.stdout.split(/\r?\n/).map(line => line.trim().split(/\s+/)).find(fields => fields[0] === 'path')?.[1]
        if (mainPath === MNEMON_MODULE) {
          return { ...(current === undefined ? {} : { current }), install: { mode: 'go', command, updateCommand: go, updateArgs: ['install', `${MNEMON_MODULE}@latest`] } }
        }
      } catch {
        // Unknown output locations and non-Go binaries remain manual installs.
      }
    }
    return { ...(current === undefined ? {} : { current }), install: { mode: 'manual', command } }
  }

  private subpackages(install: DshInstall): Array<{ status: VersionPackageStatus; manifestPath?: string }> {
    const starterPath = install.mode === 'npm' && install.profileDir !== undefined
      ? packageAt(install.profileDir, DSH_MNEMON_PACKAGE) ?? this.packageManifestPath : this.packageManifestPath
    const starter = manifest(starterPath)
    const profile = install.profileDir === undefined ? undefined : manifest(join(install.profileDir, 'package.json'))
    const names = [...new Set([...Object.keys(starter?.dependencies ?? {}), ...Object.keys(profile?.dependencies ?? {}), ...Object.keys(profile?.devDependencies ?? {})])].filter(name => SUBPACKAGE.test(name)).sort()
    return names.map(name => {
      const directSpec = dependencySpec(profile, name)
      const managedBy = directSpec === undefined ? 'starter' : 'profile'
      const base = directSpec === undefined ? dirname(starterPath) : install.profileDir!
      const path = packageAt(base, name)
      const value = path === undefined ? undefined : manifest(path)
      const linked = isLinkSpec(directSpec ?? starter?.dependencies?.[name]) || install.mode === 'link'
        || (path !== undefined && !realpathSync(dirname(path)).replaceAll('\\', '/').includes('/node_modules/'))
      const mode: VersionInstallMode = linked ? 'link' : path === undefined ? 'missing' : install.mode === 'npm' ? 'npm' : 'manual'
      const supported = managedBy === 'profile' && mode === 'npm' && this.executable('pnpm') !== undefined
      return {
        ...(path === undefined ? {} : { manifestPath: path }),
        status: {
          id: name as VersionPackageId, name, kind: SUBPACKAGE.exec(name)![1] as VersionPackageStatus['kind'], managedBy,
          ...(starter?.dependencies?.[name] === undefined ? {} : { expectedVersion: starter.dependencies[name] }),
          ...(value?.version === undefined ? {} : { current: value.version }),
          ...(path === undefined ? {} : { installPath: realpathSync(dirname(path)) }),
          ...(install.profileName === undefined ? {} : { installProfile: install.profileName }),
          installMode: mode, outdated: false, updateSupported: supported,
          updateHint: linked ? 'link' : managedBy === 'starter' ? 'starter' : supported ? 'pnpm' : mode === 'npm' ? 'pnpm-missing' : 'manual',
          restartRequired: this.pendingRestart.has(name as VersionPackageId) || this.pendingRestart.has(DSH_MNEMON_PACKAGE),
        },
      }
    })
  }

  async check(): Promise<VersionStatus> {
    const dshInstall = inspectDshInstall(this.packageManifestPath, this.dshHome)
    const [mnemonLocal, mnemonLatest, dshLatest, packages] = await Promise.all([
      settledWithin(this.inspectMnemon(), { install: { mode: 'manual', hint: 'cli-unreadable' } }),
      this.latestMnemonVersion(),
      settledWithin(this.latestDshMnemonVersion(), undefined),
      Promise.all(this.subpackages(dshInstall).map(async ({ status }) => {
        const latest = await this.latestPackageVersion(status.id, status.current)
        return { ...status, ...(latest === undefined ? { checkError: 'latest-unavailable' } : { latest }), outdated: status.current !== undefined && latest !== undefined && compareVersions(status.current, latest) < 0 }
      })),
    ])
    const pnpm = this.executable('pnpm')
    const mnemonOutdated = mnemonLocal.current !== undefined && mnemonLatest !== undefined && compareVersions(mnemonLocal.current, mnemonLatest) < 0
    const dshOutdated = dshLatest !== undefined && compareVersions(this.currentDshMnemonVersion, dshLatest) < 0
    const mnemonSupported = mnemonLocal.install.updateCommand !== undefined
    const dshSupported = dshInstall.mode === 'npm' && dshInstall.profileDir !== undefined && pnpm !== undefined
    return {
      checkedAt: new Date().toISOString(),
      components: [
        {
          id: 'mnemon',
          name: 'Mnemon CLI',
          ...(mnemonLocal.install.command === undefined ? {} : { executablePath: mnemonLocal.install.command }),
          ...(mnemonLocal.current === undefined ? {} : { current: mnemonLocal.current }),
          ...(mnemonLatest === undefined ? {} : { latest: mnemonLatest }),
          outdated: mnemonOutdated,
          installMode: mnemonLocal.install.mode,
          updateSupported: mnemonSupported,
          updateHint: mnemonLocal.install.hint ?? (mnemonLocal.install.mode === 'homebrew'
            ? mnemonSupported ? 'brew' : 'brew-missing'
            : mnemonLocal.install.mode === 'go'
              ? 'go'
              : mnemonLocal.install.mode === 'missing' ? 'install' : 'manual'),
          ...(mnemonLatest === undefined ? { checkError: 'latest-unavailable' } : {}),
        },
        {
          id: 'dsh-mnemon',
          name: 'dsh-mnemon',
          ...(dshInstall.profileName === undefined ? {} : { installProfile: dshInstall.profileName }),
          installPath: dshInstall.locationDir,
          current: this.currentDshMnemonVersion,
          ...(dshLatest === undefined ? {} : { latest: dshLatest }),
          outdated: dshOutdated,
          installMode: dshInstall.mode,
          updateSupported: dshSupported,
          packages,
          restartRequired: this.pendingRestart.size > 0,
          updateHint: dshInstall.mode === 'npm'
            ? dshSupported ? 'pnpm' : 'pnpm-missing'
            : dshInstall.mode === 'link' ? 'link' : 'manual',
          ...(dshLatest === undefined ? { checkError: 'latest-unavailable' } : {}),
        },
      ],
    }
  }

  async update(component: VersionComponentId): Promise<VersionUpdateResult> {
    if (this.updating) throw new Error('A version update is already in progress')
    this.updating = true
    try { return await this.performUpdate(component) } finally { this.updating = false }
  }

  private async performUpdate(component: VersionComponentId): Promise<VersionUpdateResult> {
    if (component === 'mnemon') {
      const before = await this.inspectMnemon()
      const latest = await this.latestMnemonVersion()
      if (before.current === undefined) throw new Error('Mnemon CLI is unavailable')
      if (latest === undefined) throw new Error('Unable to verify the latest Mnemon release')
      if (compareVersions(before.current, latest) >= 0) return { component, previousVersion: before.current, currentVersion: before.current, updated: false, restartRequired: false }
      if (before.install.updateCommand === undefined || before.install.updateArgs === undefined) throw new Error('This Mnemon installation cannot be updated automatically')
      const output = await resultOrThrow(this.processRunner, before.install.updateCommand, before.install.updateArgs, UPDATE_TIMEOUT_MS, { env: before.install.updateEnv })
      const after = await this.inspectMnemon()
      if (after.current === undefined || compareVersions(after.current, latest) < 0) throw new Error(`Mnemon update did not activate version ${latest}; found ${after.current ?? 'no executable version'}`)
      const outputText = updateOutput(output)
      return {
        component,
        previousVersion: before.current,
        currentVersion: after.current,
        updated: true,
        restartRequired: false,
        ...(outputText === undefined ? {} : { output: outputText }),
      }
    }

    const install = inspectDshInstall(this.packageManifestPath, this.dshHome)
    const child = component === DSH_MNEMON_PACKAGE ? undefined : this.subpackages(install).find(item => item.status.id === component)?.status
    if (component !== DSH_MNEMON_PACKAGE && child === undefined) throw new Error(`Unknown version component: ${String(component)}`)
    if (child !== undefined && !child.updateSupported) throw new Error('This subpackage must be updated through its Starter or original installation method')
    const previousVersion = child?.current ?? this.currentDshMnemonVersion
    const latest = await this.latestPackageVersion(component, previousVersion)
    if (latest === undefined) throw new Error('Unable to verify the latest dsh-mnemon release')
    if (compareVersions(previousVersion, latest) >= 0) return { component, previousVersion, currentVersion: previousVersion, updated: false, restartRequired: this.pendingRestart.has(component) }
    const pnpm = this.executable('pnpm')
    if (install.mode !== 'npm' || install.profileDir === undefined || pnpm === undefined) throw new Error('This dsh-mnemon installation cannot be updated automatically')
    const output = await resultOrThrow(this.processRunner, pnpm, ['add', `${component}@${latest}`, '--save-exact'], UPDATE_TIMEOUT_MS, { cwd: install.profileDir })
    // The running module may still reside in pnpm's old versioned directory.
    // Read the profile's current public link, not that stale package path.
    const installedVersion = manifest(join(install.profileDir, 'node_modules', component, 'package.json'))?.version
    if (installedVersion !== latest) throw new Error(`${component} update did not install the requested version ${latest}; found ${installedVersion ?? 'no package'}`)
    const outputText = updateOutput(output)
    if (component === DSH_MNEMON_PACKAGE) this.dshMnemonVersion = installedVersion
    this.pendingRestart.add(component)
    return {
      component,
      previousVersion,
      currentVersion: installedVersion,
      updated: true,
      restartRequired: true,
      ...(outputText === undefined ? {} : { output: outputText }),
    }
  }
}
