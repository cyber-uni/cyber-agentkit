import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ReferenceFailure } from './reference-error.js'
import { defaultLayer, findRoot, referenceLayers, referenceRoot, workingChain } from './reference-layers.js'

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
	it('reads the tiers highest first: managed, repo, user, plugin, default (R12)', async () => {
		const repo = tempDir()
		write(repo, '.git/HEAD', 'ref: refs/heads/main\n')
		const cwd = join(repo, 'packages', 'a')
		mkdirSync(cwd, { recursive: true })
		const home = tempDir()
		const plugin = tempDir()
		write(plugin, 'plugin.json', JSON.stringify({ name: 'host', version: '4.0.0' }))
		const skill = tempDir()
		write(skill, 'SKILL.md', '---\nname: tracker\n---\n')

		const { layers, root } = await referenceLayers({
			cwd,
			home,
			platform: 'linux',
			env: {},
			plugin: { name: 'host', root: plugin },
			defaultSkill: skill,
		})

		expect(root).toBe(repo)
		expect(layers.map(({ tier, dir }) => `${tier} ${dir}`)).toEqual([
			'managed (no harness detected)',
			`repo ${join(repo, '.agents', 'references')}`,
			`user ${join(home, '.agents', 'references')}`,
			`plugin ${join(plugin, 'references')}`,
			`default ${join(skill, 'references')}`,
		])
		expect(layers.find(({ tier }) => tier === 'plugin')).toMatchObject({ origin: 'host', version: '4.0.0' })
		expect(layers.at(-1)?.skill).toBe('tracker')
	})

	it('reads no folder between the working folder and the root as a tier', async () => {
		const repo = tempDir()
		write(repo, '.git/HEAD', 'ref: refs/heads/main\n')
		write(repo, 'packages/a/.agents/references/x.md', '# near\n')
		const cwd = join(repo, 'packages', 'a')

		const { layers } = await referenceLayers({ cwd, home: tempDir(), platform: 'linux', env: {} })

		expect(layers.some(({ dir }) => dir.startsWith(join(repo, 'packages')))).toBe(false)
	})

	it('throws root-missing for a root that does not exist, reading nothing (J24, UC1.20)', async () => {
		const root = join(tempDir(), 'gone')

		const failure = await referenceLayers({ root, home: tempDir(), platform: 'linux', env: {} }).catch(
			(error: unknown) => error,
		)

		expect(failure).toBeInstanceOf(ReferenceFailure)
		expect(failure).toMatchObject({ code: 'root-missing', usage: false })
	})

	it('reads no managed folder when several harnesses are detected, and names them', async () => {
		const { layers, harnesses } = await referenceLayers({
			root: tempDir(),
			home: tempDir(),
			platform: 'linux',
			env: { ...claudeCode, CODEX_THREAD_ID: 'thread' },
		})

		expect(harnesses).toEqual(['claude-code', 'codex'])
		expect(layers.filter(({ tier }) => tier === 'managed')).toEqual([
			{
				tier: 'managed',
				dir: '(several harnesses detected)',
				skipped: 'detection names several harnesses (claude-code, codex), so no managed folder is read',
			},
		])
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

		expect(layers.find(({ tier }) => tier === 'plugin')).toMatchObject({
			plugin: 'dep-a',
			origin: 'dependency',
			version: '1.0.0',
		})
	})

	it("reads the root's package.json only: a workspace package's own adds no plugin (R13)", async () => {
		const root = tempDir()
		write(root, '.git/HEAD', 'ref: refs/heads/main\n')
		write(root, 'package.json', JSON.stringify({ name: 'workspace' }))
		const cwd = join(root, 'packages', 'a')
		write(cwd, 'package.json', JSON.stringify({ dependencies: { 'dep-a': '1.0.0' } }))
		write(cwd, 'node_modules/dep-a/package.json', JSON.stringify({ name: 'dep-a', version: '1.0.0' }))
		write(cwd, 'node_modules/dep-a/plugin.json', JSON.stringify({ name: 'dep-a' }))
		write(cwd, 'node_modules/dep-a/references/testing.md', '# dep-a\n')

		const fromPackage = await referenceLayers({ cwd, home: tempDir(), platform: 'linux', env: {} })
		const fromRoot = await referenceLayers({ cwd: root, home: tempDir(), platform: 'linux', env: {} })

		expect(fromPackage.layers.filter(({ tier }) => tier === 'plugin')).toEqual([])
		expect(fromRoot.layers.filter(({ tier }) => tier === 'plugin')).toEqual([])
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
			{ tier: 'repo', dir: join(home, '.agents', 'references') },
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

describe('the repository root (R12)', () => {
	it('is the nearest folder at or above the working folder holding a .git folder', () => {
		const repo = tempDir()
		mkdirSync(join(repo, '.git'))
		const cwd = join(repo, 'packages', 'a')
		mkdirSync(cwd, { recursive: true })

		expect(findRoot(cwd)).toBe(repo)
		expect(findRoot(repo)).toBe(repo)
	})

	it('counts a .git file, so a git worktree is its own root', () => {
		const repo = tempDir()
		mkdirSync(join(repo, '.git'))
		const worktree = join(repo, 'worktrees', 'one')
		write(worktree, '.git', 'gitdir: ../../.git/worktrees/one\n')

		expect(findRoot(join(worktree))).toBe(worktree)
	})

	it('ignores pnpm-workspace.yaml and package.json workspaces', () => {
		const repo = tempDir()
		write(repo, 'pnpm-workspace.yaml', '')
		write(repo, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }))
		const cwd = join(repo, 'packages', 'a')
		mkdirSync(cwd, { recursive: true })

		expect(findRoot(cwd)).toBe(cwd)
	})

	it('is the working folder when no folder above holds .git', () => {
		const cwd = tempDir()

		expect(findRoot(cwd)).toBe(cwd)
	})

	it('is the --root folder when given, even below a repository root', () => {
		const repo = tempDir()
		mkdirSync(join(repo, '.git'))
		const given = join(repo, 'packages')
		mkdirSync(given)

		expect(referenceRoot(given)).toBe(given)
		expect(() => referenceRoot(join(repo, 'gone'))).toThrow(expect.objectContaining({ code: 'root-missing' }))
	})

	it('walks from the working folder up to the root only for harness matching, or reads the root alone', () => {
		const repo = tempDir()
		const cwd = join(repo, 'packages', 'a')

		expect(workingChain(cwd, repo)).toEqual([cwd, join(repo, 'packages'), repo])
		expect(workingChain(tempDir(), repo)).toEqual([repo])
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
