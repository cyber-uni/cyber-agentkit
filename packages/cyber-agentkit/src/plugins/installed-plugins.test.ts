import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { harnessIds } from '../harness/harness-id.js'
import { installedPlugins } from './installed-plugins.js'

let root: string
let home: string

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'agent-harness-'))
	home = join(root, 'home')
})

afterEach(async () => {
	await rm(root, { recursive: true, force: true })
})

async function put(path: string, content: string) {
	await mkdir(dirname(path), { recursive: true })
	await writeFile(path, content)
}

const environment = (env: Record<string, string> = {}) => ({
	env,
	homedir: home,
	cwd: root,
	platform: 'linux' as const,
})

describe('installedPlugins', () => {
	describe('claude-code', () => {
		const record = () => join(home, '.claude/plugins/installed_plugins.json')

		it('reads each install from installed_plugins.json', async () => {
			await put(
				record(),
				JSON.stringify({
					version: 2,
					plugins: {
						'a@m': [
							{ scope: 'user', installPath: '/cache/m/a/1.0.0', version: '1.0.0', installedAt: 'x' },
							{ scope: 'project', projectPath: '/repo', installPath: '/cache/m/a/abc123', version: 'abc123' },
						],
						'b@m': [{ scope: 'user', installPath: '/cache/m/b/2.0.0' }],
					},
				}),
			)

			const result = await installedPlugins('claude-code', environment())

			expect(result.supported).toBe(true)
			expect(result.plugins).toEqual([
				{ id: 'a@m', path: '/cache/m/a/1.0.0', version: '1.0.0', scope: 'user', research: ['E-CC-P2'] },
				{
					id: 'a@m',
					path: '/cache/m/a/abc123',
					version: 'abc123',
					scope: 'project',
					projectPath: '/repo',
					research: ['E-CC-P2'],
				},
				{ id: 'b@m', path: '/cache/m/b/2.0.0', scope: 'user', research: ['E-CC-P2'] },
			])
			expect(result.sources).toEqual([{ path: record(), found: true }])
		})

		it('follows CLAUDE_CONFIG_DIR', async () => {
			const configDir = join(root, 'claude')
			await put(join(configDir, 'plugins/installed_plugins.json'), JSON.stringify({ plugins: {} }))

			const result = await installedPlugins('claude-code', environment({ CLAUDE_CONFIG_DIR: configDir }))

			expect(result.sources).toEqual([{ path: join(configDir, 'plugins/installed_plugins.json'), found: true }])
		})

		it('skips entries without an installPath and drops an unknown scope', async () => {
			await put(
				record(),
				JSON.stringify({ plugins: { 'a@m': [{ scope: 'user' }, { scope: 'weird', installPath: '/p' }], 'b@m': 'x' } }),
			)

			const result = await installedPlugins('claude-code', environment())

			expect(result.plugins).toEqual([{ id: 'a@m', path: '/p', research: ['E-CC-P2'] }])
		})

		it('reports a missing record as not found', async () => {
			const result = await installedPlugins('claude-code', environment())

			expect(result.plugins).toEqual([])
			expect(result.sources).toEqual([{ path: record(), found: false }])
		})

		it('reports an unparsable record as an error', async () => {
			await put(record(), '{ nope')

			const result = await installedPlugins('claude-code', environment())

			expect(result.plugins).toEqual([])
			expect(result.sources[0]?.found).toBe(true)
			expect(result.sources[0]?.error).toMatch(/JSON/)
		})
	})

	describe('codex', () => {
		const cache = () => join(home, '.codex/plugins/cache')
		const version = (marketplace: string, plugin: string, name: string) =>
			put(join(cache(), marketplace, plugin, name, '.codex-plugin/plugin.json'), '{}')

		it('reports each cached plugin at its only version', async () => {
			await version('m', 'a', '1.0.0')
			await version('n', 'b', '1dc19589')

			const result = await installedPlugins('codex', environment())

			expect(result.supported).toBe(true)
			expect(result.plugins).toEqual([
				{ id: 'a@m', path: join(cache(), 'm/a/1.0.0'), version: '1.0.0', research: ['E-CODEX-P3', 'E-CODEX-P8'] },
				{ id: 'b@n', path: join(cache(), 'n/b/1dc19589'), version: '1dc19589', research: ['E-CODEX-P3', 'E-CODEX-P8'] },
			])
			expect(result.unresolved).toEqual([])
		})

		it('follows CODEX_HOME', async () => {
			const codexHome = join(root, 'codex')
			await put(join(codexHome, 'plugins/cache/m/a/1.0.0/plugin.json'), '{}')

			const result = await installedPlugins('codex', environment({ CODEX_HOME: codexHome }))

			expect(result.plugins.map((p) => p.path)).toEqual([join(codexHome, 'plugins/cache/m/a/1.0.0')])
		})

		it('picks a local folder over any version', async () => {
			await version('m', 'a', '9.0.0')
			await version('m', 'a', 'local')

			const result = await installedPlugins('codex', environment())

			expect(result.plugins.map((p) => p.version)).toEqual(['local'])
		})

		it('picks the highest semver version, not the last by string order', async () => {
			for (const v of ['1.9.0', '1.10.0', '1.10.0-beta.2', '1.2.0']) await version('m', 'a', v)

			const result = await installedPlugins('codex', environment())

			expect(result.plugins.map((p) => p.version)).toEqual(['1.10.0'])
		})

		it('orders pre-releases by their identifiers', async () => {
			for (const v of ['2.0.0-beta.10', '2.0.0-beta.9', '2.0.0-alpha']) await version('m', 'a', v)

			const result = await installedPlugins('codex', environment())

			expect(result.plugins.map((p) => p.version)).toEqual(['2.0.0-beta.10'])
		})

		it('uses string order when no name parses as semver', async () => {
			for (const v of ['aaa', 'ccc', 'bbb']) await version('m', 'a', v)

			const result = await installedPlugins('codex', environment())

			expect(result.plugins.map((p) => p.version)).toEqual(['ccc'])
		})

		it('uses string order for a mixed pair, as the single comparison does', async () => {
			await version('m', 'a', '1.0.0')
			await version('m', 'a', 'abc')

			const result = await installedPlugins('codex', environment())

			expect(result.plugins.map((p) => p.version)).toEqual(['abc'])
		})

		it('reports a plugin as unresolved when three or more names mix semver and non-semver', async () => {
			for (const v of ['1.0.0', '2.0.0', 'abc']) await version('m', 'a', v)
			await version('m', 'b', '1.0.0')

			const result = await installedPlugins('codex', environment())

			expect(result.plugins.map((p) => p.id)).toEqual(['b@m'])
			expect(result.unresolved).toEqual(['a@m'])
		})

		it('ignores names Codex would reject and plugins with no version folder', async () => {
			await version('bad.mkt', 'a', '1.0.0')
			await version('m', '.hidden', '1.0.0')
			await version('m', 'a', 'bad name')
			await mkdir(join(cache(), 'm/empty'), { recursive: true })
			await put(join(cache(), 'm/file/1.0.0'), 'not a folder')

			const result = await installedPlugins('codex', environment())

			expect(result.plugins).toEqual([])
		})

		it('reports a missing cache as not found', async () => {
			const result = await installedPlugins('codex', environment())

			expect(result.sources).toEqual([{ path: cache(), found: false }])
		})
	})

	describe('copilot-cli', () => {
		const config = () => join(home, '.copilot/config.json')

		it('reads installedPlugins from config.json, naming a direct install by its bare name', async () => {
			const installed = join(home, '.copilot/installed-plugins')
			await put(
				config(),
				`// User settings belong in settings.json.
// This file is managed automatically.
{
  "installedPlugins": [
    {
      "name": "arcade-canvas",
      "marketplace": "",
      "enabled": true,
      "version": "1.0.2",
      "cache_path": "${installed}/_direct/github--awesome-copilot--plugins-arcade-canvas",
      "source": { "source": "github", "repo": "github/awesome-copilot", "path": "plugins/arcade-canvas" }
    },
    {
      "name": "spark",
      "marketplace": "copilot-plugins",
      "version": "1.0.0",
      "cache_path": "${installed}/copilot-plugins/spark",
      "source_sha": "fd29",
      "enabled": true
    },
    { "name": "no-path", "marketplace": "m" }
  ]
}`,
			)

			const result = await installedPlugins('copilot-cli', environment())

			expect(result.supported).toBe(true)
			expect(result.plugins).toEqual([
				{
					id: 'arcade-canvas',
					path: join(installed, '_direct/github--awesome-copilot--plugins-arcade-canvas'),
					version: '1.0.2',
					research: ['E-COPILOT-P10', 'E-COPILOT-P11'],
				},
				{
					id: 'spark@copilot-plugins',
					path: join(installed, 'copilot-plugins/spark'),
					version: '1.0.0',
					research: ['E-COPILOT-P10'],
				},
			])
			expect(result.unread).toEqual([
				`plugins from marketplaces added by local path (extraKnownMarketplaces in ${join(home, '.copilot/settings.json')})`,
			])
		})

		it('follows COPILOT_HOME and ignores XDG_CONFIG_HOME', async () => {
			const copilotHome = join(root, 'copilot')

			const result = await installedPlugins(
				'copilot-cli',
				environment({ COPILOT_HOME: copilotHome, XDG_CONFIG_HOME: join(root, 'xdg') }),
			)

			expect(result.sources).toEqual([{ path: join(copilotHome, 'config.json'), found: false }])
		})

		it('reports no plugins when config.json has no installedPlugins', async () => {
			await put(config(), '{ "firstLaunchAt": "x" }')

			const result = await installedPlugins('copilot-cli', environment())

			expect(result.plugins).toEqual([])
			expect(result.sources).toEqual([{ path: config(), found: true }])
		})
	})

	it('reports every other harness as unsupported', async () => {
		const supported = ['claude-code', 'codex', 'copilot-cli']
		for (const harness of harnessIds.filter((id) => !supported.includes(id))) {
			const result = await installedPlugins(harness, environment())
			expect(result).toEqual({
				harness,
				supported: false,
				plugins: [],
				unresolved: [],
				sources: [],
				unread: [],
				research: [],
			})
		}
	})
})
