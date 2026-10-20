import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { type cli, exitCodes } from 'clibuilder'
import { isCliError, printAnswer } from 'clibuilder/axi'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createReferenceCommand,
	createReferenceCommands,
	type ReferenceCheckReport,
	type ReferenceCreateReport,
	type ReferenceDeleteReport,
	type ReferenceImplementationsReport,
	type ReferenceListReport,
	type ReferenceSearchReport,
	type ReferenceSelectReport,
	type ReferenceWhereOutput,
} from './reference.command.js'
import {
	githubCapabilities,
	recipeInterface,
	routingInterface,
	typescriptRecipe,
} from './reference-interface.fixtures.js'
import type { ReferenceTrace } from './resolve-reference.js'

/** The command reads the home directory itself; a fixture per test needs its own fake one. */
const fakeHome = vi.hoisted(() => ({ value: '' }))

vi.mock('node:os', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:os')>()
	return { ...actual, homedir: () => fakeHome.value }
})

/**
 * What the resolver throws on the next call, so the commands' own failure path — including the
 * branch where the thrown value is not an `Error` — can be reached.
 */
const failure = vi.hoisted(() => ({ value: undefined as unknown }))

vi.mock('./resolve-reference.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./resolve-reference.js')>()
	const failing =
		<T extends (...args: never[]) => unknown>(fn: T) =>
		(...args: Parameters<T>) => {
			if (failure.value !== undefined) throw failure.value
			return fn(...args)
		}
	return { ...actual, resolveReference: failing(actual.resolveReference) }
})

/**
 * The harness the command sees, and where it keeps managed policy. The real ones read the process
 * environment and fixed system folders, which a test can neither choose nor write.
 */
const harness = vi.hoisted(() => ({
	candidates: [] as string[],
	managed: undefined as { kind: string; location: string; description: string; research: string }[] | undefined,
}))

vi.mock('../detection/detect-harness.js', () => ({
	detectHarness: () => ({
		harness: harness.candidates.length === 1 ? harness.candidates[0] : 'unknown',
		evidence: [],
		candidates: harness.candidates,
	}),
}))

vi.mock('../managed-policy/managed-policy-locations.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../managed-policy/managed-policy-locations.js')>()
	return {
		...actual,
		managedPolicyLocations: (...args: Parameters<typeof actual.managedPolicyLocations>) =>
			harness.managed ?? actual.managedPolicyLocations(...args),
	}
})

function tempDir(prefix = 'reference-'): string {
	return mkdtempSync(join(tmpdir(), prefix))
}

/** The plugin running the command; its `references/` is emptied before each test. */
const hostRoot = tempDir('reference-host-')

const commands = createReferenceCommands({ plugin: { name: 'host', root: hostRoot } })

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

/**
 * Runs a command the way the cli does: with the resolved `format` on `this`, printing what `run()`
 * returns on stdout and mapping a thrown `CliError` to its exit code.
 */
async function exec(command: cli.Command, args: Record<string, unknown> & { format?: string }): Promise<number> {
	const { format = 'toon', ...rest } = args
	try {
		const answer = await (command as unknown as { run(this: object, value: object): Promise<unknown> }).run.call(
			{ format },
			rest,
		)
		const text = printAnswer(answer, format as 'toon' | 'json' | 'text')
		if (text !== undefined) process.stdout.write(text)
		return exitCodes.success
	} catch (error) {
		if (isCliError(error)) return error.exitCode
		throw error
	}
}

type Args = Record<string, unknown>

const show = (names: string[], args: Args = {}) => exec(commands.show, { format: 'text', names, ...args })
const list = (args: Args = {}) => exec(commands.list, { format: 'json', ...args })
const search = (query: string, args: Args = {}) => exec(commands.search, { format: 'json', query, ...args })
const where = (name: string, args: Args = {}) => exec(commands.where, { format: 'json', name, ...args })
const check = (names: string[] | undefined, args: Args = {}) => exec(commands.check, { format: 'json', names, ...args })
const implementations = (id: string, args: Args = {}) => exec(commands.implementations, { format: 'json', id, ...args })
const create = (name: string, args: Args = {}) => exec(commands.create, { format: 'text', name, ...args })
const select = (name: string, options: string[], args: Args = {}) =>
	exec(commands.select, { format: 'text', name, options, ...args })
const remove = (name: string, args: Args = {}) => exec(commands.delete, { format: 'text', name, ...args })

/** Everything the last run put on stdout, concatenated. */
function written(): string {
	return stdout.mock.calls.map(([value]: unknown[]) => String(value)).join('')
}

function json<T>(): T {
	return JSON.parse(written()) as T
}

function errors(): string {
	return stderr.mock.calls.map(([value]: unknown[]) => String(value)).join('')
}

/** Writes a file, creating its parent directories. */
function write(root: string, relPath: string, content: string): string {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
	return path
}

/** A repository root: the project tier reads up to it, and a source-folder write must stay inside it. */
function repo(): string {
	const root = tempDir('reference-repo-')
	writeFileSync(join(root, 'pnpm-workspace.yaml'), '')
	return root
}

type PluginSpec = { manifest?: string | undefined; documents?: Record<string, string> }

/**
 * Declares each package as a dependency of `root` and installs it under `node_modules`; a package
 * with a `manifest` name is a plugin, named by it.
 */
function dependencies(root: string, packages: Record<string, PluginSpec>): void {
	const declared = Object.fromEntries(Object.keys(packages).map((pkg) => [pkg, '1.0.0']))
	write(root, 'package.json', JSON.stringify({ name: 'fixture', dependencies: declared }))
	for (const [pkg, { manifest, documents = {} }] of Object.entries(packages)) {
		const dir = join('node_modules', pkg)
		write(root, join(dir, 'package.json'), JSON.stringify({ name: pkg, version: '1.0.0' }))
		if (manifest) write(root, join(dir, 'plugin.json'), JSON.stringify({ name: manifest }))
		mkdirSync(join(root, dir, 'references'), { recursive: true })
		for (const [name, content] of Object.entries(documents)) write(root, join(dir, 'references', `${name}.md`), content)
	}
}

/** Plugins named as their packages. */
function plugins(root: string, documents: Record<string, Record<string, string>>): void {
	dependencies(
		root,
		Object.fromEntries(Object.entries(documents).map(([name, docs]) => [name, { manifest: name, documents: docs }])),
	)
}

/** A skill folder holding `SKILL.md` and its defaults. */
function skill(root: string, folder: string, defaults: Record<string, string> = {}, name = folder): string {
	const dir = join(root, folder)
	write(dir, 'SKILL.md', `---\nname: ${name}\ndescription: a skill\n---\n\n# Skill\n`)
	for (const [ref, content] of Object.entries(defaults)) write(dir, `references/${ref}.default.md`, content)
	return dir
}

function managed(documents: Record<string, string>): string {
	const dir = tempDir('reference-managed-')
	harness.candidates = ['claude-code']
	harness.managed = [{ kind: 'file', location: join(dir, 'managed-settings.json'), description: '', research: '' }]
	for (const [name, content] of Object.entries(documents)) write(dir, `references/${name}.md`, content)
	return dir
}

const base = '## Create\n\nbase create\n\n## Close\n\nbase close\n'

beforeEach(() => {
	fakeHome.value = tempDir('reference-home-')
	rmSync(join(hostRoot, 'references'), { recursive: true, force: true })
	failure.value = undefined
	harness.candidates = []
	harness.managed = undefined
	stdout.mockClear()
	stderr.mockClear()
	process.exitCode = undefined
})

afterEach(() => {
	process.exitCode = undefined
})

describe('reference command', () => {
	it('groups every subcommand under `reference`', () => {
		const command = createReferenceCommand() as unknown as { name: string; commands: { name: string }[] }

		expect(command.name).toBe('reference')
		expect(command.commands.map(({ name }) => name)).toEqual([
			'show',
			'list',
			'search',
			'where',
			'create',
			'select',
			'delete',
			'implementations',
			'check',
		])
	})
})

describe('show: tiers', () => {
	it('applies managed over project over user over the plugins, each patching what is below', async () => {
		const root = repo()
		plugins(root, { a: { name: '## A\n\nplugin\n' } })
		write(fakeHome.value, '.agents/references/name.md', '## U\n\nuser\n')
		write(root, '.agents/references/name.md', '## A\n\nproject\n')
		managed({ name: '## M\n\nmanaged\n' })

		expect(await show(['name'], { root })).toBe(0)
		expect(written()).toBe('## A\n\nproject\n\n## U\n\nuser\n\n## M\n\nmanaged\n')
	})

	it('puts the nearer project folder above the repository root', async () => {
		const root = repo()
		const sub = join(root, 'packages', 'app')
		write(root, '.agents/references/name.md', '## A\n\nroot\n\n## B\n\nroot b\n')
		write(sub, '.agents/references/name.md', '## A\n\nnear\n')

		expect(await show(['name'], { root: sub })).toBe(0)
		expect(written()).toBe('## A\n\nnear\n\n## B\n\nroot b\n')
	})

	it('reads no governances folder in any tier', async () => {
		const root = repo()
		write(root, '.agents/governances/name.md', 'legacy\n')
		write(fakeHome.value, '.agents/governances/name.md', 'legacy\n')

		expect(await show(['name'], { root })).toBe(1)
		expect(errors()).toContain('error: reference-missing:')
	})

	it("reads the running plugin's own references once", async () => {
		const root = repo()
		write(hostRoot, 'references/name.md', 'host\n')

		expect(await show(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ trace: ReferenceTrace }[]>()
		expect(entry?.trace.layers.filter(({ plugin }) => plugin === 'host')).toHaveLength(1)
	})

	it('names a dependency plugin by its manifest, never by its package name', async () => {
		const root = repo()
		dependencies(root, { '@scope/pkg': { manifest: 'house', documents: { name: 'house\n' } } })

		expect(await show(['house/name'], { root })).toBe(0)
		expect(written()).toBe('house\n')
		stdout.mockClear()
		expect(await show(['@scope/pkg/name'], { root })).toBe(1)
		expect(errors()).toContain('error: reference-invalid:')
	})

	it('reads no layer for a dependency that is not a plugin, and the trace says so', async () => {
		const root = repo()
		dependencies(root, { lib: { documents: { name: 'lib\n' } } })

		expect(await show(['name'], { root, format: 'json', trace: true })).toBe(1)
		const [entry] = json<{ status: string; trace: ReferenceTrace }[]>()
		expect(entry?.status).toBe('missing')
		expect(entry?.trace.layers.find(({ path }) => path.includes('lib'))?.outcome).toBe('not read (not a plugin)')
	})

	it('skips managed policy that cannot be read locally, and names the detected harnesses', async () => {
		harness.candidates = ['claude-code']
		harness.managed = [
			{ kind: 'macos-managed-preferences', location: 'com.anthropic.claudecode', description: '', research: '' },
		]
		const root = repo()
		write(root, '.agents/references/name.md', 'project\n')

		expect(await show(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ trace: ReferenceTrace }[]>()
		expect(entry?.trace.harnesses).toEqual(['claude-code'])
		expect(entry?.trace.layers.find(({ path }) => path === 'com.anthropic.claudecode')?.outcome).toMatch(
			/^not read \(claude-code keeps this policy in a macOS managed-preferences domain/,
		)
	})

	it('shows no managed folder when no harness is detected', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', 'project\n')

		expect(await show(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ trace: ReferenceTrace }[]>()
		expect(entry?.trace.layers[0]).toMatchObject({
			tier: 'managed',
			outcome: expect.stringMatching(/^not read \(no harness/),
		})
	})
})

describe('show: the default tier', () => {
	it("reads <skill>/references/<name>.default.md with --default, under a plugin's contribution", async () => {
		const root = repo()
		const folder = skill(root, 'skills/tracker', { name: base })

		expect(await show(['name'], { root, default: folder })).toBe(0)
		expect(written()).toBe(base)
	})

	it('does not read the old references/<name>.md copy as a default', async () => {
		const root = repo()
		const folder = skill(root, 'skills/tracker')
		write(folder, 'references/name.md', 'old layout\n')

		expect(await show(['name'], { root, default: folder })).toBe(1)
	})

	it('warns when the skill folder does not exist, and resolves without it', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', 'project\n')

		expect(await show(['name'], { root, default: join(root, 'nowhere') })).toBe(0)
		expect(written()).toBe('project\n')
		expect(errors()).toMatch(/^warning: default-folder-missing: /m)
	})

	it('warns, naming reference select, when a plugin answers over the default with no extends naming either', async () => {
		const root = repo()
		plugins(root, { a: { name: '## Create\n\nplugin\n' } })
		const folder = skill(root, 'skills/tracker', { name: base })

		expect(await show(['name'], { root, default: folder })).toBe(0)
		expect(written()).toBe('## Create\n\nplugin\n\n## Close\n\nbase close\n')
		expect(errors()).toMatch(/warning: default-not-selected: .*reference select name/)
	})
})

describe('show: text output', () => {
	it('prints one document alone, and several as <reference> blocks in the order asked', async () => {
		const root = repo()
		write(root, '.agents/references/a.md', 'alpha\n')
		write(root, '.agents/references/b.md', 'beta\n')

		expect(await show(['b', 'a'], { root })).toBe(0)
		expect(written()).toBe('<reference name="b">\nbeta\n</reference>\n\n<reference name="a">\nalpha\n</reference>\n')
		expect(errors()).toBe('')
	})

	it('marks a name not found in place, writes its coded error to stderr, and exits 1', async () => {
		const root = repo()
		write(root, '.agents/references/a.md', 'alpha\n')

		expect(await show(['a', 'gone', 'x.md'], { root })).toBe(1)
		expect(written()).toBe(
			'<reference name="a">\nalpha\n</reference>\n\n<reference name="gone" status="missing" />\n\n<reference name="x.md" status="invalid" />\n',
		)
		expect(errors()).toMatch(/^error: reference-missing: /m)
		expect(errors()).toMatch(/^error: reference-invalid: /m)
	})

	it('exits 1 with nothing on stdout when the one name is not found', async () => {
		expect(await show(['gone'], { root: repo() })).toBe(1)
		expect(written()).toBe('')
	})

	it('exits 2 when no name is given', async () => {
		expect(await show([], { root: repo() })).toBe(2)
		expect(errors()).toMatch(/^error: usage: /)
	})

	it('writes a warning to stderr with its code, leaving stdout and the exit code alone', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\nmerge: first-wins\n---\n\nbody\n')

		expect(await show(['name'], { root })).toBe(0)
		expect(written()).toBe('body\n')
		expect(errors()).toMatch(/^warning: merge-unknown: .*read as patch$/m)
	})

	it('reports an ambiguous name with its error, exit 1', async () => {
		const root = repo()
		plugins(root, { a: { name: 'a\n' }, b: { name: 'b\n' } })

		expect(await show(['name'], { root })).toBe(1)
		expect(errors()).toMatch(
			/^error: reference-ambiguous: name: the plugins a, b hold it, and no extends orders them; options: a\/name, b\/name$/m,
		)
	})

	it('writes the trace to stderr: a summary line, the sections, then the layers', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n\n## Create\n\nmine\n')

		expect(await show(['name'], { root, trace: true })).toBe(0)
		expect(written()).toBe('## Create\n\nmine\n\n## Close\n\nbase close\n')
		const trace = errors()
		expect(trace).toMatch(/^name: found; stack: a; built by project .*; harnesses: none detected$/m)
		expect(trace).toMatch(/^sections:\n {2}Create: project .* \(patch\)\n {2}Close: plugin a \(patch\)$/m)
		expect(trace).toMatch(/^layers:$/m)
		expect(trace).toMatch(/^ {2}project .*name\.md: used; patch from default {"extends":\["a"\]}$/m)
	})

	it('shows a removed section and the shadowed layers in the text trace', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(root, '.agents/references/name.md', '---\nmerge: replace\n---\n\n## Only\n\nmine\n')

		expect(await show(['name'], { root, trace: true })).toBe(0)
		expect(errors()).toMatch(/plugin a .*: shadowed by project .* \(replace\)/)
	})

	it('names the reason in the text trace of a name not found', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(root, '.agents/references/name.md', '---\nmerge: remove\n---\n')

		expect(await show(['name'], { root, trace: true })).toBe(1)
		expect(errors()).toMatch(/^ {2}"name" is turned off by project .* \(remove\)$/m)
	})
})

describe('show: structured output (R38, R47)', () => {
	it('gives a found name with no warnings as its content string', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', 'body\n')

		expect(await show(['name'], { root, format: 'json' })).toBe(0)
		expect(json()).toEqual(['body\n'])
	})

	it('gives a found name with warnings as a record, and keeps the warnings off stderr', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\nmerge: bogus\n---\n\nbody\n')

		expect(await show(['name'], { root, format: 'json' })).toBe(0)
		expect(json()).toEqual([
			{
				name: 'name',
				status: 'found',
				content: 'body\n',
				warnings: [{ code: 'merge-unknown', message: expect.stringContaining('read as patch') }],
			},
		])
		expect(errors()).toBe('')
	})

	it('gives a name not found as a record of name, status, and code; options when ambiguous', async () => {
		const root = repo()
		plugins(root, { a: { amb: 'a\n' }, b: { amb: 'b\n' } })

		expect(await show(['gone', 'amb', 'a/b/c'], { root, format: 'json' })).toBe(1)
		expect(json()).toEqual([
			{ name: 'gone', status: 'missing', code: 'reference-missing' },
			{ name: 'amb', status: 'ambiguous', code: 'reference-ambiguous', options: ['a/amb', 'b/amb'] },
			{ name: 'a/b/c', status: 'invalid', code: 'reference-invalid' },
		])
	})

	it('makes every entry a record with status and metadata under --metadata, without merge and extends', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\ndescription: d\ncontract: 2\nmerge: patch\n---\n\nbody\n')

		expect(await show(['name'], { root, format: 'json', metadata: true })).toBe(0)
		expect(json()).toEqual([
			{ name: 'name', status: 'found', content: 'body\n', metadata: { description: 'd', contract: 2 } },
		])
	})

	it('adds the trace under --trace, with the home directory collapsed', async () => {
		const root = repo()
		write(fakeHome.value, '.agents/references/name.md', 'user\n')

		expect(await show(['name'], { root, format: 'toon', trace: true })).toBe(0)
		expect(written()).toContain('~/.agents/references/name.md')
		stdout.mockClear()
		expect(await show(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ trace: ReferenceTrace }[]>()
		expect(entry?.trace.contributions).toEqual([
			{ tier: 'user', path: '~/.agents/references/name.md', operation: 'patch' },
		])
		expect(entry?.trace.stack).toEqual([])
	})

	it('warns when a document fails its interface check (R37)', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
		write(root, '.agents/references/scaffold.recipe.bad.md', '---\nimplements: scaffold.recipe@9\n---\n\n## Recipe\n')

		expect(await show(['scaffold.recipe.bad'], { root, format: 'json' })).toBe(0)
		const [entry] = json<{ warnings: { code: string; message: string }[] }[]>()
		expect(entry?.warnings).toEqual([{ code: 'interface-check', message: expect.stringContaining('(version)') }])
	})

	it('reports a thrown failure as an error, exit 1', async () => {
		const root = repo()
		failure.value = new Error('boom')
		expect(await show(['name'], { root })).toBe(1)
		expect(errors()).toBe('error: boom\n')

		stderr.mockClear()
		failure.value = 'not an error'
		expect(await show(['name'], { root })).toBe(1)
		expect(errors()).toBe('error: Reference lookup failed.\n')
	})
})

describe('list', () => {
	it('gives one row per name, its status and options when not found, and a defaults note', async () => {
		const root = repo()
		plugins(root, { a: { amb: 'a\n', gone: base }, b: { amb: 'b\n' } })
		write(root, '.agents/references/doc.md', '---\ndescription: |\n  First line.\n  Second.\n---\n\nbody\n')
		write(root, '.agents/references/gone.md', '---\nmerge: remove\n---\n')

		expect(await list({ root })).toBe(0)
		const report = json<ReferenceListReport>()
		expect(report.references).toEqual([
			{ name: 'amb', status: 'ambiguous', options: ['a/amb', 'b/amb'] },
			{ name: 'doc', description: 'First line.' },
			{ name: 'gone', status: 'missing' },
		])
		expect(report.defaults).toMatch(/no harness detected/)
		expect(report.layers).toBeUndefined()
	})

	it('adds one row per name per layer under --trace, marking a selection', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n')

		expect(await list({ root, trace: true })).toBe(0)
		expect(json<ReferenceListReport>().layers).toEqual([
			{
				name: 'name',
				tier: 'project',
				path: join(root, '.agents/references/name.md'),
				outcome: 'used',
				selection: true,
			},
			{ name: 'name', tier: 'plugin', plugin: 'a', path: expect.stringContaining('name.md'), outcome: 'used' },
		])
	})

	it('shows a name a remove turned off as missing, and each row below it shadowed', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(root, '.agents/references/name.md', '---\nmerge: remove\n---\n')

		expect(await list({ root, trace: true })).toBe(0)
		const report = json<ReferenceListReport>()
		expect(report.references).toEqual([{ name: 'name', status: 'missing' }])
		expect(report.layers?.map(({ outcome }) => outcome)).toEqual([
			'used',
			expect.stringMatching(/^shadowed by project .*\(remove\)$/),
		])
	})

	it('keeps exactly the names a pattern matches', async () => {
		const root = repo()
		write(root, '.agents/references/tracker.capabilities.github.md', 'x\n')
		write(root, '.agents/references/tracker.capabilities.jira.md', 'x\n')
		write(root, '.agents/references/tracker.routing.md', 'x\n')

		expect(await list({ root, pattern: 'tracker.capabilities.*' })).toBe(0)
		expect((json<ReferenceListReport>().references as { name: string }[]).map(({ name }) => name)).toEqual([
			'tracker.capabilities.github',
			'tracker.capabilities.jira',
		])
	})

	it('states an explicit zero', async () => {
		const root = repo()
		expect(await list({ root })).toBe(0)
		expect(json<ReferenceListReport>().references).toBe('0 references — no layer holds one')

		stdout.mockClear()
		write(root, '.agents/references/a.md', 'x\n')
		expect(await list({ root, pattern: 'zzz*' })).toBe(0)
		expect(json<ReferenceListReport>().references).toBe('0 references match "zzz*"')
	})

	it('gives the warnings resolving raised', async () => {
		const root = repo()
		write(root, '.agents/references/a.md', '---\nmerge: bogus\n---\n\nx\n')

		expect(await list({ root })).toBe(0)
		expect(json<ReferenceListReport>().warnings).toEqual([{ code: 'merge-unknown', message: expect.any(String) }])
	})

	it('reports a thrown failure', async () => {
		const root = repo()
		write(root, '.agents/references/a.md', 'x\n')
		failure.value = 'nope'
		expect(await list({ root })).toBe(1)
		expect(errors()).toBe('error: Reference listing failed.\n')
	})
})

describe('search', () => {
	it('gives matches of name, description, and match, best first, with no echoed query', async () => {
		const root = repo()
		write(root, '.agents/references/testing.md', '---\ndescription: How to test.\n---\n\nbody\n')
		write(root, '.agents/references/other.md', '---\ndescription: About testing things.\n---\n\nbody\n')

		expect(await search('testing', { root })).toBe(0)
		const report = json<ReferenceSearchReport>()
		expect(report).toEqual({
			references: [
				{ name: 'testing', description: 'How to test.', match: 'name' },
				{ name: 'other', description: 'About testing things.', match: 'description' },
			],
			defaults: expect.any(String),
		})
	})

	it('adds the tier and plugin under --trace, and searches an unordered name once per plugin', async () => {
		const root = repo()
		plugins(root, { a: { guide: 'alpha guide\n' }, b: { guide: 'beta guide\n' } })

		expect(await search('guide', { root, trace: true })).toBe(0)
		expect(json<ReferenceSearchReport>().references).toEqual([
			{ name: 'a/guide', match: 'name', tier: 'plugin', plugin: 'a' },
			{ name: 'b/guide', match: 'name', tier: 'plugin', plugin: 'b' },
		])
	})

	it('leaves out a name a remove turned off, and states an explicit zero', async () => {
		const root = repo()
		plugins(root, { a: { guide: 'guide\n' } })
		write(root, '.agents/references/guide.md', '---\nmerge: remove\n---\n')

		expect(await search('guide', { root })).toBe(0)
		expect(json<ReferenceSearchReport>().references).toBe('0 references match "guide"')
	})

	it('exits 2 on an empty query', async () => {
		expect(await search('  ', { root: repo() })).toBe(2)
	})

	it('reports a thrown failure', async () => {
		const root = repo()
		write(root, '.agents/references/a.md', 'x\n')
		failure.value = 'nope'
		expect(await search('a', { root })).toBe(1)
		expect(errors()).toBe('error: Reference search failed.\n')
	})
})

describe('where', () => {
	it('gives the project and user files, who each reaches, and the heading paths below each', async () => {
		const root = repo()
		plugins(root, { a: { name: '## Create\n\n### Steps\n\nsteps\n' } })
		write(fakeHome.value, '.agents/references/name.md', '## Close\n\nuser\n')

		expect(await where('name', { root })).toBe(0)
		expect(json<ReferenceWhereOutput>()).toEqual({
			name: 'name',
			status: 'found',
			places: [
				{
					scope: 'project',
					path: '.agents/references/name.md',
					reaches: 'everyone working in this repository',
					status: 'empty',
					sections: ['Create', 'Create > Steps', 'Close'],
				},
				{
					scope: 'user',
					path: '~/.agents/references/name.md',
					reaches: 'only you, in every repository',
					status: 'used',
					sections: ['Create', 'Create > Steps'],
				},
			],
		})
	})

	it('exits 0 on an ambiguous name, giving the options a selection chooses between', async () => {
		const root = repo()
		plugins(root, { a: { name: 'a\n' }, b: { name: 'b\n' } })

		expect(await where('name', { root })).toBe(0)
		const report = json<ReferenceWhereOutput>()
		expect(report.status).toBe('ambiguous')
		expect(report.options).toEqual(['a/name', 'b/name'])
		expect(report.places.map(({ scope }) => scope)).toEqual(['project', 'user'])
	})

	it('takes --default, so the sections below include the default', async () => {
		const root = repo()
		const folder = skill(root, 'skills/tracker', { name: '## Default\n\nd\n' })

		expect(await where('name', { root, default: folder })).toBe(0)
		expect(json<ReferenceWhereOutput>().places[0]?.sections).toEqual(['Default'])
	})

	it('adds the layers under --trace, a plugin read-only among them', async () => {
		const root = repo()
		plugins(root, { a: { name: 'a\n' } })

		expect(await where('name', { root, trace: true })).toBe(0)
		expect(json<ReferenceWhereOutput>().layers?.find(({ plugin }) => plugin === 'a')?.outcome).toBe('used')
	})

	it('exits 1 on an invalid name', async () => {
		expect(await where('a/b/c', { root: repo() })).toBe(1)
		expect(errors()).toMatch(/^error: reference-invalid: /)
	})

	it('writes warnings to stderr in text', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\nmerge: bogus\n---\n\nx\n')
		expect(await where('name', { root, format: 'text' })).toBe(0)
		expect(errors()).toMatch(/^warning: merge-unknown: /)
	})

	it('reports a thrown failure', async () => {
		failure.value = 'nope'
		expect(await where('name', { root: repo() })).toBe(1)
		expect(errors()).toBe('error: Reference placement lookup failed.\n')
	})
})

describe('check', () => {
	it('gives only the failures and the count that pass', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
		write(root, '.agents/references/scaffold.recipe.typescript-lib.md', typescriptRecipe)
		write(root, '.agents/references/scaffold.recipe.bad.md', '---\nimplements: scaffold.recipe@9\n---\n\n## Recipe\n')

		expect(await check(undefined, { root })).toBe(1)
		expect(json<ReferenceCheckReport>()).toEqual({
			failed: [{ name: 'scaffold.recipe.bad', failures: [{ check: 'version', message: 'unknown version 9' }] }],
			passed: 2,
		})
	})

	it('exits 0 when every check passes, and adds every entry under --trace', async () => {
		const root = repo()
		plugins(root, {
			repobuddy: {
				'project-tracker.capabilities.interface': (await import('./reference-interface.fixtures.js'))
					.capabilitiesInterface,
				'project-tracker.capabilities.github': githubCapabilities,
			},
		})

		expect(await check(['project-tracker.capabilities.github'], { root, trace: true })).toBe(0)
		expect(json<ReferenceCheckReport>()).toEqual({
			passed: 1,
			references: [
				{
					name: 'project-tracker.capabilities.github',
					kind: 'implementation',
					status: 'passed',
					unsupported: ['Retype'],
				},
			],
		})
	})

	it('fails a name not found with its status code, and writes the summary error in text', async () => {
		const root = repo()
		expect(await check(['gone'], { root, format: 'text' })).toBe(1)
		expect(errors()).toMatch(/^error: interface-check: 1 of 1 references fail their check\.$/m)
		stdout.mockClear()
		expect(await check(['gone'], { root })).toBe(1)
		expect(json<ReferenceCheckReport>().failed).toEqual([
			{ name: 'gone', failures: [{ check: 'reference-missing', message: expect.any(String) }] },
		])
	})

	it('fails the compose check when composing raised a warning', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'project-tracker.routing.interface': routingInterface } })
		write(root, '.agents/references/project-tracker.routing.interface.md', '---\nmerge: patch\n---\n\nhigher\n')

		expect(await check(['project-tracker.routing.interface'], { root })).toBe(1)
		expect(json<ReferenceCheckReport>().failed?.[0]?.failures.map(({ check }) => check)).toEqual(['compose'])
	})

	it('reports a thrown failure', async () => {
		failure.value = 'nope'
		expect(await check(['x'], { root: repo() })).toBe(1)
		expect(errors()).toBe('error: Reference check failed.\n')
	})
})

describe('implementations', () => {
	function fixture(): string {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
		write(root, '.agents/references/scaffold.recipe.typescript-lib.md', typescriptRecipe)
		write(root, '.agents/references/scaffold.recipe.bad.md', '---\nimplements: scaffold.recipe@9\n---\n\n## Recipe\n')
		return root
	}

	it('gives each pin, description, and unsupported sections', async () => {
		expect(await implementations('scaffold.recipe', { root: fixture() })).toBe(0)
		expect(json<ReferenceImplementationsReport>()).toEqual({
			implementations: [
				{
					pin: 'scaffold.recipe.typescript-lib',
					description: 'A TypeScript library.',
					unsupported: ['Inputs', 'Config', 'Verify', 'Post'],
				},
			],
		})
	})

	it('adds the name, tier, version, the interface, and the ones left out under --trace', async () => {
		expect(await implementations('scaffold.recipe', { root: fixture(), trace: true })).toBe(0)
		const report = json<ReferenceImplementationsReport>()
		expect(report).toMatchObject({
			interface: 'scaffold.recipe',
			cardinality: 'many',
			accept: [1],
			excluded: [{ name: 'scaffold.recipe.bad', reasons: ['version: unknown version 9'] }],
		})
		expect(report.implementations).toEqual([
			expect.objectContaining({ name: 'scaffold.recipe.typescript-lib', tier: 'project', version: 1 }),
		])
	})

	it('states an explicit zero, and takes --accept', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
		expect(await implementations('scaffold.recipe', { root, accept: '1, 2' })).toBe(0)
		expect(json<ReferenceImplementationsReport>().implementations).toBe('0 implementations of scaffold.recipe')
	})

	it('exits 2 on a malformed --accept, and 1 on an unknown interface', async () => {
		expect(await implementations('scaffold.recipe', { root: repo(), accept: 'one' })).toBe(2)
		expect(await implementations('nope', { root: repo() })).toBe(1)
		expect(errors()).toMatch(/error: no interface document nope\.interface/)
	})
})

describe('create', () => {
	it('writes the project file with merge: patch by default, and points to show', async () => {
		const root = repo()

		expect(await create('name', { root })).toBe(0)
		const content = readFileSync(join(root, '.agents/references/name.md'), 'utf8')
		expect(content).toMatch(/^---\ndescription: .*\ntags: \[topic\]\nmerge: patch\n---\n\n## Overview\n/)
		expect(written()).toContain('Run `show name` for the composed document.')
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
		expect(await create('other', { root, merge: 'remove', template })).toBe(1)
		expect(errors()).toMatch(/error: options-conflict: --merge remove/)
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
		expect(errors()).toMatch(/is named scaffold\.recipe\.<key>, not "wrong"/)
		expect(await create('scaffold.recipe.x', { root, implements: 'scaffold.recipe', template })).toBe(1)
		expect(await create('scaffold.recipe.x', { root, implements: 'a/b/c' })).toBe(1)
	})

	it('refuses a title template and writes nothing', async () => {
		const root = repo()
		const template = write(root, 't.md', '---\ndescription: d\n---\n\n# Title\n\n## A\n\na\n')

		expect(await create('name', { root, template })).toBe(1)
		expect(errors()).toMatch(/error: template-title: .*"# Title"/)
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
		expect(errors()).toMatch(/cannot read the template/)
		const list = write(root, 'l.md', '---\n- a\n---\n\n## A\n')
		expect(await create('name', { root, template: list })).toBe(1)
		expect(errors()).toMatch(/not a YAML mapping/)
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
		expect(errors()).toMatch(/error: file-exists: .*Update mode/)
	})

	it('refuses when a replace or a remove above would hide the new file, naming it', async () => {
		const root = repo()
		managed({ name: '---\nmerge: replace\n---\n\nmanaged\n' })

		expect(await create('name', { root })).toBe(1)
		expect(errors()).toMatch(/error: hidden: managed .*name\.md \(replace\) applies above it/)

		stderr.mockClear()
		harness.managed = undefined
		harness.candidates = []
		write(root, '.agents/references/other.md', '---\nmerge: remove\n---\n')
		expect(await create('other', { root, scope: 'user' })).toBe(1)
		expect(errors()).toMatch(/error: hidden: project .*\(remove\)/)
	})

	it('is not hidden by a replace with no body', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\nmerge: replace\nextends: []\n---\n')
		expect(await create('name', { root, scope: 'user' })).toBe(0)
	})

	it('refuses a qualified name, naming the bare one', async () => {
		expect(await create('a/name', { root: repo() })).toBe(1)
		expect(errors()).toMatch(/error: reference-qualified: .*ask for "name"/)
		expect(await create('x.md', { root: repo() })).toBe(1)
		expect(errors()).toMatch(/error: reference-invalid:/)
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
		expect(errors()).toMatch(/error: folder-invalid: .*no plugin manifest/)

		const outside = tempDir('reference-outside-')
		write(outside, 'plugin.json', JSON.stringify({ name: 'out' }))
		expect(await create('name', { root, plugin: outside })).toBe(1)
		expect(errors()).toMatch(/outside the repository/)

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
		expect(await create('other', { root, default: folder, merge: 'patch' })).toBe(1)
	})

	it('refuses a --default folder with no SKILL.md, or outside the repository', async () => {
		const root = repo()
		expect(await create('name', { root, default: join(root, 'plain') })).toBe(1)
		expect(errors()).toMatch(/no SKILL\.md/)
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

describe('select', () => {
	it('writes extends listing the options bottom first, and reports what answers', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: '## Create\n\nb\n' } })

		expect(await select('name', ['a', 'b/name'], { root })).toBe(0)
		expect(readFileSync(join(root, '.agents/references/name.md'), 'utf8')).toBe('---\nextends: [a, b]\n---\n')
		expect(written()).toMatch(/extends: \[a, b\]\. "name" is answered by plugin b, on the stack a → b\./)
	})

	it('keeps the body and other keys, changing only extends', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		const path = write(
			root,
			'.agents/references/name.md',
			'---\ndescription: mine\nextends: [a]\n---\n\n## Create\n\nmine\n',
		)

		expect(await select('name', ['b', 'default'], { root, format: 'json' })).toBe(0)
		expect(readFileSync(path, 'utf8')).toBe('---\ndescription: mine\nextends: [b, default]\n---\n\n## Create\n\nmine\n')
		expect(json<ReferenceSelectReport>()).toMatchObject({ extends: ['b', 'default'], status: 'found', stack: ['b'] })
	})

	it('writes to the user tier with --scope user', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		expect(await select('name', ['a'], { root, scope: 'user' })).toBe(0)
		expect(existsSync(join(fakeHome.value, '.agents/references/name.md'))).toBe(true)
	})

	it('refuses an option that is neither default nor a plugin holding the name, writing nothing', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { other: 'x\n' } })

		expect(await select('name', ['b'], { root })).toBe(1)
		expect(errors()).toMatch(
			/error: option-invalid: b is neither default nor a plugin holding "name"; the plugins holding it are a\./,
		)
		expect(existsSync(join(root, '.agents/references/name.md'))).toBe(false)
	})

	it('refuses a qualified name, and exits 2 with no option', async () => {
		const root = repo()
		expect(await select('a/name', ['a'], { root })).toBe(1)
		expect(await select('name', [], { root })).toBe(2)
	})

	it('removes extends with --clear, deleting a file left with nothing in it', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		const empty = write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n')
		const kept = write(root, '.agents/references/other.md', '---\nextends: [a]\n---\n\nbody\n')

		expect(await select('name', [], { root, clear: true })).toBe(0)
		expect(existsSync(empty)).toBe(false)
		expect(written()).toMatch(/selection cleared; the file was left empty and deleted/)
		expect(await select('other', [], { root, clear: true, format: 'json' })).toBe(0)
		expect(readFileSync(kept, 'utf8')).toBe('body\n')
	})

	it('fails --clear with no selection, stating what answers the name now', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })

		expect(await select('name', [], { root, clear: true })).toBe(1)
		expect(errors()).toMatch(
			/error: no-selection: the project tier holds no selection of "name"\. "name" is answered by plugin a/,
		)
		expect(await select('name', ['a'], { root, clear: true })).toBe(2)
	})
})

describe('delete', () => {
	it('deletes the project file and reports the status and stack afterwards', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		const path = write(root, '.agents/references/name.md', '## Create\n\nmine\n')

		expect(await remove('name', { root, format: 'json' })).toBe(0)
		expect(existsSync(path)).toBe(false)
		expect(json<ReferenceDeleteReport>()).toEqual({
			path,
			status: 'found',
			stack: ['a'],
			answer: '"name" is answered by plugin a, on the stack a.',
		})
	})

	it('says when a selection went with the file, naming reference select, and gives the options it leaves', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n\n## Create\n\nmine\n')

		expect(await remove('name', { root })).toBe(0)
		expect(written()).toMatch(
			/deleted\. "name" is ambiguous: .* Also, the selection extends: \[a\] went with it; run `reference select name <option>\.\.\.` to restore it\./,
		)
	})

	it('fails with no file there, stating what answers the name now', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })

		expect(await remove('name', { root })).toBe(1)
		expect(errors()).toMatch(/error: no-file: .*does not exist.*"name" is answered by plugin a/)
	})

	it('prints the answer afterwards with --dry-run, deleting nothing', async () => {
		const root = repo()
		const path = write(fakeHome.value, '.agents/references/name.md', 'user\n')
		write(root, '.agents/references/name.md', 'project\n')

		expect(await remove('name', { root, scope: 'user', 'dry-run': true })).toBe(0)
		expect(existsSync(path)).toBe(true)
		expect(written()).toMatch(/would delete\. "name" is answered by the project file/)
	})

	it('deletes a folder-form file and its emptied folder', async () => {
		const root = repo()
		const path = write(root, '.agents/references/name/README.md', 'folder\n')

		expect(await remove('name', { root })).toBe(0)
		expect(existsSync(dirname(path))).toBe(false)
	})

	it('acts on a plugin or a skill source folder with --plugin or --default', async () => {
		const root = repo()
		const plugin = join(root, 'plugins/house')
		write(plugin, 'plugin.json', JSON.stringify({ name: 'house' }))
		const pluginFile = write(plugin, 'references/name.md', 'x\n')
		const folder = skill(root, 'skills/tracker', { name: 'd\n' })

		expect(await remove('name', { root, plugin })).toBe(0)
		expect(existsSync(pluginFile)).toBe(false)
		expect(await remove('name', { root, default: folder })).toBe(0)
		expect(existsSync(join(folder, 'references/name.default.md'))).toBe(false)
	})

	it('refuses a qualified name, and exits 2 on conflicting places', async () => {
		const root = repo()
		expect(await remove('a/name', { root })).toBe(1)
		expect(await remove('name', { root, scope: 'user', default: root })).toBe(2)
	})

	it('reports a thrown failure', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', 'x\n')
		failure.value = 'nope'
		expect(await remove('name', { root })).toBe(1)
		expect(errors()).toBe('error: Reference deletion failed.\n')
	})
})

describe('symlinked skill folders', () => {
	it('reads a default through a symlinked skill folder given to --default', async () => {
		const root = repo()
		const real = skill(root, 'store/tracker', { name: 'linked\n' })
		const link = join(root, '.agents/skills/pnpm-pkg-tracker')
		mkdirSync(dirname(link), { recursive: true })
		symlinkSync(real, link)

		expect(await show(['name'], { root, default: link })).toBe(0)
		expect(written()).toBe('linked\n')
	})
})
