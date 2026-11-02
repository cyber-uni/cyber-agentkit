import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceCreateReport } from './reference.command.js'
import {
	base,
	create,
	errors,
	fakeHome,
	harness,
	json,
	lastError,
	managed,
	plugins,
	repo,
	skill,
	stderr,
	stdout,
	tempDir,
	write,
	written,
} from './reference-command.fixtures.js'
import { recipeInterface } from './reference-interface.fixtures.js'

describe('create', () => {
	it('writes the project file with merge: patch by default, and points to load', async () => {
		const root = repo()

		expect(await create('name', { root })).toBe(0)
		const content = readFileSync(join(root, '.agents/references/name.md'), 'utf8')
		expect(content).toMatch(/^---\ndescription: .*\ntags: \[topic\]\nmerge: patch\n---\n\n## Overview\n/)
		expect(written()).toContain('Run `load name` for the composed document.')
	})

	it('writes to the user tier with --scope user', async () => {
		expect(await create('name', { root: repo(), scope: 'user' })).toBe(0)
		expect(existsSync(join(fakeHome.value, '.agents/references/name.md'))).toBe(true)
	})

	it('writes --merge, else the template’s own merge', async () => {
		const root = repo()
		const template = write(root, 't.md', '---\ndescription: d\nmerge: combine\n---\n\n## A\n\na\n')

		expect(await create('one', { root, merge: 'replace' })).toBe(0)
		expect(readFileSync(join(root, '.agents/references/one.md'), 'utf8')).toContain('merge: replace')
		expect(await create('two', { root, template })).toBe(0)
		expect(readFileSync(join(root, '.agents/references/two.md'), 'utf8')).toBe(
			'---\ndescription: d\nmerge: combine\n---\n\n## A\n\na\n',
		)
	})

	it('writes no body with --merge remove, and refuses it with --template', async () => {
		const root = repo()
		expect(await create('name', { root, merge: 'remove' })).toBe(0)
		expect(readFileSync(join(root, '.agents/references/name.md'), 'utf8')).toBe('---\nmerge: remove\n---\n')

		const template = write(root, 't.md', '## A\n')
		expect(await create('other', { root, merge: 'remove', template })).toBe(2)
		expect(lastError()).toMatchObject({ code: 'remove-with-template', error: expect.stringMatching(/--merge remove/) })
	})

	it('exits 2 on an unknown --merge', async () => {
		expect(await create('name', { root: repo(), merge: 'first-wins' })).toBe(2)
	})

	it('writes an implementation with merge: replace and every section stubbed', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })

		expect(await create('scaffold.recipe.go', { root, implements: 'scaffold.recipe' })).toBe(0)
		const content = readFileSync(join(root, '.agents/references/scaffold.recipe.go.md'), 'utf8')
		expect(content).toContain('implements: scaffold.recipe@1\nmerge: replace\n')
		for (const section of ['Recipe', 'Inputs', 'Files', 'Config', 'Verify', 'Post']) {
			expect(content).toContain(`## ${section}\n\n**Unsupported.**`)
		}
	})

	it('refuses an unknown interface, a name that does not fit, and --implements with --template', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
		const template = write(root, 't.md', '## A\n')

		expect(await create('x', { root, implements: 'nope' })).toBe(1)
		expect(await create('wrong', { root, implements: 'scaffold.recipe' })).toBe(1)
		expect(lastError().error).toMatch(/is named scaffold\.recipe\.<key>, not "wrong"/)
		expect(await create('scaffold.recipe.x', { root, implements: 'scaffold.recipe', template })).toBe(2)
		expect(lastError().code).toBe('template-with-implements')
		expect(await create('scaffold.recipe.x', { root, implements: 'a/b/c' })).toBe(1)
	})

	it('refuses a title template and writes nothing', async () => {
		const root = repo()
		const template = write(root, 't.md', '---\ndescription: d\n---\n\n# Title\n\n## A\n\na\n')

		expect(await create('name', { root, template })).toBe(1)
		expect(lastError()).toMatchObject({ code: 'template-title', error: expect.stringMatching(/.*"# Title"/) })
		expect(existsSync(join(root, '.agents/references/name.md'))).toBe(false)
	})

	it('writes a template with no description, with a hint on stderr rather than a warning', async () => {
		const root = repo()
		const template = write(root, 't.md', '## A\n\na\n')

		expect(await create('name', { root, template })).toBe(0)
		expect(errors()).toMatch(/^hint: it has no `description`/)
		expect(errors()).not.toMatch(/warning:/)
		expect(readFileSync(join(root, '.agents/references/name.md'), 'utf8')).toBe('---\nmerge: patch\n---\n\n## A\n\na\n')
	})

	it('refuses an unreadable template, and one whose frontmatter is not a mapping', async () => {
		const root = repo()
		expect(await create('name', { root, template: join(root, 'missing.md') })).toBe(1)
		expect(lastError().error).toMatch(/cannot read the template/)
		const list = write(root, 'l.md', '---\n- a\n---\n\n## A\n')
		expect(await create('name', { root, template: list })).toBe(1)
		expect(lastError().error).toMatch(/not a YAML mapping/)
	})

	it('adds a body and merge to a selection-only file, keeping its extends', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		const path = write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n')
		const template = write(root, 't.md', '---\ndescription: mine\n---\n\n## Create\n\nmine\n')

		expect(await create('name', { root, template })).toBe(0)
		expect(readFileSync(path, 'utf8')).toBe(
			'---\nextends: [a]\ndescription: mine\nmerge: patch\n---\n\n## Create\n\nmine\n',
		)
	})

	it('refuses a file that already has a body', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', 'body\n')

		expect(await create('name', { root })).toBe(1)
		expect(lastError()).toMatchObject({ code: 'file-exists', error: expect.stringMatching(/.*Update mode/) })
	})

	it('refuses when a replace or a remove above would hide the new file, naming it', async () => {
		const root = repo()
		managed({ name: '---\nmerge: replace\n---\n\nmanaged\n' })

		expect(await create('name', { root })).toBe(1)
		expect(lastError()).toMatchObject({
			code: 'reference-hidden',
			error: expect.stringMatching(/managed .*name\.md \(replace\) applies above it/),
		})

		stderr.mockClear()
		harness.managed = undefined
		harness.candidates = []
		write(root, '.agents/references/other.md', '---\nmerge: remove\n---\n')
		expect(await create('other', { root, scope: 'user' })).toBe(1)
		expect(lastError()).toMatchObject({
			code: 'reference-hidden',
			error: expect.stringMatching(/project .*\(remove\)/),
		})
	})

	it('is not hidden by a replace with no body', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\nmerge: replace\nextends: []\n---\n')
		expect(await create('name', { root, scope: 'user' })).toBe(0)
	})

	it('refuses a qualified name, naming the bare one, and an invalid name, as usage errors (J1)', async () => {
		expect(await create('a/name', { root: repo() })).toBe(2)
		expect(lastError()).toMatchObject({ code: 'reference-qualified', error: expect.stringMatching(/.*ask for "name"/) })
		expect(await create('x.md', { root: repo() })).toBe(2)
		expect(lastError().code).toBe('name-invalid')
	})

	it('exits 2 when more than one of --scope, --plugin, and --default is given, or --scope is unknown', async () => {
		const root = repo()
		expect(await create('name', { root, scope: 'user', plugin: root })).toBe(2)
		expect(await create('name', { root, plugin: root, default: root })).toBe(2)
		expect(await create('name', { root, scope: 'machine' })).toBe(2)
	})

	it('writes <plugin>/references/<name>.md with --plugin, with merge only when --merge is given', async () => {
		const root = repo()
		const folder = join(root, 'plugins/house')
		write(folder, 'plugin.json', JSON.stringify({ name: 'house' }))
		const template = write(root, 't.md', '---\ndescription: d\n---\n\n## A\n\na\n')

		expect(await create('name', { root, plugin: folder, template })).toBe(0)
		expect(readFileSync(join(folder, 'references/name.md'), 'utf8')).toBe('---\ndescription: d\n---\n\n## A\n\na\n')
		expect(await create('other', { root, plugin: folder, template, merge: 'combine' })).toBe(0)
		expect(readFileSync(join(folder, 'references/other.md'), 'utf8')).toContain('merge: combine')
	})

	it('refuses a --plugin folder with no manifest, outside the repository, or under node_modules', async () => {
		const root = repo()
		expect(await create('name', { root, plugin: join(root, 'plain') })).toBe(1)
		expect(lastError()).toMatchObject({ code: 'folder-invalid', error: expect.stringMatching(/.*no plugin manifest/) })

		const outside = tempDir('reference-outside-')
		write(outside, 'plugin.json', JSON.stringify({ name: 'out' }))
		expect(await create('name', { root, plugin: outside })).toBe(1)
		expect(lastError().error).toMatch(/outside the repository/)

		const installed = join(root, 'node_modules/house')
		write(installed, 'plugin.json', JSON.stringify({ name: 'house' }))
		expect(await create('name', { root, plugin: installed })).toBe(1)
	})

	it('writes <skill>/references/<name>.default.md with --default, with no merge', async () => {
		const root = repo()
		const folder = skill(root, 'skills/tracker')
		const template = write(root, 't.md', '---\ndescription: d\nmerge: replace\n---\n\n## A\n\na\n')

		expect(await create('name', { root, default: folder, template })).toBe(0)
		expect(readFileSync(join(folder, 'references/name.default.md'), 'utf8')).toBe(
			'---\ndescription: d\n---\n\n## A\n\na\n',
		)
		expect(await create('other', { root, default: folder, merge: 'patch' })).toBe(2)
		expect(lastError().code).toBe('options-conflict')
	})

	it('refuses a --default folder with no SKILL.md, or outside the repository', async () => {
		const root = repo()
		expect(await create('name', { root, default: join(root, 'plain') })).toBe(1)
		expect(lastError().error).toMatch(/no SKILL\.md/)
		const outside = skill(tempDir('reference-outside-'), 'tracker')
		expect(await create('name', { root, default: outside })).toBe(1)
	})

	it('prints the trace under --trace, the new file used', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })

		expect(await create('name', { root, trace: true })).toBe(0)
		expect(errors()).toMatch(/project .*name\.md: used/)

		stdout.mockClear()
		expect(await create('other', { root, trace: true, format: 'json' })).toBe(0)
		const report = json<ReferenceCreateReport>()
		expect(report.trace?.layers.find(({ tier }) => tier === 'project')?.outcome).toBe('used')
	})

	it('prints the path and content with --dry-run, and writes nothing', async () => {
		const root = repo()

		expect(await create('name', { root, 'dry-run': true })).toBe(0)
		expect(written()).toMatch(/^.*\.agents\/references\/name\.md\n\n---\n/)
		expect(existsSync(join(root, '.agents/references/name.md'))).toBe(false)

		stdout.mockClear()
		expect(await create('name', { root, 'dry-run': true, format: 'json' })).toBe(0)
		expect(json<ReferenceCreateReport>()).toMatchObject({
			hint: expect.stringMatching(/Nothing was written/),
			content: expect.any(String),
		})
	})
})
