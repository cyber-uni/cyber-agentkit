import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceCustomizeBase, ReferenceCustomizeReport } from './reference.command.js'
import {
	base,
	errors,
	fakeHome,
	hostRoot,
	json,
	lastError,
	load,
	managed,
	plugins,
	repo,
	customize as run,
	skill,
	stdout,
	write,
	written,
} from './reference-command.fixtures.js'
import { recipeInterface } from './reference-interface.fixtures.js'

/** Each run's stdout on its own, so a test can read the last run's answer. */
const customize = (name: string, args: Record<string, unknown> = {}) => {
	stdout.mockClear()
	return run(name, args)
}

const ask = (root: string, text = 'Say it in fewer words.\n') => write(root, 'request.md', text)
const draft = (root: string, text = '## Create\n\nshort\n') => write(root, 'body.md', text)
const repoFile = (root: string, name = 'name') => join(root, '.agents/references', `${name}.md`)

describe('customize --extends (UC9, R79, R80)', () => {
	it('writes a selection listing the picks bottom first, a <plugin>/<name> and a :<merge> step included', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: '## Create\n\nb\n' } })

		expect(await customize('name', { root, extends: ['a', 'b/name:combine'] })).toBe(0)
		expect(readFileSync(repoFile(root), 'utf8')).toBe('---\nextends:\n  - a\n  - b: combine\n---\n')
		expect(written()).toMatch(
			/extends: \["a",\{"b":"combine"\}\]\. "name" is answered by plugin b, on the stack a → b\./,
		)
	})

	it('keeps the body and other keys, changing only extends (R79, UC18.9)', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		const path = write(
			root,
			'.agents/references/name.md',
			'---\ndescription: mine\nextends: [a]\n---\n\n## Create\n\nmine\n',
		)

		expect(await customize('name', { root, extends: ['b', 'default'], format: 'json' })).toBe(0)
		expect(readFileSync(path, 'utf8')).toBe('---\ndescription: mine\nextends: [b, default]\n---\n\n## Create\n\nmine\n')
		expect(json<ReferenceCustomizeReport>()).toMatchObject({ extends: ['b', 'default'], status: 'found', stack: ['b'] })
	})

	it('suggests customizing again when the body it keeps records a request (R83)', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		write(root, '.agents/references/name.md', '---\nextends: [a]\nrequest: |\n  shorter\n---\n\n## Create\n\nmine\n')

		expect(await customize('name', { root, extends: ['b'] })).toBe(0)
		expect(errors()).toMatch(/^hint: its body was generated from a request against the old stack; .*--request/m)
	})

	it('writes the user tier with --scope user, where only the enabled plugins count (R84, R13)', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(hostRoot, 'references/name.md', base)

		expect(await customize('name', { root, scope: 'user', extends: ['host'] })).toBe(0)
		expect(readFileSync(join(fakeHome.value, '.agents/references/name.md'), 'utf8')).toBe('---\nextends: [host]\n---\n')
		expect(await customize('name', { root, scope: 'user', extends: ['a'] })).toBe(1)
		expect(lastError().code).toBe('step-invalid')
	})

	it('refuses a step that is neither default nor a plugin holding the name, writing nothing (UC9.2)', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { other: 'x\n' } })

		expect(await customize('name', { root, extends: ['b'] })).toBe(1)
		expect(lastError()).toEqual({
			code: 'step-invalid',
			error: 'b is neither default nor a plugin holding "name"; the plugins holding it are a.',
		})
		expect(existsSync(repoFile(root))).toBe(false)
	})

	it('writes an --extends-file list with every step key, and refuses one that is not an extends list', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		const file = write(root, 'picks.yaml', 'extends:\n  - a\n  - b:\n      merge: combine\n      sections: [Create]\n')

		expect(await customize('name', { root, 'extends-file': file })).toBe(0)
		expect(readFileSync(repoFile(root), 'utf8')).toBe(
			'---\nextends:\n  - a\n  - b:\n      merge: combine\n      sections:\n        - Create\n---\n',
		)

		const bad = write(root, 'bad.yaml', 'extends: a b\n')
		expect(await customize('other', { root, 'extends-file': bad })).toBe(1)
		expect(lastError().code).toBe('extends-file-invalid')
		expect(await customize('other', { root, 'extends-file': join(root, 'gone.yaml') })).toBe(1)
		expect(lastError().code).toBe('extends-file-invalid')
		expect(existsSync(repoFile(root, 'other'))).toBe(false)
	})

	it('removes extends with --extends none, deleting a file left with nothing (UC9.5)', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		const kept = write(root, '.agents/references/kept.md', '---\nextends: [a]\n---\n\n## Create\n\nmine\n')
		write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n')

		expect(await customize('kept', { root, extends: ['none'] })).toBe(0)
		expect(readFileSync(kept, 'utf8')).toBe('## Create\n\nmine\n')
		expect(await customize('name', { root, extends: ['none'] })).toBe(0)
		expect(existsSync(repoFile(root))).toBe(false)
		expect(written()).toContain('selection removed; the file was left empty and deleted.')
	})

	it('answers no-selection, exit 0, writing nothing, when that tier has no extends (R80)', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })

		expect(await customize('name', { root, extends: ['none'], format: 'json' })).toBe(0)
		expect(json<ReferenceCustomizeReport>()).toMatchObject({
			code: 'no-selection',
			message: expect.stringMatching(
				/holds no selection of "name", so nothing was removed\. "name" is answered by plugin a/,
			),
		})
		expect(existsSync(repoFile(root))).toBe(false)
	})

	it('writes picks under a managed extends that builds the stack, warning extends-not-used naming it (R109)', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		managed({ name: '---\nextends: [a]\n---\n' })

		expect(await customize('name', { root, extends: ['b'] })).toBe(0)
		expect(readFileSync(repoFile(root), 'utf8')).toBe('---\nextends: [b]\n---\n')
		expect(errors()).toMatch(
			/^warning: extends-not-used: the picks are written to .*, but managed .*'s extends builds the stack/m,
		)
	})

	it('writes a selection a managed replace hides, warning reference-hidden (UC18.15, R26)', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		managed({ name: '---\nmerge: replace\n---\n\nmanaged\n' })

		expect(await customize('name', { root, extends: ['a'] })).toBe(0)
		expect(existsSync(repoFile(root))).toBe(true)
		expect(errors()).toMatch(/^warning: reference-hidden: .* managed .*\(replace\) applies above it/m)
	})

	it('lets the repo pick build the stack over a user pick (UC9.3)', async () => {
		const root = repo()
		write(hostRoot, 'references/name.md', base)
		plugins(root, { a: { name: base } })

		expect(await customize('name', { root, scope: 'user', extends: ['host'] })).toBe(0)
		expect(await customize('name', { root, extends: ['a'], trace: true, format: 'json' })).toBe(0)
		const report = json<ReferenceCustomizeReport>()
		expect(report.stack).toEqual(['a'])
		expect(report.trace?.layers.find(({ tier }) => tier === 'user')?.extendsOutcome).toMatch(/^not used/)
	})
})

describe('customize --request --body (UC18, R81, R82)', () => {
	it('writes the body with the picks, each source and its installed version, the request, and merge', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })

		expect(await customize('name', { root, extends: ['a', 'b'], request: ask(root), body: draft(root) })).toBe(0)
		expect(readFileSync(repoFile(root), 'utf8')).toBe(
			'---\nmerge: patch\nextends: [a, b]\nsources:\n  - plugin: a\n    version: 1.0.0\n  - plugin: b\n    version: 1.0.0\nrequest: |\n  Say it in fewer words.\n---\n\n## Create\n\nshort\n',
		)
		expect(written()).toContain('Run `load name` for the composed document.')
		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toContain('short')
	})

	it('records the target’s own extends when no picks are given, and writes --merge replace', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		write(root, '.agents/references/name.md', '---\nextends: [b]\n---\n')

		expect(await customize('name', { root, merge: 'replace', request: ask(root), body: draft(root) })).toBe(0)
		const content = readFileSync(repoFile(root), 'utf8')
		expect(content).toMatch(/^---\nmerge: replace\nextends: \[b\]\nsources:\n {2}- plugin: b\n/)
	})

	it('writes a missing name from the request alone, with no sources (UC18.3, J12)', async () => {
		const root = repo()

		expect(await customize('name', { root, request: ask(root), body: draft(root) })).toBe(0)
		expect(readFileSync(repoFile(root), 'utf8')).toBe(
			'---\nmerge: patch\nrequest: |\n  Say it in fewer words.\n---\n\n## Create\n\nshort\n',
		)
	})

	it('refuses a request on an ambiguous name with no picks, and applies it once picked (UC18.4)', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })

		expect(await customize('name', { root, request: ask(root), body: draft(root) })).toBe(1)
		expect(lastError().code).toBe('pick-required')
		expect(existsSync(repoFile(root))).toBe(false)
		expect(await customize('name', { root, extends: ['a'], request: ask(root), body: draft(root) })).toBe(0)
	})

	it('refuses a body that records no request, and replaces one that does (UC18.2)', async () => {
		const root = repo()
		const path = write(root, '.agents/references/name.md', '## Create\n\nby hand\n')

		expect(await customize('name', { root, request: ask(root), body: draft(root) })).toBe(1)
		expect(lastError().code).toBe('body-not-generated')
		expect(readFileSync(path, 'utf8')).toBe('## Create\n\nby hand\n')

		write(root, '.agents/references/name.md', '---\nrequest: |\n  old\n---\n\n## Create\n\nold\n')
		expect(await customize('name', { root, request: ask(root), body: draft(root) })).toBe(0)
		expect(readFileSync(path, 'utf8')).toContain('request: |\n  Say it in fewer words.\n')
	})

	it('refuses an unreadable --request or --body file (file-unreadable)', async () => {
		const root = repo()
		expect(await customize('name', { root, request: join(root, 'gone.md'), body: draft(root) })).toBe(1)
		expect(lastError().code).toBe('file-unreadable')
		expect(await customize('name', { root, request: ask(root), body: join(root, 'gone.md') })).toBe(1)
		expect(lastError().code).toBe('file-unreadable')
	})

	it('records only the enabled plugins’ sources for a user target (R81, R84)', async () => {
		const root = repo()
		write(hostRoot, 'references/name.md', base)
		plugins(root, { a: { name: base } })

		expect(
			await customize('name', { root, scope: 'user', extends: ['host'], request: ask(root), body: draft(root) }),
		).toBe(0)
		const content = readFileSync(join(fakeHome.value, '.agents/references/name.md'), 'utf8')
		expect(content).toContain('extends: [host]\nsources:\n  - plugin: host\n')
		expect(content).not.toContain('plugin: a')
	})

	it('writes a folder’s project section with the main document’s sources and no merge or extends', async () => {
		const root = repo()
		mkdirSync(join(root, 'app'))
		plugins(root, { a: { name: base } })

		expect(await customize('name', { root, in: join(root, 'app'), request: ask(root), body: draft(root) })).toBe(0)
		expect(readFileSync(join(root, 'app/.agents/references/name.md'), 'utf8')).toBe(
			'---\nsources:\n  - plugin: a\n    version: 1.0.0\nrequest: |\n  Say it in fewer words.\n---\n\n## Create\n\nshort\n',
		)
	})

	it('prints the path and the exact content with --dry-run, writing nothing (R29)', async () => {
		const root = repo()

		expect(await customize('name', { root, request: ask(root), body: draft(root), 'dry-run': true })).toBe(0)
		expect(written()).toMatch(/\.agents\/references\/name\.md\n\n---\nmerge: patch\nrequest: \|\n/)
		expect(existsSync(repoFile(root))).toBe(false)
	})

	it('prints the trace with the written file’s outcome under --trace (R31)', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })

		expect(await customize('name', { root, request: ask(root), body: draft(root), trace: true })).toBe(0)
		expect(errors()).toMatch(/^ {2}repo .*name\.md: used/m)
		expect(errors()).toMatch(/^ {4}request:\n {6}Say it in fewer words\./m)
	})

	it('writes a user file this repository’s repo remove hides, warning repo-hides-user', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\nmerge: remove\n---\n')

		expect(await customize('name', { root, scope: 'user', request: ask(root), body: draft(root) })).toBe(0)
		expect(existsSync(join(fakeHome.value, '.agents/references/name.md'))).toBe(true)
		expect(errors()).toMatch(/^warning: repo-hides-user: /m)
	})

	it('writes a non-Markdown name whole, in its format, with the record in <name>.meta.md (R92)', async () => {
		const root = repo()
		plugins(root, { a: {} })
		write(root, 'node_modules/a/references/conf.json', '{"a":1}\n')
		const body = write(root, 'body.json', '{"a":2}\n')

		expect(await customize('conf', { root, request: ask(root), body })).toBe(0)
		expect(readFileSync(join(root, '.agents/references/conf.json'), 'utf8')).toBe('{"a":2}\n')
		expect(readFileSync(join(root, '.agents/references/conf.meta.md'), 'utf8')).toBe(
			'---\nsources:\n  - plugin: a\n    version: 1.0.0\nrequest: |\n  Say it in fewer words.\n---\n',
		)
		expect(existsSync(repoFile(root, 'conf'))).toBe(false)
	})

	it('refuses a target answering in <name>/README.md, naming it (J7)', async () => {
		const root = repo()
		const readme = write(root, '.agents/references/name/README.md', '---\nrequest: x\n---\n\n## A\n\na\n')

		expect(await customize('name', { root, request: ask(root), body: draft(root) })).toBe(1)
		expect(lastError()).toMatchObject({ code: 'file-exists', error: expect.stringContaining(readme) })
	})
})

describe('customize --implements (R111)', () => {
	it('writes a whole implementation for a name only an interface defines, recording implements (UC18.12)', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })

		expect(
			await customize('scaffold.recipe.go', {
				root,
				implements: 'scaffold.recipe',
				request: ask(root),
				body: draft(root),
			}),
		).toBe(0)
		expect(readFileSync(repoFile(root, 'scaffold.recipe.go'), 'utf8')).toBe(
			'---\nmerge: replace\nimplements: scaffold.recipe@1\nrequest: |\n  Say it in fewer words.\n---\n\n## Create\n\nshort\n',
		)
	})

	it('refuses a missing name under a found interface’s namespace without --implements, giving the command', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })

		expect(await customize('scaffold.recipe.go', { root, request: ask(root), body: draft(root), format: 'json' })).toBe(
			1,
		)
		expect(json<{ code: string; help: string[] }>()).toMatchObject({
			code: 'implements-required',
			help: [expect.stringContaining('--implements scaffold.recipe --request <file> --body <file>')],
		})
	})

	it('refuses an unknown interface and a name outside the interface’s namespace', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })

		expect(await customize('x', { root, implements: 'nope', request: ask(root), body: draft(root) })).toBe(1)
		expect(lastError().code).toBe('interface-invalid')
		expect(
			await customize('wrong', { root, implements: 'scaffold.recipe', request: ask(root), body: draft(root) }),
		).toBe(1)
		expect(lastError().code).toBe('name-outside-interface')
	})

	it('writes a project section with --in, with no implements or merge, under any name (UC18.14)', async () => {
		const root = repo()
		mkdirSync(join(root, 'app'))
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })

		expect(
			await customize('anything', {
				root,
				in: join(root, 'app'),
				implements: 'scaffold.recipe',
				request: ask(root),
				body: draft(root),
			}),
		).toBe(0)
		expect(readFileSync(join(root, 'app/.agents/references/anything.md'), 'utf8')).toBe(
			'---\nrequest: |\n  Say it in fewer words.\n---\n\n## Create\n\nshort\n',
		)
	})

	it('keeps the implements the target records when customizing it again (J4)', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
		write(
			root,
			'.agents/references/scaffold.recipe.go.md',
			'---\nmerge: replace\nimplements: scaffold.recipe@1\nrequest: |\n  old\n---\n\n## Recipe\n\nold\n',
		)

		expect(await customize('scaffold.recipe.go', { root, request: ask(root), body: draft(root) })).toBe(0)
		expect(readFileSync(repoFile(root, 'scaffold.recipe.go'), 'utf8')).toMatch(
			/^---\nmerge: replace\nimplements: scaffold.recipe@1\nrequest: /,
		)
	})
})

describe('customize --base (R84, J4, J5)', () => {
	it('prints the name built without the target file, the user tier, or managed text; managed extends still builds', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: '## Create\n\nb create\n' } })
		managed({ name: '---\nextends: [a, b]\n---\n\n## Close\n\nmanaged close\n' })
		write(root, '.agents/references/name.md', '---\nrequest: x\n---\n\n## Create\n\nold generated\n')
		write(fakeHome.value, '.agents/references/name.md', '## Close\n\npersonal\n')

		expect(await customize('name', { root, base: true })).toBe(0)
		expect(written()).toBe('## Create\n\nb create\n\n## Close\n\nbase close\n')
		expect(existsSync(join(root, 'request.md'))).toBe(false)
	})

	it('reads the target’s own extends as the picks, and --extends in their place (J4)', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: '## Create\n\nb create\n' } })
		write(root, '.agents/references/name.md', '---\nextends: [b]\n---\n\n## Create\n\nmine\n')

		expect(await customize('name', { root, base: true, format: 'json' })).toBe(0)
		expect(json<ReferenceCustomizeBase>()).toEqual({
			status: 'found',
			stack: ['b'],
			content: '## Create\n\nb create\n',
		})
		expect(await customize('name', { root, base: true, extends: ['a'], format: 'json' })).toBe(0)
		expect(json<ReferenceCustomizeBase>()).toMatchObject({ stack: ['a'], content: base })
	})

	it('leaves the repo tier and the dependency plugins out for a user target (R84, R13)', async () => {
		const root = repo()
		write(hostRoot, 'references/name.md', '## Create\n\nhost create\n')
		plugins(root, { a: { name: base } })
		write(root, '.agents/references/name.md', '---\nmerge: replace\n---\n\n## Create\n\nrepo\n')

		expect(await customize('name', { root, scope: 'user', base: true, format: 'json' })).toBe(0)
		expect(json<ReferenceCustomizeBase>()).toEqual({
			status: 'found',
			stack: ['host'],
			content: '## Create\n\nhost create\n',
		})
	})

	it('gives a folder target the main document and the outer folders’ sections only', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(root, 'packages/.agents/references/name.md', '## Outer\n\nouter\n')
		write(root, 'packages/app/.agents/references/name.md', '## Own\n\nown\n')
		write(root, 'packages/app/deep/.agents/references/name.md', '## Deep\n\ndeep\n')
		write(root, 'other/.agents/references/name.md', '## Other\n\nother\n')

		expect(await customize('name', { root, in: join(root, 'packages/app'), base: true })).toBe(0)
		expect(written()).toBe(`${base.trimEnd()}\n\n<project folder="packages">\n## Outer\n\nouter\n</project>\n`)
	})

	it('puts the interface’s stub before the resolved name, or alone for a missing one (R111)', async () => {
		const root = repo()
		plugins(root, {
			repobuddy: { 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.go': '## Recipe\n\ngo\n' },
		})

		expect(await customize('scaffold.recipe.go', { root, implements: 'scaffold.recipe', base: true })).toBe(0)
		const found = written()
		expect(found).toMatch(/^## Recipe\n\n\*\*Unsupported\.\*\* /)
		expect(found.trimEnd().endsWith('## Recipe\n\ngo')).toBe(true)

		expect(
			await customize('scaffold.recipe.rs', { root, implements: 'scaffold.recipe', base: true, format: 'json' }),
		).toBe(0)
		const missing = json<ReferenceCustomizeBase>()
		expect(missing.status).toBe('missing')
		expect(missing.content).toMatch(/^## Recipe\n\n\*\*Unsupported\.\*\* /)
	})

	it('joins the skill’s default with --default (R41)', async () => {
		const root = repo()
		const folder = skill(root, 'skills/tracker', { name: base })

		expect(await customize('name', { root, default: folder, base: true })).toBe(0)
		expect(written()).toBe(base)
	})

	it('runs a write’s checks and codes (J5)', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })

		expect(await customize('name', { root, base: true })).toBe(1)
		expect(lastError().code).toBe('pick-required')
		expect(await customize('name', { root, base: true, extends: ['c'] })).toBe(1)
		expect(lastError().code).toBe('step-invalid')
		expect(await customize('name', { root, base: true, in: root })).toBe(2)
		expect(lastError().code).toBe('in-not-below-root')
	})

	it('builds a stale document’s input from its recorded picks, never the stale document (UC20)', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(
			root,
			'.agents/references/name.md',
			'---\nextends: [a]\nsources:\n  - plugin: a\n    version: 0.1.0\nrequest: |\n  shorter\n---\n\n## Create\n\nstale\n',
		)

		expect(await customize('name', { root, base: true })).toBe(0)
		expect(written()).toBe(base)
	})
})

describe('customize: flag values and error order (J10, J11, C3)', () => {
	it('refuses combinations that cannot work as options-conflict, and bad values as option-invalid', async () => {
		const root = repo()
		const file = write(root, 'picks.yaml', '- a\n')
		const cases: [Record<string, unknown>, string][] = [
			[{ extends: ['a'], 'extends-file': file }, 'options-conflict'],
			[{ base: true, request: ask(root), body: draft(root) }, 'options-conflict'],
			[{ base: true, 'dry-run': true }, 'options-conflict'],
			[{ implements: 'x', extends: ['a'] }, 'options-conflict'],
			[{ extends: ['none'], request: ask(root), body: draft(root) }, 'options-conflict'],
			[{ extends: ['none', 'a'] }, 'option-invalid'],
			[{ extends: ['a:merge'] }, 'option-invalid'],
			[{ extends: ['a/b/c'] }, 'option-invalid'],
			[{ extends: ['a'], scope: 'project' }, 'option-invalid'],
			[{ request: ask(root), body: draft(root), merge: 'merge' }, 'option-invalid'],
			[{ steps: ['a'], request: ask(root), body: draft(root) }, 'options-missing'],
		]
		for (const [args, code] of cases) {
			expect(await customize('name', { root, ...args })).toBe(2)
			expect(lastError().code).toBe(code)
		}
		expect(existsSync(repoFile(root))).toBe(false)
	})

	it('takes the steps after --extends as more steps, so `--extends a b` lists both', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })

		expect(await customize('name', { root, extends: ['a'], steps: ['b'] })).toBe(0)
		expect(readFileSync(repoFile(root), 'utf8')).toBe('---\nextends: [a, b]\n---\n')
	})

	it('raises a usage error before root-missing, and change-missing before options-conflict', async () => {
		const gone = join(repo(), 'gone')
		expect(await customize('name', { root: gone, plugin: gone })).toBe(2)
		expect(lastError().code).toBe('change-missing')
		expect(await customize('name', { root: gone, extends: ['a'], plugin: gone })).toBe(2)
		expect(lastError().code).toBe('options-conflict')
		expect(await customize('name', { root: gone, extends: ['a'] })).toBe(1)
		expect(lastError().code).toBe('root-missing')
	})

	it('raises file-unreadable, then interface-invalid, then the in-* checks, then step-invalid', async () => {
		const root = repo()
		const gone = join(root, 'gone.md')
		expect(
			await customize('name', { root, in: join(root, 'nope'), implements: 'nope', request: gone, body: gone }),
		).toBe(1)
		expect(lastError().code).toBe('file-unreadable')
		expect(
			await customize('name', {
				root,
				in: join(root, 'nope'),
				implements: 'nope',
				request: ask(root),
				body: draft(root),
			}),
		).toBe(1)
		expect(lastError().code).toBe('interface-invalid')
		expect(await customize('name', { root, in: join(root, 'nope'), request: ask(root), body: draft(root) })).toBe(1)
		expect(lastError().code).toBe('in-folder-missing')
		write(root, '.agents/references/name.json', '{}\n')
		expect(await customize('name', { root, extends: ['c'] })).toBe(1)
		expect(lastError().code).toBe('step-invalid')
	})

	it('raises pick-required before body-not-generated', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		write(root, '.agents/references/name.md', '## Create\n\nby hand\n')
		expect(await customize('name', { root, request: ask(root), body: draft(root) })).toBe(1)
		expect(lastError().code).toBe('pick-required')
		expect(await customize('name', { root, extends: ['a'], request: ask(root), body: draft(root) })).toBe(1)
		expect(lastError().code).toBe('body-not-generated')
	})
})
