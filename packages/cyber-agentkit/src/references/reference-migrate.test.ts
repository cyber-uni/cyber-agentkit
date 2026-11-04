import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import { migrateReferences } from './reference-migrate.js'
import { resolveReference } from './resolve-reference.js'

function tempDir(prefix = 'reference-migrate-'): string {
	return mkdtempSync(join(tmpdir(), prefix))
}

function write(root: string, relPath: string, content: string): string {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
	return path
}

const read = (path: string) => readFileSync(path, 'utf8')

type Setup = { root: string; home: string; layers: ReferenceLayers }

/** A repository root outside git, a home folder, and the given plugins as the plugin tier. */
function setup(files: Record<string, string> = {}, plugins: Record<string, Record<string, string>> = {}): Setup {
	const root = tempDir()
	const home = tempDir('reference-migrate-home-')
	for (const [file, content] of Object.entries(files)) {
		if (file.startsWith('~/')) write(home, file.slice(2), content)
		else write(root, file, content)
	}
	const pluginLayers: ReferenceLayer[] = Object.entries(plugins).map(([plugin, documents]) => {
		const dir = tempDir('reference-migrate-plugin-')
		for (const [file, content] of Object.entries(documents)) write(dir, file, content)
		return { tier: 'plugin', dir, plugin }
	})
	const layers: ReferenceLayers = {
		layers: [
			{ tier: 'repo', dir: join(root, '.agents', 'references') },
			{ tier: 'user', dir: join(home, '.agents', 'references') },
			...pluginLayers,
		],
		root,
		projects: new Map(),
		harnesses: [],
	}
	return { root, home, layers }
}

const base = '## Create\n\nbase create\n\n## Close\n\nbase close\n'

describe('migrate previews by default and applies with write (R121)', () => {
	it('returns the plan and writes nothing without write', () => {
		const { root, home, layers } = setup({
			'.agents/references/tracker.md': '---\ndescription: mine\nmerge: merge-sections\n---\n\n## Create\n\nmine\n',
		})
		const path = join(root, '.agents/references/tracker.md')
		const before = read(path)

		const result = migrateReferences(layers, { home })

		expect(result).toEqual({
			rows: [
				{
					path,
					tier: 'repo',
					name: 'tracker',
					form: 'merge-sections',
					from: 'merge: merge-sections',
					to: 'no merge: patch is the default',
				},
			],
			written: false,
			warnings: [],
		})
		expect(read(path)).toBe(before)
	})

	it('applies every change with write, keeping the body and every other key as written (R122)', () => {
		const { root, home, layers } = setup({
			'.agents/references/tracker.md':
				'---\ndescription: mine # kept\nmerge: merge-sections\n---\n\n## Create\n\nmine\n',
			'~/.agents/references/style.md': '---\nmerge: first-wins\n---\n\nmy style\n',
		})

		const result = migrateReferences(layers, { home, write: true })

		expect(result.written).toBe(true)
		expect(result.rows.map(({ tier, form }) => [tier, form])).toEqual([
			['repo', 'merge-sections'],
			['user', 'first-wins'],
		])
		expect(read(join(root, '.agents/references/tracker.md'))).toBe(
			'---\ndescription: mine # kept\n---\n\n## Create\n\nmine\n',
		)
		expect(read(join(home, '.agents/references/style.md'))).toBe('---\nmerge: replace\n---\n\nmy style\n')
	})

	it('returns the empty plan when nothing is in a legacy form (UC22.1)', () => {
		const { home, layers } = setup({ '.agents/references/tracker.md': '---\nmerge: patch\n---\n\nmine\n' })

		expect(migrateReferences(layers, { home, write: true })).toEqual({ rows: [], written: false, warnings: [] })
	})

	it('leaves load with no reference-legacy-format warning afterwards (R126)', () => {
		const { home, layers } = setup(
			{
				'.agents/references/tracker.md':
					'---\noverrides: [a/tracker]\nmerge: merge-sections\n---\n\n## Create\n\nmine\n',
			},
			{ a: { 'tracker.md': base } },
		)
		const codes = () => resolveReference('tracker', layers).warnings.map(({ code }) => code)
		expect(codes()).toContain('reference-legacy-format')

		migrateReferences(layers, { home, write: true })

		expect(codes()).toEqual([])
		expect(resolveReference('tracker', layers).content).toBe('## Create\n\nmine\n\n## Close\n\nbase close\n')
	})
})

describe('overrides (R122, UC22.2)', () => {
	it('becomes extends, each qualified entry reduced to its plugin', () => {
		const { root, home, layers } = setup({
			'.agents/references/tracker.md': '---\noverrides: [a/tracker, b]\n---\n\nmine\n',
		})

		const [row] = migrateReferences(layers, { home, write: true }).rows

		expect(row).toMatchObject({ form: 'overrides', from: 'overrides: [a/tracker, b]', to: 'extends: [a, b]' })
		expect(read(join(root, '.agents/references/tracker.md'))).toBe('---\nextends: [a, b]\n---\n\nmine\n')
	})

	it('is a manual row beside an extends that leaves one of its plugins out, and the file is not changed', () => {
		const content = '---\noverrides: [b]\nextends: [a]\n---\n\nmine\n'
		const { root, home, layers } = setup({ '.agents/references/tracker.md': content })

		const [row] = migrateReferences(layers, { home, write: true }).rows

		expect(row?.manual).toMatch(/does not name b/)
		expect(row?.to).toBeUndefined()
		expect(read(join(root, '.agents/references/tracker.md'))).toBe(content)
	})
})

describe('project sections (UC22.3, UC22.4)', () => {
	it('removes a legacy merge and overrides from a project section', () => {
		const { root, home, layers } = setup({
			'pkg/.agents/references/tracker.md': '---\nmerge: merge-sections\noverrides: [a]\n---\n\n## Create\n\npkg\n',
		})

		const { rows } = migrateReferences(layers, { home, write: true })

		expect(rows.map(({ tier, folder, form, to }) => [tier, folder, form, to])).toEqual([
			['project', 'pkg', 'merge-sections', 'no merge: a project section carries none'],
			['project', 'pkg', 'overrides', 'removed: a project section carries no extends'],
		])
		expect(read(join(root, 'pkg/.agents/references/tracker.md'))).toBe('## Create\n\npkg\n')
	})

	it('leaves a selection in a project folder to a person, giving the customize that records it', () => {
		const content = '---\nextends: [a, default]\n---\n'
		const { root, home, layers } = setup({ 'pkg/.agents/references/tracker.md': content })

		const [row] = migrateReferences(layers, { home, write: true }).rows

		expect(row).toMatchObject({ tier: 'project', folder: 'pkg', form: 'project-selection' })
		expect(row?.manual).toMatch(/`reference customize tracker --extends a default`/)
		expect(read(join(root, 'pkg/.agents/references/tracker.md'))).toBe(content)
	})
})

describe('renames (R124)', () => {
	const table = { '_renames.yaml': 'project-tracker.contract: project-tracker.capabilities.interface\n' }

	it("renames a file under an older name from a plugin's rename table", () => {
		const { root, home, layers } = setup(
			{ '.agents/references/project-tracker.contract.md': '## Version\n\nmine\n' },
			{ repobuddy: table },
		)

		const { rows } = migrateReferences(layers, { home, write: true })

		expect(rows).toEqual([
			{
				path: join(root, '.agents/references/project-tracker.contract.md'),
				tier: 'repo',
				name: 'project-tracker.contract',
				form: 'renamed',
				from: 'project-tracker.contract.md',
				to: 'project-tracker.capabilities.interface.md',
				by: `plugin repobuddy's _renames.yaml`,
			},
		])
		expect(existsSync(join(root, '.agents/references/project-tracker.contract.md'))).toBe(false)
		expect(read(join(root, '.agents/references/project-tracker.capabilities.interface.md'))).toBe(
			'## Version\n\nmine\n',
		)
	})

	it("renames a file under an owner's alias, a non-Markdown file with its metadata file", () => {
		const { root, home, layers } = setup(
			{
				'.agents/references/old.json': '{}\n',
				'.agents/references/old.meta.md': '---\ndescription: data\n---\n',
				'~/.agents/references/old/README.md': 'mine\n',
			},
			{ a: { 'new.md': '---\naliases: [old]\n---\n\nnew\n' } },
		)

		const { rows } = migrateReferences(layers, { home, write: true })

		expect(rows.map(({ tier, from, to }) => [tier, from, to])).toEqual([
			['repo', 'old.json', 'new.json'],
			['repo', 'old.meta.md', 'new.meta.md'],
			['user', 'old/', 'new/'],
		])
		expect(read(join(root, '.agents/references/new.json'))).toBe('{}\n')
		expect(existsSync(join(root, '.agents/references/new.meta.md'))).toBe(true)
		expect(read(join(home, '.agents/references/new/README.md'))).toBe('mine\n')
	})

	it('is a manual row when the new name already has a file in that folder (UC22.5)', () => {
		const { root, home, layers } = setup(
			{ '.agents/references/old.md': 'old\n', '.agents/references/new.md': 'new\n' },
			{ a: { '_renames.yaml': 'old: new\n' } },
		)

		const [row] = migrateReferences(layers, { home, write: true }).rows

		expect(row?.manual).toMatch(/"new" already has a file/)
		expect(read(join(root, '.agents/references/old.md'))).toBe('old\n')
	})

	it('is a manual row when two sources rename an older name differently (UC22.5)', () => {
		const { root, home, layers } = setup(
			{ '.agents/references/old.md': 'old\n' },
			{ a: { '_renames.yaml': 'old: one\n' }, b: { '_renames.yaml': 'old: two\n' } },
		)

		const [row] = migrateReferences(layers, { home, write: true }).rows

		expect(row?.manual).toMatch(/renamed differently: "one" by plugin a's _renames.yaml, "two" by plugin b's/)
		expect(existsSync(join(root, '.agents/references/old.md'))).toBe(true)
	})

	it('rewrites a legacy form and renames in one change', () => {
		const { root, home, layers } = setup(
			{ '.agents/references/old.md': '---\nmerge: merge-sections\n---\n\nold\n' },
			{ a: { '_renames.yaml': 'old: new\n' } },
		)

		const { rows } = migrateReferences(layers, { home, write: true })

		expect(rows.map(({ form }) => form)).toEqual(['merge-sections', 'renamed'])
		expect(read(join(root, '.agents/references/new.md'))).toBe('old\n')
	})

	it('passes on a rename table entry that is not a pair of bare names', () => {
		const { home, layers } = setup({}, { a: { '_renames.yaml': 'old: a/new\n' } })

		expect(migrateReferences(layers, { home }).warnings.map(({ code }) => code)).toEqual(['rename-invalid'])
	})

	it("does not apply a plugin's renames to the plugin's own folder", () => {
		const { home, layers } = setup({}, { a: { '_renames.yaml': 'old: new\n', 'old.md': 'old\n' } })

		expect(migrateReferences(layers, { home }).rows).toEqual([])
	})
})

describe('names (R125)', () => {
	it('limits the run to the files of the names given, a file under an older name of one included', () => {
		const { home, layers } = setup(
			{
				'.agents/references/one.md': '---\nmerge: merge-sections\n---\n\none\n',
				'.agents/references/two.md': '---\nmerge: merge-sections\n---\n\ntwo\n',
				'.agents/references/old.md': 'old\n',
			},
			{ a: { '_renames.yaml': 'old: new\n' } },
		)

		expect(migrateReferences(layers, { home, names: ['one', 'new'] }).rows.map(({ name }) => name)).toEqual([
			'old',
			'one',
		])
	})
})

describe('source folders (R123, UC22.7, UC22.8)', () => {
	function skillFolder(root: string, files: Record<string, string>): string {
		write(root, 'skills/tracker-skill/SKILL.md', '---\nname: tracker-skill\n---\n')
		for (const [file, content] of Object.entries(files))
			write(root, join('skills/tracker-skill/references', file), content)
		return join(root, 'skills/tracker-skill')
	}

	it("renames a default in the old layout only for a name given, and rewrites the skill's defaults", () => {
		const { root, home, layers } = setup({
			'.agents/references/tracker.md': '---\nmerge: merge-sections\n---\n\nmine\n',
		})
		const folder = skillFolder(root, {
			'tracker.md': '---\nmerge: merge-sections\n---\n\nold default\n',
			'weights.md': 'a document the skill reads itself\n',
			'style.default.md': '---\nmerge: first-wins\n---\n\nstyle\n',
		})

		expect(migrateReferences(layers, { home, default: folder }).rows.map(({ name, form }) => [name, form])).toEqual([
			['style', 'first-wins'],
		])
		const { rows } = migrateReferences(layers, { home, default: folder, names: ['tracker'], write: true })

		expect(rows.map(({ form, from, to }) => [form, from, to])).toEqual([
			['merge-sections', 'merge: merge-sections', 'no merge: patch is the default'],
			['default-layout', 'references/tracker.md', 'references/tracker.default.md'],
		])
		expect(read(join(folder, 'references/tracker.default.md'))).toBe('old default\n')
		expect(existsSync(join(folder, 'references/weights.md'))).toBe(true)
		// The tiers are not read when a source folder is given.
		expect(read(join(root, '.agents/references/tracker.md'))).toMatch(/merge-sections/)
	})

	it("rewrites a plugin's source folder, applying no rename there", () => {
		const { root, home, layers } = setup()
		write(root, 'plugin/plugin.json', '{"name":"mine"}')
		write(root, 'plugin/references/tracker.md', '---\noverrides: [a]\n---\n\nmine\n')

		const { rows } = migrateReferences(layers, { home, plugin: join(root, 'plugin'), write: true })

		expect(rows.map(({ tier, form }) => [tier, form])).toEqual([['plugin', 'overrides']])
		expect(read(join(root, 'plugin/references/tracker.md'))).toBe('---\nextends: [a]\n---\n\nmine\n')
	})

	it('refuses a source folder outside the repository, such as an installed copy', () => {
		const { home, layers } = setup()
		const elsewhere = tempDir('reference-migrate-installed-')
		write(elsewhere, 'plugin.json', '{"name":"installed"}')

		expect(() => migrateReferences(layers, { home, plugin: elsewhere })).toThrow(
			expect.objectContaining({ code: 'folder-invalid' }),
		)
	})

	it('refuses --plugin with --default as a usage error', () => {
		const { root, home, layers } = setup()

		expect(() => migrateReferences(layers, { home, plugin: root, default: root })).toThrow(
			expect.objectContaining({ code: 'options-conflict' }),
		)
	})
})
