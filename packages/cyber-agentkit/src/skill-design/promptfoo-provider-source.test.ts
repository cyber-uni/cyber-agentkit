import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { headlessInvocation } from '../headless/headless-invocation.js'
import { promptfooHookSource, promptfooProviderSource } from './promptfoo-provider-source.js'

const claude = headlessInvocation('claude-code')
const isolation = JSON.stringify(claude.supported === true ? claude.isolation : undefined)

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
      sandbox: options.config.sandbox,
      settings: options.config.settings,
      additionalDirectories: options.config.additional_directories,
      plugins: options.config.plugins,
      homeEntries: fs.readdirSync(options.config.env.HOME),
    }
    return { output: JSON.stringify(report), metadata: {} }
  },
})
`

function runProvider(
	withSkill: boolean,
	{ platform, network, plugin }: { platform?: string; network?: string[]; plugin?: boolean } = {},
): Record<string, any> {
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
		`${platform ? `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} })\n` : ''}const { default: Provider } = await import('./provider.mjs')
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', isolation: ${isolation}, inner: {}, ${withSkill ? `skillDir: ${JSON.stringify(join(root, 'skill'))},` : ''}${plugin ? ` pluginName: 'kit', pluginDir: ${JSON.stringify(join(root, 'skill'))},` : ''} } })
const response = await provider.callApi('hi', { vars: { kind: 'outcome', files: ${JSON.stringify(join(root, 'files'))}, rubrics: '{}'${network ? `, network: ${JSON.stringify(JSON.stringify(network))}` : ''} } })
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

describe('promptfooProviderSource home (F4, F10)', () => {
	it('gives each run an empty HOME, XDG folder and Claude config folder while the login stays in the real one, copying nothing', () => {
		const { env, homeEntries } = runProvider(true)
		const real = process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
		expect(env.HOME).toMatch(/skill-test-home-/)
		expect(env.XDG_CONFIG_HOME).toBe(join(env.HOME, '.config'))
		expect(env.CLAUDE_CONFIG_DIR).toBe(join(env.HOME, '.claude'))
		if (process.platform !== 'darwin')
			expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(process.env['CLAUDE_SECURESTORAGE_CONFIG_DIR'] ?? real)
		expect(env.PATH?.split(delimiter)[0]).toBe(dirname(process.execPath))
		expect(env.TMPDIR).toBe(join(env.HOME, 'tmp'))
		expect(env.ENABLE_CLAUDEAI_MCP_SERVERS).toBe('false')
		expect(homeEntries).toEqual(['tmp'])
	})

	it('on macOS also gives each run an empty Claude config folder, and names the default keychain entry for the login (E-CC-D13)', () => {
		const { env } = runProvider(true, { platform: 'darwin' })
		expect(env.CLAUDE_CONFIG_DIR).toBe(join(env.HOME, '.claude'))
		expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
			process.env['CLAUDE_SECURESTORAGE_CONFIG_DIR'] ?? process.env['CLAUDE_CONFIG_DIR'] ?? '',
		)
	})

	it('limits one shell command to 30 s by default and 2 min at most, stopping it at the limit (R104)', () => {
		const { env } = runProvider(true)
		expect(env.BASH_DEFAULT_TIMEOUT_MS).toBe('30000')
		expect(env.BASH_MAX_TIMEOUT_MS).toBe('120000')
		expect(env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1')
	})
})

describe('promptfooProviderSource containment (R107)', () => {
	it('runs shell commands in a sandbox that cannot be left, closes the network, and keeps the file tools in the run folder', () => {
		const { sandbox, settings, env } = runProvider(true)
		expect(sandbox).toMatchObject({
			enabled: true,
			failIfUnavailable: true,
			allowUnsandboxedCommands: false,
			network: { allowedDomains: [], strictAllowlist: true },
		})
		expect(sandbox.filesystem.denyRead).toEqual(expect.arrayContaining([tmpdir(), homedir()]))
		expect(sandbox.filesystem.allowRead).toEqual(expect.arrayContaining([env.HOME]))
		expect(sandbox.filesystem.allowWrite).toEqual(expect.arrayContaining([env.HOME]))
		expect(settings.permissions).toMatchObject({
			blockReadsOutsideWorkingDirectories: true,
			blockWritesOutsideWorkingDirectories: true,
		})
	})

	it('lets a run read and write its own plugin copy, as a working folder', () => {
		const { sandbox, settings, additionalDirectories, plugins } = runProvider(false, { plugin: true })
		const copy = plugins[0].path
		expect(copy).toMatch(/skill-test-plugin-/)
		expect(additionalDirectories).toEqual([copy])
		expect(sandbox.filesystem.allowRead).toContain(copy)
		expect(sandbox.filesystem.allowWrite).toContain(copy)
		expect(settings.permissions.blockReadsExemptPaths).toBeUndefined()
	})

	it('opens the network only to the hosts the case lists', () => {
		expect(runProvider(true, { network: ['registry.npmjs.org'] }).sandbox.network).toEqual({
			allowedDomains: ['registry.npmjs.org'],
			strictAllowlist: true,
		})
	})

	/** A fake inner provider that plays the tool calls Claude would make through the hooks it is given, and reports what the hooks answered. */
	const probing = String.raw`
exports.loadApiProvider = async (_id, { options }) => ({
  callApi: async () => {
    const c = options.config
    const pre = (input) => Promise.all(c.hooks.PreToolUse.flatMap((entry) => entry.hooks.map((hook) => hook(input))))
    const post = (input) => c.hooks.PostToolUse[0].hooks[0](input)
    const fail = (input) => c.hooks.PostToolUseFailure[0].hooks[0](input)
    const outside = process.env.OUTSIDE
    const answers = {
      readOutside: await pre({ tool_name: 'Read', tool_input: { file_path: outside } }),
      readInside: await pre({ tool_name: 'Read', tool_input: { file_path: 'notes.txt' } }),
      writeOutside: await pre({ tool_name: 'Write', tool_input: { file_path: '/etc/skill-test-probe', content: 'x' } }),
      globOutside: await pre({ tool_name: 'Glob', tool_input: { pattern: '/etc/**' } }),
    }
    await fail({ tool_name: 'Bash', tool_input: { command: 'cat ' + outside }, error: 'Exit code 1\ncat: ' + outside + ': No such file or directory' })
    await post({ tool_name: 'Bash', tool_input: { command: 'cat /etc/hostname' }, tool_response: { stdout: 'box', stderr: '' } })
    await post({ tool_name: 'Bash', tool_input: { command: 'cat /no/such/file' }, tool_response: { stdout: '', stderr: 'cat: /no/such/file: No such file or directory' } })
    await fail({ tool_name: 'Bash', tool_input: { command: 'curl https://example.com' }, error: 'Exit code 7\ncurl: (7) CONNECT tunnel failed, response 403\n<sandbox_violations>\ndeny network-outbound example.com:443 (host is not on the allow list)\n</sandbox_violations>' })
    return { output: 'done', metadata: { answers, toolCalls: [{ name: 'Bash', input: { command: 'curl https://wider.example', allowed_domains: ['wider.example'] }, is_error: true }] } }
  },
})
`

	function probe(): Record<string, any> {
		const root = mkdtempSync(join(tmpdir(), 'provider-contain-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), probing)
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		const outside = join(root, 'secret.txt')
		writeFileSync(outside, 'secret')
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', isolation: ${isolation}, inner: {} } })
console.log(JSON.stringify(await provider.callApi('hi', { vars: { kind: 'outcome', rubrics: '{}' } })))
`,
		)
		const response = JSON.parse(
			execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8', env: { ...process.env, OUTSIDE: outside } }),
		)
		return { ...response, outside }
	}

	it('refuses a file tool outside the run folder, lets one inside through, and records each refusal', () => {
		const { metadata } = probe()
		const denied = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } }
		expect(metadata.answers.readOutside[1]).toMatchObject(denied)
		expect(metadata.answers.writeOutside[1]).toMatchObject(denied)
		expect(metadata.answers.globOutside[1]).toMatchObject(denied)
		expect(metadata.answers.readInside).toEqual([{}, {}])
	})

	it('records a read the sandbox hid, a host it denied, and a host a command asked for beyond the case list, and nothing for a read it allowed or a file that does not exist', () => {
		const { metadata, outside } = probe()
		expect(metadata.blocked).toEqual([
			{ what: 'read', target: outside },
			{ what: 'write', target: '/etc/skill-test-probe' },
			{ what: 'read', target: '/etc' },
			{ what: 'network', target: 'example.com' },
			{ what: 'network', target: 'wider.example' },
		])
	})
})

describe('promptfooProviderSource login check (R108)', () => {
	/** A fake Claude Code that answers `auth status` as logged in only when its config folder is the real one, or always when LOGIN_SHARED=1. */
	const claude = String.raw`#!/usr/bin/env node
const env = process.env
const loggedIn = env.LOGIN_SHARED === '1' || !/skill-test-home-/.test(env.CLAUDE_CONFIG_DIR || '')
process.stdout.write(JSON.stringify({ loggedIn: env.LOGIN_NONE === '1' ? false : loggedIn }))
process.exit(loggedIn ? 0 : 1)
`

	function login(env: Record<string, string>): Record<string, any> {
		const root = mkdtempSync(join(tmpdir(), 'provider-login-'))
		const modules = join(root, 'node_modules')
		mkdirSync(join(modules, 'promptfoo'), { recursive: true })
		writeFileSync(join(modules, 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(
			join(modules, 'promptfoo', 'index.js'),
			"exports.loadApiProvider = async () => ({ callApi: async () => ({ output: 'ran', metadata: {} }) })",
		)
		const sdk = join(modules, '@anthropic-ai', 'claude-agent-sdk')
		mkdirSync(sdk, { recursive: true })
		writeFileSync(join(sdk, 'package.json'), '{"name":"@anthropic-ai/claude-agent-sdk","main":"index.js"}')
		writeFileSync(join(sdk, 'index.js'), '')
		const native = join(modules, '@anthropic-ai', `claude-agent-sdk-${process.platform}-${process.arch}`)
		mkdirSync(native, { recursive: true })
		writeFileSync(join(native, 'package.json'), '{"name":"native"}')
		writeFileSync(join(native, 'claude'), claude, { mode: 0o755 })
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', isolation: ${isolation}, inner: {} } })
console.log(JSON.stringify(await provider.callApi('hi', { vars: { kind: 'outcome', rubrics: '{}' } })))
`,
		)
		return JSON.parse(
			execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8', env: { ...process.env, ...env } }),
		)
	}

	it.skipIf(process.platform === 'win32')('runs when a run is logged in', () => {
		expect(login({ LOGIN_SHARED: '1' })).toMatchObject({ output: 'ran' })
	})

	it.skipIf(process.platform === 'win32')(
		'says in plain words when the login setting stopped working, before any run',
		() => {
			const response = login({ LOGIN_SHARED: '0' })
			expect(response.output).toBeUndefined()
			expect(response.error).toMatch(
				/^login: Claude Code is logged in, but a test run is not: .*CLAUDE_SECURESTORAGE_CONFIG_DIR/,
			)
		},
	)

	it.skipIf(process.platform === 'win32')('says so when Claude Code is not logged in at all', () => {
		expect(login({ LOGIN_SHARED: '0', LOGIN_NONE: '1' }).error).toMatch(/^login: Claude Code is not logged in/)
	})
})

describe('promptfooProviderSource time limit (F8)', () => {
	/**
	 * A fake inner provider that starts a process through the spawner it is given, as Claude Code would start, and never
	 * answers. That process starts a long-lived one of its own in a session of its own (detached), as Claude Code does
	 * with each shell command, and both write their process IDs. It runs on Linux, macOS, and Windows.
	 */
	const hanging = String.raw`
exports.loadApiProvider = async (_id, { options }) => ({
  callApi: async () => {
    const grandchild = "require('node:fs').writeFileSync(process.env.PID_FILE, String(process.pid)); setInterval(() => {}, 1000)"
    const child = "const c = require('node:child_process').spawn(process.execPath, ['-e', process.env.GRANDCHILD], { detached: true, stdio: 'ignore' }); c.unref(); setInterval(() => {}, 1000)"
    const shell = options.config.spawn_claude_code_process({ command: process.execPath, args: ['-e', child], cwd: options.config.working_dir, env: { ...process.env, ...options.config.env, GRANDCHILD: grandchild } })
    require('node:fs').writeFileSync(process.env.PID_FILE + '.shell', String(shell.pid))
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
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', isolation: ${isolation}, inner: {}, timeout: 2 } })
console.log(JSON.stringify(await provider.callApi('hi', { vars: { kind: 'outcome', rubrics: '{}' } })))
`,
		)
		const pidFile = join(root, 'pid')
		const started = Date.now()
		const out = execFileSync('node', [join(root, 'run.mjs')], {
			encoding: 'utf8',
			env: { ...process.env, PID_FILE: pidFile },
		})
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
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', isolation: ${isolation}, inner: { max_turns: 20 } } })
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

describe('promptfooProviderSource progress (R98, R99)', () => {
	/** A fake inner provider that answers at once; the run script runs the wrapper and the hook, then prints the progress file. */
	const answering =
		"exports.loadApiProvider = async () => ({ callApi: async () => ({ output: 'secret reply', metadata: {} }) })"

	function progress(kind: string, arm: string, skipped = false): { lines: Record<string, any>[]; raw: string } {
		const root = mkdtempSync(join(tmpdir(), 'provider-progress-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), answering)
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(join(root, 'hook.mjs'), promptfooHookSource)
		const file = join(root, 'progress.jsonl')
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
import { afterEach } from './hook.mjs'
const provider = new Provider({ config: { arm: ${JSON.stringify(arm)}, skillName: 'demo', isolation: ${isolation}, inner: {}, progressFile: ${JSON.stringify(file)} } })
const response = await provider.callApi('hi', { test: { description: 'case-a' }, repeatIndex: 1, vars: { kind: ${JSON.stringify(kind)}, rubrics: '{}' } })
await afterEach({ result: { response, vars: { kind: ${JSON.stringify(kind)} }, testCase: { description: 'case-a' }, provider: { label: ${JSON.stringify(arm === 'skill' ? 'with-skill' : 'baseline')} }, repeatIndex: 1, latencyMs: 1234, success: ${!skipped} } })
`,
		)
		execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8' })
		const raw = existsSync(file) ? readFileSync(file, 'utf8') : ''
		return {
			raw,
			lines: raw
				.split('\n')
				.filter(Boolean)
				.map((line) => JSON.parse(line)),
		}
	}

	it('appends a start line when a run begins and an end line, with its outcome and time, when it ends', () => {
		const { lines, raw } = progress('outcome', 'skill')
		expect(lines).toMatchObject([
			{ event: 'start', case: 'case-a', arm: 'skill', run: 2, kind: 'outcome' },
			{ event: 'end', case: 'case-a', arm: 'skill', run: 2, kind: 'outcome', outcome: 'pass', durationMs: 1234 },
		])
		expect(typeof lines[0]?.t).toBe('number')
		expect(raw).not.toContain('secret reply')
	})

	it('writes nothing for a trigger run the baseline arm skips', () => {
		expect(progress('trigger', 'baseline').lines).toEqual([])
	})

	it('ends a failed run as fail', () => {
		expect(progress('outcome', 'baseline', true).lines.at(-1)).toMatchObject({ outcome: 'fail', arm: 'baseline' })
	})
	it('ends an errored run as not run, with the reason in one short line (R137)', () => {
		const root = mkdtempSync(join(tmpdir(), 'provider-hook-'))
		writeFileSync(join(root, 'hook.mjs'), promptfooHookSource)
		const error =
			'Error calling Claude Agent SDK: Error: Claude Code returned an error result: Not logged in · Please run /login\n    at x'
		writeFileSync(
			join(root, 'run.mjs'),
			`import { afterEach } from './hook.mjs'
await afterEach({ result: { response: { error: ${JSON.stringify(error)} }, vars: { kind: 'outcome' }, testCase: { description: 'case-a' }, provider: { label: 'with-skill' }, repeatIndex: 0 } })
`,
		)
		execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8' })
		const line = JSON.parse(readFileSync(join(root, 'progress.jsonl'), 'utf8').trim())
		expect(line).toMatchObject({ outcome: 'not run', reason: 'Not logged in · Please run /login' })
	})
})

describe('promptfooProviderSource CLI driver (Codex, E-CODEX-H7)', () => {
	/** A fake `codex` that reports what it sees, reads the skill when it is there, writes a file, and replies. */
	const fakeCodex = String.raw`#!/usr/bin/env node
const fs = require('node:fs')
const out = (event) => process.stdout.write(JSON.stringify(event) + '\n')
const seen = { args: process.argv.slice(2), cwd: process.cwd(), HOME: process.env.HOME, CODEX_HOME: process.env.CODEX_HOME, skill: fs.existsSync('.agents/skills/demo/SKILL.md'), other: fs.existsSync('.agents/skills/other/SKILL.md') }
fs.writeFileSync(process.env.SEEN_FILE, JSON.stringify(seen))
out({ type: 'thread.started', thread_id: 't' })
out({ type: 'item.completed', item: { id: 'w', type: 'error', message: 'a warning, not an error' } })
if (seen.skill) out({ type: 'item.started', item: { id: 'c', type: 'command_execution', command: "/bin/sh -lc \"sed -n '1,200p' " + process.cwd() + "/.agents/skills/demo/SKILL.md\"" } })
fs.writeFileSync('NOTES.md', '## Notes\n')
out({ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: 'Wrote the notes.' } })
out({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } })
`

	function codex(
		kind: 'trigger' | 'outcome',
		withSkill = true,
		pluginDir?: string,
	): { response: Record<string, any>; seen: Record<string, any> } {
		const root = mkdtempSync(join(tmpdir(), 'provider-codex-'))
		mkdirSync(join(root, 'bin'))
		writeFileSync(join(root, 'bin', 'codex'), fakeCodex, { mode: 0o755 })
		mkdirSync(join(root, 'skill'))
		writeFileSync(join(root, 'skill', 'SKILL.md'), '---\nname: demo\n---\n')
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(
			join(root, 'node_modules', 'promptfoo', 'index.js'),
			'exports.loadApiProvider = async () => { throw new Error("not for codex") }',
		)
		const codexIsolation = JSON.stringify((headlessInvocation('codex') as { isolation: unknown }).isolation)
		const config = {
			arm: 'skill',
			skillName: 'demo',
			harness: 'codex',
			command: { executable: join(root, 'bin', 'codex'), args: ['exec', '--json', '--ignore-user-config'] },
			...(withSkill ? { skillDir: join(root, 'skill') } : {}),
			...(pluginDir ? { pluginDir, pluginName: 'kit' } : {}),
		}
		const rubrics = JSON.stringify({
			C1: [{ 'file-contains': { path: 'NOTES.md', text: '## Notes' } }],
			C2: [{ contains: 'Ahoy' }],
		})
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const provider = new Provider({ config: { ...${JSON.stringify(config)}, isolation: ${codexIsolation} } })
console.log(JSON.stringify(await provider.callApi('write the notes', { vars: { kind: '${kind}', rubrics: ${JSON.stringify(rubrics)} } })))
`,
		)
		const seenFile = join(root, 'seen.json')
		const response = JSON.parse(
			execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8', env: { ...process.env, SEEN_FILE: seenFile } }),
		)
		return { response, seen: JSON.parse(readFileSync(seenFile, 'utf8')) }
	}

	it('runs the command with the prompt last in the run folder, the skill under .agents/skills, an empty home, and the real CODEX_HOME', () => {
		const { response, seen } = codex('outcome')
		expect(seen.args).toEqual(['exec', '--json', '--ignore-user-config', 'write the notes'])
		expect(seen.cwd).toMatch(/skill-test-run-/)
		expect(seen.HOME).toMatch(/skill-test-home-/)
		expect(seen.CODEX_HOME).toBe(process.env['CODEX_HOME'] || join(homedir(), '.codex'))
		expect(seen.skill).toBe(true)
		expect(response).toMatchObject({
			output: 'Wrote the notes.',
			tokenUsage: { prompt: 10, completion: 5, total: 15 },
			metadata: { arm: 'skill', fired: true, checks: { C1: { pass: true }, C2: { pass: false } } },
		})
		expect(response.error).toBeUndefined()
	})

	it('ends a trigger run at the first read of a SKILL.md, and counts it fired only for the skill under test', () => {
		expect(codex('trigger').response).toMatchObject({ output: '', metadata: { fired: true } })
		expect(codex('trigger', false).response).toMatchObject({ metadata: { fired: false } })
	})

	it('gives a plugin skill project skills copied from the plugin, as Codex has no flag to load one', () => {
		const plugin = mkdtempSync(join(tmpdir(), 'provider-codex-plugin-'))
		for (const name of ['demo', 'other']) {
			mkdirSync(join(plugin, 'skills', name), { recursive: true })
			writeFileSync(join(plugin, 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\n`)
		}
		const { seen } = codex('outcome', false, plugin)
		expect(seen).toMatchObject({ skill: true, other: true })
	})
})

describe('promptfooProviderSource plugin copy (R91)', () => {
	/** A fake inner provider that edits the plugin it was handed when EDIT_PLUGIN is set. */
	const editing = String.raw`
const fs = require('node:fs')
exports.loadApiProvider = async (_id, { options }) => ({
  callApi: async () => {
    const plugin = options.config.plugins[0].path
    if (process.env.EDIT_PLUGIN === '1') fs.appendFileSync(plugin + '/skills/demo/SKILL.md', 'changed\n')
    return { output: plugin, metadata: {} }
  },
})
`

	function pluginRun(edit: boolean): { response: Record<string, any>; source: string } {
		const root = mkdtempSync(join(tmpdir(), 'provider-plugin-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), editing)
		const source = join(root, 'plugin')
		mkdirSync(join(source, 'skills', 'demo'), { recursive: true })
		writeFileSync(join(source, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\n')
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		const rubrics = JSON.stringify({
			C2: [{ script: 'test -z "$(git -C "$SKILL_TEST_PLUGIN" status --porcelain --untracked-files=all)"' }],
		})
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', pluginName: 'kit', pluginDir: ${JSON.stringify(source)}, isolation: ${isolation}, inner: {} } })
console.log(JSON.stringify(await provider.callApi('hi', { vars: { kind: 'outcome', rubrics: ${JSON.stringify(rubrics)} } })))
`,
		)
		const out = execFileSync('node', [join(root, 'run.mjs')], {
			encoding: 'utf8',
			env: { ...process.env, EDIT_PLUGIN: edit ? '1' : '0' },
		})
		return { response: JSON.parse(out), source }
	}

	it('loads a copy of the arm plugin of its own, so a check on SKILL_TEST_PLUGIN fails when the run changed it', () => {
		const changed = pluginRun(true)
		expect(changed.response.output).not.toBe(changed.source)
		expect(changed.response.metadata.checks.C2).toMatchObject({ pass: false })
		expect(readFileSync(join(changed.source, 'skills', 'demo', 'SKILL.md'), 'utf8')).not.toContain('changed')
		expect(existsSync(changed.response.output)).toBe(false)
	})

	it('passes that check when the run left the plugin alone', () => {
		expect(pluginRun(false).response.metadata.checks.C2).toEqual({ pass: true })
	})
})
