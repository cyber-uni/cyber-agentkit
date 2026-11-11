/**
 * The promptfoo provider `skill test` writes beside its config. promptfoo's Claude Agent SDK provider
 * (0.125.1) runs in a temp folder it deletes and has no `copy_working_dir` (research E20), so this
 * wrapper makes each run's folder: a fresh copy of the case's files committed in a new git repository, plus the
 * skill under `.claude/skills/<name>/` in the arm that has it (excluded from git status). A trigger run ends when the skill is called, or after three turns. A run that passes its time limit (`timeout`, seconds) is stopped, process group and all, and answers the error `time limit`. After the run it decides the rubric checks that
 * need no judge in that folder, records whether the skill fired, and removes the folder. Each run also gets an empty home folder.
 * It resolves promptfoo from the npx install running it.
 */
export const promptfooProviderSource = String.raw`import { execFileSync, execSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const req = createRequire(fs.realpathSync(process.argv[1]))
const { loadApiProvider } = await import(req.resolve('promptfoo'))
const cap = (text) => (text.length > 2000 ? text.slice(0, 2000) + '…' : text)

function decide(check, output, dir) {
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
      try { execSync(value, { cwd: dir, stdio: 'pipe', timeout: 60000 }); return { pass: true, detail: '' } }
      catch (error) { return { pass: false, detail: cap(String(error.stderr || error.stdout || error.message)) } }
    default: return { pass: false, detail: 'unknown check ' + kind }
  }
}

// Each run sees an empty home and an empty Claude config folder, so a skill's own CLI finds no user
// references or plugins, and the Bash tool sources no user shell snapshot. The login stays the real one:
// CLAUDE_SECURESTORAGE_CONFIG_DIR names the folder Claude Code reads and writes its credentials in (E-CC-D11, found
// in the claude binary 2.1.322, not in the vendor docs; CLAUDE_CONFIG_DIR is E-CC-D7), so Claude Code
// refreshes a token in the real file itself and nothing is copied or linked. If a Claude Code version
// ignores the variable, the run reports "Not logged in" and counts as not run. macOS keeps the real config
// folder, because its keychain entry is named after the folder and that name cannot be set from here. A login
// set through ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN passes through as is. A version manager's node
// shim reads its config from the home folder, so the node running this provider goes first on PATH: a
// skill's node scripts still run.
function isolatedHome(home) {
  const real = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const PATH = [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter)
  const env = { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config'), CLAUDE_CONFIG_DIR: real, PATH }
  if (process.platform !== 'darwin') {
    env.CLAUDE_CONFIG_DIR = path.join(home, '.claude')
    env.CLAUDE_SECURESTORAGE_CONFIG_DIR = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR || real
  }
  return env
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

export default class SkillRun {
  constructor(options) { this.options = options; this.config = options.config }
  id() { return this.options.id || 'skill-run' }
  async callApi(prompt, context) {
    const { arm, skillDir, skillName, inner, timeout = 300 } = this.config
    const vars = context.vars
    if (vars.kind === 'trigger' && arm !== 'skill') return { output: '', metadata: { arm, skipped: true } }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-run-'))
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-home-'))
    try {
      if (vars.files) fs.cpSync(vars.files, dir, { recursive: true })
      const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
      git(['init', '-q'])
      git(['config', 'user.name', 'skill-test'])
      git(['config', 'user.email', 'skill-test@example.invalid'])
      git(['config', 'commit.gpgsign', 'false'])
      git(['add', '-A'])
      git(['commit', '-q', '-m', 'case files', '--allow-empty'])
      if (skillDir) fs.cpSync(skillDir, path.join(dir, '.claude', 'skills', skillName), { recursive: true })
      fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), '.claude/\n')
      const marker = 'SKILL_TEST_RUN=' + randomUUID()
      const env = { ...isolatedHome(home), SKILL_TEST_RUN: marker.split('=')[1] }
      const children = []
      // A trigger case only needs to know whether the skill fired. A hook records the Skill call and ends the run there; a turn cap of three
      // backs it up for a run that never calls it. The SDK answers a cap with an error that carries no skill calls, so the hook is the record.
      let hookFired = false
      const watchSkill = async (input) => {
        if (input.tool_name !== 'Skill' || String(input.tool_input?.skill ?? '').trim() !== skillName) return {}
        hookFired = true
        return { continue: false, stopReason: 'the skill fired' }
      }
      const provider = await loadApiProvider('anthropic:claude-agent-sdk', { options: { config: { ...inner, ...(vars.kind === 'trigger' ? { max_turns: 3, hooks: { PreToolUse: [{ matcher: 'Skill', hooks: [watchSkill] }] } } : {}), env, working_dir: dir, spawn_claude_code_process: spawnInGroup(children) } } })
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
      if (first === 'time limit') return { error: 'time limit', metadata: { arm, timedOut: true } }
      const response = first
      // A trigger case only needs to know whether the skill fired, so it ends there or at the turn cap; running out of turns is its normal end.
      if (vars.kind === 'trigger' && /maximum number of turns/.test(response.error ?? '')) {
        delete response.error
        response.output = ''
      }
      const output = typeof response.output === 'string' ? response.output : JSON.stringify(response.output ?? '')
      const calls = response.metadata?.skillCalls ?? []
      const fired = hookFired || calls.some((call) => call.name === skillName || call.input?.skill === skillName)
      const checks = {}
      if (!response.error)
        for (const [id, list] of Object.entries(JSON.parse(vars.rubrics || '{}'))) {
          const results = list.map((check) => decide(check, output, dir))
          const failed = results.find((result) => !result.pass)
          checks[id] = failed ? { pass: false, detail: failed.detail } : { pass: true }
        }
      response.metadata = { ...response.metadata, arm, fired, checks }
      return response
    } finally {
      for (const folder of [dir, home]) try { fs.rmSync(folder, { recursive: true, force: true }) } catch {}
    }
  }
}
`
