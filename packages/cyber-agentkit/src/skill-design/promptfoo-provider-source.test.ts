import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { promptfooProviderSource } from './promptfoo-provider-source.js'

/** A fake `promptfoo` whose inner provider reports what the run folder looks like when the model would start. */
const fakePromptfoo = String.raw`
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
exports.loadApiProvider = async (_id, { options }) => ({
  callApi: async () => {
    const dir = options.config.working_dir
    const report = {
      isRepo: git(dir, 'rev-parse', '--is-inside-work-tree'),
      log: git(dir, 'log', '--format=%s|%an|%ae'),
      status: git(dir, 'status', '--porcelain'),
      tracked: git(dir, 'ls-files'),
      skillInstalled: fs.existsSync(dir + '/.claude/skills/demo/SKILL.md'),
      env: options.config.env,
      homeEntries: fs.readdirSync(options.config.env.HOME),
    }
    return { output: JSON.stringify(report), metadata: {} }
  },
})
`

function runProvider(withSkill: boolean): Record<string, any> {
	const root = mkdtempSync(join(tmpdir(), 'provider-test-'))
	mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
	writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
	writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), fakePromptfoo)
	mkdirSync(join(root, 'files'))
	writeFileSync(join(root, 'files', 'notes.txt'), 'hello')
	mkdirSync(join(root, 'skill'))
	writeFileSync(join(root, 'skill', 'SKILL.md'), '---\nname: demo\n---\n')
	writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
	writeFileSync(
		join(root, 'run.mjs'),
		`import Provider from './provider.mjs'
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', inner: {}, ${withSkill ? `skillDir: ${JSON.stringify(join(root, 'skill'))},` : ''} } })
const response = await provider.callApi('hi', { vars: { kind: 'outcome', files: ${JSON.stringify(join(root, 'files'))}, rubrics: '{}' } })
console.log(response.output)
`,
	)
	return JSON.parse(execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8' }))
}

describe('promptfooProviderSource run folder (F7)', () => {
	it('makes the folder a git repository with the case files committed and the installed skill out of git status', () => {
		expect(runProvider(true)).toMatchObject({
			isRepo: 'true',
			log: 'case files|skill-test|skill-test@example.invalid',
			status: '',
			tracked: 'notes.txt',
			skillInstalled: true,
		})
	})

	it('is a repository with an empty commit when the arm has no skill', () => {
		expect(runProvider(false)).toMatchObject({ isRepo: 'true', status: '', skillInstalled: false })
	})
})

describe('promptfooProviderSource home (F4)', () => {
	it('gives each run an empty HOME and XDG folder while the Claude config folder stays the real one, copying nothing', () => {
		const { env, homeEntries } = runProvider(true)
		expect(env.HOME).toMatch(/skill-test-home-/)
		expect(env.XDG_CONFIG_HOME).toBe(join(env.HOME, '.config'))
		expect(env.CLAUDE_CONFIG_DIR).toBe(process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'))
		expect(env.PATH?.split(delimiter)[0]).toBe(dirname(process.execPath))
		expect(homeEntries).toEqual([])
	})
})

describe('promptfooProviderSource time limit (F8)', () => {
	/** A fake inner provider that starts a shell with a long sleep through the spawner it is given, and never answers. */
	const hanging = String.raw`
exports.loadApiProvider = async (_id, { options }) => ({
  callApi: async () => {
    const child = options.config.spawn_claude_code_process({ command: 'sh', args: ['-c', 'setsid sleep 300 & echo $! > ' + process.env.PID_FILE + '; wait'], cwd: options.config.working_dir, env: { ...process.env, ...options.config.env } })
    require('node:fs').writeFileSync(process.env.PID_FILE + '.shell', String(child.pid))
    return new Promise(() => {})
  },
})
`

	it('stops a run at its time limit, kills the shell and what it started, even in a session of its own, and answers the error time limit', async () => {
		const root = mkdtempSync(join(tmpdir(), 'provider-limit-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), hanging)
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', inner: {}, timeout: 1 } })
console.log(JSON.stringify(await provider.callApi('hi', { vars: { kind: 'outcome', rubrics: '{}' } })))
`,
		)
		const pidFile = join(root, 'pid')
		const started = Date.now()
		const out = execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8', env: { ...process.env, PID_FILE: pidFile } })
		expect(Date.now() - started).toBeLessThan(15000)
		expect(JSON.parse(out)).toMatchObject({ error: 'time limit' })
		const alive = (pid: number) => {
			try {
				process.kill(pid, 0)
				return true
			} catch {
				return false
			}
		}
		await new Promise((done) => setTimeout(done, 300))
		expect(alive(Number(readFileSync(`${pidFile}.shell`, 'utf8')))).toBe(false)
		expect(alive(Number(readFileSync(pidFile, 'utf8')))).toBe(false)
	})
})

describe('promptfooProviderSource trigger runs (F9)', () => {
	/** A fake inner provider for a trigger run: it sees the turn cap and the Skill hook, calls the hook as Claude would, then hits the cap. */
	const capped = String.raw`
exports.loadApiProvider = async (_id, { options }) => ({
  callApi: async () => {
    const c = options.config
    const hook = c.hooks.PreToolUse[0].hooks[0]
    const wrong = await hook({ tool_name: 'Skill', tool_input: { skill: 'other' } })
    const right = process.env.SKILL_CALLED === '1' ? await hook({ tool_name: 'Skill', tool_input: { skill: 'demo' } }) : {}
    return { error: 'Error calling Claude Agent SDK: Error: Claude Code returned an error result: Reached maximum number of turns (3)', metadata: { turns: c.max_turns, matcher: c.hooks.PreToolUse[0].matcher, wrong, right } }
  },
})
`

	function trigger(skillCalled: boolean): Record<string, any> {
		const root = mkdtempSync(join(tmpdir(), 'provider-trigger-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), capped)
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', inner: { max_turns: 20 } } })
console.log(JSON.stringify(await provider.callApi('hi', { vars: { kind: 'trigger', rubrics: '{}' } })))
`,
		)
		return JSON.parse(
			execFileSync('node', [join(root, 'run.mjs')], {
				encoding: 'utf8',
				env: { ...process.env, SKILL_CALLED: skillCalled ? '1' : '0' },
			}),
		)
	}

	it('caps a trigger run at three turns, records the skill call from a hook, and ends the run there', () => {
		const response = trigger(true)
		expect(response.error).toBeUndefined()
		expect(response.metadata).toMatchObject({
			turns: 3,
			matcher: 'Skill',
			fired: true,
			wrong: {},
			right: { continue: false },
		})
	})

	it('reports not fired when the run reaches the cap without calling the skill, and still counts it as run', () => {
		const response = trigger(false)
		expect(response.error).toBeUndefined()
		expect(response.metadata).toMatchObject({ fired: false })
	})
})
