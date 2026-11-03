import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
	base,
	create,
	customize,
	fakeHome,
	json,
	plugins,
	remove,
	repo,
	skill,
	tempDir,
	write,
} from './reference-command.fixtures.js'
import { recipeInterface } from './reference-interface.fixtures.js'

/** Every file under a folder, with its text, so a refusal can be shown to write nothing. */
function snapshot(...folders: string[]): Record<string, string> {
	const files: Record<string, string> = {}
	const visit = (top: string, dir: string) => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry)
			if (statSync(path).isDirectory()) visit(top, path)
			else files[`${top}:${relative(top, path)}`] = readFileSync(path, 'utf8')
		}
	}
	for (const folder of folders) visit(folder, folder)
	return files
}

type Fixture = { root: string; home: string; app: string }

type Report = {
	code?: string
	help?: string[]
	content?: string
	warnings?: { code: string }[]
	hints?: string[]
}

type Row = {
	command: 'create' | 'customize' | 'delete'
	/** The flags or input, as the table in the write test cases gives them. */
	flags: string
	name?: string
	setup?: (fixture: Fixture) => void
	args: (fixture: Fixture) => Record<string, unknown>
	/** The code in the error value or the record; none for an allowed row. */
	code?: string
	exit: 0 | 1 | 2
	/** For a row that writes: what the write must show. */
	check?: (fixture: Fixture, report: Report) => void
}

const ask = ({ root }: Fixture) => write(root, 'request.md', 'shorter\n')
const draft = ({ root }: Fixture) => write(root, 'body.md', '## Create\n\nshort\n')
const recipe = ({ root }: Fixture) => plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
const house = ({ root }: Fixture) => {
	const folder = join(root, 'plugins/house')
	write(folder, 'plugin.json', JSON.stringify({ name: 'house' }))
	return folder
}
const tracker = ({ root }: Fixture) => skill(root, 'skills/tracker', { name: base }, 'tracker')
const outside = () => tempDir('reference-outside-')

/**
 * The flag-combination table of the write test cases (UC5.6, 5.7, 5.11, UC18.7, 18.8, 18.11, 18.16,
 * 18.19, R24, R27, R28, R82, E26, E30, E58): one row each, every refusal writing nothing.
 */
const rows: Row[] = [
	...(['create', 'customize', 'delete'] as const).map(
		(command): Row => ({
			command,
			flags: 'qualified name',
			name: 'a/name',
			args: () => ({ extends: ['a'] }),
			code: 'reference-qualified',
			exit: 2,
		}),
	),
	{
		command: 'customize',
		flags: '--plugin (any)',
		args: (f) => ({ plugin: house(f), extends: ['a'] }),
		code: 'options-conflict',
		exit: 2,
	},
	{
		command: 'customize',
		flags: '--default <skill folder> alone',
		args: (f) => ({ default: tracker(f), base: true }),
		exit: 0,
		check: (_, report) => expect(report.content).toBe(base),
	},
	{
		command: 'customize',
		flags: '--default <skill folder> with --scope',
		setup: ({ root }) => plugins(root, { a: { name: base } }),
		args: (f) => ({ default: tracker(f), scope: 'repo', extends: ['default', 'a'] }),
		exit: 0,
		check: ({ root }) =>
			expect(readFileSync(join(root, '.agents/references/name.md'), 'utf8')).toBe('---\nextends: [default, a]\n---\n'),
	},
	{
		command: 'customize',
		flags: '--default <skill folder> with --in',
		args: (f) => ({ default: tracker(f), in: f.app, request: ask(f), body: draft(f) }),
		exit: 0,
		check: ({ app }) =>
			expect(readFileSync(join(app, '.agents/references/name.md'), 'utf8')).toContain('- default: tracker\n'),
	},
	{
		command: 'customize',
		flags: '--scope with --in',
		args: (f) => ({ scope: 'repo', in: f.app, request: ask(f), body: draft(f) }),
		code: 'options-conflict',
		exit: 2,
	},
	{
		command: 'customize',
		flags: '--in with --merge',
		args: (f) => ({ in: f.app, merge: 'patch', request: ask(f), body: draft(f) }),
		code: 'options-conflict',
		exit: 2,
	},
	{
		command: 'customize',
		flags: '--in with --extends',
		args: (f) => ({ in: f.app, extends: ['none'] }),
		code: 'options-conflict',
		exit: 2,
	},
	{ command: 'customize', flags: 'neither --extends nor --request', args: () => ({}), code: 'change-missing', exit: 2 },
	{
		command: 'customize',
		flags: '--request without --body',
		args: (f) => ({ request: ask(f) }),
		code: 'options-missing',
		exit: 2,
	},
	{
		command: 'customize',
		flags: '--body without --request',
		args: (f) => ({ body: draft(f) }),
		code: 'options-missing',
		exit: 2,
	},
	{
		command: 'customize',
		flags: '--in naming the root',
		args: (f) => ({ in: f.root, request: ask(f), body: draft(f) }),
		code: 'in-not-below-root',
		exit: 2,
	},
	{
		command: 'customize',
		flags: '--in outside the root',
		args: (f) => ({ in: outside(), request: ask(f), body: draft(f) }),
		code: 'in-not-below-root',
		exit: 2,
	},
	{
		command: 'customize',
		flags: '--in for a name whose main document is not Markdown',
		setup: ({ root }) => write(root, '.agents/references/name.json', '{}\n'),
		args: (f) => ({ in: f.app, request: ask(f), body: draft(f) }),
		code: 'in-not-markdown',
		exit: 1,
	},
	{
		command: 'customize',
		flags: '--request file unreadable',
		args: (f) => ({ request: join(f.root, 'gone.md'), body: draft(f) }),
		code: 'file-unreadable',
		exit: 1,
	},
	{
		command: 'customize',
		flags: '--body file unreadable',
		args: (f) => ({ request: ask(f), body: join(f.root, 'gone.md') }),
		code: 'file-unreadable',
		exit: 1,
	},
	{
		command: 'customize',
		flags: '--request, target holds a body recording no request',
		setup: ({ root }) => write(root, '.agents/references/name.md', '## Create\n\nby hand\n'),
		args: (f) => ({ request: ask(f), body: draft(f) }),
		code: 'body-not-generated',
		exit: 1,
	},
	{
		command: 'customize',
		flags: '--request, no --extends, name ambiguous',
		setup: ({ root }) => plugins(root, { a: { name: base }, b: { name: base } }),
		args: (f) => ({ request: ask(f), body: draft(f) }),
		code: 'pick-required',
		exit: 1,
	},
	{
		command: 'customize',
		flags: "--request, no --implements, missing name under a found interface's namespace",
		name: 'scaffold.recipe.go',
		setup: recipe,
		args: (f) => ({ request: ask(f), body: draft(f) }),
		code: 'implements-required',
		exit: 1,
		check: (_, report) => expect(report.help?.join(' ')).toContain('--implements scaffold.recipe'),
	},
	{
		command: 'customize',
		flags: '--implements with unknown interface',
		args: (f) => ({ implements: 'nope', request: ask(f), body: draft(f) }),
		code: 'interface-invalid',
		exit: 1,
	},
	{
		command: 'customize',
		flags: "--implements for a name outside the interface's namespace",
		setup: recipe,
		args: (f) => ({ implements: 'scaffold.recipe', request: ask(f), body: draft(f) }),
		code: 'name-outside-interface',
		exit: 1,
	},
	{
		command: 'customize',
		flags: '--implements with --in',
		setup: recipe,
		args: (f) => ({ implements: 'scaffold.recipe', in: f.app, request: ask(f), body: draft(f) }),
		exit: 0,
		check: ({ app }) => {
			const content = readFileSync(join(app, '.agents/references/name.md'), 'utf8')
			expect(content).not.toMatch(/^(implements|merge):/m)
		},
	},
	{
		command: 'customize',
		flags: '--base',
		setup: ({ root }) => plugins(root, { a: { name: base } }),
		args: () => ({ base: true }),
		exit: 0,
		check: (_, report) => expect(report.content).toBe(base),
	},
	{
		command: 'create',
		flags: '--scope with --in',
		args: (f) => ({ scope: 'user', in: f.app }),
		code: 'options-conflict',
		exit: 2,
	},
	{
		command: 'create',
		flags: '--plugin with --default',
		args: (f) => ({ plugin: house(f), default: tracker(f) }),
		code: 'options-conflict',
		exit: 2,
	},
	{
		command: 'create',
		flags: '--merge with --in',
		args: (f) => ({ merge: 'patch', in: f.app }),
		code: 'options-conflict',
		exit: 2,
	},
	{
		command: 'create',
		flags: '--in naming the root',
		args: (f) => ({ in: f.root }),
		code: 'in-not-below-root',
		exit: 2,
	},
	{
		command: 'create',
		flags: '--in outside the root',
		args: () => ({ in: outside() }),
		code: 'in-not-below-root',
		exit: 2,
	},
	{
		command: 'create',
		flags: '--merge remove with --template',
		args: ({ root }) => ({ merge: 'remove', template: write(root, 't.md', '## A\n') }),
		code: 'remove-with-template',
		exit: 2,
	},
	{
		command: 'create',
		flags: '--template with --implements',
		args: ({ root }) => ({ implements: 'scaffold.recipe', template: write(root, 't.md', '## A\n') }),
		code: 'template-with-implements',
		exit: 2,
	},
	{ command: 'create', flags: 'unknown --merge', args: () => ({ merge: 'merge' }), code: 'option-invalid', exit: 2 },
	{
		command: 'create',
		flags: '--merge remove alone',
		args: () => ({ merge: 'remove' }),
		exit: 0,
		check: ({ root }) =>
			expect(readFileSync(join(root, '.agents/references/name.md'), 'utf8')).toBe('---\nmerge: remove\n---\n'),
	},
	{
		command: 'create',
		flags: 'unreadable template',
		args: ({ root }) => ({ template: join(root, 'gone.md') }),
		code: 'template-invalid',
		exit: 1,
	},
	{
		command: 'create',
		flags: 'template frontmatter not a mapping',
		args: ({ root }) => ({ template: write(root, 't.md', '---\n- a\n---\n\n## A\n') }),
		code: 'template-invalid',
		exit: 1,
	},
	{
		command: 'create',
		flags: 'unknown interface for --implements',
		args: () => ({ implements: 'nope' }),
		code: 'interface-invalid',
		exit: 1,
	},
	{
		command: 'create',
		flags: 'title template',
		args: ({ root }) => ({ template: write(root, 't.md', '# Title\n\n## A\n\na\n') }),
		code: 'template-title',
		exit: 1,
	},
	{
		command: 'create',
		flags: 'template with no description',
		args: ({ root }) => ({ template: write(root, 't.md', '## A\n\na\n') }),
		exit: 0,
		check: (_, report) => expect(report.hints?.join(' ')).toMatch(/`list` and `search` show it blank/),
	},
	{
		command: 'create',
		flags: '--in for a name whose main document is not Markdown',
		setup: ({ root }) => write(root, '.agents/references/name.json', '{}\n'),
		args: (f) => ({ in: f.app }),
		code: 'in-not-markdown',
		exit: 1,
	},
	{
		command: 'create',
		flags: '--plugin folder with no plugin manifest',
		args: ({ root }) => ({ plugin: join(root, 'plain') }),
		code: 'folder-invalid',
		exit: 1,
	},
	{
		command: 'create',
		flags: '--default folder with no SKILL.md',
		args: ({ root }) => ({ default: join(root, 'plain') }),
		code: 'folder-invalid',
		exit: 1,
	},
	{
		command: 'create',
		flags: '--plugin folder outside the repository',
		args: () => {
			const folder = outside()
			write(folder, 'plugin.json', JSON.stringify({ name: 'out' }))
			return { plugin: folder }
		},
		code: 'folder-invalid',
		exit: 1,
	},
	{
		command: 'create',
		flags: '--default folder outside the repository',
		args: () => ({ default: skill(outside(), 'tracker') }),
		code: 'folder-invalid',
		exit: 1,
	},
	{
		command: 'create',
		flags: '--plugin file extending a plugin, with merge: replace',
		setup: ({ root }) => plugins(root, { a: { name: base } }),
		args: (f) => ({
			plugin: house(f),
			merge: 'replace',
			template: write(f.root, 't.md', '---\nextends: [a]\n---\n\n## A\n'),
		}),
		code: 'extends-replace',
		exit: 1,
	},
	{
		command: 'create',
		flags: '--default file extending a plugin, with merge: replace',
		setup: ({ root }) => plugins(root, { a: { name: base } }),
		args: (f) => ({
			default: skill(f.root, 'skills/other'),
			merge: 'replace',
			template: write(f.root, 't.md', '---\nextends: [a]\n---\n\n## A\n'),
		}),
		code: 'extends-replace',
		exit: 1,
	},
	{
		command: 'create',
		flags: '--in with a template holding merge, extends, implements, and aliases',
		args: (f) => ({
			in: f.app,
			template: write(
				f.root,
				't.md',
				'---\nmerge: combine\nextends: [a]\nimplements: x@1\naliases: [old]\n---\n\n## A\n',
			),
		}),
		exit: 0,
		check: (_, report) =>
			expect(report.warnings?.map(({ code }) => code)).toEqual(Array(4).fill('project-section-key-ignored')),
	},
	{
		command: 'create',
		flags: 'file exists with a body',
		setup: ({ root }) => write(root, '.agents/references/name.md', '## A\n\na\n'),
		args: () => ({}),
		code: 'file-exists',
		exit: 1,
	},
	{
		command: 'create',
		flags: 'a file answering the name in another form',
		setup: ({ root }) => write(root, '.agents/references/name/README.md', '## A\n\na\n'),
		args: () => ({}),
		code: 'file-exists',
		exit: 1,
	},
	{
		command: 'delete',
		flags: '--scope with --in',
		args: (f) => ({ scope: 'user', in: f.app }),
		code: 'options-conflict',
		exit: 2,
	},
	{
		command: 'delete',
		flags: '--plugin with --default',
		args: (f) => ({ plugin: house(f), default: tracker(f) }),
		code: 'options-conflict',
		exit: 2,
	},
	{
		command: 'delete',
		flags: '--in outside the root',
		args: () => ({ in: outside() }),
		code: 'in-not-below-root',
		exit: 2,
	},
	{
		command: 'delete',
		flags: '--plugin folder with no manifest',
		args: ({ root }) => ({ plugin: join(root, 'plain') }),
		code: 'folder-invalid',
		exit: 1,
	},
	{
		command: 'delete',
		flags: '--default folder with no SKILL.md',
		args: ({ root }) => ({ default: join(root, 'plain') }),
		code: 'folder-invalid',
		exit: 1,
	},
	{
		command: 'delete',
		flags: '--plugin folder outside the repository',
		args: () => {
			const folder = outside()
			write(folder, 'plugin.json', JSON.stringify({ name: 'out' }))
			return { plugin: folder }
		},
		code: 'folder-invalid',
		exit: 1,
	},
	{
		command: 'delete',
		flags: 'no file at the place chosen',
		args: () => ({}),
		code: 'no-file',
		exit: 0,
		check: (_, report) => expect(report).toMatchObject({ code: 'no-file' }),
	},
]

const run = { create, customize, delete: remove }

describe('the flag-combination table (write test cases)', () => {
	it.each(rows.map((row) => [`${row.command} ${row.flags}`, row] as const))('%s', async (_, row) => {
		const root = repo()
		const app = join(root, 'app')
		mkdirSync(app)
		const fixture = { root, home: fakeHome.value, app }
		row.setup?.(fixture)
		const args = row.args(fixture)
		const before = snapshot(root, fixture.home)

		expect(await run[row.command](row.name ?? 'name', { root, format: 'json', ...args })).toBe(row.exit)
		const report = json<Report>()
		if (row.code) expect(report.code).toBe(row.code)
		else expect(report.code).toBeUndefined()
		// A refusal, a no-op, and --base write nothing.
		if (row.exit !== 0 || row.code || args['base']) expect(snapshot(root, fixture.home)).toEqual(before)
		row.check?.(fixture, report)
	})
})
