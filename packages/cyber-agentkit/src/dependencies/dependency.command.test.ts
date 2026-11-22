import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { run } from '../cli.js'

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
const printed = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join('')

let home: string
let root: string

/** Clears every harness signal the test runner itself may carry, so the running harness is what a test sets. */
function noHarness() {
	for (const key of Object.keys(process.env))
		if (
			/^(CLAUDE|CODEX|CURSOR|COPILOT|OPENCODE|KILO|GEMINI|QWEN|CLINE|CRUSH|OPENHANDS|AUGMENT|AI_AGENT|VSCODE|TERM_PROGRAM)/.test(
				key,
			)
		)
			vi.stubEnv(key, undefined)
}

beforeEach(() => {
	noHarness()
	home = realpathSync(mkdtempSync(join(tmpdir(), 'dependency-doctor-home-')))
	root = realpathSync(mkdtempSync(join(tmpdir(), 'dependency-doctor-root-')))
	vi.stubEnv('HOME', home)
	vi.stubEnv('USERPROFILE', home)
})

afterEach(() => {
	vi.unstubAllEnvs()

	stdout.mockClear()
	stderr.mockClear()
})

function put(path: string, content: string) {
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
}

/** Claude Code's install record and user settings, with each install's folder under the cache. */
function claudeState(installed: string[], enabledPlugins: Record<string, boolean>) {
	put(
		join(home, '.claude/plugins/installed_plugins.json'),
		JSON.stringify({
			version: 2,
			plugins: Object.fromEntries(
				installed.map((id) => [id, [{ scope: 'user', installPath: join(home, 'cache', id), version: '1.0.0' }]]),
			),
		}),
	)
	put(join(home, '.claude/settings.json'), JSON.stringify({ enabledPlugins }))
}

/** A plugin folder whose `.claude-plugin/plugin.json` lists `dependencies`. */
function plugin(dependencies: unknown[], at = join(root, 'plugin')) {
	put(join(at, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'p', dependencies }))
	return at
}

async function doctor(...args: string[]) {
	stdout.mockClear()
	const code = await run(['node', 'cyber-agentkit', 'dependency', 'doctor', ...args, '--format', 'json'])
	return { code, out: JSON.parse(printed()) }
}

const codes = (out: { problems?: { code: string }[] }) => (out.problems ?? []).map(({ code }) => code)

describe('dependency doctor', () => {
	it('exits 0 with dependency-missing for a missing dependency', async () => {
		claudeState(['lintbot@forge'], {})
		const { code, out } = await doctor('--plugin', plugin(['tracer@acme']), '--harness', 'claude-code')
		expect(code).toBe(0)
		expect(out.status).toBe('not-ready')
		expect(out.dependencies).toEqual([{ name: 'tracer', marketplace: 'acme', state: 'missing' }])
		expect(out.problems).toEqual([
			{ code: 'dependency-missing', dependency: 'tracer@acme', message: expect.any(String) },
		])
		expect(out.steps.at(-1)).toBe('Run /reload-plugins.')
	})

	it('exits 0 with dependency-disabled for a disabled dependency', async () => {
		claudeState(['tracer@acme'], { 'tracer@acme': false })
		const { code, out } = await doctor('--plugin', plugin(['tracer@acme']), '--harness', 'claude-code')
		expect(code).toBe(0)
		expect(codes(out)).toEqual(['dependency-disabled'])
	})

	it('exits 0 with dependency-unknown when the harness keeps no install record', async () => {
		const { code, out } = await doctor('--plugin', plugin(['tracer@acme']), '--harness', 'cursor')
		expect(code).toBe(0)
		expect(out.dependencies).toEqual([{ name: 'tracer', marketplace: 'acme', state: 'unknown' }])
		expect(codes(out)).toEqual(['dependency-unknown'])
	})

	it('is ready with no problems and no steps when every dependency is enabled or installed', async () => {
		claudeState(['tracer@acme', 'lintbot@acme'], { 'tracer@acme': true })
		const { code, out } = await doctor('--plugin', plugin(['tracer@acme', 'lintbot@acme']), '--harness', 'claude-code')
		expect(code).toBe(0)
		expect(out.status).toBe('ready')
		expect(out.problems).toBeUndefined()
		expect(out.steps).toBeUndefined()
	})

	it('lists every problem, an unparsable manifest beside a missing dependency from a later source', async () => {
		claudeState(['lintbot@forge'], {})
		const at = plugin(['tracer@acme'])
		put(join(at, 'plugin.json'), '{')
		const { code, out } = await doctor('--plugin', at, '--harness', 'claude-code')
		expect(code).toBe(0)
		expect(codes(out)).toEqual(['manifest-unparsable', 'dependency-missing'])
	})

	it('reports manifest-unparsable even when the later source is all enabled', async () => {
		claudeState(['tracer@acme'], { 'tracer@acme': true })
		const at = plugin(['tracer@acme'])
		put(join(at, 'plugin.json'), '{')
		const { code, out } = await doctor('--plugin', at, '--harness', 'claude-code')
		expect(code).toBe(0)
		expect(out.status).toBe('not-ready')
		expect(codes(out)).toEqual(['manifest-unparsable'])
	})

	it.each([
		['lists nothing', []],
		['lists only malformed entries', [7, null, { name: 3 }]],
	])('says a plugin that %s declares none, with no steps, no warning, and exit 0', async (_, dependencies) => {
		const { code, out } = await doctor('--plugin', plugin(dependencies), '--harness', 'claude-code')
		expect(code).toBe(0)
		expect(out.status).toBe('ready')
		expect(out.dependencies).toMatch(/declares no dependencies/)
		expect(out.steps).toBeUndefined()
		expect(stderr).not.toHaveBeenCalled()
	})

	it('says an empty plugin folder declares none', async () => {
		mkdirSync(join(root, 'empty'))
		const { code, out } = await doctor('--plugin', join(root, 'empty'), '--harness', 'codex')
		expect(code).toBe(0)
		expect(out.dependencies).toMatch(/declares no dependencies/)
	})

	it('resolves a bare name in the marketplace the plugin was installed from', async () => {
		claudeState(['p@acme', 'tracer@acme', 'tracer@other'], { 'tracer@acme': true, 'tracer@other': false })
		const at = plugin(['tracer'], join(home, 'cache', 'p@acme'))
		const { code, out } = await doctor('--plugin', at, '--harness', 'claude-code')
		expect(code).toBe(0)
		expect(out.declaringMarketplace).toBe('acme')
		expect(out.dependencies).toEqual([{ name: 'tracer', state: 'enabled', id: 'tracer@acme' }])
		expect(out.status).toBe('ready')
	})

	it('reports a bare name as unknown when the plugin folder is not installed', async () => {
		claudeState(['tracer@acme'], { 'tracer@acme': true })
		const { code, out } = await doctor('--plugin', plugin(['tracer']), '--harness', 'claude-code')
		expect(code).toBe(0)
		expect(codes(out)).toEqual(['dependency-unknown'])
		expect(out.steps).toHaveLength(1)
	})

	it('reads the current folder when --plugin is left out', async () => {
		claudeState(['lintbot@forge'], {})
		vi.spyOn(process, 'cwd').mockReturnValue(plugin(['tracer@acme']))
		const { out } = await doctor('--harness', 'claude-code')
		expect(out.dependencies).toEqual([{ name: 'tracer', marketplace: 'acme', state: 'missing' }])
		vi.mocked(process.cwd).mockRestore()
	})

	it('uses the harness detected running when --harness is left out', async () => {
		vi.stubEnv('CLAUDECODE', '1')
		vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'session')
		claudeState([], {})
		const { code, out } = await doctor('--plugin', plugin(['tracer@acme']))
		expect(code).toBe(0)
		expect(out.harness).toBe('claude-code')
	})

	it('uses an explicit --harness as given', async () => {
		vi.stubEnv('CLAUDECODE', '1')
		vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'session')
		const { out } = await doctor('--plugin', plugin(['tracer@acme']), '--harness', 'cursor')
		expect(out.harness).toBe('cursor')
		expect(out.dependencies).toEqual([{ name: 'tracer', marketplace: 'acme', state: 'unknown' }])
	})

	it('exits 1 with harness-not-detected and a step to pass --harness when no harness is detected', async () => {
		const { code, out } = await doctor('--plugin', plugin(['tracer@acme']))
		expect(code).toBe(1)
		expect(out.code).toBe('harness-not-detected')
		expect(out.help.join('\n')).toMatch(/--harness/)
	})

	it.each([
		['an unknown option', ['--nonsense']],
		['a --plugin path that does not exist', ['--plugin', '/no/such/plugin', '--harness', 'claude-code']],
		['an unknown harness', ['--harness', 'vscode']],
	])('exits 2 for %s', async (_, args) => {
		stdout.mockClear()
		const code = await run(['node', 'cyber-agentkit', 'dependency', 'doctor', ...args])
		expect(code).toBe(2)
	})

	it('changes no plugin or settings file', async () => {
		claudeState(['lintbot@forge', 'off@acme'], { 'off@acme': false })
		const at = plugin(['tracer@acme', 'off@acme', 'bare'])
		const files = [
			join(home, '.claude/plugins/installed_plugins.json'),
			join(home, '.claude/settings.json'),
			join(at, '.claude-plugin/plugin.json'),
		]
		const before = files.map((file) => readFileSync(file))
		await doctor('--plugin', at, '--harness', 'claude-code')
		expect(files.map((file) => readFileSync(file))).toEqual(before)
	})
})
