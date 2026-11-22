import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
	checkPluginDependencies,
	declaredPluginDependencies,
	type PluginDependency,
	readPluginDependencies,
} from './plugin-dependencies.js'

describe('declaredPluginDependencies', () => {
	it('reads the three entry forms', () => {
		expect(
			declaredPluginDependencies({
				dependencies: ['a', 'b@m', { name: 'c', marketplace: 'n', version: '^1' }, { name: 'd@o' }],
			}),
		).toEqual([
			{ name: 'a' },
			{ name: 'b', marketplace: 'm' },
			{ name: 'c', marketplace: 'n', version: '^1' },
			{ name: 'd', marketplace: 'o' },
		])
	})

	it('prefers an object marketplace over an inline one', () => {
		expect(declaredPluginDependencies({ dependencies: [{ name: 'a@x', marketplace: 'y' }] })).toEqual([
			{ name: 'a', marketplace: 'y' },
		])
	})

	it('skips malformed entries and declares none without an array', () => {
		expect(declaredPluginDependencies({ dependencies: [1, null, '', {}, { name: 2 }] })).toEqual([])
		expect(declaredPluginDependencies({ dependencies: 'a' })).toEqual([])
		expect(declaredPluginDependencies({})).toEqual([])
		expect(declaredPluginDependencies(undefined)).toEqual([])
	})
})

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

async function claudeState(installed: string[], enabledPlugins: Record<string, boolean>) {
	await put(
		join(home, '.claude/plugins/installed_plugins.json'),
		JSON.stringify({
			version: 2,
			plugins: Object.fromEntries(
				installed.map((id) => [id, [{ scope: 'user', installPath: join(home, 'cache', id), version: '1.0.0' }]]),
			),
		}),
	)
	await put(join(home, '.claude/settings.json'), JSON.stringify({ enabledPlugins }))
}

describe('readPluginDependencies', () => {
	it('reads .claude-plugin/plugin.json', async () => {
		await put(join(root, 'p/.claude-plugin/plugin.json'), JSON.stringify({ name: 'p', dependencies: ['a@m'] }))
		const read = await readPluginDependencies(join(root, 'p'))
		expect(read.dependencies).toEqual([{ name: 'a', marketplace: 'm' }])
	})

	it('prefers the universal-plugin extension in the root plugin.json', async () => {
		await put(
			join(root, 'p/plugin.json'),
			JSON.stringify({ extensions: { 'org.cyberuni.universal-plugin': { dependencies: ['x'] } } }),
		)
		await put(join(root, 'p/.claude-plugin/plugin.json'), JSON.stringify({ dependencies: ['y'] }))
		const read = await readPluginDependencies(join(root, 'p'))
		expect(read.dependencies).toEqual([{ name: 'x' }])
		expect(read.path).toBe(join(root, 'p/plugin.json'))
	})

	it('prefers io.github.cyber-uni.plugin-manager over the older namespace', async () => {
		await put(
			join(root, 'p/plugin.json'),
			JSON.stringify({
				extensions: {
					'org.cyberuni.universal-plugin': { dependencies: ['old'] },
					'io.github.cyber-uni.plugin-manager': { dependencies: ['new'] },
				},
			}),
		)
		expect((await readPluginDependencies(join(root, 'p'))).dependencies).toEqual([{ name: 'new' }])
	})

	it('declares none for a missing manifest and reports an unparsable one', async () => {
		expect((await readPluginDependencies(join(root, 'none'))).dependencies).toEqual([])
		await put(join(root, 'bad/.claude-plugin/plugin.json'), '{')
		const read = await readPluginDependencies(join(root, 'bad'))
		expect(read.dependencies).toEqual([])
		expect(read.error).toBeDefined()
	})

	it('reports an unparsable manifest even when a later source lists the dependencies', async () => {
		await put(join(root, 'p/plugin.json'), '{')
		await put(join(root, 'p/.claude-plugin/plugin.json'), JSON.stringify({ dependencies: ['formatter'] }))
		const read = await readPluginDependencies(join(root, 'p'))
		expect(read.dependencies).toEqual([{ name: 'formatter' }])
		expect(read.error).toContain(join(root, 'p/plugin.json'))
	})
})

describe('checkPluginDependencies on Claude Code', () => {
	it('classifies each dependency', async () => {
		await claudeState(['on@m', 'off@m', 'set@m'], { 'on@m': true, 'off@m': false })

		const check = await checkPluginDependencies('claude-code', {
			...environment(),
			dependencies: [
				{ name: 'on', marketplace: 'm' },
				{ name: 'off', marketplace: 'm' },
				{ name: 'set', marketplace: 'm' },
				{ name: 'gone', marketplace: 'x' },
			],
		})

		expect(check.supported).toBe(true)
		expect(check.autoResolved).toBe(true)
		expect(check.dependencies.map((d) => [d.name, d.state, d.id])).toEqual([
			['on', 'enabled', 'on@m'],
			['off', 'disabled', 'off@m'],
			['set', 'installed', 'set@m'],
			['gone', 'missing', undefined],
		])
	})

	it('reports a requested version without letting it change the state', async () => {
		await claudeState(['a@m'], { 'a@m': true })
		const check = await checkPluginDependencies('claude-code', {
			...environment(),
			dependencies: [{ name: 'a', marketplace: 'm', version: '9.0.0' }],
		})
		expect(check.dependencies).toEqual([{ name: 'a', marketplace: 'm', version: '9.0.0', state: 'enabled', id: 'a@m' }])
	})

	it('resolves a bare name in the declaring marketplace passed in', async () => {
		await claudeState(['a@m'], { 'a@m': true })
		const check = await checkPluginDependencies('claude-code', {
			...environment(),
			declaringMarketplace: 'm',
			dependencies: [{ name: 'a' }],
		})
		expect(check.dependencies[0]).toMatchObject({ state: 'enabled', id: 'a@m' })
	})

	it('never satisfies a bare name with a same-named install from another marketplace', async () => {
		await claudeState(['a@other'], { 'a@other': true })
		const check = await checkPluginDependencies('claude-code', {
			...environment(),
			declaringMarketplace: 'm',
			dependencies: [{ name: 'a' }],
		})
		expect(check.dependencies[0]?.state).toBe('missing')
	})

	it('resolves a bare name in the marketplace the plugin root is installed from', async () => {
		await claudeState(['p@m', 'a@m', 'a@other'], { 'p@m': true, 'a@m': true, 'a@other': false })
		await put(join(home, 'cache', 'p@m', '.claude-plugin/plugin.json'), JSON.stringify({ dependencies: ['a'] }))
		const check = await checkPluginDependencies('claude-code', {
			...environment(),
			pluginRoot: join(home, 'cache', 'p@m'),
		})
		expect(check.dependencies).toEqual([{ name: 'a', state: 'enabled', id: 'a@m' }])
	})

	it('lets a passed declaring marketplace win over the one the plugin root is installed from', async () => {
		await claudeState(['p@forge', 'a@acme'], { 'a@acme': true })
		await put(join(home, 'cache', 'p@forge', '.claude-plugin/plugin.json'), JSON.stringify({ dependencies: ['a'] }))
		const check = await checkPluginDependencies('claude-code', {
			...environment(),
			pluginRoot: join(home, 'cache', 'p@forge'),
			declaringMarketplace: 'acme',
		})
		expect(check.dependencies[0]?.state).toBe('enabled')
	})

	it('reports a bare name as unknown when the declaring marketplace is not known', async () => {
		await claudeState(['a@m'], { 'a@m': true })
		await put(join(root, 'dev/.claude-plugin/plugin.json'), JSON.stringify({ dependencies: ['a'] }))
		const check = await checkPluginDependencies('claude-code', { ...environment(), pluginRoot: join(root, 'dev') })
		expect(check.dependencies).toEqual([{ name: 'a', state: 'unknown' }])
	})

	it('matches a marketplace-qualified dependency only in that marketplace', async () => {
		await claudeState(['a@other'], { 'a@other': true })
		const check = await checkPluginDependencies('claude-code', {
			...environment(),
			dependencies: [{ name: 'a', marketplace: 'm' }],
		})
		expect(check.dependencies[0]?.state).toBe('missing')
	})

	it('reads the declaration from pluginRoot', async () => {
		await claudeState([], {})
		await put(join(root, 'p/.claude-plugin/plugin.json'), JSON.stringify({ dependencies: ['a@m'] }))
		const check = await checkPluginDependencies('claude-code', { ...environment(), pluginRoot: join(root, 'p') })
		expect(check.dependencies).toEqual([{ name: 'a', marketplace: 'm', state: 'missing' }])
	})
})

describe('Claude Code steps', () => {
	const steps = async (dependencies: PluginDependency[], declaringMarketplace?: string) =>
		(
			await checkPluginDependencies('claude-code', {
				...environment(),
				dependencies,
				...(declaringMarketplace && { declaringMarketplace }),
			})
		).steps

	it('orders install, the marketplace question, the add-the-marketplace step, then reload', async () => {
		await claudeState([], {})
		const got = await steps([{ name: 'tracer', marketplace: 'acme' }], 'forge')
		expect(got).toHaveLength(4)
		expect(got[0]).toBe('Install tracer@acme: claude plugin install tracer@acme')
		expect(got[1]).toMatch(/Check that the marketplace acme is added/)
		expect(got[2]).toMatch(
			/^Add the marketplace acme: .*allowCrossMarketplaceDependenciesOn.*already have tracer@acme enabled/,
		)
		expect(got[3]).toBe('Run /reload-plugins.')
	})

	it('gives the same steps for the same input', async () => {
		await claudeState(['off@m'], { 'off@m': false })
		const input: PluginDependency[] = [
			{ name: 'a', marketplace: 'x' },
			{ name: 'off', marketplace: 'm' },
			{ name: 'b' },
		]
		expect(await steps(input, 'm')).toEqual(await steps(input, 'm'))
		expect(await steps(input, 'm')).toEqual([
			'Install a@x: claude plugin install a@x',
			'Check that the marketplace x is added to Claude Code, and add it if it is not.',
			expect.stringMatching(/^Add the marketplace x:/),
			'Enable off@m: set it to true in enabledPlugins.',
			'Install b@m: claude plugin install b@m',
			'Run /reload-plugins.',
		])
	})

	it('gives only an enable step and a reload step for a disabled dependency', async () => {
		await claudeState(['tracer@acme'], { 'tracer@acme': false })
		expect(await steps([{ name: 'tracer', marketplace: 'acme' }])).toEqual([
			'Enable tracer@acme: set it to true in enabledPlugins.',
			'Run /reload-plugins.',
		])
	})

	it('explains an unknown bare name, guesses no command, and gives no reload step', async () => {
		await claudeState(['tracer@acme'], { 'tracer@acme': true })
		const got = await steps([{ name: 'tracer' }])
		expect(got).toHaveLength(1)
		expect(got[0]).toMatch(/marketplace of the plugin that declares it is not known/)
		expect(got[0]).toMatch(/tracer@<marketplace>/)
		expect(got.join('\n')).not.toMatch(/plugin install|reload/)
	})

	it('installs a missing bare name from the declaring marketplace, with no marketplace steps', async () => {
		await claudeState([], {})
		expect(await steps([{ name: 'tracer' }], 'acme')).toEqual([
			'Install tracer@acme: claude plugin install tracer@acme',
			'Run /reload-plugins.',
		])
	})

	it('adds no add-the-marketplace step when the marketplace is the declaring one', async () => {
		await claudeState([], {})
		const got = await steps([{ name: 'tracer', marketplace: 'acme' }], 'acme')
		expect(got.join('\n')).not.toMatch(/allowCrossMarketplaceDependenciesOn/)
		expect(got).toHaveLength(3)
	})

	it('adds the add-the-marketplace step when the declaring marketplace is unknown', async () => {
		await claudeState([], {})
		expect((await steps([{ name: 'tracer', marketplace: 'acme' }])).join('\n')).toMatch(
			/allowCrossMarketplaceDependenciesOn/,
		)
	})

	it('gives no step for an enabled or installed dependency', async () => {
		await claudeState(['a@m', 'b@m'], { 'a@m': true })
		expect(
			await steps([
				{ name: 'a', marketplace: 'm' },
				{ name: 'b', marketplace: 'm' },
			]),
		).toEqual([])
	})
})

describe('checkPluginDependencies on a harness without dependency support', () => {
	const nothingInstalled = /^(codex|cursor) has no plugin dependency field, so nothing is installed for you\./

	async function codexState(installed: string[], config: string) {
		for (const id of installed) {
			const [name, marketplace] = id.split('@') as [string, string]
			await put(join(home, '.codex/plugins/cache', marketplace, name, '1.0.0/.codex-plugin/plugin.json'), '{}')
		}
		await put(join(home, '.codex/config.toml'), config)
	}

	it('reports states as Claude Code does', async () => {
		await codexState(['on@m', 'off@m'], '[plugins."on@m"]\nenabled = true\n[plugins."off@m"]\nenabled = false\n')
		const check = await checkPluginDependencies('codex', {
			...environment(),
			dependencies: [
				{ name: 'on', marketplace: 'm' },
				{ name: 'off', marketplace: 'm' },
				{ name: 'gone', marketplace: 'm' },
				{ name: 'bare' },
			],
		})
		expect(check.supported).toBe(false)
		expect(check.autoResolved).toBe(false)
		expect(check.dependencies.map((d) => d.state)).toEqual(['enabled', 'disabled', 'missing', 'unknown'])
		expect(check.steps[0]).toMatch(nothingInstalled)
		expect(check.steps.slice(1)).toEqual([
			"Enable off@m through codex's plugin settings.",
			"Install gone from m through codex's plugin install flow, then enable it.",
			'Check that the marketplace m is added to codex, and add it if it is not.',
			expect.stringMatching(/^bare names no marketplace/),
		])
		expect(check.steps.join('\n')).not.toMatch(/claude plugin install|reload/)
	})

	it('gives no steps when every dependency is enabled', async () => {
		await codexState(['on@m'], '[plugins."on@m"]\nenabled = true\n')
		const check = await checkPluginDependencies('codex', {
			...environment(),
			dependencies: [{ name: 'on', marketplace: 'm' }],
		})
		expect(check.steps).toEqual([])
	})

	it('reports every dependency unknown with manual steps when the harness keeps no install record', async () => {
		const check = await checkPluginDependencies('cursor', {
			...environment(),
			dependencies: [{ name: 'a', marketplace: 'm' }],
		})
		expect(check.dependencies.map((d) => d.state)).toEqual(['unknown'])
		expect(check.steps).toEqual([
			expect.stringMatching(nothingInstalled),
			"Check whether a from m is installed and enabled in cursor. If it is not, install it through cursor's plugin install flow, then enable it.",
		])
	})

	it('has no steps when nothing is declared', async () => {
		expect((await checkPluginDependencies('cursor', environment())).steps).toEqual([])
	})
})
