/**
 * The promptfoo provider `skill test` writes beside its config. promptfoo's Claude Agent SDK provider
 * (0.125.1) runs in a temp folder it deletes and has no `copy_working_dir` (research E20), so this
 * wrapper makes each run's folder: a fresh copy of the case's files, plus the skill under
 * `.claude/skills/<name>/` in the arm that has it. After the run it decides the rubric checks that
 * need no judge in that folder, records whether the skill fired, and removes the folder.
 * It resolves promptfoo from the npx install running it.
 */
export const promptfooProviderSource = String.raw`import { execSync } from 'node:child_process'
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

export default class SkillRun {
  constructor(options) { this.options = options; this.config = options.config }
  id() { return this.options.id || 'skill-run' }
  async callApi(prompt, context) {
    const { arm, skillDir, skillName, inner } = this.config
    const vars = context.vars
    if (vars.kind === 'trigger' && arm !== 'skill') return { output: '', metadata: { arm, skipped: true } }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-run-'))
    try {
      if (vars.files) fs.cpSync(vars.files, dir, { recursive: true })
      if (skillDir) fs.cpSync(skillDir, path.join(dir, '.claude', 'skills', skillName), { recursive: true })
      const provider = await loadApiProvider('anthropic:claude-agent-sdk', { options: { config: { ...inner, working_dir: dir } } })
      const response = await provider.callApi(prompt, context)
      const output = typeof response.output === 'string' ? response.output : JSON.stringify(response.output ?? '')
      const calls = response.metadata?.skillCalls ?? []
      const fired = calls.some((call) => call.name === skillName || call.input?.skill === skillName)
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
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}
`
