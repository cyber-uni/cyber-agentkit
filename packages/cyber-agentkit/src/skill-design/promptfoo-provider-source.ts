/**
 * The promptfoo provider `skill test` writes beside its config. promptfoo's Claude Agent SDK provider
 * (0.125.1) runs in a temp folder it deletes and has no `copy_working_dir` (research E20), so this
 * wrapper makes each run's folder: a fresh copy of the case's files committed in a new git repository, plus the
 * skill under the harness's project skills folder (`.claude/skills/<name>/` for Claude Code) in the arm that has it (excluded from git status), or, for a skill developed in a plugin, a fresh copy of that arm's plugin loaded as a local plugin (R91), committed in a git repository of its own and named to script checks by `SKILL_TEST_PLUGIN`, or its skills copied into the project skills folder for a harness with no local-plugin flag. Claude Code runs through promptfoo's Agent SDK provider; another harness (`config.harness`) runs through its own CLI (`config.command`). Each Skill call is recorded in `.skill-test/skill-calls.jsonl` (excluded from git status). A trigger run ends at its first Skill call, or after three turns. A run that passes its time limit (`timeout`, seconds) is stopped, process group and all, and answers the error `time limit`. After the run it decides the rubric checks that
 * need no judge in that folder, records whether the skill fired, and removes the folder. Each run also gets an empty home folder.
 * It resolves promptfoo from the npx install running it.
 *
 * Progress (R98, R99): when its config names a `progressFile`, the provider appends one JSON line when a run starts
 * ({ event: 'start', case, arm, run, kind, t }); `promptfooHookSource` appends the line when it ends.
 */
export const promptfooProviderSource = String.raw`import { execFileSync, execSync, spawn } from 'node:child_process'
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

function decide(check, output, dir, env) {
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
      try { execSync(value, { cwd: dir, env, stdio: 'pipe', timeout: 60000 }); return { pass: true, detail: '' } }
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
function containment({ dir, home, plugin, network }) {
  const real = (p) => { try { return fs.realpathSync(p) } catch { return p } }
  const nodeInstall = path.dirname(path.dirname(real(process.execPath)))
  const own = [...new Set([dir, home, plugin].filter(Boolean).flatMap((p) => [p, real(p)]))]
  return {
    readable: own,
    writable: own,
    settings: { permissions: { blockReadsOutsideWorkingDirectories: true, blockWritesOutsideWorkingDirectories: true } },
    sandbox: {
      enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false,
      network: { allowedDomains: network ?? [], strictAllowlist: true },
      filesystem: { denyRead: [...new Set([os.tmpdir(), real(os.tmpdir()), os.homedir()])], allowRead: [...own, nodeInstall], allowWrite: own },
    },
  }
}

const inside = (roots, p) => roots.some((root) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep))

// Records what the containment refused, as { what: 'read' | 'write' | 'network', target }. A file tool (the
// declaration's fileTools) given a path outside the run is refused here. For a shell command it reads the sandbox's
// own notes and a host a command asked to reach beyond the case's list, and counts a path the command names that exists outside the run but that the command could not find,
// read or write as refused: the sandbox hides it. A path the command builds as it runs is still refused, but may go
// unrecorded.
function watchContainment({ dir, readable, writable, fileTools, network = [] }, blocked) {
  const note = (what, target) => { if (!blocked.some((b) => b.what === what && b.target === target) && blocked.length < 50) blocked.push({ what, target }) }
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

// Decides the rubric checks that need no judge in the run's folder, and records whether the skill fired.
// A script check finds the run's own plugin copy at SKILL_TEST_PLUGIN.
function finish(response, { arm, vars, dir, plugin, fired, blocked }) {
  const output = typeof response.output === 'string' ? response.output : JSON.stringify(response.output ?? '')
  const checks = {}
  const env = { ...process.env, ...(plugin ? { SKILL_TEST_PLUGIN: plugin } : {}) }
  if (!response.error)
    for (const [id, list] of Object.entries(JSON.parse(vars.rubrics || '{}'))) {
      const results = list.map((check) => decide(check, output, dir, env))
      const failed = results.find((result) => !result.pass)
      checks[id] = failed ? { pass: false, detail: failed.detail } : { pass: true }
    }
  response.metadata = { ...response.metadata, arm, fired, checks, ...(blocked ? { blocked } : {}) }
  return response
}

// A harness driven through its own CLI: the command from headlessCommand(), with the prompt last, its JSON lines
// read as they come. Only Codex's events are read (E-CODEX-H7): the reply is the last agent_message, usage comes
// from turn.completed, a turn.failed or top-level error is the run's error, and a skill is used when a command
// reads <projectSkills>/<skill>/SKILL.md, the only sign of it. A trigger run ends at the first such read.
function runCli({ command, isolation, prompt, names, vars, dir, env, timeout, marker, callLog }) {
  return new Promise((resolve) => {
    const children = []
    const child = spawnInGroup(children)({ command: command.executable, args: [...command.args, prompt], cwd: dir, env: { ...process.env, ...env } })
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

export default class SkillRun {
  constructor(options) { this.options = options; this.config = options.config }
  id() { return this.options.id || 'skill-run' }
  async callApi(prompt, context) {
    const { arm, skillDir, skillName, pluginDir, pluginName, inner, timeout = 300, harness = 'claude-code', isolation, command } = this.config
    // A skill loaded from a plugin is called <plugin>:<skill> (research E21).
    const names = pluginName ? [skillName, pluginName + ':' + skillName] : [skillName]
    const vars = context.vars
    if (vars.kind === 'trigger' && arm !== 'skill') return { output: '', metadata: { arm, skipped: true } }
    if (this.config.progressFile)
      try { fs.appendFileSync(this.config.progressFile, JSON.stringify({ event: 'start', case: context.test?.description ?? '', arm, run: (context.repeatIndex ?? vars.__repeatIndex ?? 0) + 1, kind: vars.kind, t: Date.now() }) + '\n') } catch {}
    if (harness === 'claude-code') {
      const login = await loginProblem(isolation)
      if (login) return { error: login, metadata: { arm } }
    }
    // Real paths: Claude Code takes a working folder as written, and on macOS the temp folder runs through a link.
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-run-')))
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-home-')))
    // A run loads a copy of its arm's plugin of its own, committed in a git repository, so a script check can tell
    // whether the run changed it: SKILL_TEST_PLUGIN names that copy.
    const plugin = pluginDir ? fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-plugin-'))) : undefined
    try {
      if (vars.files) fs.cpSync(vars.files, dir, { recursive: true })
      const commit = (cwd, message) => {
        const git = (args) => execFileSync('git', args, { cwd, stdio: 'pipe' })
        git(['init', '-q'])
        git(['config', 'user.name', 'skill-test'])
        git(['config', 'user.email', 'skill-test@example.invalid'])
        git(['config', 'commit.gpgsign', 'false'])
        git(['add', '-A'])
        git(['commit', '-q', '-m', message, '--allow-empty'])
      }
      commit(dir, 'case files')
      if (plugin) {
        fs.cpSync(pluginDir, plugin, { recursive: true })
        commit(plugin, 'plugin')
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
      const marker = 'SKILL_TEST_RUN=' + randomUUID()
      const env = { ...isolatedEnv(isolation, home), SKILL_TEST_RUN: marker.split('=')[1] }
      const children = []
      if (harness !== 'claude-code') {
        const response = await runCli({ command, isolation, prompt, names, vars, dir, env, timeout, marker, callLog })
        return finish(response, { arm, vars, dir, plugin, fired: response.metadata?.fired ?? false })
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
      let hooks = { PreToolUse: [skillHook] }
      let contained
      let watch
      const blocked = []
      if (isolation.containment) {
        contained = containment({ dir, home, plugin, network: vars.network ? JSON.parse(vars.network) : undefined })
        watch = watchContainment({ dir, ...contained, fileTools: isolation.containment.fileTools, network: contained.sandbox.network.allowedDomains }, blocked)
        hooks = { ...watch.hooks, PreToolUse: [skillHook, ...watch.hooks.PreToolUse] }
      }
      const provider = await loadApiProvider('anthropic:claude-agent-sdk', { options: { config: { ...inner, ...(plugin ? { plugins: [{ type: 'local', path: plugin }] } : {}), ...(vars.kind === 'trigger' ? { max_turns: 3 } : {}), hooks, env, working_dir: dir, ...(contained ? { sandbox: contained.sandbox, settings: contained.settings, ...(plugin ? { additional_directories: [plugin] } : {}) } : {}), spawn_claude_code_process: spawnInGroup(children) } } })
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
      if (first === 'time limit') return { error: 'time limit', metadata: { arm, timedOut: true, ...(contained ? { blocked } : {}) } }
      const response = first
      // A trigger case only needs to know whether the skill fired, so it ends there or at the turn cap; running out of turns is its normal end.
      if (vars.kind === 'trigger' && /maximum number of turns/.test(response.error ?? '')) {
        delete response.error
        response.output = ''
      }
      watch?.review(response.metadata?.toolCalls)
      const calls = response.metadata?.skillCalls ?? []
      const fired = hookFired || calls.some((call) => names.includes(call.name) || names.includes(call.input?.skill))
      return finish(response, { arm, vars, dir, plugin, fired, blocked: contained ? blocked : undefined })
    } finally {
      for (const folder of [dir, home, plugin].filter(Boolean)) try { fs.rmSync(folder, { recursive: true, force: true }) } catch {}
    }
  }
}
`

/**
 * The promptfoo `afterEach` extension `skill test` writes beside its config. promptfoo calls it once each run is
 * graded, so it knows what the provider cannot: whether the run met its criteria. It appends the run's end line to
 * `progress.jsonl` next to itself ({ event: 'end', case, arm, run, kind, outcome, reason?, durationMs, t }), where
 * `outcome` is `pass` or `fail` (every assertion of the run), `fired` or `not fired` for a trigger run, or
 * `not run` with the reason. It never writes the model's reply, and a run the baseline arm skips writes nothing.
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
    const line = { event: 'end', case: result.testCase?.description ?? '', arm: result.provider?.label === 'with-skill' ? 'skill' : 'baseline', run: (result.repeatIndex ?? 0) + 1, kind, durationMs: result.latencyMs, t: Date.now() }
    // The same short reason the saved result gives (R137): the first line, without the Agent SDK provider's wrappers.
    if (error) { line.outcome = 'not run'; line.reason = String(error).trim().split('\n')[0].replace(/^(?:\s*(?:Error calling Claude Agent SDK|Error|Claude Code returned an error result):)+\s*/i, '').slice(0, 160) || 'no reason given' }
    else if (kind === 'trigger') line.outcome = response?.metadata?.fired ? 'fired' : 'not fired'
    else line.outcome = result.success ? 'pass' : 'fail'
    fs.appendFileSync(file, JSON.stringify(line) + '\n')
  } catch {}
}
`
