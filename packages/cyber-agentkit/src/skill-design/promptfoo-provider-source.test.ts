import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { headlessInvocation } from '../headless/headless-invocation.js'
import { promptfooHookSource, promptfooProviderSource } from './promptfoo-provider-source.js'
import { sandboxFaults } from './sandbox-faults.js'
import { usageLimits } from './usage-limits.js'

/** The script sandbox's CLI, which the provider resolves from the npx install it runs in. */
const srt = join(dirname(createRequire(import.meta.url).resolve('@anthropic-ai/sandbox-runtime')), 'cli.js')

/** Puts the script sandbox beside a fake promptfoo, as the npx install holds it. */
function linkSandbox(root: string): void {
	mkdirSync(join(root, 'node_modules', '@anthropic-ai'), { recursive: true })
	symlinkSync(dirname(dirname(srt)), join(root, 'node_modules', '@anthropic-ai', 'sandbox-runtime'), 'dir')
}

/** Why the script sandbox does not start on this machine (on Linux it needs bubblewrap, socat, and ripgrep), or undefined when it does. */
const sandboxDown = (() => {
	const settings = mkdtempSync(join(tmpdir(), 'provider-srt-'))
	writeFileSync(
		join(settings, 's.json'),
		JSON.stringify({
			network: { allowedDomains: [], deniedDomains: [] },
			filesystem: { denyRead: [], allowWrite: [settings], denyWrite: [] },
		}),
	)
	try {
		execFileSync(process.execPath, [srt, '--settings', join(settings, 's.json'), '-c', 'true'], { stdio: 'pipe' })
		return undefined
	} catch (error) {
		return String((error as { stderr?: unknown }).stderr || (error as Error).message).trim() || 'it exited non-zero'
	}
})()
const sandboxStarts = sandboxDown === undefined
// The CI job that installs the sandbox's tools sets this, so the tests that need it cannot pass by being skipped there.
if (process.env['SKILL_TEST_REQUIRE_SANDBOX'] && sandboxDown)
	throw new Error(`the script sandbox does not start on this machine: ${sandboxDown}`)

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
    if (process.env.FAKE_RUN_WRITES) fs.writeFileSync(dir + '/' + process.env.FAKE_RUN_WRITES, 'written by the run\n')
    const report = {
      isRepo: git(dir, 'rev-parse', '--is-inside-work-tree'),
      log: git(dir, 'log', '--format=%s|%an|%ae'),
      status: git(dir, 'status', '--porcelain'),
      tracked: git(dir, 'ls-files'),
      skillInstalled: fs.existsSync(dir + '/.claude/skills/demo/SKILL.md'),
      instructions: fs.existsSync(dir + '/CLAUDE.md') ? fs.readFileSync(dir + '/CLAUDE.md', 'utf8') : undefined,
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
	{
		platform,
		network,
		plugin,
		dependencies,
		instruction,
		caseInstructions,
	}: {
		platform?: string
		network?: string[]
		plugin?: boolean
		dependencies?: string[]
		instruction?: string
		caseInstructions?: string
	} = {},
): Record<string, any> {
	const root = mkdtempSync(join(tmpdir(), 'provider-test-'))
	mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
	writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
	writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), fakePromptfoo)
	mkdirSync(join(root, 'files'))
	writeFileSync(join(root, 'files', 'notes.txt'), 'hello')
	if (caseInstructions !== undefined) writeFileSync(join(root, 'files', 'CLAUDE.md'), caseInstructions)
	mkdirSync(join(root, 'skill'))
	writeFileSync(join(root, 'skill', 'SKILL.md'), '---\nname: demo\n---\n')
	writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
	writeFileSync(
		join(root, 'run.mjs'),
		`${platform ? `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} })\n` : ''}const { default: Provider } = await import('./provider.mjs')
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', isolation: ${isolation}, inner: {}, ${instruction === undefined ? '' : `instruction: ${JSON.stringify(instruction)}, `}${withSkill ? `skillDir: ${JSON.stringify(join(root, 'skill'))},` : ''}${plugin ? ` pluginName: 'kit', pluginDir: ${JSON.stringify(join(root, 'skill'))},` : ''}${dependencies ? ` dependencyDirs: ${JSON.stringify(dependencies)},` : ''} } })
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

describe('promptfooProviderSource instruction (instruction compare)', () => {
	it('writes the arm instruction to the project instruction file, committed with the case files', () => {
		expect(runProvider(false, { instruction: '## Commit Discipline\n\nCommit each unit.\n' })).toMatchObject({
			status: '',
			tracked: 'CLAUDE.md\nnotes.txt',
			instructions: '## Commit Discipline\n\nCommit each unit.\n',
		})
	})

	it('adds it after what the case files already put in that file', () => {
		expect(runProvider(false, { instruction: '## B\n', caseInstructions: '# Repo\n\nUse pnpm.\n\n' })).toMatchObject({
			instructions: '# Repo\n\nUse pnpm.\n\n## B\n',
		})
	})

	it('writes no instruction file when the arm has none', () => {
		expect(runProvider(false).instructions).toBeUndefined()
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

	it('starts each shell command in the run folder, so a cd into the read-only plugin copy cannot break the sandbox (E-CC-D17)', () => {
		expect(runProvider(true, { plugin: true }).env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR).toBe('1')
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

	it('loads the plugins the plugin depends on beside it, readable but not writable (E-CC-H10)', () => {
		const dependency = mkdtempSync(join(tmpdir(), 'provider-dependency-'))
		const { sandbox, additionalDirectories, plugins } = runProvider(false, { plugin: true, dependencies: [dependency] })
		const copy = plugins[0].path
		expect(plugins).toEqual([
			{ type: 'local', path: copy },
			{ type: 'local', path: dependency },
		])
		expect(additionalDirectories).toEqual([copy, dependency])
		expect(sandbox.filesystem.allowRead).toContain(dependency)
		expect(sandbox.filesystem.allowWrite).not.toContain(dependency)
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

describe('promptfooProviderSource model (R161)', () => {
	function modelOf(caseModel?: string): unknown {
		const root = mkdtempSync(join(tmpdir(), 'provider-model-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(
			join(root, 'node_modules', 'promptfoo', 'index.js'),
			'exports.loadApiProvider = async (_id, { options }) => ({ callApi: async () => ({ output: "", metadata: { model: options.config.model } }) })',
		)
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const provider = new Provider({ config: { arm: 'baseline', skillName: 'demo', isolation: ${isolation}, inner: { model: 'sonnet' } } })
console.log(JSON.stringify(await provider.callApi('hi', { vars: { kind: 'outcome', rubrics: '{}'${caseModel ? `, model: '${caseModel}'` : ''} } })))
`,
		)
		return JSON.parse(execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8' })).metadata.model
	}

	it("runs on the run's model, or on the case's own when it names one", () => {
		expect(modelOf()).toBe('sonnet')
		expect(modelOf('opus')).toBe('opus')
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

describe('promptfooProviderSource cost cap (#238)', () => {
	/** A fake inner provider that writes a transcript of `TOKENS` output tokens, then makes a tool call through every PreToolUse hook. */
	const spending = String.raw`
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
exports.loadApiProvider = async (_id, { options }) => ({
  callApi: async () => {
    const c = options.config
    const transcript = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'provider-transcript-')), 't.jsonl')
    const message = { id: 'm1', model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: Number(process.env.TOKENS) } }
    // The same message twice, as a transcript writes one line per content block: it counts once.
    fs.writeFileSync(transcript, [{ type: 'user' }, { type: 'assistant', message }, { type: 'assistant', message }].map((l) => JSON.stringify(l)).join('\n'))
    const answers = await Promise.all(c.hooks.PreToolUse.flatMap((entry) => entry.hooks.map((hook) => hook({ tool_name: 'Bash', tool_input: { command: 'true' }, transcript_path: transcript }))))
    return { output: 'done', metadata: { budget: c.max_budget_usd ?? null, stopped: answers.some((a) => a.continue === false && a.stopReason === 'cost cap') } }
  },
})
`

	function spend(tokens: number): Record<string, any> {
		const root = mkdtempSync(join(tmpdir(), 'provider-cost-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), spending)
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const provider = new Provider({ config: { arm: 'baseline', skillName: 'demo', isolation: ${isolation}, costCap: 0.5, inner: {} } })
console.log(JSON.stringify(await provider.callApi('hi', { vars: { kind: 'outcome', rubrics: '{}' } })))
`,
		)
		return JSON.parse(
			execFileSync('node', [join(root, 'run.mjs')], {
				encoding: 'utf8',
				env: { ...process.env, TOKENS: String(tokens) },
			}),
		)
	}

	it('passes the Agent SDK no budget the model would see, and lets a run under the cap go on', () => {
		// 10,000 output tokens at $15 a million: $0.15.
		const response = spend(10_000)
		expect(response.error).toBeUndefined()
		expect(response.metadata).toMatchObject({ budget: null, stopped: false })
	})

	it('ends a run whose transcript passes the cap, and answers an error', () => {
		// 40,000 output tokens at $15 a million: $0.60; counted twice it would be $1.20.
		const response = spend(40_000)
		expect(response.metadata).toMatchObject({ budget: null, stopped: true })
		expect(response.error).toBe('Exceeded the run cost cap: about $0.60 of $0.50')
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

describe('promptfooProviderSource sandbox failures (R154)', () => {
	const bwrap =
		"bwrap: Can't create file at /tmp/skill-test-plugin-Xa1b2C/references/.claude/launch.json: Read-only file system"
	/** A fake inner provider that plays shell commands through every PostToolUse and PostToolUseFailure hook it is given. */
	const shell = (failing: boolean) => String.raw`
exports.loadApiProvider = async (_id, { options }) => ({
  callApi: async () => {
    const all = (event, input) => Promise.all(options.config.hooks[event].flatMap((entry) => entry.hooks.map((hook) => hook(input))))
    await all('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: { stdout: 'notes.txt', stderr: '' } })
    ${failing ? `await all('PostToolUseFailure', { tool_name: 'Bash', tool_input: { command: 'ls' }, error: 'Exit code 1\\n' + ${JSON.stringify(bwrap)} })` : ''}
    return { output: 'done', metadata: {} }
  },
})
`

	function play(failing: boolean, containment: boolean): { response: Record<string, any>; line?: Record<string, any> } {
		const root = mkdtempSync(join(tmpdir(), 'provider-sandbox-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), shell(failing))
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(join(root, 'hook.mjs'), promptfooHookSource)
		const used = containment ? JSON.parse(isolation) : { ...JSON.parse(isolation), containment: undefined }
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
import { afterEach } from './hook.mjs'
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', isolation: ${JSON.stringify(used)}, inner: {}, sandboxFaults: ${JSON.stringify(sandboxFaults)} } })
const response = await provider.callApi('hi', { vars: { kind: 'outcome', rubrics: '{}' } })
await afterEach({ result: { response, vars: { kind: 'outcome' }, testCase: { description: 'case-a' }, provider: { label: 'with-skill' }, repeatIndex: 0, success: true } })
console.log(JSON.stringify(response))
`,
		)
		const response = JSON.parse(execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8' }))
		const file = join(root, 'progress.jsonl')
		return { response, line: existsSync(file) ? JSON.parse(readFileSync(file, 'utf8').trim()) : undefined }
	}

	it('records the known fault a shell command hit, contained or not, and ends the run as a sandbox failure', () => {
		for (const contained of [true, false]) {
			const { response, line } = play(true, contained)
			expect(response.metadata.sandboxFault).toEqual({ fault: 'bwrap-read-only-mount', text: bwrap })
			expect(line).toMatchObject({ outcome: 'sandbox failure', reason: bwrap.slice(0, 160) })
		}
	})

	it('records nothing when no command hit one', () => {
		const { response, line } = play(false, true)
		expect(response.metadata).not.toHaveProperty('sandboxFault')
		expect(line).toMatchObject({ outcome: 'pass' })
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
		model?: { args: string[]; case?: string },
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
			command: {
				executable: join(root, 'bin', 'codex'),
				args: model?.args ?? ['exec', '--json', '--ignore-user-config'],
				modelFlag: '--model',
			},
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
console.log(JSON.stringify(await provider.callApi('write the notes', { vars: { kind: '${kind}', rubrics: ${JSON.stringify(rubrics)}${model?.case ? `, model: '${model.case}'` : ''} } })))
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

	it("replaces the run's model with a case's own, before the prompt (R161)", () => {
		const args = ['exec', '--model', 'run-model', '--json']
		expect(codex('outcome', true, undefined, { args, case: 'case-model' }).seen.args).toEqual([
			'exec',
			'--json',
			'--model',
			'case-model',
			'write the notes',
		])
		expect(codex('outcome', true, undefined, { args }).seen.args).toEqual([...args, 'write the notes'])
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
		linkSandbox(root)
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

	it.skipIf(!sandboxStarts)(
		'loads a copy of the arm plugin of its own, so a check on SKILL_TEST_PLUGIN fails when the run changed it',
		() => {
			const changed = pluginRun(true)
			expect(changed.response.output).not.toBe(changed.source)
			expect(changed.response.metadata.checks.C2).toMatchObject({ pass: false })
			expect(readFileSync(join(changed.source, 'skills', 'demo', 'SKILL.md'), 'utf8')).not.toContain('changed')
			expect(existsSync(changed.response.output)).toBe(false)
		},
	)

	it.skipIf(!sandboxStarts)('passes that check when the run left the plugin alone', () => {
		expect(pluginRun(false).response.metadata.checks.C2).toEqual({ pass: true })
	})

	/** A fake inner provider that reports what the plugin copy holds when the model would start. */
	const inspecting = String.raw`
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
exports.loadApiProvider = async (_id, { options }) => ({
  callApi: async () => {
    const plugin = options.config.plugins[0].path
    const at = (p) => path.join(plugin, p)
    const gitFile = fs.readFileSync(at('.git'), 'utf8').trim()
    const report = {
      plugin,
      gitFile,
      status: execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: plugin, encoding: 'utf8' }),
      tracked: execFileSync('git', ['ls-files'], { cwd: plugin, encoding: 'utf8' }).trim().split(/\r?\n/),
      sandbox: options.config.sandbox,
      exists: Object.fromEntries(
        ['.mcp.json', '.claude/launch.json', '.claude/workflows', 'skills/demo/.claude/launch.json', 'skills/demo/.mcp.json', 'skills/demo/references/.claude/settings.json', 'skills/demo/.claude/hooks']
          .map((p) => [p, fs.existsSync(at(p)) ? (fs.statSync(at(p)).isDirectory() ? 'folder' : fs.readFileSync(at(p), 'utf8')) : null]),
      ),
      nested: fs.existsSync(at('.claude/.claude')),
    }
    return { output: JSON.stringify(report), metadata: {} }
  },
})
`

	/** Runs one outcome run of a plugin whose root already holds an .mcp.json, through the inspecting provider. */
	function inspectCopy(): Record<string, any> {
		const root = mkdtempSync(join(tmpdir(), 'provider-plugin-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), inspecting)
		const source = join(root, 'plugin')
		mkdirSync(join(source, 'skills', 'demo', 'references'), { recursive: true })
		writeFileSync(join(source, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\n')
		writeFileSync(join(source, '.mcp.json'), '{"mcpServers":{"own":{"command":"x"}}}\n')
		// A file the author's own git ignore rules would leave out, so the placeholder is committed despite them.
		writeFileSync(join(source, '.gitignore'), 'settings.json\n')
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', pluginName: 'kit', pluginDir: ${JSON.stringify(source)}, isolation: ${isolation}, inner: {} } })
console.log(JSON.stringify(await provider.callApi('hi', { vars: { kind: 'outcome' } })))
`,
		)
		return JSON.parse(JSON.parse(execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8' })).output)
	}

	it('makes ahead, in every folder of the copy, each path the shell sandbox mounts over, so a cd into the copy keeps the shell working (E-CC-D20)', () => {
		const { exists, nested } = inspectCopy()
		expect(exists).toEqual({
			'.mcp.json': '{"mcpServers":{"own":{"command":"x"}}}\n',
			'.claude/launch.json': '{}\n',
			'.claude/workflows': 'folder',
			'skills/demo/.claude/launch.json': '{}\n',
			'skills/demo/.mcp.json': '{}\n',
			'skills/demo/references/.claude/settings.json': '{}\n',
			'skills/demo/.claude/hooks': 'folder',
		})
		expect(nested).toBe(false)
	})

	it('commits those paths, so the copy starts clean, even when ignore rules would leave them out', () => {
		const { status, tracked } = inspectCopy()
		expect(status).toBe('')
		expect(tracked).toEqual(expect.arrayContaining(['.claude/settings.json', 'skills/demo/.claude/settings.json']))
	})

	it("keeps the copy's git folder outside it, readable by the shell but not writable (E-CC-D20)", () => {
		const { plugin, gitFile, sandbox } = inspectCopy()
		const gitDir = gitFile.replace(/^gitdir: /, '')
		expect(gitDir).toMatch(/skill-test-plugin-git-/)
		expect(gitDir.startsWith(plugin)).toBe(false)
		expect(sandbox.filesystem.allowRead).toContain(gitDir)
		expect(sandbox.filesystem.allowWrite).not.toContain(gitDir)
	})
})

describe('promptfooProviderSource setup scripts and script checks (R155, R156, R157)', () => {
	/** Runs one outcome run with a setup script and rubrics through the fake promptfoo; answers its whole response. */
	function scripted({
		setup,
		rubrics = {},
		writes,
		keep,
	}: {
		setup?: string
		rubrics?: Record<string, Record<string, unknown>[]>
		writes?: string
		keep?: string
	}): {
		response: Record<string, any>
		outside: string
	} {
		const root = mkdtempSync(join(tmpdir(), 'provider-setup-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), fakePromptfoo)
		linkSandbox(root)
		mkdirSync(join(root, 'files'))
		writeFileSync(join(root, 'files', 'notes.txt'), 'hello\n')
		if (setup !== undefined) writeFileSync(join(root, 'setup.sh'), setup)
		const outside = mkdtempSync(join(tmpdir(), 'provider-outside-'))
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		const vars = {
			kind: 'outcome',
			files: join(root, 'files'),
			rubrics: JSON.stringify(rubrics),
			...(setup !== undefined ? { setup: join(root, 'setup.sh') } : {}),
		}
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', isolation: ${isolation}, inner: {}${keep ? `, keep: ${JSON.stringify(keep)}` : ''} } })
console.log(JSON.stringify(await provider.callApi('hi', { vars: ${JSON.stringify(vars)} })))
`,
		)
		const response = JSON.parse(
			execFileSync('node', [join(root, 'run.mjs')], {
				encoding: 'utf8',
				env: { ...process.env, OUTSIDE: outside, ...(writes ? { FAKE_RUN_WRITES: writes } : {}) },
			}),
		)
		return { response, outside }
	}

	it.skipIf(!sandboxStarts)(
		'starts the model from the state the setup script makes, after the case files are committed',
		() => {
			const { response } = scripted({
				setup:
					'#!/bin/sh\nset -e\necho start > start.txt\ngit add start.txt\ngit commit -q -m start\necho changed >> notes.txt\n',
			})
			const report = JSON.parse(response.output)
			expect(report.log).toBe(
				'start|skill-test|skill-test@example.invalid\ncase files|skill-test|skill-test@example.invalid',
			)
			expect(report.status).toBe('M notes.txt')
			expect(report.tracked).toBe('notes.txt\nstart.txt')
		},
	)

	it.skipIf(!sandboxStarts)(
		'with keep, stops after the setup, answers git status, and keeps the folder and home without a model call (#290)',
		() => {
			const keep = mkdtempSync(join(tmpdir(), 'provider-keep-'))
			const { response } = scripted({
				keep,
				setup:
					'#!/bin/sh\nset -e\nmkdir hooks\ngit config --global core.hooksPath "$PWD/hooks"\necho changed >> notes.txt\necho set up\n',
			})
			// An empty hooks folder is not in git status; the change to notes.txt is.
			expect(response.output).toBe(' M notes.txt\n')
			expect(response.metadata.tried).toEqual({ status: ' M notes.txt\n', said: 'set up', failed: false })
			expect(readFileSync(join(keep, 'folder', 'notes.txt'), 'utf8')).toBe('hello\nchanged\n')
			expect(existsSync(join(keep, 'folder', '.git', 'HEAD'))).toBe(true)
			expect(readFileSync(join(keep, 'home', '.gitconfig'), 'utf8')).toContain('hooksPath')
		},
	)

	it.skipIf(!sandboxStarts)(
		'with keep, keeps the folder of a setup that fails, writing under .git/hooks (#290)',
		() => {
			const keep = mkdtempSync(join(tmpdir(), 'provider-keep-'))
			const { response } = scripted({ keep, setup: '#!/bin/sh\nset -e\necho hi > .git/hooks/commit-msg\n' })
			expect(response.error).toMatch(/^setup script failed: /)
			expect(response.metadata.tried).toMatchObject({ failed: true, status: '' })
			expect(response.metadata.tried.said).toMatch(/Read-only file system|Operation not permitted|Permission denied/)
			expect(existsSync(join(keep, 'folder', 'notes.txt'))).toBe(true)
		},
	)

	it.skipIf(!sandboxStarts)('ends the run as not run with the output of a setup script that fails', () => {
		const { response } = scripted({ setup: 'echo preparing\necho "no such branch: main" >&2\nexit 3\n' })
		expect(response.output).toBeUndefined()
		expect(response.error).toBe('setup script failed: no such branch: main')
		expect(response.metadata.setupFailed.text).toContain('preparing')
		expect(response.metadata.setupFailed.text).toContain('no such branch: main')
	})

	it.skipIf(!sandboxStarts)('fails a setup script that writes outside the run folder, and writes nothing there', () => {
		const { response, outside } = scripted({ setup: 'echo escaped > "$OUTSIDE/escaped.txt"\n' })
		expect(response.error).toMatch(/^setup script failed: /)
		expect(existsSync(join(outside, 'escaped.txt'))).toBe(false)
	})

	it.skipIf(!sandboxStarts)('fails a setup script that opens a network connection', () => {
		const { response } = scripted({
			setup: `node -e "require('node:net').connect(80, '93.184.215.14').on('connect', () => process.exit(0)).on('error', (e) => { console.error(e.code); process.exit(4) })"\n`,
		})
		expect(response.error).toMatch(/^setup script failed: /)
	})

	it.skipIf(!sandboxStarts)(
		'runs a script check contained: one in the run folder passes, one that writes outside or reaches the network fails',
		() => {
			const { response, outside } = scripted({
				rubrics: {
					C1: [{ script: 'test -f notes.txt' }],
					C2: [{ script: 'echo escaped > "$OUTSIDE/escaped.txt"' }],
					C3: [
						{
							script: `node -e "require('node:net').connect(80, '93.184.215.14').on('connect', () => process.exit(0)).on('error', () => process.exit(4))"`,
						},
					],
				},
			})
			expect(response.metadata.checks.C1).toEqual({ pass: true })
			expect(response.metadata.checks.C2.pass).toBe(false)
			expect(response.metadata.checks.C3.pass).toBe(false)
			expect(existsSync(join(outside, 'escaped.txt'))).toBe(false)
		},
	)

	/** The check many criteria end with: nothing in the run's repository changed. */
	const unchanged = { C1: [{ script: 'test -z "$(git status --porcelain --untracked-files=all)"' }] }

	it.skipIf(!sandboxStarts)(
		'passes a "nothing changed" git status check for a run that wrote nothing, unmoved by what the sandbox protects',
		() => {
			expect(scripted({ rubrics: unchanged }).response.metadata.checks.C1).toEqual({ pass: true })
		},
	)

	it.skipIf(!sandboxStarts)('fails that check for a run that wrote a file', () => {
		expect(scripted({ rubrics: unchanged, writes: 'new.txt' }).response.metadata.checks.C1.pass).toBe(false)
	})

	it.skipIf(!sandboxStarts)("still refuses a script check a write to the run repository's .git/config", () => {
		const { response } = scripted({ rubrics: { C1: [{ script: 'echo "[core]" >> .git/config' }] } })
		expect(response.metadata.checks.C1.pass).toBe(false)
	})
})

describe('promptfooProviderSource usage limit (R162)', () => {
	const limitText = "You've hit your 5-hour limit · resets 4:40am (America/Los_Angeles)"
	/** A fake inner provider that counts its calls in a file and answers the usage-limit error each time. */
	const limited = (calls: string) => String.raw`
const fs = require('node:fs')
exports.loadApiProvider = async () => ({
  callApi: async () => {
    fs.appendFileSync(${JSON.stringify(calls)}, 'x')
    return { error: 'Error calling Claude Agent SDK: Error: Claude Code returned an error result: ' + ${JSON.stringify(limitText)} }
  },
})
`

	it('ends the run that hits the limit as limit reached, and starts no run after it', () => {
		const root = mkdtempSync(join(tmpdir(), 'provider-limit-'))
		const calls = join(root, 'calls.txt')
		const limitFile = join(root, 'usage-limit.json')
		const progressFile = join(root, 'progress.jsonl')
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'index.js'), limited(calls))
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(join(root, 'hook.mjs'), promptfooHookSource)
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
import { afterEach } from './hook.mjs'
const provider = new Provider({ config: { arm: 'skill', skillName: 'demo', isolation: ${isolation}, inner: {}, usageLimits: ${JSON.stringify(usageLimits)}, limitFile: ${JSON.stringify(limitFile)}, progressFile: ${JSON.stringify(progressFile)} } })
const responses = []
for (const repeatIndex of [0, 1, 2]) {
  const response = await provider.callApi('hi', { test: { description: 'case-a' }, repeatIndex, vars: { kind: 'outcome', rubrics: '{}' } })
  await afterEach({ result: { response, vars: { kind: 'outcome' }, testCase: { description: 'case-a' }, provider: { label: 'with-skill' }, repeatIndex } })
  responses.push(response)
}
console.log(JSON.stringify(responses))
`,
		)
		const responses = JSON.parse(execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8' }))
		expect(readFileSync(calls, 'utf8')).toBe('x')
		expect(JSON.parse(readFileSync(limitFile, 'utf8'))).toEqual({
			text: limitText,
			resets: '4:40am (America/Los_Angeles)',
		})
		expect(responses[0].metadata.limitReached).toEqual({
			text: limitText,
			resets: '4:40am (America/Los_Angeles)',
			started: true,
		})
		for (const later of responses.slice(1)) {
			expect(later.error).toBe(`limit reached: ${limitText}`)
			expect(later.metadata.limitReached).toMatchObject({ text: limitText, started: false })
		}
		const lines = readFileSync(progressFile, 'utf8')
			.split('\n')
			.filter(Boolean)
			.map((line) => JSON.parse(line))
		// only the run that started has a start line
		expect(lines.filter((line) => line.event === 'start')).toHaveLength(1)
		expect(lines.filter((line) => line.event === 'end')).toMatchObject([
			{ run: 1, outcome: 'limit reached', reason: limitText, started: true, resets: '4:40am (America/Los_Angeles)' },
			{ run: 2, outcome: 'limit reached', started: false },
			{ run: 3, outcome: 'limit reached', started: false },
		])
	})

	it('runs only the arms a resumed run names, under the run number it stands for (R163)', () => {
		const root = mkdtempSync(join(tmpdir(), 'provider-resume-'))
		mkdirSync(join(root, 'node_modules', 'promptfoo'), { recursive: true })
		writeFileSync(join(root, 'node_modules', 'promptfoo', 'package.json'), '{"name":"promptfoo","main":"index.js"}')
		writeFileSync(
			join(root, 'node_modules', 'promptfoo', 'index.js'),
			"exports.loadApiProvider = async () => ({ callApi: async () => ({ output: 'ok', metadata: {} }) })",
		)
		writeFileSync(join(root, 'provider.mjs'), promptfooProviderSource)
		const progressFile = join(root, 'progress.jsonl')
		writeFileSync(
			join(root, 'run.mjs'),
			`import Provider from './provider.mjs'
const vars = { kind: 'outcome', rubrics: '{}', __run: '3', __arms: '["skill"]' }
const out = []
for (const arm of ['skill', 'baseline']) {
  const provider = new Provider({ config: { arm, skillName: 'demo', isolation: ${isolation}, inner: {}, progressFile: ${JSON.stringify(progressFile)} } })
  out.push(await provider.callApi('hi', { test: { description: 'case-a' }, repeatIndex: 0, vars }))
}
console.log(JSON.stringify(out))
`,
		)
		const [skill, baseline] = JSON.parse(execFileSync('node', [join(root, 'run.mjs')], { encoding: 'utf8' }))
		expect(skill.output).toBe('ok')
		expect(baseline.metadata).toMatchObject({ skipped: true })
		expect(JSON.parse(readFileSync(progressFile, 'utf8').trim())).toMatchObject({
			event: 'start',
			arm: 'skill',
			run: 3,
		})
	})
})
