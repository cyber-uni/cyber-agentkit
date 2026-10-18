import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkPluginDependencies, declaredPluginDependencies, readPluginDependencies } from './plugin-dependencies.js'

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

	it('prefers org.spikyuni.plugin-manager over the older namespace', async () => {
		await put(
			join(root, 'p/plugin.json'),
			JSON.stringify({
				extensions: {
					'org.cyberuni.universal-plugin': { dependencies: ['old'] },
					'org.spikyuni.plugin-manager': { dependencies: ['new'] },
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
})

describe('checkPluginDependencies on Claude Code', () => {
	it('classifies each dependency and returns steps for the missing and disabled', async () => {
		await claudeState(['on@m', 'off@m', 'bare@other'], { 'on@m': true, 'off@m': false })

		const check = await checkPluginDependencies('claude-code', {
			...environment(),
			dependencies: [
				{ name: 'on', marketplace: 'm' },
				{ name: 'off', marketplace: 'm' },
				{ name: 'bare' },
				{ name: 'gone', marketplace: 'x' },
				{ name: 'nomarket' },
			],
		})

		expect(check.supported).toBe(true)
		expect(check.autoResolved).toBe(true)
		expect(check.dependencies.map((d) => [d.name, d.state, d.id])).toEqual([
			['on', 'enabled', 'on@m'],
			['off', 'disabled', 'off@m'],
			['bare', 'installed', 'bare@other'],
			['gone', 'missing', undefined],
			['nomarket', 'missing', undefined],
		])
		expect(check.steps).toEqual([
			'Enable off@m: set it to true in enabledPlugins.',
			'Install gone@x: claude plugin install gone@x',
			"If gone@x is not in the declaring plugin's marketplace, that marketplace's root must list x in allowCrossMarketplaceDependenciesOn, or you must already have it enabled.",
			'Install nomarket: claude plugin install nomarket',
			'Run /reload-plugins.',
		])
	})

	it('matches a marketplace-qualified dependency only in that marketplace', async () => {
		await claudeState(['a@other'], { 'a@other': true })
		const check = await checkPluginDependencies('claude-code', {
			...environment(),
			dependencies: [{ name: 'a', marketplace: 'm' }],
		})
		expect(check.dependencies[0]?.state).toBe('missing')
	})

	it('has no steps when everything is enabled', async () => {
		await claudeState(['a@m'], { 'a@m': true })
		const check = await checkPluginDependencies('claude-code', {
			...environment(),
			dependencies: [{ name: 'a', marketplace: 'm' }],
		})
		expect(check.steps).toEqual([])
	})

	it('reads the declaration from pluginRoot', async () => {
		await claudeState([], {})
		await put(join(root, 'p/.claude-plugin/plugin.json'), JSON.stringify({ dependencies: ['a@m'] }))
		const check = await checkPluginDependencies('claude-code', { ...environment(), pluginRoot: join(root, 'p') })
		expect(check.dependencies).toEqual([{ name: 'a', marketplace: 'm', state: 'missing' }])
	})
})

describe('checkPluginDependencies on a harness without dependency support', () => {
	it('returns manual steps and says nothing is resolved', async () => {
		const check = await checkPluginDependencies('cursor', {
			...environment(),
			dependencies: [{ name: 'a', marketplace: 'm' }, { name: 'b' }],
		})
		expect(check.supported).toBe(false)
		expect(check.autoResolved).toBe(false)
		expect(check.steps).toEqual([
			'cursor has no plugin dependency field, so nothing is resolved for you. Install and enable each plugin yourself.',
			"Install a from m through cursor's plugin install flow, then enable it.",
			"Install b through cursor's plugin install flow, then enable it.",
		])
	})

	it('has no steps when nothing is declared', async () => {
		expect((await checkPluginDependencies('cursor', environment())).steps).toEqual([])
	})
})
