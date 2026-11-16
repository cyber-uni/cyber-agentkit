/**
 * The promptfoo provider `skill test` writes beside its config. promptfoo's Claude Agent SDK provider
 * (0.125.1) runs in a temp folder it deletes and has no `copy_working_dir` (research E20), so this
 * wrapper makes each run's folder: a fresh copy of the case's files committed in a new git repository, plus the
 * skill under the harness's project skills folder (`.claude/skills/<name>/` for Claude Code) in the arm that has it (excluded from git status), or, for a skill developed in a plugin, a fresh copy of that arm's plugin loaded as a local plugin (R91), committed in a git repository of its own whose git folder is kept outside it, holding ahead each path the harness's shell sandbox mounts over (E-CC-D20), as each dependency copy also does (E-CC-D22), and named to script checks by `SKILL_TEST_PLUGIN`, or its skills copied into the project skills folder for a harness with no local-plugin flag. Claude Code runs through promptfoo's Agent SDK provider; another harness (`config.harness`) runs through its own CLI (`config.command`). Each Skill call is recorded in `.skill-test/skill-calls.jsonl` (excluded from git status). A trigger run ends at its first Skill call, or after three turns. A run that passes its time limit (`timeout`, seconds) is stopped, process group and all, and answers the error `time limit`. A case's setup script (`vars.setup`) runs in the
 * folder after the files are committed and before the model starts, and it and each `script` check run in the script
 * sandbox (R155, R157). The config's `sandbox` holds the settings `skill-design.test.sandbox` resolved to (#302): with
 * `shell.sandbox` false shell commands run with no OS sandbox, and the response's `metadata.wroteOutside` lists each
 * path outside the run's folders a shell command named and changed; with `scripts.sandbox` false the setup script and
 * `script` checks run with no script sandbox. After the run it decides the rubric checks that
 * need no judge in that folder, records whether the skill fired, and removes the folder. Each run also gets an empty home folder.
 * It resolves promptfoo from the npx install running it.
 *
 * Setup only (#290): with the config's `keep`, a run (`skill case try`) needs no login and ends after the case's setup
 * script, before any skill or plugin is copied in or a model is called. It copies the run's folder and home, as the
 * setup left them, to `keep/folder` and `keep/home`, and answers the folder's `git status --porcelain`, with
 * `metadata.tried` ({ status, said, failed }).
 *
 * Usage limit (R162): a run whose error carries one of the config's `usageLimits` writes its message to the config's
 * `limitFile`, and every run that starts after that file exists ends before it does anything, as limit reached.
 *
 * Progress (R98, R99): when its config names a `progressFile`, the provider appends one JSON line when a run starts
 * ({ event: 'start', case, arm, run, kind, t }); `promptfooHookSource` appends the line when it ends.
 */
export const promptfooProviderSource = String.raw`import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const req = createRequire(fs.realpathSync(process.argv[1]))
// A file URL, since import() takes no Windows drive path.
const { loadApiProvider } = await import(pathToFileURL(req.resolve('promptfoo')).href)
const cap = (text) => (text.length > 2000 ? text.slice(0, 2000) + '…' : text)

function decide(check, output, dir, script) {
  const [kind, value] = Object.entries(check)[0]
  const file = (p) => path.join(dir, p)
  const read = (p) => (fs.existsSync(file(p)) ? fs.readFileSync(file(p), 'utf8') : undefined)
  switch (kind) {
    case 'contains': return { pass: output.includes(value), detail: cap(output) }
    case 'not-contains': return { pass: !output.includes(value), detail: cap(output) }
    case 'regex': return { pass: new RegExp(value).test(output), detail: cap(output) }
    case 'not-regex': return { pass: !new RegExp(value).test(output), detail: cap(output) }
    case 'file-exists': return { pass: fs.existsSync(file(value)), detail: fs.existsSync(file(value)) ? value + ' exists' : value + ' does not exist' }
    case 'file-contains': {
      const text = read(value.path)
      return { pass: text !== undefined && text.includes(value.text), detail: text === undefined ? value.path + ' does not exist' : cap(text) }
    }
    case 'script':
      try { script(value); return { pass: true, detail: '' } }
      catch (error) { return { pass: false, detail: cap(String(error.stderr || error.stdout || error.message)) } }
    default: return { pass: false, detail: 'unknown check ' + kind }
  }
}

// Each run sees an empty home and, where the harness allows, an empty config folder, so a skill's own CLI finds no
// user references or plugins, and the shell sources no user snapshot. Where things live comes from the harness's
// isolation declaration (headlessInvocation(harness).isolation). The login stays the real one and nothing is
// copied or linked: with a 'separate' login, a variable names the folder the credentials are read and written in
// (Claude Code: CLAUDE_SECURESTORAGE_CONFIG_DIR, E-CC-D11), so the harness refreshes a token in the real file
// itself. On a platform where that variable names a keychain entry instead (keychainOn; macOS for Claude Code,
// E-CC-D13), it is empty for the default entry, or the real config folder when CLAUDE_CONFIG_DIR is set, and the
// config folder still moves. On a platform that ties the credentials to the config folder's path (keepConfigDirOn)
// the config folder stays. With a 'config-dir' login (Codex, E-CODEX-H6) the config folder stays, and the declared
// arguments keep the user's config in it from loading. A login set through an API key variable passes through as
// is. A version manager's node shim reads its config from the home folder, so the node running this provider goes
// first on PATH: a skill's node scripts still run. The declaration's own variables follow, such as Claude Code's
// limits on one shell command (E-CC-D12), so a runaway find / costs seconds, not the whole run. Temporary files go
// to the home's tmp folder, since a contained run cannot reach the system one (see containment).
function isolatedEnv(isolation, home) {
  const expand = (p, base) => (p === '~' || p.startsWith('~/') ? path.join(base, p.slice(2)) : p)
  const { configDir, login } = isolation
  const real = process.env[configDir.env] || expand(configDir.default, os.homedir())
  const PATH = [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter)
  const tmp = path.join(home, 'tmp')
  fs.mkdirSync(tmp, { recursive: true })
  const env = { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config'), TMPDIR: tmp, TMP: tmp, TEMP: tmp, CLAUDE_TMPDIR: tmp, PATH, ...isolation.env }
  if (login.store === 'separate' && (login.keychainOn ?? []).includes(process.platform)) {
    env[configDir.env] = expand(configDir.default, home)
    env[login.env] = process.env[login.env] ?? process.env[configDir.env] ?? ''
  } else if (login.store === 'separate' && !(login.keepConfigDirOn ?? []).includes(process.platform)) {
    env[configDir.env] = expand(configDir.default, home)
    env[login.env] = process.env[login.env] || real
  } else env[configDir.env] = real
  return env
}

// What a contained run may touch, apart from where its config and login live (isolatedEnv), for a harness whose
// declaration has containment (Claude Code, E-CC-D15). The file tools reach only the run's folder, its home, and
// its own plugin copy, which the run may change and a script check reads at SKILL_TEST_PLUGIN; the copy is added
// as a working folder (blockReadsOutsideWorkingDirectories, blockWritesOutsideWorkingDirectories). A PreToolUse
// hook refuses the same first, so the result can name what was refused.
// Shell commands run in the OS sandbox, which fails the run rather than run a command outside it. It hides the
// home folders and the system temp folder and lets back only the run's folders and the node install; system
// folders that hold programs stay readable. Writes go only to the run's own folders. The network is closed but for
// the hosts the case lists (allowedDomains with strictAllowlist), and the sandbox notes each host it denied in the
// command's output (<sandbox_violations>).
// The sandbox settings (box, #302) choose each of these: with shell.sandbox false shell commands run with no OS sandbox
// and reach whatever the user's own account can, while the file-tool limits, which hold with it off (E-CC-D23), stay
// as fileTools sets them. shell.network open needs shell.sandbox false; skill test refuses the rest.
function containment({ dir, home, plugin, dependencies = [], network, box }) {
  const real = (p) => { try { return fs.realpathSync(p) } catch { return p } }
  const nodeInstall = path.dirname(path.dirname(real(process.execPath)))
  const own = [...new Set([dir, home, plugin].filter(Boolean).flatMap((p) => [p, real(p)]))]
  // The plugins the plugin under test depends on, and the plugin copy's git folder, are read, never written.
  const needed = [...new Set(dependencies.flatMap((p) => [p, real(p)]))]
  return {
    readable: [...own, ...needed],
    writable: own,
    network: network ?? [],
    settings: { permissions: { blockReadsOutsideWorkingDirectories: box.fileTools.blockReadsOutsideWorkingDirectories, blockWritesOutsideWorkingDirectories: box.fileTools.blockWritesOutsideWorkingDirectories } },
    sandbox: !box.shell.sandbox ? { enabled: false } : {
      enabled: true, failIfUnavailable: box.shell.failIfUnavailable, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: box.shell.allowUnsandboxedCommands,
      network: { allowedDomains: network ?? [], strictAllowlist: true },
      filesystem: { denyRead: box.shell.hideHome ? [...new Set([os.tmpdir(), real(os.tmpdir()), os.homedir()])] : [], allowRead: [...own, ...needed, nodeInstall], allowWrite: own },
    },
  }
}

// A setup script and a script check are the case author's shell, so they run contained as a run's shell commands
// are (R157), on every harness: in Anthropic's sandbox runtime (srt, research E22), which uses the same OS sandbox
// as Claude Code's (bubblewrap on Linux and WSL, Seatbelt on macOS). Writes go only to the run's own folders, reads
// of the home folders and the system temp folder are refused but for the run's own folders and the node install,
// and the network is closed: srt allows no host when allowedDomains is empty. Before the first script, a probe asks
// srt to run 'true'; when it cannot, every run that needs a script answers the error 'sandbox: …', and no script runs
// outside the sandbox.
let scriptSandboxChecked
function scriptSandbox() {
  scriptSandboxChecked ??= (() => {
    let cli
    try { cli = path.join(path.dirname(req.resolve('@anthropic-ai/sandbox-runtime')), 'cli.js') }
    catch { return { problem: 'sandbox: the script sandbox (@anthropic-ai/sandbox-runtime) is not installed beside promptfoo, so no setup script or script check can be contained' } }
    const probe = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-probe-')))
    try {
      runContained(cli, 'true', { cwd: probe, own: [probe], env: process.env, timeout: 60000 })
      return { cli }
    } catch (error) {
      const said = String(error.stderr || error.stdout || error.message).trim().split('\n')[0]
      return { problem: 'sandbox: the script sandbox cannot start, so no setup script or script check can be contained: ' + said + '. On Linux and WSL it needs bubblewrap, socat, and ripgrep installed.' }
    } finally { try { fs.rmSync(probe, { recursive: true, force: true }) } catch {} }
  })()
  return scriptSandboxChecked
}

// Runs a shell command in srt: own folders readable and writable, needed folders readable, no network. The settings
// file lives in a folder of its own, outside what the command may write. Throws as execSync does when it exits non-zero.
// srt write-protects the dotfiles and folders it names in the folder it starts in, and puts a /dev/null placeholder
// where one does not exist, which a command in that folder sees as a new file: git status lists .bashrc, .mcp.json,
// .vscode and the rest as untracked (E23). So srt starts in an empty folder of its own and the command changes into
// cwd first, and the run folder looks to the command as the run left it. The protection that matters there stays:
// writes to each own git repository's .git/config and .git/hooks are refused, which git status does not show.
function runContained(cli, command, { cwd, own, needed = [], env, timeout }) {
  const real = (p) => { try { return fs.realpathSync(p) } catch { return p } }
  const nodeInstall = path.dirname(path.dirname(real(process.execPath)))
  // srt reads its own helpers (vendor/seccomp on Linux) from inside the sandbox.
  const srtPackage = path.dirname(path.dirname(real(cli)))
  const writable = [...new Set(own.flatMap((p) => [p, real(p)]))]
  const readable = [...writable, ...new Set(needed.flatMap((p) => [p, real(p)]))]
  const gitGuarded = writable.filter((p) => { try { return fs.statSync(path.join(p, '.git')).isDirectory() } catch { return false } })
    .flatMap((p) => [path.join(p, '.git', 'config'), path.join(p, '.git', 'hooks')])
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-srt-'))
  try {
    const settings = path.join(settingsDir, 'srt-settings.json')
    const start = path.join(settingsDir, 'start')
    fs.mkdirSync(start)
    fs.writeFileSync(settings, JSON.stringify({
      network: { allowedDomains: [], deniedDomains: [] },
      filesystem: { denyRead: [...new Set([os.tmpdir(), real(os.tmpdir()), os.homedir()])], allowRead: [...readable, nodeInstall, srtPackage], allowWrite: writable, denyWrite: gitGuarded },
    }))
    const enter = "cd '" + cwd.replace(/'/g, "'\\''") + "' || exit 1\n"
    return execFileSync(process.execPath, [cli, '--settings', settings, '-c', enter + command], { cwd: start, env, stdio: 'pipe', timeout, encoding: 'utf8' })
  } finally { try { fs.rmSync(settingsDir, { recursive: true, force: true }) } catch {} }
}

// Runs a setup script or a script check: in the script sandbox, or, with scripts.sandbox false (#302), as a plain shell
// command in cwd with the same environment and time limit. Throws as execSync does when it exits non-zero.
function runScript(command, { cwd, own, needed = [], env, timeout, unsandboxed = false }) {
  if (unsandboxed) return execFileSync('/bin/sh', ['-c', command], { cwd, env, stdio: 'pipe', timeout, encoding: 'utf8' })
  const sandbox = scriptSandbox()
  if (sandbox.problem) throw new Error(sandbox.problem)
  return runContained(sandbox.cli, command, { cwd, own, needed, env, timeout })
}

const inside = (roots, p) => roots.some((root) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep))

// Records what the containment refused, as { what: 'read' | 'write' | 'network', target }. A file tool (the
// declaration's fileTools) given a path outside the run is refused here. For a shell command it reads the sandbox's
// own notes and a host a command asked to reach beyond the case's list, and counts a path the command names that exists outside the run but that the command could not find,
// read or write as refused: the sandbox hides it. A path the command builds as it runs is still refused, but may go
// unrecorded.
// With no OS sandbox (unsandboxed: shell.sandbox false, #302) nothing refuses a shell command's write, so each path a command names outside
// the run's folders that changed since the run started is recorded in wrote. A write to a path the command builds as
// it runs, or one a program it starts makes, goes unrecorded.
function watchContainment({ dir, readable, writable, fileTools, network = [], unsandboxed = false, since = 0 }, blocked, wrote = []) {
  const note = (what, target) => { if (!blocked.some((b) => b.what === what && b.target === target) && blocked.length < 50) blocked.push({ what, target }) }
  const changed = (target) => { try { return fs.lstatSync(target).mtimeMs >= since } catch { return false } }
  // A shell command may ask for more hosts than the case lists (Bash's allowed_domains). Claude Code refuses that
  // before the command runs, since the sandbox's allowlist is the whole list, and no hook sees it; the refusal names
  // no host, so the run's tool calls are read for it afterwards (review).
  const wider = (call) => {
    if (call?.name === 'Bash' || call?.tool_name === 'Bash')
      for (const host of [].concat((call.input ?? call.tool_input)?.allowed_domains ?? [])) if (!network.includes(String(host))) note('network', String(host))
  }
  const review = (calls) => { for (const call of calls ?? []) wider(call) }
  const before = async (input) => {
    wider(input)
    const what = fileTools[input.tool_name]
    if (!what) return {}
    const given = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? input.tool_input?.path
    const pattern = input.tool_name === 'Glob' && path.isAbsolute(String(input.tool_input?.pattern ?? '')) ? String(input.tool_input.pattern).split(/[*?[{]/)[0] : undefined
    const target = path.resolve(dir, String(given ?? pattern ?? '.'))
    if (inside(what === 'read' ? readable : writable, target)) return {}
    note(what, target)
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'skill test: this run may only ' + what + ' files in its own folder' } }
  }
  const after = async (input) => {
    if (input.tool_name !== 'Bash') return {}
    const text = typeof input.tool_response === 'string' ? input.tool_response : JSON.stringify(input.tool_response ?? input.error ?? '')
    const said = text.replace(/\\n/g, '\n')
    for (const block of said.matchAll(/<sandbox_violations>([\s\S]*?)<\/sandbox_violations>/g))
      for (const line of block[1].split('\n').map((l) => l.trim()).filter(Boolean)) {
        const network = /network-outbound\s+(\S+)/.exec(line)
        if (network) note('network', network[1].replace(/:\d+$/, ''))
        else note(/write/.test(line) ? 'write' : 'read', line.replace(/^deny\s+\S+\s+/, ''))
      }
    const command = String(input.tool_input?.command ?? '')
    for (const match of command.matchAll(/(?:^|[\s'"=:(<>])(\/[^\s'"|;&<>()$*?]+)/g)) {
      const target = match[1].replace(/\/+$/, '') || '/'
      if (unsandboxed && target !== '/' && !inside(writable, target) && changed(target) && !wrote.includes(target) && wrote.length < 50) wrote.push(target)
      if (target === '/' || inside(readable, target) || !fs.existsSync(target)) continue
      const failed = new RegExp(target.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&') + '[^\n]*(No such file|Permission denied|Operation not permitted|Read-only file system)').exec(said)
      if (failed) note(/Read-only/.test(failed[1]) ? 'write' : 'read', target)
    }
    return {}
  }
  return { hooks: { PreToolUse: [{ hooks: [before] }], PostToolUse: [{ hooks: [after] }], PostToolUseFailure: [{ hooks: [after] }] }, review }
}

// Before the first run, asks the Claude Code the Agent SDK runs whether a run is logged in, with the declaration's
// status arguments (claude auth status, which spends nothing, E-CC-D16). When a run is not but Claude Code is with
// the real environment, the login setting stopped working, and every run would fail as "Not logged in": each run
// answers this in plain words instead. Answers undefined when the run is logged in, or when the check cannot run.
let loginChecked
function loginProblem(isolation) {
  const { login } = isolation
  if (!login.status) return undefined
  loginChecked ??= (async () => {
    let claude
    try {
      const sdk = createRequire(req.resolve('@anthropic-ai/claude-agent-sdk'))
      const native = '@anthropic-ai/claude-agent-sdk-' + process.platform + '-' + process.arch
      claude = path.join(path.dirname(sdk.resolve(native + '/package.json')), process.platform === 'win32' ? 'claude.exe' : 'claude')
    } catch { return undefined }
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-home-'))
    const status = (env) => {
      try { return JSON.parse(execFileSync(claude, login.status, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 })) }
      catch (error) { try { return JSON.parse(String(error.stdout)) } catch { return undefined } }
    }
    try {
      const run = status({ ...process.env, ...isolatedEnv(isolation, home) })
      if (!run || run.loggedIn) return undefined
      const own = status(process.env)
      const keys = login.passEnv.join(' or ')
      if (own && !own.loggedIn) return 'login: Claude Code is not logged in. Run claude auth login, or set ' + keys + ', and run the test again.'
      return 'login: Claude Code is logged in, but a test run is not: this Claude Code version no longer takes the login through ' + login.env + ', the setting skill test uses to share it with each run. Set ' + keys + ' (CLAUDE_CODE_OAUTH_TOKEN comes from claude setup-token), and run the test again.'
    } finally { try { fs.rmSync(home, { recursive: true, force: true }) } catch {} }
  })()
  return loginChecked
}

// A run that hits its time limit is killed with everything it started (a model's find / can crawl for an
// hour). Claude Code runs each shell command in a session of its own, so a process group is not enough:
// every process of the run carries the run's marker in its environment, and the kill finds them by it
// (Linux reads /proc, macOS asks ps; Windows kills the process tree). A process stuck in uninterruptible
// disk sleep survives the kill; callApi stops waiting for it.
function markedPids(marker) {
  try {
    if (process.platform === 'linux')
      return fs.readdirSync('/proc').filter((name) => /^\d+$/.test(name) && Number(name) !== process.pid).filter((name) => {
        try { return fs.readFileSync('/proc/' + name + '/environ', 'utf8').split('\0').includes(marker) } catch { return false }
      }).map(Number)
    if (process.platform === 'darwin')
      return execFileSync('ps', ['-axEww', '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
        .split('\n').filter((line) => line.includes(marker)).map((line) => Number(line.trim().split(/\s+/)[0])).filter((pid) => pid && pid !== process.pid)
  } catch {}
  return []
}

function killRun(marker, children) {
  for (const child of children) {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      else process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }
  for (const pid of markedPids(marker)) try { process.kill(pid, 'SIGKILL') } catch {}
}

function spawnInGroup(children) {
  return (o) => {
    const child = spawn(o.command, o.args, { cwd: o.cwd, env: o.env, stdio: ['pipe', 'pipe', 'ignore'], detached: process.platform !== 'win32', windowsHide: true, signal: o.signal })
    children.push(child)
    return child
  }
}

const mountedDependencies = new Set()

// The harness's sandbox mounts over the declaration's mountPoints in the shell's folder and in each folder above it,
// and in a folder it holds read-only, as it holds a loaded plugin, a path that does not exist cannot be mounted over:
// every later shell command fails (E-CC-D17, E-CC-D20). So each folder of the plugin copy gets each one the copy
// does not have, a JSON file holding {} or an empty one, made ahead. Answers the files made, relative to root.
// The walk does not go into the folders that hold the mount points (the first segment of each declared folder, as
// .claude), or a later call would find the ones this call made and make them again inside, eight times over each call (#311).
function makeMountPoints(root, { files, folders }) {
  const made = []
  const own = new Set([...folders, ...files].map((declared) => declared.split('/')[0]))
  const walk = (at) => {
    const here = fs.readdirSync(path.join(root, at), { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== '.git' && !own.has(entry.name))
    for (const folder of folders) if (!fs.existsSync(path.join(root, at, folder))) fs.mkdirSync(path.join(root, at, folder), { recursive: true })
    for (const file of files) {
      const full = path.join(root, at, file)
      if (fs.existsSync(full)) continue
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, file.endsWith('.json') ? '{}\n' : '')
      made.push(path.join(at, file))
    }
    for (const entry of here) walk(path.join(at, entry.name))
  }
  walk('')
  return made
}

// Decides the rubric checks that need no judge in the run's folder, and records whether the skill fired.
// A script check finds the run's own plugin copy at SKILL_TEST_PLUGIN.
// A script check runs contained (R157), with the run's own environment; a run that needs one when the script sandbox
// cannot start never reaches here (callApi answers the sandbox error first).
function finish(response, { arm, vars, dir, home, plugin, dependencies = [], env: runEnv = {}, fired, blocked, wrote, sandboxFault, limits, scriptsOff = false }) {
  const output = typeof response.output === 'string' ? response.output : JSON.stringify(response.output ?? '')
  const checks = {}
  const env = { ...process.env, ...runEnv, ...(plugin ? { SKILL_TEST_PLUGIN: plugin } : {}) }
  const script = (command) => runScript(command, { cwd: dir, own: [dir, home, plugin].filter(Boolean), needed: dependencies, env, timeout: 60000, unsandboxed: scriptsOff })
  if (!response.error)
    for (const [id, list] of Object.entries(JSON.parse(vars.rubrics || '{}'))) {
      const results = list.map((check) => decide(check, output, dir, script))
      const failed = results.find((result) => !result.pass)
      checks[id] = failed ? { pass: false, detail: failed.detail } : { pass: true }
    }
  const limitReached = limits?.hit(response.error)
  response.metadata = { ...response.metadata, arm, fired, checks, ...(blocked ? { blocked } : {}), ...(wrote?.length ? { wroteOutside: wrote } : {}), ...(sandboxFault ? { sandboxFault } : {}), ...(limitReached ? { limitReached } : {}) }
  return response
}

// The account's usage limit (R162): the config's usageLimits, from usage-limits.ts, matched against a run's error. The
// first run that hits one writes { text, resets? } to limitFile; a run that finds that file starts nothing.
function usageLimit(limits, file) {
  return {
    reached() {
      if (!file) return undefined
      try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return undefined }
    },
    hit(error) {
      if (!error) return undefined
      for (const limit of limits) {
        const match = new RegExp(limit.pattern, 'm').exec(String(error))
        if (!match) continue
        const resets = match.groups?.resets?.trim()
        const found = { text: match[0].trim().slice(0, 160), ...(resets ? { resets } : {}) }
        if (file) try { fs.writeFileSync(file, JSON.stringify(found), { flag: 'wx' }) } catch {}
        return { ...found, started: true }
      }
      return undefined
    },
  }
}

// A harness driven through its own CLI: the command from headlessCommand(), with the prompt last, its JSON lines
// read as they come. Only Codex's events are read (E-CODEX-H7): the reply is the last agent_message, usage comes
// from turn.completed, a turn.failed or top-level error is the run's error, and a skill is used when a command
// reads <projectSkills>/<skill>/SKILL.md, the only sign of it. A trigger run ends at the first such read.
// A case that names its own model (vars.model, R161) replaces the run's: the model flag and its value come out of the
// command line, and the case's go in before the prompt.
function withModel(command, model) {
  if (!model || !command.modelFlag) return command.args
  const args = []
  for (let i = 0; i < command.args.length; i++) {
    if (command.args[i] === command.modelFlag) { i++; continue }
    args.push(command.args[i])
  }
  return [...args, command.modelFlag, model]
}

function runCli({ command, isolation, prompt, names, vars, dir, env, timeout, marker, callLog }) {
  return new Promise((resolve) => {
    const children = []
    const child = spawnInGroup(children)({ command: command.executable, args: [...withModel(command, vars.model), prompt], cwd: dir, env: { ...process.env, ...env } })
    child.stdin.end()
    const skillRead = new RegExp(isolation.projectSkills.split('.').join('\\.') + '/([\\w.-]+)/SKILL\\.md')
    let reply = ''
    let error
    let fired = false
    let ended = false
    const usage = { prompt: 0, completion: 0, total: 0 }
    const end = (response) => {
      if (ended) return
      ended = true
      clearTimeout(limit)
      killRun(marker, children)
      resolve(response)
    }
    const limit = setTimeout(() => end({ error: 'time limit', metadata: { timedOut: true } }), timeout * 1000)
    let buffer = ''
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        let event
        try { event = JSON.parse(line) } catch { continue }
        const item = event.item
        if (event.type === 'item.completed' && item?.type === 'agent_message') reply = String(item.text ?? '')
        else if (event.type === 'item.started' && item?.type === 'command_execution') {
          const match = skillRead.exec(String(item.command ?? ''))
          if (match) {
            fs.appendFileSync(callLog, JSON.stringify({ skill: match[1], args: '' }) + '\n')
            if (names.includes(match[1])) fired = true
            if (vars.kind === 'trigger') return end({ output: '', metadata: { fired } })
          }
        } else if (event.type === 'turn.completed' && event.usage) {
          usage.prompt += event.usage.input_tokens ?? 0
          usage.completion += event.usage.output_tokens ?? 0
          usage.total = usage.prompt + usage.completion
        } else if (event.type === 'turn.failed') error = String(event.error?.message ?? 'the turn failed')
        else if (event.type === 'error') error = String(event.message ?? 'error')
      }
    })
    child.on('error', (failure) => end({ error: String(failure.message ?? failure) }))
    child.on('close', (code) => {
      if (error) return end({ error, metadata: { fired } })
      if (code !== 0 && !reply) return end({ error: command.executable + ' exited ' + code, metadata: { fired } })
      end({ output: vars.kind === 'trigger' ? '' : reply, tokenUsage: usage, metadata: { fired } })
    })
  })
}

// Watches each shell command's output for an error the test sandbox, not the skill, caused (R154): the config's
// sandboxFaults, from sandbox-faults.ts. The first one a run hits is kept as { fault, text }, and the run counts toward
// no pass rate.
function watchSandboxFaults(faults) {
  const found = {}
  const after = async (input) => {
    if (found.fault || input.tool_name !== 'Bash') return {}
    const said = (typeof input.tool_response === 'string' ? input.tool_response : JSON.stringify(input.tool_response ?? input.error ?? '')).replace(/\\n/g, '\n')
    for (const fault of faults) {
      const match = new RegExp(fault.pattern).exec(said)
      if (match) { found.fault = fault.id; found.text = match[0].slice(0, 300); break }
    }
    return {}
  }
  return { hooks: { PostToolUse: [{ hooks: [after] }], PostToolUseFailure: [{ hooks: [after] }] }, hit: () => (found.fault ? { ...found } : undefined) }
}

// Holds a run to the config's costCap (US dollars) without telling the model: Claude Code shows the Agent SDK's own
// max_budget_usd to the model as a reminder (#238), so the provider estimates the spend itself. Before each tool call
// it sums the usage of each assistant message in the run's transcript, at the per-million-token rates of the model's
// family (an estimate, as the SDK's own is), and ends the run once it passes the cap.
const costRates = [
  { family: /haiku/i, input: 1, output: 5 },
  { family: /sonnet/i, input: 3, output: 15 },
  { family: /./, input: 5, output: 25 },
]
function transcriptCost(file) {
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return 0 }
  const seen = new Map()
  for (const line of text.split('\n')) {
    let entry
    try { entry = JSON.parse(line) } catch { continue }
    const message = entry?.message
    if (entry?.type !== 'assistant' || !message?.usage) continue
    seen.set(message.id ?? seen.size, message)
  }
  let cost = 0
  for (const { model = '', usage } of seen.values()) {
    const rate = costRates.find(({ family }) => family.test(model))
    const input = (usage.input_tokens ?? 0) + 1.25 * (usage.cache_creation_input_tokens ?? 0) + 0.1 * (usage.cache_read_input_tokens ?? 0)
    cost += (input * rate.input + (usage.output_tokens ?? 0) * rate.output) / 1e6
  }
  return cost
}
function watchCost(costCap) {
  let over
  const before = async (input) => {
    if (!costCap || over || !input.transcript_path) return {}
    const cost = transcriptCost(input.transcript_path)
    if (cost <= costCap) return {}
    over = cost
    return { continue: false, stopReason: 'cost cap' }
  }
  return { hooks: costCap ? [{ hooks: [before] }] : [], over: () => over }
}

// A setup-only run (skill case try): the run's folder and home, as the setup left them, are copied to keep/folder and
// keep/home, and the answer is the folder's git status, what the setup printed, and whether it failed.
function keepTried(keep, dir, home, { said, failed = false }, arm) {
  let status
  try { status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }) }
  catch (error) { status = String(error.stderr || error.message) }
  fs.cpSync(dir, path.join(keep, 'folder'), { recursive: true, verbatimSymlinks: true })
  fs.cpSync(home, path.join(keep, 'home'), { recursive: true, verbatimSymlinks: true })
  return { output: status, metadata: { arm, tried: { status, said, failed } } }
}

export default class SkillRun {
  constructor(options) { this.options = options; this.config = options.config }
  id() { return this.options.id || 'skill-run' }
  async callApi(prompt, context) {
    const { arm, skillDir, skillName, pluginDir, pluginName, dependencyDirs = [], instruction, inner, timeout = 300, harness = 'claude-code', isolation, command, sandboxFaults = [], usageLimits = [], limitFile, costCap, keep, sandbox: box } = this.config
    // The sandbox settings skill-design.test.sandbox resolved to (#302); a run without them does not start.
    if (!box) return { error: 'sandbox: the test config names no sandbox settings', metadata: { arm } }
    const shellOff = !box.shell.sandbox
    const scriptsOff = !box.scripts.sandbox
    // A skill loaded from a plugin is called <plugin>:<skill> (research E21).
    const names = pluginName ? [skillName, pluginName + ':' + skillName] : [skillName]
    const vars = context.vars
    if (vars.kind === 'trigger' && arm !== 'skill') return { output: '', metadata: { arm, skipped: true } }
    // A resume runs only the arms a run has left (R163); vars.__run is then the run's number.
    if (vars.__arms && !JSON.parse(vars.__arms).includes(arm)) return { output: '', metadata: { arm, skipped: true } }
    // Once a run reached the usage limit, no run starts (R162).
    const limits = usageLimit(usageLimits, limitFile)
    const reached = limits.reached()
    if (reached) return { error: 'limit reached: ' + reached.text, metadata: { arm, limitReached: { ...reached, started: false } } }
    if (this.config.progressFile)
      try { fs.appendFileSync(this.config.progressFile, JSON.stringify({ event: 'start', case: context.test?.description ?? '', arm, run: vars.__run ? Number(vars.__run) : (context.repeatIndex ?? vars.__repeatIndex ?? 0) + 1, kind: vars.kind, t: Date.now() }) + '\n') } catch {}
    // A setup-only run (skill case try) makes no model call, so it needs no login.
    if (harness === 'claude-code' && !keep) {
      const login = await loginProblem(isolation)
      if (login) return { error: login, metadata: { arm } }
    }
    // A run that needs a script needs the script sandbox; when it cannot start, the run does not start either (R157).
    const scripted = !!vars.setup || Object.values(JSON.parse(vars.rubrics || '{}')).some((list) => list.some((check) => 'script' in check))
    if (scripted && !scriptsOff) {
      const sandbox = scriptSandbox()
      if (sandbox.problem) return { error: sandbox.problem, metadata: { arm } }
    }
    // Real paths: Claude Code takes a working folder as written, and on macOS the temp folder runs through a link.
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-run-')))
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-home-')))
    // A run loads a copy of its arm's plugin of its own, committed in a git repository, so a script check can tell
    // whether the run changed it: SKILL_TEST_PLUGIN names that copy. The repository's git folder is kept outside the
    // copy, where the run reads it but never writes it (E-CC-D20).
    const plugin = pluginDir ? fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-plugin-'))) : undefined
    const pluginGit = plugin ? fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-plugin-git-'))) : undefined
    const readOnly = [...dependencyDirs, ...(pluginGit ? [pluginGit] : [])]
    try {
      if (vars.files) fs.cpSync(vars.files, dir, { recursive: true })
      // An instruction under measure goes in the project instruction file the harness loads, committed with the case files
      // as a checked-in AGENTS.md is; it follows what the case's own file already says.
      if (typeof instruction === 'string') {
        const file = path.join(dir, isolation.projectInstructions)
        const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\s*$/, '\n\n') : ''
        fs.writeFileSync(file, before + instruction)
      }
      // A repository whose git folder is gitDir, when given; the files in force are committed even when ignored.
      const commit = (cwd, message, { gitDir, force = [] } = {}) => {
        const git = (args) => execFileSync('git', args, { cwd, stdio: 'pipe' })
        git(['init', '-q', ...(gitDir ? ['--separate-git-dir=' + gitDir] : [])])
        git(['config', 'user.name', 'skill-test'])
        git(['config', 'user.email', 'skill-test@example.invalid'])
        git(['config', 'commit.gpgsign', 'false'])
        git(['add', '-A'])
        if (force.length) git(['add', '-f', '--', ...force])
        git(['commit', '-q', '-m', message, '--allow-empty'])
      }
      commit(dir, 'case files')
      const marker = 'SKILL_TEST_RUN=' + randomUUID()
      const env = { ...isolatedEnv(isolation, home), SKILL_TEST_RUN: marker.split('=')[1] }
      // The case's setup script makes the state the model starts from, after the files are committed (R155). It runs
      // from a copy in the run's home, so it is not part of the run's folder, contained as a script check is (R157). A
      // script that fails ends the run as not run, with its output (R156).
      if (vars.setup) {
        const script = path.join(home, '.skill-test-setup', path.basename(vars.setup))
        fs.mkdirSync(path.dirname(script), { recursive: true })
        fs.copyFileSync(vars.setup, script)
        fs.chmodSync(script, 0o755)
        try {
          const said = runScript("'" + script.replace(/'/g, "'\''") + "'", { cwd: dir, own: [dir, home], env: { ...process.env, ...env }, timeout: 120000, unsandboxed: scriptsOff })
          if (keep) return keepTried(keep, dir, home, { said: cap(String(said ?? '').trim()) }, arm)
        } catch (error) {
          const said = String([error.stdout, error.stderr].filter(Boolean).join('\n') || error.message).trim()
          const failed = { error: 'setup script failed: ' + (said.split('\n').filter(Boolean).slice(-1)[0] ?? 'it exited ' + error.status), metadata: { arm, setupFailed: { text: cap(said || 'it exited ' + error.status) } } }
          if (keep) failed.metadata.tried = keepTried(keep, dir, home, { said: cap(said), failed: true }, arm).metadata.tried
          return failed
        }
      }
      if (keep) return keepTried(keep, dir, home, { said: '' }, arm)
      if (plugin) {
        fs.cpSync(pluginDir, plugin, { recursive: true })
        commit(plugin, 'plugin', { gitDir: pluginGit, force: isolation.containment?.mountPoints && !shellOff ? makeMountPoints(plugin, isolation.containment.mountPoints) : [] })
      }
      // The sandbox holds each dependency copy read-only as it holds the plugin, and fails every shell command on a
      // mount point a copy does not have (E-CC-D20, E-CC-D22), so each copy gets them too. The copies are shared by
      // every run and are no git repository, so each is made once, by the first run to reach it (#311).
      if (isolation.containment?.mountPoints && !shellOff)
        for (const dependency of dependencyDirs)
          if (!mountedDependencies.has(dependency)) {
            makeMountPoints(dependency, isolation.containment.mountPoints)
            mountedDependencies.add(dependency)
          }
      const skills = path.join(dir, isolation.projectSkills)
      if (skillDir) fs.cpSync(skillDir, path.join(skills, skillName), { recursive: true })
      // A harness with no flag to load a local plugin gets the plugin's skills as project skills.
      if (plugin && !isolation.pluginFlag && fs.existsSync(path.join(plugin, 'skills')))
        fs.cpSync(path.join(plugin, 'skills'), skills, { recursive: true })
      fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), '/' + isolation.projectSkills + '/\n.skill-test/\n')
      // Every Skill call the run makes, one JSON line each ({ skill, args }), so a rubric can check what one skill passed to another.
      const callLog = path.join(dir, '.skill-test', 'skill-calls.jsonl')
      fs.mkdirSync(path.dirname(callLog), { recursive: true })
      const children = []
      if (harness !== 'claude-code') {
        const response = await runCli({ command, isolation, prompt, names, vars, dir, env, timeout, marker, callLog })
        return finish(response, { arm, vars, dir, home, plugin, dependencies: readOnly, env, fired: response.metadata?.fired ?? false, limits, scriptsOff })
      }
      // A trigger case only needs to know which skill the request chose. A hook records each Skill call and ends a trigger run at the first
      // one, counting it as fired when it is the skill under test; a turn cap of three backs it up for a run that calls none. The SDK
      // answers a cap with an error that carries no skill calls, so the hook is the record.
      let hookFired = false
      const watchSkill = async (input) => {
        if (input.tool_name !== 'Skill') return {}
        const name = String(input.tool_input?.skill ?? '').trim()
        fs.appendFileSync(callLog, JSON.stringify({ skill: name, args: String(input.tool_input?.args ?? '') }) + '\n')
        if (vars.kind !== 'trigger') return {}
        if (names.includes(name)) hookFired = true
        return { continue: false, stopReason: names.includes(name) ? 'the skill fired' : 'another skill fired' }
      }
      const skillHook = { matcher: 'Skill', hooks: [watchSkill] }
      const faults = watchSandboxFaults(sandboxFaults)
      const spend = watchCost(costCap)
      let hooks = { PreToolUse: [skillHook, ...spend.hooks], ...faults.hooks }
      let contained
      let watch
      const blocked = []
      const wrote = []
      if (isolation.containment) {
        contained = containment({ dir, home, plugin, dependencies: readOnly, network: vars.network ? JSON.parse(vars.network) : undefined, box })
        watch = watchContainment({ dir, ...contained, fileTools: isolation.containment.fileTools, unsandboxed: shellOff, since: Date.now() - 1000 }, blocked, wrote)
        hooks = {
          // The hook refuses a file tool outside the run's folders before the file-tool limits do, so the result names it.
          PreToolUse: [skillHook, ...spend.hooks, ...(box.hook ? watch.hooks.PreToolUse : [])],
          PostToolUse: [...watch.hooks.PostToolUse, ...faults.hooks.PostToolUse],
          PostToolUseFailure: [...watch.hooks.PostToolUseFailure, ...faults.hooks.PostToolUseFailure],
        }
      }
      // The plugin loads beside the plugins it depends on: Claude Code does not start it without them (E-CC-H10).
      const provider = await loadApiProvider('anthropic:claude-agent-sdk', { options: { config: { ...inner, ...(vars.model ? { model: vars.model } : {}), ...(plugin ? { plugins: [plugin, ...dependencyDirs].map((p) => ({ type: 'local', path: p })) } : {}), ...(vars.kind === 'trigger' ? { max_turns: 3 } : {}), hooks, env, working_dir: dir, ...(contained ? { sandbox: contained.sandbox, settings: contained.settings, ...(plugin ? { additional_directories: [plugin, ...dependencyDirs] } : {}) } : {}), spawn_claude_code_process: spawnInGroup(children) } } })
      const controller = new AbortController()
      let limit
      const timedOut = new Promise((resolve) => {
        limit = setTimeout(() => {
          controller.abort()
          killRun(marker, children)
          resolve('time limit')
        }, timeout * 1000)
      })
      const answer = provider.callApi(prompt, context, { abortSignal: controller.signal }).catch((error) => ({ error: String(error?.message ?? error) }))
      const first = await Promise.race([answer, timedOut])
      clearTimeout(limit)
      if (first === 'time limit') return { error: 'time limit', metadata: { arm, timedOut: true, ...(contained ? { blocked } : {}), ...(wrote.length ? { wroteOutside: wrote } : {}), ...(faults.hit() ? { sandboxFault: faults.hit() } : {}) } }
      const response = first
      // A trigger case only needs to know whether the skill fired, so it ends there or at the turn cap; running out of turns is its normal end.
      if (vars.kind === 'trigger' && /maximum number of turns/.test(response.error ?? '')) {
        delete response.error
        response.output = ''
      }
      // A capped run answers an error, as the Agent SDK's own cap did.
      if (spend.over()) response.error = 'Exceeded the run cost cap: about $' + spend.over().toFixed(2) + ' of $' + costCap.toFixed(2)
      watch?.review(response.metadata?.toolCalls)
      const calls = response.metadata?.skillCalls ?? []
      const fired = hookFired || calls.some((call) => names.includes(call.name) || names.includes(call.input?.skill))
      return finish(response, { arm, vars, dir, home, plugin, dependencies: readOnly, env, fired, blocked: contained ? blocked : undefined, wrote, sandboxFault: faults.hit(), limits, scriptsOff })
    } finally {
      for (const folder of [dir, home, plugin, pluginGit].filter(Boolean)) try { fs.rmSync(folder, { recursive: true, force: true }) } catch {}
    }
  }
}
`

/**
 * The promptfoo `afterEach` extension `skill test` writes beside its config. promptfoo calls it once each run is
 * graded, so it knows what the provider cannot: whether the run met its criteria. It appends the run's end line to
 * `progress.jsonl` next to itself ({ event: 'end', case, arm, run, kind, outcome, reason?, durationMs, t }), where
 * `outcome` is `pass` or `fail` (every assertion of the run), `fired` or `not fired` for a trigger run, `not run`
 * with the reason, `sandbox failure`, or `limit reached` (R162) with its message, `started: false` for a run that
 * never started, and `resets` when the message says. It never writes the model's reply, and a run the baseline arm skips writes nothing.
 */
export const promptfooHookSource = String.raw`import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'progress.jsonl')

export async function afterEach({ result }) {
  try {
    const response = result.response
    if (response?.metadata?.skipped) return
    const kind = result.vars?.kind ?? result.testCase?.vars?.kind
    const error = response?.error ?? (response === undefined ? result.error ?? 'no response' : undefined)
    const line = { event: 'end', case: result.testCase?.description ?? '', arm: result.provider?.label === 'with-skill' ? 'skill' : 'baseline', run: (result.vars?.__run ?? result.testCase?.vars?.__run) ? Number(result.vars?.__run ?? result.testCase?.vars?.__run) : (result.repeatIndex ?? 0) + 1, kind, durationMs: result.latencyMs, t: Date.now() }
    // The same short reason the saved result gives (R137): the first line, without the Agent SDK provider's wrappers.
    if (response?.metadata?.limitReached) { line.outcome = 'limit reached'; line.reason = String(response.metadata.limitReached.text).slice(0, 160); line.started = response.metadata.limitReached.started !== false; if (response.metadata.limitReached.resets) line.resets = String(response.metadata.limitReached.resets) }
    else if (response?.metadata?.sandboxFault) { line.outcome = 'sandbox failure'; line.reason = String(response.metadata.sandboxFault.text).slice(0, 160) }
    else if (error) { line.outcome = 'not run'; line.reason = String(error).trim().split('\n')[0].replace(/^(?:\s*(?:Error calling Claude Agent SDK|Error|Claude Code returned an error result):)+\s*/i, '').slice(0, 160) || 'no reason given' }
    else if (kind === 'trigger') line.outcome = response?.metadata?.fired ? 'fired' : 'not fired'
    else line.outcome = result.success ? 'pass' : 'fail'
    fs.appendFileSync(file, JSON.stringify(line) + '\n')
  } catch {}
}
`
