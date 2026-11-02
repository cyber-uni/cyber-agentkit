import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceCreateReport } from './reference.command.js'
import {
	base,
	create,
	errors,
	fakeHome,
	json,
	lastError,
	managed,
	plugins,
	repo,
	skill,
	stdout,
	tempDir,
	write,
	written,
} from './reference-command.fixtures.js'
import { recipeInterface } from './reference-interface.fixtures.js'

/** A real git repository, so `git check-ignore` answers. */
function gitRepo(): string {
	const root = tempDir('reference-git-')
	execFileSync('git', ['init', '-q'], { cwd: root })
	return root
}

const heldInterface = `---
description: An interface whose sections say what they hold.
interface:
  cardinality: many
  version: 2
  sections:
    - heading: Tracker
      required: true
      holds: The tracker's name.
    - Detect
---

## About

a
`

describe('create', () => {
	it('writes the repo file with merge: patch by default, and points to load', async () => {
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

	it('writes to the root with --scope repo, and refuses --scope project, which is no tier to write', async () => {
		const root = repo()
		expect(await create('name', { root, scope: 'repo' })).toBe(0)
		expect(existsSync(join(root, '.agents/references/name.md'))).toBe(true)

		expect(await create('other', { root, scope: 'project' })).toBe(2)
		expect(lastError()).toEqual({ error: '--scope is repo or user; got "project".', code: 'option-invalid' })
	})

	it('refuses a --root that does not exist with root-missing, exit 1, writing nothing', async () => {
		const root = join(repo(), 'gone')
		expect(await create('name', { root })).toBe(1)
		expect(lastError().code).toBe('root-missing')
		expect(existsSync(root)).toBe(false)
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
		expect(lastError().code).toBe('interface-invalid')
		expect(await create('wrong', { root, implements: 'scaffold.recipe' })).toBe(1)
		expect(lastError()).toMatchObject({
			code: 'name-outside-interface',
			error: expect.stringMatching(/is named scaffold\.recipe\.<key>, not "wrong"/),
		})
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
		expect(lastError()).toMatchObject({
			code: 'template-invalid',
			error: expect.stringMatching(/cannot read the template/),
		})
		const list = write(root, 'l.md', '---\n- a\n---\n\n## A\n')
		expect(await create('name', { root, template: list })).toBe(1)
		expect(lastError()).toMatchObject({ code: 'template-invalid', error: expect.stringMatching(/not a YAML mapping/) })
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

	it('writes a file a replace or a remove above hides, warning reference-hidden and naming it (R26, UC5.4)', async () => {
		const root = repo()
		const dir = managed({ name: '---\nmerge: replace\n---\n\nmanaged\n' })

		expect(await create('name', { root, trace: true })).toBe(0)
		expect(existsSync(join(root, '.agents/references/name.md'))).toBe(true)
		expect(errors()).toContain(
			`warning: reference-hidden: ${join(root, '.agents/references/name.md')} is written, but managed ${join(dir, 'references/name.md')} (replace) applies above it`,
		)
		expect(errors()).toMatch(/repo .*name\.md: shadowed by managed/)

		stdout.mockClear()
		expect(await create('other', { root, format: 'json', 'dry-run': true })).toBe(0)
		expect(json<ReferenceCreateReport>().warnings).toBeUndefined()
	})

	it('warns repo-hides-user for a user file under this repository’s repo replace or remove', async () => {
		const root = repo()
		write(root, '.agents/references/other.md', '---\nmerge: remove\n---\n')

		expect(await create('other', { root, scope: 'user', format: 'json' })).toBe(0)
		expect(existsSync(join(fakeHome.value, '.agents/references/other.md'))).toBe(true)
		expect(json<ReferenceCreateReport>().warnings).toEqual([
			{ code: 'repo-hides-user', message: expect.stringMatching(/repo .*other\.md \(remove\) applies above it/) },
		])
		expect(errors()).toBe('')
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
		expect(await create('other', { root, default: folder, merge: 'patch' })).toBe(0)
		expect(readFileSync(join(folder, 'references/other.default.md'), 'utf8')).toContain('merge: patch')
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
		expect(errors()).toMatch(/repo .*name\.md: used/)

		stdout.mockClear()
		expect(await create('other', { root, trace: true, format: 'json' })).toBe(0)
		const report = json<ReferenceCreateReport>()
		expect(report.trace?.layers.find(({ tier }) => tier === 'repo')?.outcome).toBe('used')
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

	it('stubs each interface section with what it holds (R28)', async () => {
		const root = repo()
		plugins(root, { tracker: { 'tracker.capabilities.interface': heldInterface } })

		expect(await create('tracker.capabilities.jira', { root, implements: 'tracker.capabilities' })).toBe(0)
		const content = readFileSync(join(root, '.agents/references/tracker.capabilities.jira.md'), 'utf8')
		expect(content).toContain("## Tracker\n\n**Unsupported.** The tracker's name.\n")
		expect(content).toContain('## Detect\n\n**Unsupported.** Replace this line')
		expect(content).toContain('implements: tracker.capabilities@2\nmerge: replace\n')
	})

	it('refuses a file answering the name in another form, naming it (J7, R60)', async () => {
		const root = repo()
		const readme = write(root, '.agents/references/name/README.md', '---\nextends: [a]\n---\n')
		expect(await create('name', { root })).toBe(1)
		expect(lastError()).toMatchObject({ code: 'file-exists', error: expect.stringContaining(readme) })
		expect(existsSync(join(root, '.agents/references/name.md'))).toBe(false)

		const data = write(root, '.agents/references/data.json', '{}\n')
		expect(await create('data', { root })).toBe(1)
		expect(lastError()).toMatchObject({ code: 'file-exists', error: expect.stringContaining(data) })

		const folder = skill(root, 'skills/tracker')
		const own = write(folder, 'references/conf.default.yaml', 'a: 1\n')
		expect(await create('conf', { root, default: folder })).toBe(1)
		expect(lastError()).toMatchObject({ code: 'file-exists', error: expect.stringContaining(own) })
	})

	describe('--in <folder> (R24, R27, J8)', () => {
		it('writes the folder’s project section with no merge, which load then delivers', async () => {
			const root = repo()
			mkdirSync(join(root, 'packages/app'), { recursive: true })
			plugins(root, { a: { name: base } })

			expect(await create('name', { root, in: join(root, 'packages/app'), format: 'json', trace: true })).toBe(0)
			const path = join(root, 'packages/app/.agents/references/name.md')
			expect(readFileSync(path, 'utf8')).toMatch(/^---\ndescription: .*\ntags: \[topic\]\n---\n\n## Overview\n/)
			const report = json<ReferenceCreateReport>()
			expect(report).toMatchObject({ folder: 'packages/app', hint: 'Run `load name` for the composed document.' })
			expect(report.trace?.projectSections).toEqual([
				expect.objectContaining({ folder: 'packages/app', outcome: 'used' }),
			])
		})

		it('drops merge, extends, implements, and aliases from the template, one warning per key (R27)', async () => {
			const root = repo()
			mkdirSync(join(root, 'app'))
			const template = write(
				root,
				't.md',
				'---\ndescription: d\nmerge: combine\nextends: [a]\nimplements: x@1\naliases: [old]\n---\n\n## A\n\na\n',
			)

			expect(await create('name', { root, in: join(root, 'app'), template })).toBe(0)
			expect(readFileSync(join(root, 'app/.agents/references/name.md'), 'utf8')).toBe(
				'---\ndescription: d\n---\n\n## A\n\na\n',
			)
			const warned = [...errors().matchAll(/^warning: project-section-key-ignored: `(\w+)`/gm)].map((m) => m[1])
			expect(warned).toEqual(['merge', 'extends', 'implements', 'aliases'])
		})

		it('writes every interface section with no implements or merge, under any name (J9, R111)', async () => {
			const root = repo()
			mkdirSync(join(root, 'app'))
			plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })

			expect(await create('anything', { root, in: join(root, 'app'), implements: 'scaffold.recipe' })).toBe(0)
			const content = readFileSync(join(root, 'app/.agents/references/anything.md'), 'utf8')
			expect(content).not.toMatch(/implements:|merge:/)
			for (const section of ['Recipe', 'Inputs', 'Files', 'Config', 'Verify', 'Post']) {
				expect(content).toContain(`## ${section}\n\n**Unsupported.**`)
			}
			expect(errors()).not.toMatch(/warning:/)
		})

		it('warns reference-hidden under a managed replace, and still writes', async () => {
			const root = repo()
			mkdirSync(join(root, 'app'))
			managed({ name: '---\nmerge: replace\n---\n\nmanaged\n' })

			expect(await create('name', { root, in: join(root, 'app') })).toBe(0)
			expect(existsSync(join(root, 'app/.agents/references/name.md'))).toBe(true)
			expect(errors()).toMatch(/^warning: reference-hidden: .* managed .*\(replace\) applies above it/m)
		})

		it('refuses --merge with --in, and an --in that is the root or outside it, as usage errors', async () => {
			const root = repo()
			mkdirSync(join(root, 'app'))
			expect(await create('name', { root, in: join(root, 'app'), merge: 'patch' })).toBe(2)
			expect(lastError().code).toBe('options-conflict')
			expect(await create('name', { root, in: root })).toBe(2)
			expect(lastError()).toMatchObject({ code: 'in-not-below-root', error: expect.stringMatching(/the root itself/) })
			expect(await create('name', { root, in: tempDir() })).toBe(2)
			expect(lastError()).toMatchObject({ code: 'in-not-below-root', error: expect.stringMatching(/outside the root/) })
			expect(await create('name', { root, in: join(root, 'app'), scope: 'user' })).toBe(2)
			expect(lastError().code).toBe('options-conflict')
		})

		it('refuses a folder that does not exist, or one git ignores, writing nothing (J8)', async () => {
			const root = gitRepo()
			write(root, '.gitignore', 'build/\n')
			mkdirSync(join(root, 'build'))

			expect(await create('name', { root, in: join(root, 'missing') })).toBe(1)
			expect(lastError().code).toBe('in-folder-missing')
			expect(existsSync(join(root, 'missing'))).toBe(false)
			expect(await create('name', { root, in: join(root, 'build') })).toBe(1)
			expect(lastError()).toMatchObject({
				code: 'in-folder-ignored',
				error: expect.stringMatching(/git ignores build/),
			})
			expect(existsSync(join(root, 'build/.agents'))).toBe(false)
		})

		it('refuses a name whose main document is not Markdown (in-not-markdown)', async () => {
			const root = repo()
			mkdirSync(join(root, 'app'))
			write(root, '.agents/references/conf.json', '{}\n')

			expect(await create('conf', { root, in: join(root, 'app') })).toBe(1)
			expect(lastError().code).toBe('in-not-markdown')
		})

		it('prints the path and content with --dry-run, writing nothing', async () => {
			const root = repo()
			mkdirSync(join(root, 'app'))
			expect(await create('name', { root, in: join(root, 'app'), 'dry-run': true })).toBe(0)
			expect(written()).toMatch(/app\/\.agents\/references\/name\.md\n\n---\n/)
			expect(existsSync(join(root, 'app/.agents'))).toBe(false)
		})
	})

	describe('a plugin or default file extending a plugin (UC5.12, R103)', () => {
		function house(root: string): string {
			const folder = join(root, 'plugins/house')
			write(folder, 'plugin.json', JSON.stringify({ name: 'house' }))
			return folder
		}

		it('records each extended plugin’s installed version in sources', async () => {
			const root = repo()
			plugins(root, { a: { name: base } })
			const folder = house(root)
			const template = write(root, 't.md', '---\ndescription: d\nextends: [a, default]\n---\n\n## Create\n\nmine\n')

			expect(await create('name', { root, plugin: folder, template })).toBe(0)
			expect(readFileSync(join(folder, 'references/name.md'), 'utf8')).toBe(
				'---\ndescription: d\nextends: [a, default]\nsources:\n  - plugin: a\n    version: 1.0.0\n---\n\n## Create\n\nmine\n',
			)
		})

		it('takes only --merge, never the template’s merge (R27)', async () => {
			const root = repo()
			const folder = house(root)
			const template = write(root, 't.md', '---\ndescription: d\nmerge: combine\n---\n\n## A\n\na\n')

			expect(await create('name', { root, plugin: folder, template })).toBe(0)
			expect(readFileSync(join(folder, 'references/name.md'), 'utf8')).toBe('---\ndescription: d\n---\n\n## A\n\na\n')
		})

		it('refuses merge: replace on a file extending a plugin, writing nothing; a snapshot with no extends is accepted', async () => {
			const root = repo()
			plugins(root, { a: { name: base } })
			const folder = house(root)
			const skillFolder = skill(root, 'skills/tracker')
			const extending = write(root, 'e.md', '---\nextends: [a]\n---\n\n## Create\n\nmine\n')

			expect(await create('name', { root, plugin: folder, template: extending, merge: 'replace' })).toBe(1)
			expect(lastError()).toMatchObject({ code: 'extends-replace', error: expect.stringMatching(/extends a/) })
			expect(existsSync(join(folder, 'references/name.md'))).toBe(false)
			expect(await create('name', { root, default: skillFolder, template: extending, merge: 'replace' })).toBe(1)
			expect(lastError().code).toBe('extends-replace')

			const snapshot = write(root, 's.md', '---\ndescription: d\n---\n\n## Create\n\nwhole\n')
			expect(await create('name', { root, plugin: folder, template: snapshot, merge: 'replace' })).toBe(0)
			expect(readFileSync(join(folder, 'references/name.md'), 'utf8')).toContain('merge: replace')
		})
	})

	describe('error precedence (C3, J10)', () => {
		it('raises a usage error before root-missing, and options-conflict before option-invalid', async () => {
			const gone = join(repo(), 'gone')
			expect(await create('x.md', { root: gone })).toBe(2)
			expect(lastError().code).toBe('name-invalid')
			expect(await create('name', { root: gone, in: tempDir() })).toBe(2)
			expect(lastError().code).toBe('in-not-below-root')
			expect(await create('name', { root: gone, scope: 'machine', plugin: gone })).toBe(2)
			expect(lastError().code).toBe('options-conflict')
			expect(await create('name', { root: gone, merge: 'bogus', template: gone })).toBe(2)
			expect(lastError().code).toBe('option-invalid')
		})

		it('raises root-missing, then folder-invalid, then template-invalid', async () => {
			const root = repo()
			expect(await create('name', { root: join(root, 'gone'), plugin: join(root, 'plain') })).toBe(1)
			expect(lastError().code).toBe('root-missing')
			expect(await create('name', { root, plugin: join(root, 'plain'), template: join(root, 'missing.md') })).toBe(1)
			expect(lastError().code).toBe('folder-invalid')
		})

		it('raises template-* and interface checks before in-*, and every check before file-exists', async () => {
			const root = repo()
			plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
			expect(await create('x', { root, implements: 'nope', in: join(root, 'missing') })).toBe(1)
			expect(lastError().code).toBe('interface-invalid')
			expect(await create('x', { root, template: join(root, 'missing.md'), in: join(root, 'missing') })).toBe(1)
			expect(lastError().code).toBe('template-invalid')

			write(root, '.agents/references/wrong.md', 'body\n')
			expect(await create('wrong', { root, implements: 'scaffold.recipe' })).toBe(1)
			expect(lastError().code).toBe('name-outside-interface')
			const title = write(root, 'title.md', '# Title\n\n## A\n')
			expect(await create('wrong', { root, template: title })).toBe(1)
			expect(lastError().code).toBe('template-title')

			mkdirSync(join(root, 'app'))
			write(root, 'app/.agents/references/conf.md', 'section\n')
			write(root, '.agents/references/conf.json', '{}\n')
			expect(await create('conf', { root, in: join(root, 'app') })).toBe(1)
			expect(lastError().code).toBe('in-not-markdown')
		})

		it('raises extends-replace before file-exists and before any hide warning or write', async () => {
			const root = repo()
			plugins(root, { a: { name: base } })
			const folder = join(root, 'plugins/house')
			write(folder, 'plugin.json', JSON.stringify({ name: 'house' }))
			write(folder, 'references/name.md', '---\nextends: [a]\n---\n\nbody\n')
			const extending = write(root, 'e.md', '---\nextends: [a]\n---\n\n## Create\n\nmine\n')

			expect(await create('name', { root, plugin: folder, template: extending, merge: 'replace' })).toBe(1)
			expect(lastError().code).toBe('extends-replace')
			expect(errors()).toBe('')
		})
	})
})
