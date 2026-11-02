import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { type cli, exitCodes } from 'clibuilder'
import { isCliError, printAnswer } from 'clibuilder/axi'
import { afterEach, beforeEach, vi } from 'vitest'
import { createReferenceCommands } from './reference.command.js'

/** The command reads the home directory itself; a fixture per test needs its own fake one. */
const fakeHomeHoisted = vi.hoisted(() => ({ value: '' }))
export const fakeHome = fakeHomeHoisted

vi.mock('node:os', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:os')>()
	return { ...actual, homedir: () => fakeHomeHoisted.value }
})

/**
 * What the resolver throws on the next call, so the commands' own failure path — including the
 * branch where the thrown value is not an `Error` — can be reached.
 */
const failureHoisted = vi.hoisted(() => ({ value: undefined as unknown }))
export const failure = failureHoisted

vi.mock('./resolve-reference.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./resolve-reference.js')>()
	const failing =
		<T extends (...args: never[]) => unknown>(fn: T) =>
		(...args: Parameters<T>) => {
			if (failureHoisted.value !== undefined) throw failureHoisted.value
			return fn(...args)
		}
	return { ...actual, resolveReference: failing(actual.resolveReference) }
})

/**
 * The harness the command sees, and where it keeps managed policy. The real ones read the process
 * environment and fixed system folders, which a test can neither choose nor write.
 */
const harnessHoisted = vi.hoisted(() => ({
	candidates: [] as string[],
	managed: undefined as { kind: string; location: string; description: string; research: string }[] | undefined,
}))
export const harness = harnessHoisted

vi.mock('../detection/detect-harness.js', () => ({
	detectHarness: () => ({
		harness: harnessHoisted.candidates.length === 1 ? harnessHoisted.candidates[0] : 'unknown',
		evidence: [],
		candidates: harnessHoisted.candidates,
	}),
}))

vi.mock('../managed-policy/managed-policy-locations.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../managed-policy/managed-policy-locations.js')>()
	return {
		...actual,
		managedPolicyLocations: (...args: Parameters<typeof actual.managedPolicyLocations>) =>
			harnessHoisted.managed ?? actual.managedPolicyLocations(...args),
	}
})

export function tempDir(prefix = 'reference-'): string {
	return mkdtempSync(join(tmpdir(), prefix))
}

/** The plugin running the command; its `references/` is emptied before each test. */
export const hostRoot = tempDir('reference-host-')

export const commands = createReferenceCommands({ plugin: { name: 'host', root: hostRoot } })

export const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
export const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

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

export type Args = Record<string, unknown>

export const show = (names: string[], args: Args = {}) => exec(commands.show, { format: 'text', names, ...args })
export const list = (args: Args = {}) => exec(commands.list, { format: 'json', ...args })
export const search = (query: string, args: Args = {}) => exec(commands.search, { format: 'json', query, ...args })
export const where = (name: string, args: Args = {}) => exec(commands.where, { format: 'json', name, ...args })
export const check = (names: string[] | undefined, args: Args = {}) =>
	exec(commands.check, { format: 'json', names, ...args })
export const implementations = (id: string, args: Args = {}) =>
	exec(commands.implementations, { format: 'json', id, ...args })
export const create = (name: string, args: Args = {}) => exec(commands.create, { format: 'text', name, ...args })
export const select = (name: string, options: string[], args: Args = {}) =>
	exec(commands.select, { format: 'text', name, options, ...args })
export const remove = (name: string, args: Args = {}) => exec(commands.delete, { format: 'text', name, ...args })

/** Everything the last run put on stdout, concatenated. */
export function written(): string {
	return stdout.mock.calls.map(([value]: unknown[]) => String(value)).join('')
}

export function json<T>(): T {
	return JSON.parse(written()) as T
}

export function errors(): string {
	return stderr.mock.calls.map(([value]: unknown[]) => String(value)).join('')
}

/** Writes a file, creating its parent directories. */
export function write(root: string, relPath: string, content: string): string {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
	return path
}

/** A repository root: the project tier reads up to it, and a source-folder write must stay inside it. */
export function repo(): string {
	const root = tempDir('reference-repo-')
	writeFileSync(join(root, 'pnpm-workspace.yaml'), '')
	return root
}

export type PluginSpec = { manifest?: string | undefined; documents?: Record<string, string> }

/**
 * Declares each package as a dependency of `root` and installs it under `node_modules`; a package
 * with a `manifest` name is a plugin, named by it.
 */
export function dependencies(root: string, packages: Record<string, PluginSpec>): void {
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
export function plugins(root: string, documents: Record<string, Record<string, string>>): void {
	dependencies(
		root,
		Object.fromEntries(Object.entries(documents).map(([name, docs]) => [name, { manifest: name, documents: docs }])),
	)
}

/** A skill folder holding `SKILL.md` and its defaults. */
export function skill(root: string, folder: string, defaults: Record<string, string> = {}, name = folder): string {
	const dir = join(root, folder)
	write(dir, 'SKILL.md', `---\nname: ${name}\ndescription: a skill\n---\n\n# Skill\n`)
	for (const [ref, content] of Object.entries(defaults)) write(dir, `references/${ref}.default.md`, content)
	return dir
}

export function managed(documents: Record<string, string>): string {
	const dir = tempDir('reference-managed-')
	harness.candidates = ['claude-code']
	harness.managed = [{ kind: 'file', location: join(dir, 'managed-settings.json'), description: '', research: '' }]
	for (const [name, content] of Object.entries(documents)) write(dir, `references/${name}.md`, content)
	return dir
}

export const base = '## Create\n\nbase create\n\n## Close\n\nbase close\n'

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
