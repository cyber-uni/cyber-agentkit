import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultLayer, projectChain, referenceLayers, repositoryRoot } from './reference-layers.js'

function tempDir(prefix = 'reference-layers-'): string {
	return mkdtempSync(join(tmpdir(), prefix))
}

function write(root: string, relPath: string, content: string): string {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
	return path
}

const claudeCode = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'session' }

describe('referenceLayers', () => {
	it('reads the tiers highest first: managed, project nearest first, user, plugin, default', async () => {
		const repo = tempDir()
		write(repo, '.git/HEAD', 'ref: refs/heads/main\n')
		const root = join(repo, 'packages', 'a')
		mkdirSync(root, { recursive: true })
		const home = tempDir()
		const plugin = tempDir()
		const skill = tempDir()
		write(skill, 'SKILL.md', '---\nname: tracker\n---\n')

		const { layers } = await referenceLayers({
			root,
			home,
			platform: 'linux',
			env: {},
			plugin: { name: 'host', root: plugin },
			defaultSkill: skill,
		})

		expect(layers.map(({ tier, dir }) => `${tier} ${dir}`)).toEqual([
			'managed (no harness detected)',
			`project ${join(root, '.agents', 'references')}`,
			`project ${join(repo, 'packages', '.agents', 'references')}`,
			`project ${join(repo, '.agents', 'references')}`,
			`user ${join(home, '.agents', 'references')}`,
			`plugin ${join(plugin, 'references')}`,
			`default ${join(skill, 'references')}`,
		])
		expect(layers.at(-1)?.skill).toBe('tracker')
	})

	it('reads no governances folder and no managed folder of its own, only the harness’s', async () => {
		const { layers, harnesses } = await referenceLayers({
			root: tempDir(),
			home: tempDir(),
			platform: 'linux',
			env: claudeCode,
		})

		expect(harnesses).toEqual(['claude-code'])
		expect(layers.some(({ dir }) => dir.includes('governances'))).toBe(false)
		expect(layers.filter(({ tier, skipped }) => tier === 'managed' && !skipped).map(({ dir }) => dir)).toEqual([
			'/etc/claude-code/references',
		])
	})

	it('names a dependency plugin by its manifest name, never by its package name', async () => {
		const root = tempDir()
		write(root, 'package.json', JSON.stringify({ dependencies: { '@scope/dep-a': '1.0.0' } }))
		write(root, 'node_modules/@scope/dep-a/package.json', JSON.stringify({ name: '@scope/dep-a', version: '1.0.0' }))
		write(root, 'node_modules/@scope/dep-a/.claude-plugin/plugin.json', JSON.stringify({ name: 'dep-a' }))
		write(root, 'node_modules/@scope/dep-a/references/testing.md', '# dep-a\n')

		const { layers } = await referenceLayers({ root, home: tempDir(), platform: 'linux', env: {} })

		expect(layers.find(({ tier }) => tier === 'plugin')).toMatchObject({ plugin: 'dep-a' })
	})

	it('shows a dependency that ships references/ without a plugin manifest as not a plugin', async () => {
		const root = tempDir()
		write(root, 'package.json', JSON.stringify({ devDependencies: { 'dep-b': '1.0.0' } }))
		write(root, 'node_modules/dep-b/package.json', JSON.stringify({ name: 'dep-b', version: '1.0.0' }))
		write(root, 'node_modules/dep-b/references/testing.md', '# dep-b\n')

		const { layers } = await referenceLayers({ root, home: tempDir(), platform: 'linux', env: {} })

		expect(layers.find(({ tier }) => tier === 'plugin')).toMatchObject({ skipped: 'not a plugin' })
	})

	it('adds no layer for a dependency without a references/ folder', async () => {
		const root = tempDir()
		write(root, 'package.json', JSON.stringify({ dependencies: { 'dep-c': '1.0.0' } }))
		write(root, 'node_modules/dep-c/package.json', JSON.stringify({ name: 'dep-c', version: '1.0.0' }))
		write(root, 'node_modules/dep-c/plugin.json', JSON.stringify({ name: 'dep-c' }))

		const { layers } = await referenceLayers({ root, home: tempDir(), platform: 'linux', env: {} })

		expect(layers.filter(({ tier }) => tier === 'plugin')).toEqual([])
	})

	it("skips a dependency that resolves to the running plugin's own root", async () => {
		const root = tempDir()
		write(root, 'package.json', JSON.stringify({ dependencies: { 'dep-a': '1.0.0' } }))
		write(root, 'node_modules/dep-a/package.json', JSON.stringify({ name: 'dep-a', version: '1.0.0' }))
		write(root, 'node_modules/dep-a/plugin.json', JSON.stringify({ name: 'dep-a' }))
		write(root, 'node_modules/dep-a/references/testing.md', '# dep-a\n')

		const { layers } = await referenceLayers({
			root,
			home: tempDir(),
			platform: 'linux',
			env: {},
			plugin: { name: 'host', root: join(root, 'node_modules', 'dep-a') },
		})

		expect(layers.filter(({ tier }) => tier === 'plugin').map(({ plugin }) => plugin)).toEqual(['host'])
	})

	it('reads the running plugin once, when a harness also has it enabled', async () => {
		const home = tempDir()
		const packageRoot = tempDir()
		write(packageRoot, 'references/testing.md', '# own\n')
		write(home, '.claude/settings.json', JSON.stringify({ enabledPlugins: { 'host@market': true } }))
		write(
			home,
			'.claude/plugins/installed_plugins.json',
			JSON.stringify({ plugins: { 'host@market': [{ scope: 'user', installPath: packageRoot }] } }),
		)

		const { layers } = await referenceLayers({
			root: tempDir(),
			home,
			platform: 'linux',
			plugin: { name: 'host', root: packageRoot },
			env: claudeCode,
		})

		expect(layers.filter(({ dir }) => dir === join(packageRoot, 'references'))).toHaveLength(1)
	})

	it('reads one folder once when the repository is checked out at the home directory', async () => {
		const home = tempDir()
		write(home, '.git/HEAD', 'ref: refs/heads/main\n')

		const { layers } = await referenceLayers({ root: home, home, platform: 'linux', env: {} })

		expect(layers.filter(({ dir }) => dir === join(home, '.agents', 'references'))).toEqual([
			{ tier: 'project', dir: join(home, '.agents', 'references') },
		])
	})
})

describe('defaultLayer', () => {
	it('names the skill by the name its SKILL.md gives, not its folder name', () => {
		const folder = join(tempDir(), 'pnpm-some-package-tracker')
		write(folder, 'SKILL.md', '---\nname: tracker\n---\n')

		expect(defaultLayer(folder)).toEqual({ tier: 'default', dir: join(folder, 'references'), skill: 'tracker' })
	})

	it('follows a symlinked skill folder', () => {
		const real = tempDir()
		write(real, 'SKILL.md', '---\nname: linked\n---\n')
		const link = join(tempDir(), 'link')
		symlinkSync(real, link)

		expect(defaultLayer(link).skill).toBe('linked')
	})

	it('warns, and reads nothing, for a skill folder that does not exist', () => {
		const folder = join(tempDir(), 'gone')

		expect(defaultLayer(folder)).toMatchObject({
			tier: 'default',
			skipped: 'no skill folder',
			warning: { code: 'default-folder-missing' },
		})
	})
})

describe('the repository root', () => {
	it('is the first folder above the root with a .git, a pnpm-workspace.yaml, or a package.json with workspaces', () => {
		const repo = tempDir()
		write(repo, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }))
		const root = join(repo, 'packages', 'a')
		mkdirSync(root, { recursive: true })

		expect(repositoryRoot(root)).toBe(repo)
		expect(projectChain(root)).toEqual([root, join(repo, 'packages'), repo])
	})

	it('is none above a root outside any repository, so the root alone is read', () => {
		const root = tempDir()

		expect(projectChain(root)).toEqual([root])
		expect(repositoryRoot(root)).toBeUndefined()
	})
})

describe('the skills holding a default', () => {
	it("finds them in the detected harness's skill folders and enabled plugins, known by their SKILL.md name", async () => {
		const repo = tempDir()
		write(repo, '.git/HEAD', 'ref: refs/heads/main\n')
		write(repo, '.claude/skills/pnpm-pkg-tracker/SKILL.md', '---\nname: tracker\n---\n')
		write(repo, '.claude/skills/pnpm-pkg-tracker/references/x.default.md', '## A\n')
		write(repo, '.claude/skills/plain/SKILL.md', '---\nname: plain\n---\n')
		write(repo, '.agents/skills/ignored/SKILL.md', '---\nname: ignored\n---\n')
		write(repo, '.agents/skills/ignored/references/x.default.md', '## A\n')
		const own = tempDir()
		write(own, 'skills/reference/SKILL.md', '---\nname: reference\n---\n')
		write(own, 'skills/reference/references/y.default.md', '## B\n')

		const { skills } = await referenceLayers({
			root: repo,
			home: tempDir(),
			platform: 'linux',
			env: claudeCode,
			plugin: { name: 'host', root: own },
		})

		expect(skills).toEqual({
			skills: [
				{ name: 'tracker', folder: join(realpathSync(repo), '.claude/skills/pnpm-pkg-tracker') },
				{ name: 'reference', folder: join(realpathSync(own), 'skills/reference') },
			],
		})
	})

	it('says why none is listed when no harness is detected', async () => {
		const { skills } = await referenceLayers({ root: tempDir(), home: tempDir(), platform: 'linux', env: {} })

		expect(skills).toEqual({ skills: [], unverified: expect.stringMatching(/^no harness detected/) })
	})

	it('says which detected harness has skill folders that are not verified', async () => {
		const { skills, harnesses } = await referenceLayers({
			root: tempDir(),
			home: tempDir(),
			platform: 'linux',
			env: { AGENT: '1', OPENCODE: '1', KILO: '1', KILO_PID: '4242' },
		})

		expect(harnesses).toEqual(['kilo'])
		expect(skills?.unverified).toBe(
			"the skill folders kilo reads are not verified, so its skills' defaults are not listed",
		)
	})
})
