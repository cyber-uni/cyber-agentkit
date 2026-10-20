import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { enabledPlugins } from './enabled-plugins.js'

let root: string
let home: string
let project: string

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'agent-harness-'))
	home = join(root, 'home')
	project = join(root, 'project')
	await mkdir(project, { recursive: true })
})

afterEach(async () => {
	await rm(root, { recursive: true, force: true })
})

async function put(path: string, content: string) {
	await mkdir(dirname(path), { recursive: true })
	await writeFile(path, content)
}

const environment = () => ({ env: {}, homedir: home, cwd: project, platform: 'linux' as const })

describe('enabledPlugins', () => {
	it('reads Claude Code enabledPlugins from user settings', async () => {
		await put(join(home, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'a@m': true, 'b@m': false } }))

		const result = await enabledPlugins('claude-code', environment())

		expect(result.supported).toBe(true)
		expect(result.plugins).toEqual([
			{ id: 'a@m', enabled: true, scope: 'user', source: join(home, '.claude/settings.json') },
			{ id: 'b@m', enabled: false, scope: 'user', source: join(home, '.claude/settings.json') },
		])
	})

	it('resolves each Claude Code plugin by scope: managed, then local, then project, then user', async () => {
		const managed = join(root, 'etc/managed-settings.json')
		await put(managed, JSON.stringify({ enabledPlugins: { 'm@x': false } }))
		await put(
			join(project, '.claude/settings.local.json'),
			JSON.stringify({ enabledPlugins: { 'l@x': true, 'm@x': true } }),
		)
		await put(join(project, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'p@x': true, 'l@x': false } }))
		await put(join(home, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'u@x': true, 'p@x': false } }))

		const result = await enabledPlugins('claude-code', { ...environment(), managedSettingsPath: managed })

		expect(Object.fromEntries(result.plugins.map((p) => [p.id, [p.enabled, p.scope]]))).toEqual({
			'm@x': [false, 'managed'],
			'l@x': [true, 'local'],
			'p@x': [true, 'project'],
			'u@x': [true, 'user'],
		})
		expect(result.sources.map((s) => s.scope)).toEqual(['managed', 'local', 'project', 'user'])
	})

	it('reads the Claude Code managed settings file from its documented location by default', async () => {
		const result = await enabledPlugins('claude-code', environment())

		expect(result.sources[0]).toEqual({
			scope: 'managed',
			path: '/etc/claude-code/managed-settings.json',
			found: false,
		})
	})

	it('names the Claude Code policy sources it does not read', async () => {
		const result = await enabledPlugins('claude-code', { ...environment(), platform: 'darwin' })

		expect(result.unread).toEqual([
			'server-managed settings (claude.ai admin console or a self-hosted Claude apps gateway)',
			'MDM managed preferences (com.anthropic.claudecode)',
			'drop-in managed settings (/Library/Application Support/ClaudeCode/managed-settings.d)',
		])
	})

	it('reads Codex plugin tables from config.toml under $CODEX_HOME', async () => {
		const config = join(root, 'codex-home/config.toml')
		await put(
			config,
			[
				'model = "gpt-5"',
				'',
				'[plugins."canva@openai-curated"]',
				'enabled = true',
				'',
				"[plugins.'sdd@cyberplace'] # a comment",
				'enabled=false',
				'',
				'[projects."/home/u/repo"]',
				'enabled = true',
				'',
				'[plugins."no-flag@x"]',
				'other = 1',
			].join('\n'),
		)

		const result = await enabledPlugins('codex', { ...environment(), env: { CODEX_HOME: join(root, 'codex-home') } })

		expect(result.supported).toBe(true)
		expect(result.plugins).toEqual([
			{ id: 'canva@openai-curated', enabled: true, scope: 'user', source: config },
			{ id: 'sdd@cyberplace', enabled: false, scope: 'user', source: config },
		])
		expect(result.unread).toContain('server-managed settings (ChatGPT workspace admin settings)')
	})

	it('resolves Copilot CLI plugins across managed, local, repository, and user settings with comments', async () => {
		const managed = join(root, 'etc/github-copilot/managed-settings.json')
		await put(managed, '{ "enabledPlugins": { "pinned@m": false } }')
		await put(
			join(project, '.github/copilot/settings.local.json'),
			'// personal\n{ "enabledPlugins": { "local@m": true, "pinned@m": true, } }',
		)
		await put(
			join(project, '.github/copilot/settings.json'),
			'{\n  /* shared */ "enabledPlugins": { "repo@m": true, "local@m": false }\n}',
		)
		await put(join(root, 'copilot-home/settings.json'), '{ "enabledPlugins": { "user@m": true, "url//x@m": true } }')

		const result = await enabledPlugins('copilot-cli', {
			...environment(),
			env: { COPILOT_HOME: join(root, 'copilot-home') },
			managedSettingsPath: managed,
		})

		expect(Object.fromEntries(result.plugins.map((p) => [p.id, [p.enabled, p.scope]]))).toEqual({
			'pinned@m': [false, 'managed'],
			'local@m': [true, 'local'],
			'repo@m': [true, 'project'],
			'user@m': [true, 'user'],
			'url//x@m': [true, 'user'],
		})
		expect(result.unread).toEqual(
			expect.arrayContaining([
				expect.stringContaining('.github-private'),
				expect.stringContaining(join(project, '.claude/settings.json')),
			]),
		)
	})

	it('reports Cursor as unsupported, since it keeps no enabled-plugin record', async () => {
		expect(await enabledPlugins('cursor', environment())).toMatchObject({ supported: false, plugins: [], sources: [] })
	})

	it.each([
		'opencode',
		'kilo',
		'gemini-cli',
		'qwen-code',
		'vscode-copilot',
		'cline',
		'crush',
		'openhands',
		'augment',
	] as const)(
		'reports %s as unsupported, since it keeps no enabled-plugin record this package can resolve',
		async (harness) => {
			expect(await enabledPlugins(harness, environment())).toMatchObject({ supported: false, plugins: [], sources: [] })
		},
	)

	it('records a settings file it cannot parse and ignores its entries', async () => {
		await put(join(home, '.claude/settings.json'), '{ not json')

		const result = await enabledPlugins('claude-code', environment())

		expect(result.plugins).toEqual([])
		expect(result.sources.at(-1)).toMatchObject({ scope: 'user', found: true, error: expect.any(String) })
	})
})
