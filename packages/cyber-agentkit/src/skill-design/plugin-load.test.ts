import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { InstalledPlugin } from '../plugins/installed-plugins.js'
import { checkPluginsLoad, dependencySkillFolders, type PluginList, resolveDependencyPlugins } from './plugin-load.js'

/** A plugin folder whose Claude Code manifest has this name and declares these dependencies. */
function plugin(name: string, dependencies?: unknown[]): string {
	const root = mkdtempSync(join(tmpdir(), `plugin-load-${name}-`))
	mkdirSync(join(root, '.claude-plugin'))
	writeFileSync(
		join(root, '.claude-plugin', 'plugin.json'),
		JSON.stringify({ name, ...(dependencies ? { dependencies } : {}) }),
	)
	return root
}

const install = (id: string, path: string, scope?: InstalledPlugin['scope']): InstalledPlugin => ({
	id,
	path,
	...(scope ? { scope } : {}),
	research: ['E-CC-P2'],
})

describe('resolveDependencyPlugins', () => {
	it('answers none for a plugin that declares no dependency', async () => {
		expect(await resolveDependencyPlugins(plugin('kit'), 'kit', {})).toEqual({ plugins: [] })
	})

	it("finds each dependency in the installed plugins, and the dependencies' own dependencies", async () => {
		const base = plugin('base')
		const agentkit = plugin('cyber-agentkit', ['base'])
		const ran = await resolveDependencyPlugins(plugin('kit', ['cyber-agentkit']), 'kit', {
			installed: [install('cyber-agentkit@cyber-uni', agentkit, 'user'), install('base@cyber-uni', base, 'user')],
		})
		expect(ran).toEqual({
			plugins: [
				{ name: 'cyber-agentkit', path: agentkit },
				{ name: 'base', path: base },
			],
		})
	})

	it('takes a folder passed with --plugin over the installed one, matched by its manifest name', async () => {
		const local = plugin('cyber-agentkit')
		const ran = await resolveDependencyPlugins(plugin('kit', ['cyber-agentkit']), 'kit', {
			folders: [plugin('other'), local],
			installed: [install('cyber-agentkit@cyber-uni', plugin('cyber-agentkit'), 'user')],
		})
		expect(ran).toEqual({ plugins: [{ name: 'cyber-agentkit', path: local }] })
	})

	it('takes the install in the marketplace a dependency names, and a user-scope install before another', async () => {
		const user = plugin('tool')
		const pinned = plugin('tool')
		const root = plugin('kit', ['tool'])
		const installed = [
			install('tool@a', plugin('tool'), 'project'),
			install('tool@a', user, 'user'),
			install('tool@b', pinned),
		]
		expect(await resolveDependencyPlugins(root, 'kit', { installed })).toEqual({
			plugins: [{ name: 'tool', path: user }],
		})
		const named = await resolveDependencyPlugins(plugin('kit', [{ name: 'tool', marketplace: 'b' }]), 'kit', {
			installed,
		})
		expect(named).toEqual({ plugins: [{ name: 'tool', path: pinned }] })
	})

	it('loads each plugin once, and never the plugin under test again, when dependencies form a cycle', async () => {
		const a = plugin('a', ['b', 'kit'])
		const b = plugin('b', ['a'])
		const ran = await resolveDependencyPlugins(plugin('kit', ['a']), 'kit', {
			installed: [install('a@m', a), install('b@m', b)],
		})
		expect(ran).toEqual({
			plugins: [
				{ name: 'a', path: a },
				{ name: 'b', path: b },
			],
		})
	})

	it('answers a problem naming the dependency no folder holds, and the plugin that needs it', async () => {
		const agentkit = plugin('cyber-agentkit', ['base@cyber-uni'])
		const ran = await resolveDependencyPlugins(plugin('kit', ['cyber-agentkit']), 'kit', {
			installed: [install('cyber-agentkit@cyber-uni', agentkit)],
		})
		expect(ran).toEqual({
			problem:
				'cyber-agentkit depends on base@cyber-uni, which is not installed; install it (claude plugin install base@cyber-uni) or pass its folder with --plugin <folder>',
		})
	})
})

describe('checkPluginsLoad', () => {
	const kit = { name: 'kit', path: '/run/plugin-with' }
	const agentkit = { name: 'cyber-agentkit', path: '/run/dependencies/cyber-agentkit' }
	const listing =
		(plugins: Awaited<ReturnType<PluginList>>): PluginList =>
		async () =>
			plugins

	it('answers nothing when every plugin is listed enabled with no error', async () => {
		const list = listing({
			plugins: [
				{ id: 'kit@inline', enabled: true, installPath: kit.path },
				{ id: 'cyber-agentkit@inline', enabled: true, installPath: agentkit.path },
			],
		})
		expect(await checkPluginsLoad([kit, agentkit], list)).toBeUndefined()
	})

	it('answers the error Claude Code gives for a plugin that does not load (E-CC-H10)', async () => {
		const list = listing({
			plugins: [
				{
					id: 'kit@inline',
					enabled: false,
					installPath: kit.path,
					errors: ['Dependency "cyber-agentkit" is not installed'],
				},
			],
		})
		expect(await checkPluginsLoad([kit], list)).toEqual({
			problem: 'kit does not load: Dependency "cyber-agentkit" is not installed',
		})
	})

	it('answers a problem for a plugin that is not listed, or listed disabled', async () => {
		const list = listing({ plugins: [{ id: 'kit@inline', enabled: false, installPath: kit.path }] })
		expect(await checkPluginsLoad([kit], list)).toEqual({
			problem: 'kit does not load: Claude Code lists it as disabled',
		})
		expect(await checkPluginsLoad([agentkit], list)).toEqual({
			problem: 'cyber-agentkit did not load from /run/dependencies/cyber-agentkit',
		})
	})

	it('answers a warning, not a problem, when the list cannot be made', async () => {
		expect(await checkPluginsLoad([kit], listing({ problem: 'spawn claude ENOENT' }))).toEqual({
			warning: 'could not check that the plugins load (claude plugin list: spawn claude ENOENT)',
		})
	})
})

describe('dependencySkillFolders', () => {
	const withSkill = (root: string, name: string) => {
		mkdirSync(join(root, 'skills', name), { recursive: true })
		writeFileSync(join(root, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}.\n---\n`)
		return join(root, 'skills', name)
	}

	it("lists the skills of each plugin the skill's plugin depends on, the dependencies' own included", async () => {
		const base = plugin('base')
		const baseSkill = withSkill(base, 'lint')
		const agentkit = plugin('cyber-agentkit', ['base'])
		const agentkitSkill = withSkill(agentkit, 'skill')
		const kit = plugin('kit', ['cyber-agentkit'])
		const own = withSkill(kit, 'release')
		const installed = [install('cyber-agentkit@m', agentkit, 'user'), install('base@m', base, 'user')]
		expect(await dependencySkillFolders(own, { installed })).toEqual([agentkitSkill, baseSkill])
	})

	it('lists none for a skill outside a plugin, or when a dependency is not installed', async () => {
		const kit = plugin('kit', ['missing'])
		expect(await dependencySkillFolders(withSkill(kit, 'release'), {})).toEqual([])
		expect(await dependencySkillFolders(join(mkdtempSync(join(tmpdir(), 'loose-')), 'x'), {})).toEqual([])
	})
})
