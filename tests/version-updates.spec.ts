import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProcessRunner } from '../src/host/process.ts'
import { compareVersions, VersionUpdateManager } from "../src/host/version-updates.ts"

const temporary: string[] = []

function directory(label: string): string {
  const path = mkdtempSync(join(tmpdir(), `dsh-mnemon-${label}-`))
  temporary.push(path)
  return path
}

function json(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value), 'utf8')
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('VersionUpdateManager', () => {
  it('resolves a configured CLI command on PATH and observes availability changes without restarting', async () => {
    const root = directory('configured-cli-path')
    const command = join(root, process.platform === 'win32' ? 'mnemon-test.exe' : 'mnemon-test')
    const install = () => { writeFileSync(command, '#!/bin/sh\n'); chmodSync(command, 0o755) }
    install()
    vi.stubEnv('PATH', root)
    const run = vi.fn<ProcessRunner>(async () => ({ stdout: 'mnemon version 0.2.5\n', stderr: '', exitCode: 0 }))
    const manager = new VersionUpdateManager({
      packageManifestPath: join(root, 'package.json'), mnemonCliPath: () => 'mnemon-test', processRunner: run,
      fetchNpmLatest: async () => undefined, fetchMnemonLatest: async () => '0.2.5',
    })
    expect((await manager.check()).components.find(item => item.id === 'mnemon')).toMatchObject({ current: '0.2.5', executablePath: command })
    expect(run).toHaveBeenCalledWith(command, ['--version'], expect.any(Object))
    rmSync(command)
    expect((await manager.check()).components.find(item => item.id === 'mnemon')).toMatchObject({ installMode: 'missing' })
    install()
    expect((await manager.check()).components.find(item => item.id === 'mnemon')).toMatchObject({ current: '0.2.5', executablePath: command })
  })

  it('compares releases and prereleases using semantic-version precedence', () => {
    expect(compareVersions('0.1.9', '0.1.10')).toBeLessThan(0)
    expect(compareVersions('v1.0.0-rc.2', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0+build.2', '1.0.0+build.1')).toBe(0)
  })

  it('reports a local DSH link without offering a destructive package update', async () => {
    const root = directory('link-source')
    const dshHome = directory('link-home')
    const profile = join(dshHome, 'profiles', 'web')
    mkdirSync(profile, { recursive: true })
    json(join(root, 'package.json'), { name: 'dsh-mnemon', version: '0.1.2' })
    json(join(profile, 'package.json'), { name: 'dsh-profile-web', dependencies: { 'dsh-mnemon': `link:${root}` } })
    const manager = new VersionUpdateManager({
      packageManifestPath: join(root, 'package.json'),
      dshHome,
      mnemonCliPath: () => '/missing/mnemon',
      resolveExecutable: () => undefined,
      fetchNpmLatest: async () => '0.1.3',
      fetchMnemonLatest: async () => '0.2.0',
    })

    const status = await manager.check()
    expect(status.components.find(component => component.id === 'dsh-mnemon')).toMatchObject({
      current: '0.1.2', latest: '0.1.3', outdated: true, installMode: 'link', installProfile: 'web', installPath: root, updateSupported: false, updateHint: 'link',
    })
  })

  it('reports the Mnemon executable used for the version check', async () => {
    const root = directory('executable-path')
    const command = join(root, 'mnemon')
    writeFileSync(command, '#!/bin/sh\n', 'utf8')
    chmodSync(command, 0o755)
    const manager = new VersionUpdateManager({
      packageManifestPath: join(root, 'package.json'),
      mnemonCliPath: () => command,
      resolveExecutable: value => value === command ? command : undefined,
      processRunner: async () => ({ stdout: 'mnemon version 0.2.3\n', stderr: '', exitCode: 0 }),
      fetchNpmLatest: async () => '0.1.4',
      fetchMnemonLatest: async () => '0.2.3',
    })

    const status = await manager.check()
    expect(status.components.find(component => component.id === 'mnemon')).toMatchObject({
      executablePath: command,
      current: '0.2.3',
      latest: '0.2.3',
    })
    expect(status.components.find(component => component.id === 'dsh-mnemon')).toMatchObject({
      installMode: 'manual',
      installPath: root,
    })
  })

  it('updates an npm-managed plugin only inside its owning DSH profile', async () => {
    const profile = directory('npm-profile')
    const packageRoot = join(profile, 'node_modules', 'dsh-mnemon')
    mkdirSync(packageRoot, { recursive: true })
    json(join(profile, 'package.json'), { name: 'dsh-profile-web', dependencies: { 'dsh-mnemon': '^0.1.2' } })
    json(join(packageRoot, 'package.json'), { name: 'dsh-mnemon', version: '0.1.2' })
    const run = vi.fn<ProcessRunner>(async () => {
      json(join(packageRoot, 'package.json'), { name: 'dsh-mnemon', version: '0.1.3' })
      return { stdout: 'updated', stderr: '', exitCode: 0 }
    })
    const manager = new VersionUpdateManager({
      packageManifestPath: join(packageRoot, 'package.json'),
      mnemonCliPath: () => '/missing/mnemon',
      resolveExecutable: command => command === 'pnpm' ? '/fake/pnpm' : undefined,
      processRunner: run,
      fetchNpmLatest: async () => '0.1.3',
      fetchMnemonLatest: async () => '0.2.0',
    })

    const status = await manager.check()
    expect(status.components.find(component => component.id === 'dsh-mnemon')).toMatchObject({
      installMode: 'npm',
      installProfile: 'web',
      installPath: profile,
    })
    await expect(manager.update('dsh-mnemon')).resolves.toMatchObject({ updated: true, previousVersion: '0.1.2', currentVersion: '0.1.3', restartRequired: true })
    expect(manager.currentDshMnemonVersion).toBe('0.1.3')
    expect(run).toHaveBeenCalledWith(expect.stringMatching(/pnpm$/), ['add', 'dsh-mnemon@0.1.3', '--save-exact'], expect.objectContaining({ timeoutMs: 600_000, maxOutputBytes: 16 * 1024, cwd: profile }))
  })

  function npmFixture(current: string, tags: Record<string, string | undefined>) {
    const profile = directory('npm-channel')
    const packageRoot = join(profile, 'node_modules', 'dsh-mnemon')
    mkdirSync(packageRoot, { recursive: true })
    json(join(profile, 'package.json'), { name: 'dsh-profile-web', dependencies: { 'dsh-mnemon': current } })
    json(join(packageRoot, 'package.json'), { name: 'dsh-mnemon', version: current })
    const fetch = vi.fn(async (_name: string, tag = 'latest') => tags[tag])
    const run = vi.fn<ProcessRunner>(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
    const options = {
      packageManifestPath: join(packageRoot, 'package.json'), dshHome: profile,
      mnemonCliPath: () => '/missing/mnemon', resolveExecutable: (name: string) => name === 'pnpm' ? '/fake/pnpm' : undefined,
      processRunner: run, fetchNpmLatest: fetch, fetchMnemonLatest: async () => undefined,
    }
    return { profile, packageRoot, fetch, run, options, manager: new VersionUpdateManager(options) }
  }

  it('finds beta updates without exposing prereleases to stable users', async () => {
    const beta = npmFixture('0.5.0-beta.1', { latest: '0.4.0', beta: '0.5.0-beta.2' })
    expect((await beta.manager.check()).components[1]).toMatchObject({ current: '0.5.0-beta.1', latest: '0.5.0-beta.2', outdated: true })
    expect(beta.fetch.mock.calls.map(call => call[1])).toEqual(['latest', 'beta'])
    const stable = npmFixture('0.4.0', { latest: '0.4.1', beta: '0.5.0-beta.2' })
    expect((await stable.manager.check()).components[1]).toMatchObject({ latest: '0.4.1', outdated: true })
    expect(stable.fetch).toHaveBeenCalledTimes(1)
    expect(stable.fetch).toHaveBeenCalledWith('dsh-mnemon', 'latest')
    expect(stable.run).not.toHaveBeenCalled()
  })

  it('follows the rc channel for an installed release candidate', async () => {
    const candidate = npmFixture('0.5.0-rc.1', { latest: '0.4.7', rc: '0.5.0-rc.2' })
    expect((await candidate.manager.check()).components[1]).toMatchObject({ current: '0.5.0-rc.1', latest: '0.5.0-rc.2', outdated: true })
    expect(candidate.fetch.mock.calls.map(call => call[1])).toEqual(['latest', 'rc'])
  })

  it('offers the final stable version to beta users but never downgrades to an older stable version', async () => {
    const beta = npmFixture('0.5.0-beta.1', { latest: '0.5.0', beta: '0.5.0-beta.2' })
    expect((await beta.manager.check()).components[1]).toMatchObject({ latest: '0.5.0', outdated: true })
    const older = npmFixture('0.5.0-beta.1', { latest: '0.4.0' })
    await expect(older.manager.update('dsh-mnemon')).resolves.toMatchObject({ updated: false, currentVersion: '0.5.0-beta.1' })
    expect(older.run).not.toHaveBeenCalled()
  })

  it('rejects a mis-tagged prerelease instead of silently enrolling a stable user', async () => {
    const stable = npmFixture('0.4.0', { latest: '0.5.0-beta.2' })
    expect((await stable.manager.check()).components[1]).toMatchObject({ outdated: false, checkError: 'latest-unavailable' })
    await expect(stable.manager.update('dsh-mnemon')).rejects.toThrow('Unable to verify')
    expect(stable.run).not.toHaveBeenCalled()
  })

  it('installs the exact checked beta and verifies the profile link instead of pnpm’s old package directory', async () => {
    const value = npmFixture('0.5.0-beta.1', { latest: '0.4.0', beta: '0.5.0-beta.2' })
    const oldManifest = join(value.profile, 'node_modules/.pnpm/old/node_modules/dsh-mnemon/package.json')
    mkdirSync(join(value.profile, 'node_modules/.pnpm/old/node_modules/dsh-mnemon'), { recursive: true })
    json(oldManifest, { name: 'dsh-mnemon', version: '0.5.0-beta.1' })
    const manager = new VersionUpdateManager({ ...value.options, packageManifestPath: oldManifest })
    value.run.mockImplementation(async () => {
      json(join(value.packageRoot, 'package.json'), { name: 'dsh-mnemon', version: '0.5.0-beta.2' })
      return { stdout: 'installed', stderr: '', exitCode: 0 }
    })
    await expect(manager.update('dsh-mnemon')).resolves.toMatchObject({ previousVersion: '0.5.0-beta.1', currentVersion: '0.5.0-beta.2', updated: true, restartRequired: true })
    expect(value.run).toHaveBeenCalledWith('/fake/pnpm', ['add', 'dsh-mnemon@0.5.0-beta.2', '--save-exact'], expect.objectContaining({ cwd: value.profile }))
  })

  it('does not report success when pnpm exits cleanly without installing the requested version', async () => {
    const value = npmFixture('0.5.0-beta.1', { beta: '0.5.0-beta.2' })
    await expect(value.manager.update('dsh-mnemon')).rejects.toThrow('did not install the requested version')
    expect(value.manager.currentDshMnemonVersion).toBe('0.5.0-beta.1')
  })

  it('preserves the known version on installation or registry failure', async () => {
    const value = npmFixture('0.5.0-beta.1', { beta: '0.5.0-beta.2' })
    value.run.mockResolvedValue({ stdout: '', stderr: 'fixture network failure', exitCode: 1 })
    await expect(value.manager.update('dsh-mnemon')).rejects.toThrow('fixture network failure')
    expect(value.manager.currentDshMnemonVersion).toBe('0.5.0-beta.1')
    value.fetch.mockRejectedValue(new Error('registry unavailable'))
    expect((await value.manager.check()).components[1]).toMatchObject({ outdated: false, checkError: 'latest-unavailable' })
  })

  function goFixture(location: 'gobin' | 'gopath' | 'download' = 'gobin') {
    const root = directory('go-install')
    const goPath = join(root, 'go')
    const bin = location === 'gopath' ? join(goPath, 'bin') : join(root, 'custom-bin')
    const commandDir = location === 'download' ? join(root, 'download') : bin
    mkdirSync(commandDir, { recursive: true })
    const command = join(commandDir, process.platform === 'win32' ? 'mnemon.exe' : 'mnemon')
    writeFileSync(command, 'synthetic executable; process execution is mocked', 'utf8')
    const environment = {
      GOBIN: location === 'gopath' ? '' : bin,
      GOPATH: [goPath, join(root, 'other-go')].join(delimiter),
      GOOS: process.platform, GOHOSTOS: process.platform,
      GOARCH: process.arch, GOHOSTARCH: process.arch,
    }
    const state = { current: '0.2.0', installed: '0.3.0', mainPath: 'github.com/mnemon-dev/mnemon' }
    const run = vi.fn<ProcessRunner>(async (_command, args) => {
      if (args[0] === '--version') return { stdout: `mnemon version ${state.current}\n`, stderr: '', exitCode: 0 }
      if (args[0] === 'env') return { stdout: JSON.stringify(environment), stderr: '', exitCode: 0 }
      if (args[0] === 'version') return { stdout: `\tpath\t${state.mainPath}\n\tdep\tgithub.com/mnemon-dev/mnemon\tv0.2.0\n`, stderr: '', exitCode: 0 }
      if (args[0] === 'install') {
        state.current = state.installed
        return { stdout: 'go install completed', stderr: '', exitCode: 0 }
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`)
    })
    const manager = new VersionUpdateManager({
      packageManifestPath: join(root, 'package.json'), dshHome: root,
      mnemonCliPath: () => command,
      resolveExecutable: value => value === command ? command : value === 'go' ? '/fake/go' : undefined,
      processRunner: run,
      fetchNpmLatest: async () => undefined,
      fetchMnemonLatest: async () => '0.3.0',
    })
    return { command, environment, state, run, manager }
  }

  it.each(['gobin', 'gopath'] as const)('updates a Go install only at its actual %s output location', async location => {
    const value = goFixture(location)
    expect((await value.manager.check()).components[0]).toMatchObject({ installMode: 'go', updateSupported: true, executablePath: value.command })
    expect(value.run.mock.calls.some(([, args]) => args[0] === 'install')).toBe(false)
    await expect(value.manager.update('mnemon')).resolves.toMatchObject({ previousVersion: '0.2.0', currentVersion: '0.3.0', updated: true })
    expect(value.run).toHaveBeenCalledWith('/fake/go', ['install', 'github.com/mnemon-dev/mnemon@latest'], expect.objectContaining({ timeoutMs: 600_000 }))
  })

  it('keeps downloaded Go binaries outside the install output directory manual', async () => {
    const value = goFixture('download')
    expect((await value.manager.check()).components[0]).toMatchObject({ current: '0.2.0', outdated: true, installMode: 'manual', updateSupported: false })
    await expect(value.manager.update('mnemon')).rejects.toThrow('cannot be updated automatically')
    expect(value.run.mock.calls.some(([, args]) => args[0] === 'install')).toBe(false)
  })

  it('does not mistake a dependency for the main Go executable package', async () => {
    const value = goFixture()
    value.state.mainPath = 'example.com/other-tool'
    expect((await value.manager.check()).components[0]).toMatchObject({ installMode: 'manual', updateSupported: false })
  })

  it('does not offer Go updates when cross compilation would change the output location', async () => {
    const value = goFixture()
    value.environment.GOARCH = process.arch === 'arm64' ? 'x64' : 'arm64'
    expect((await value.manager.check()).components[0]).toMatchObject({ installMode: 'manual', updateSupported: false })
  })

  it.each(['0.2.0', 'unknown'])('does not report a successful CLI update when the active version is %s', async installed => {
    const value = goFixture()
    value.state.installed = installed
    await expect(value.manager.update('mnemon')).rejects.toThrow('Mnemon update did not activate version 0.3.0')
  })

  it('uses the fixed Homebrew cask command for a recognized Mnemon install', async () => {
    const root = directory('brew')
    const command = join(root, 'Caskroom', 'mnemon', '0.2.0', 'mnemon')
    mkdirSync(join(root, 'Caskroom', 'mnemon', '0.2.0'), { recursive: true })
    writeFileSync(command, '#!/bin/sh\n', 'utf8')
    chmodSync(command, 0o755)
    let versionCalls = 0
    const run = vi.fn<ProcessRunner>(async (_command, args) => {
      if (args[0] === '--version') {
        versionCalls++
        return { stdout: `mnemon version ${versionCalls > 1 ? '0.3.0' : '0.2.0'}\n`, stderr: '', exitCode: 0 }
      }
      return { stdout: 'brew upgraded mnemon', stderr: '', exitCode: 0 }
    })
    const manager = new VersionUpdateManager({
      packageManifestPath: join(root, 'package.json'),
      mnemonCliPath: () => command,
      resolveExecutable: value => value === command ? command : value === 'brew' ? '/fake/brew' : undefined,
      processRunner: run,
      fetchNpmLatest: async () => '0.1.2',
      fetchMnemonLatest: async () => '0.3.0',
    })

    await expect(manager.update('mnemon')).resolves.toMatchObject({ previousVersion: '0.2.0', currentVersion: '0.3.0', updated: true })
    expect(run).toHaveBeenCalledWith(expect.stringMatching(/brew$/), ['upgrade', '--cask', 'mnemon'], expect.objectContaining({ timeoutMs: 600_000 }))
  })

  function cliNpmFixture() {
    const root = directory('npm cli with spaces')
    const globalRoot = join(root, 'lib/node_modules')
    const packageRoot = join(globalRoot, '@mnemon-dev/mnemon')
    const launcher = join(packageRoot, 'bin/mnemon.js')
    mkdirSync(join(packageRoot, 'bin'), { recursive: true })
    json(join(packageRoot, 'package.json'), { name: '@mnemon-dev/mnemon', version: '0.2.8', bin: { mnemon: 'bin/mnemon.js' } })
    writeFileSync(launcher, '#!/usr/bin/env node\n')
    chmodSync(launcher, 0o755)
    const command = join(root, 'mnemon')
    symlinkSync(launcher, command)
    const state = { current: '0.2.8', globalRoot, npm: true, broken: false, installed: '0.2.9' }
    const run = vi.fn<ProcessRunner>(async (_command, args) => {
      if (args.includes('--version')) return { stdout: state.broken ? '' : `mnemon version ${state.current}`, stderr: state.broken ? 'missing native binary' : '', exitCode: state.broken ? 1 : 0 }
      if (args.includes('root')) return { stdout: state.globalRoot, stderr: '', exitCode: 0 }
      if (args.includes('update')) { state.current = state.installed; return { stdout: 'updated', stderr: '', exitCode: 0 } }
      throw new Error('Unexpected process call')
    })
    const options = {
      packageManifestPath: join(root, 'package.json'), dshHome: root, mnemonCliPath: () => command,
      resolveExecutable: (value: string) => value === command ? command : value === 'npm' && state.npm ? '/fake/npm' : undefined,
      processRunner: run, fetchNpmLatest: async (name: string) => name === '@mnemon-dev/mnemon' ? '0.2.9' : undefined,
    }
    return { root, command, launcher, state, run, options, manager: new VersionUpdateManager(options) }
  }

  it('detects the official npm launcher and updates through the CLI that DSH actually uses', async () => {
    const f = cliNpmFixture()
    expect((await f.manager.check()).components[0]).toMatchObject({ installMode: 'npm', updateSupported: true, updateHint: 'npm', current: '0.2.8', latest: '0.2.9', executablePath: f.command })
    expect(f.run.mock.calls.some(([, args]) => args.includes('update'))).toBe(false)
    await expect(f.manager.update('mnemon')).resolves.toMatchObject({ currentVersion: '0.2.9', updated: true, restartRequired: false })
    expect(f.run).toHaveBeenCalledWith(process.execPath, [realpathSync(f.launcher), 'update'], expect.objectContaining({ timeoutMs: 600_000 }))
  })

  it('does not update a different Node/npm installation', async () => {
    const f = cliNpmFixture()
    f.state.globalRoot = directory('other-npm')
    expect((await f.manager.check()).components[0]).toMatchObject({ installMode: 'npm', updateSupported: false, updateHint: 'npm-unmanaged' })
    await expect(f.manager.update('mnemon')).rejects.toThrow('cannot be updated automatically')
    expect(f.run.mock.calls.some(([, args]) => args.includes('update'))).toBe(false)
  })

  it('retains npm provenance when npm or the native binary is unavailable', async () => {
    const f = cliNpmFixture()
    f.state.npm = false
    expect((await f.manager.check()).components[0]).toMatchObject({ installMode: 'npm', updateSupported: false, updateHint: 'npm-missing' })
    f.state.broken = true
    const status = (await f.manager.check()).components[0]!
    expect(status).toMatchObject({ installMode: 'npm', updateSupported: false, updateHint: 'cli-unreadable' })
    expect(status.current).toBeUndefined()
  })

  it('invokes the verified npm JavaScript launcher behind a Windows command shim without a shell', async () => {
    const f = cliNpmFixture()
    const shim = join(f.root, 'lib', 'mnemon.cmd')
    writeFileSync(shim, '@"%dp0%\\node_modules\\@mnemon-dev\\mnemon\\bin\\mnemon.js" %*')
    const manager = new VersionUpdateManager({ ...f.options, mnemonCliPath: () => shim, resolveExecutable: name => name === shim ? shim : name === 'npm' ? '/fake/npm' : undefined })
    await expect(manager.update('mnemon')).resolves.toMatchObject({ updated: true })
    expect(f.run).toHaveBeenCalledWith(process.execPath, [f.launcher, 'update'], expect.any(Object))
  })

  it('rejects an npm update that leaves the active CLI at the old version', async () => {
    const f = cliNpmFixture()
    f.state.installed = '0.2.8'
    await expect(f.manager.update('mnemon')).rejects.toThrow('did not activate version')
  })

  it.each([false, true])('checks and updates npm installations in an Electron Host (Windows shims: %s)', async windowsShims => {
    const f = cliNpmFixture()
    vi.stubEnv('ELECTRON_RUN_AS_NODE', '0')
    vi.stubEnv('npm_config_prefix', f.root)
    const shim = join(f.root, 'lib', 'mnemon.cmd')
    const npm = join(f.root, 'lib', 'npm.cmd')
    const npmCli = join(f.root, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    mkdirSync(join(f.root, 'lib', 'node_modules', 'npm', 'bin'), { recursive: true })
    writeFileSync(shim, '@"%dp0%\\node_modules\\@mnemon-dev\\mnemon\\bin\\mnemon.js" %*')
    writeFileSync(npm, 'fixture')
    writeFileSync(npmCli, 'fixture')
    const execute = f.run.getMockImplementation()!
    f.run.mockImplementation(async (command, args, options) => {
      // Electron starts a GUI instead of the requested script without this flag.
      if (command === process.execPath && options.env?.ELECTRON_RUN_AS_NODE !== '1') return { stdout: '', stderr: '', exitCode: 0 }
      return execute(command, args, options)
    })
    const manager = new VersionUpdateManager({ ...f.options,
      ...(windowsShims ? { mnemonCliPath: () => shim, resolveExecutable: (name: string) => name === shim ? shim : name === 'npm' ? npm : undefined } : {}),
    })
    expect((await manager.check()).components[0]).toMatchObject({ current: '0.2.8', installMode: 'npm', updateSupported: true, updateHint: 'npm' })
    await expect(manager.update('mnemon')).resolves.toMatchObject({ previousVersion: '0.2.8', currentVersion: '0.2.9', updated: true })
    const launcher = windowsShims ? f.launcher : realpathSync(f.launcher)
    const nodeCalls = f.run.mock.calls.filter(([command]) => command === process.execPath)
      .map(([, args, options]) => ({ args, timeoutMs: options.timeoutMs, runAsNode: options.env?.ELECTRON_RUN_AS_NODE, prefix: options.env?.npm_config_prefix }))
    expect(nodeCalls).toContainEqual({ args: [launcher, '--version'], timeoutMs: 10_000, runAsNode: '1', prefix: f.root })
    expect(nodeCalls).toContainEqual({ args: [launcher, 'update'], timeoutMs: 600_000, runAsNode: '1', prefix: f.root })
    if (windowsShims) expect(nodeCalls).toContainEqual({ args: [npmCli, 'root', '--global'], timeoutMs: 10_000, runAsNode: '1', prefix: f.root })
    else expect(f.run.mock.calls.find(([command]) => command === '/fake/npm')?.[2].env).toBeUndefined()
    expect(process.env.ELECTRON_RUN_AS_NODE).toBe('0')
  })

  function subpackageFixture() {
    const f = npmFixture('0.5.2', { latest: '0.5.3' })
    const bundled = 'dsh-mnemon-source-runtime' as const
    const direct = 'dsh-mnemon-provider-mnemon-native' as const
    json(join(f.packageRoot, 'package.json'), { name: 'dsh-mnemon', version: '0.5.2', dependencies: { [bundled]: '0.5.1', [direct]: '0.5.1', unrelated: '1.0.0' } })
    json(join(f.profile, 'package.json'), { name: 'dsh-profile-web', dependencies: { 'dsh-mnemon': '0.5.2', [direct]: '0.5.2' } })
    const bundledRoot = join(f.packageRoot, 'node_modules', bundled)
    const directRoot = join(f.profile, 'node_modules', direct)
    for (const path of [bundledRoot, directRoot]) mkdirSync(path, { recursive: true })
    json(join(bundledRoot, 'package.json'), { name: bundled, version: '0.5.1' })
    json(join(directRoot, 'package.json'), { name: direct, version: '0.5.2' })
    return { ...f, bundled, direct, bundledRoot, directRoot }
  }

  it('shows actual subpackage versions and separates Starter pins from direct Profile dependencies', async () => {
    const f = subpackageFixture()
    const packages = (await f.manager.check()).components[1]!.packages!
    expect(packages).toHaveLength(2)
    expect(packages.find(item => item.id === f.bundled)).toMatchObject({ kind: 'source', current: '0.5.1', expectedVersion: '0.5.1', latest: '0.5.3', managedBy: 'starter', updateSupported: false })
    expect(packages.find(item => item.id === f.direct)).toMatchObject({ kind: 'provider', current: '0.5.2', expectedVersion: '0.5.1', managedBy: 'profile', updateSupported: true })
    expect(f.run).not.toHaveBeenCalled()
  })

  it('updates only an independently managed subpackage and retains the restart reminder on recheck', async () => {
    const f = subpackageFixture()
    f.run.mockImplementation(async () => { json(join(f.directRoot, 'package.json'), { name: f.direct, version: '0.5.3' }); return { stdout: 'updated', stderr: '', exitCode: 0 } })
    await expect(f.manager.update(f.direct)).resolves.toMatchObject({ component: f.direct, previousVersion: '0.5.2', currentVersion: '0.5.3', restartRequired: true })
    expect(f.run).toHaveBeenCalledWith('/fake/pnpm', ['add', `${f.direct}@0.5.3`, '--save-exact'], expect.objectContaining({ cwd: f.profile }))
    expect(f.manager.currentDshMnemonVersion).toBe('0.5.2')
    const main = (await f.manager.check()).components[1]!
    expect(main.restartRequired).toBe(true)
    expect(main.packages!.find(item => item.id === f.direct)).toMatchObject({ current: '0.5.3', outdated: false, restartRequired: true })
    expect(main.packages!.find(item => item.id === f.bundled)).toMatchObject({ current: '0.5.1', restartRequired: false })
  })

  it('rejects Starter dependencies, uninstalled package names, and source links as independent update targets', async () => {
    const f = subpackageFixture()
    await expect(f.manager.update(f.bundled)).rejects.toThrow('through its Starter')
    await expect(f.manager.update('dsh-mnemon-source-uninstalled')).rejects.toThrow('Unknown version component')
    json(join(f.profile, 'package.json'), { name: 'dsh-profile-web', dependencies: { 'dsh-mnemon': '0.5.2', [f.direct]: `link:${f.directRoot}` } })
    expect((await f.manager.check()).components[1]!.packages!.find(item => item.id === f.direct)).toMatchObject({ installMode: 'link', updateSupported: false })
    await expect(f.manager.update(f.direct)).rejects.toThrow('original installation method')
    expect(f.run).not.toHaveBeenCalled()
  })

  it('keeps other package versions available if one package registry request fails', async () => {
    const f = subpackageFixture()
    f.fetch.mockImplementation(async name => { if (name === f.direct) throw new Error('offline'); return '0.5.3' })
    const main = (await f.manager.check()).components[1]!
    expect(main.latest).toBe('0.5.3')
    expect(main.packages!.find(item => item.id === f.direct)).toMatchObject({ current: '0.5.2', checkError: 'latest-unavailable' })
    expect(main.packages!.find(item => item.id === f.bundled)).toMatchObject({ latest: '0.5.3', outdated: true })
  })

  it('prevents overlapping package-manager writes and releases the lock after failure', async () => {
    const f = npmFixture('0.5.2', { latest: '0.5.3' })
    let finish!: () => void
    f.run.mockImplementation(async () => { await new Promise<void>(resolve => { finish = resolve }); return { stdout: '', stderr: 'failed', exitCode: 1 } })
    const first = f.manager.update('dsh-mnemon')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await expect(f.manager.update('dsh-mnemon')).rejects.toThrow('already in progress')
    finish()
    await expect(first).rejects.toThrow('failed')
    f.run.mockResolvedValue({ stdout: '', stderr: 'retry reached installer', exitCode: 1 })
    await expect(f.manager.update('dsh-mnemon')).rejects.toThrow('retry reached installer')
  })
})
