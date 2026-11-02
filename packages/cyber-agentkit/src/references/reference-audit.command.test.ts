import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceCheckReport, ReferenceCreateReport } from './reference.command.js'
import {
	base,
	check,
	create,
	customize,
	errors,
	fakeHome,
	hostRoot,
	implementations,
	json,
	lastError,
	list,
	load,
	managed,
	plugins,
	remove,
	repo,
	search,
	skill,
	stdout,
	where,
	write,
	written,
} from './reference-command.fixtures.js'
import { capabilitiesInterface, githubCapabilities } from './reference-interface.fixtures.js'

/** Every file under the folders, with its text and its modification time, so a read can be shown to touch nothing. */
function snapshot(...folders: string[]): Record<string, string> {
	const files: Record<string, string> = {}
	const visit = (top: string, dir: string) => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry)
			const stat = statSync(path)
			if (stat.isDirectory()) visit(top, path)
			else files[`${top}:${relative(top, path)}`] = `${stat.mtimeMs}:${readFileSync(path, 'utf8')}`
		}
	}
	for (const folder of folders) visit(folder, folder)
	return files
}

describe('read commands write nothing (R19, E21)', () => {
	it('creates, changes, and deletes no file in the repository, the home, or the host plugin', async () => {
		const root = repo()
		plugins(root, { a: { name: base, 'p.capabilities.interface': capabilitiesInterface } })
		write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n\n## Create\n\nmine\n')
		write(root, '.agents/references/p.capabilities.github.md', githubCapabilities.replace('project-tracker', 'p'))
		write(root, 'packages/app/.agents/references/name.md', '## Create\n\nnear\n')
		write(fakeHome.value, '.agents/references/other.md', '## U\n\nuser\n')
		write(hostRoot, 'references/hosted.md', 'host\n')
		skill(root, 'skills/tracker', { name: base })
		const dir = managed({ name: '## M\n\nmanaged\n' })

		const reads: [string, () => Promise<number>][] = [
			['load', () => load(['name', 'other', 'gone'], { root, trace: true })],
			['where', () => where('name', { root })],
			['list', () => list({ root, trace: true })],
			['search', () => search('create', { root, trace: true })],
			['check', () => check(undefined, { root, trace: true })],
			['implementations', () => implementations('p.capabilities', { root, trace: true })],
		]
		for (const [command, run] of reads) {
			const before = snapshot(root, fakeHome.value, hostRoot, dir)
			expect(await run(), command).toBeLessThan(2)
			expect(snapshot(root, fakeHome.value, hostRoot, dir), command).toEqual(before)
		}
	})
})

describe('delete keeps what is not the user’s file (R30, UC11)', () => {
	it('never deletes a managed contribution or an installed plugin copy, and says what answers now', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		const installed = join(root, 'node_modules/a/references/name.md')
		const dir = managed({ name: '## M\n\nmanaged\n' })
		const managedFile = join(dir, 'references/name.md')

		expect(await remove('name', { root, format: 'json' })).toBe(0)
		expect(json()).toMatchObject({ code: 'no-file', status: 'found' })
		expect(existsSync(installed)).toBe(true)
		expect(existsSync(managedFile)).toBe(true)

		stdout.mockClear()
		expect(await remove('name', { root })).toBe(0)
		expect(written()).toMatch(/no-file: .*nothing was deleted\. "name" is answered by/)
		expect(existsSync(installed)).toBe(true)
		expect(existsSync(managedFile)).toBe(true)
	})

	it('deletes only the repo file when the managed and installed ones answer the same name', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		const dir = managed({ name: '## M\n\nmanaged\n' })
		const own = write(root, '.agents/references/name.md', '## Create\n\nmine\n')

		expect(await remove('name', { root })).toBe(0)
		expect(existsSync(own)).toBe(false)
		expect(existsSync(join(root, 'node_modules/a/references/name.md'))).toBe(true)
		expect(existsSync(join(dir, 'references/name.md'))).toBe(true)
	})
})

describe('create into a folder the stack does not read (R31, UC5.10)', () => {
	it('skips the hide check and shows no trace row for a --plugin folder that is no dependency', async () => {
		const root = repo()
		const folder = join(root, 'plugins/house')
		write(folder, 'plugin.json', JSON.stringify({ name: 'house' }))
		write(root, '.agents/references/name.md', '---\nmerge: replace\n---\n\n## Create\n\nmine\n')
		const template = write(root, 't.md', '## Create\n\nhouse\n')

		expect(await create('name', { root, plugin: folder, template, trace: true, format: 'json' })).toBe(0)
		const report = json<ReferenceCreateReport & { warnings?: { code: string }[] }>()
		expect(existsSync(join(folder, 'references/name.md'))).toBe(true)
		expect(report.warnings ?? []).toEqual([])
		expect((report.trace?.layers ?? []).some(({ path }) => path.startsWith(folder))).toBe(false)
		expect(errors()).not.toMatch(/reference-hidden|shadowed/)
	})
})

describe('search ranks and matches close names (R17)', () => {
	const names = (value: { references: { name: string; match: string }[] }) =>
		value.references.map(({ name, match }) => `${name} ${match}`)

	it('ranks name, prefix, close name, description, heading, then body, and by name within a kind', async () => {
		const root = repo()
		const doc = (frontmatter: string, body: string) => `---\n${frontmatter}\n---\n\n${body}`
		write(root, '.agents/references/tracker.md', doc('description: x', '## X\n\nx\n'))
		write(root, '.agents/references/tracker-b.md', doc('description: x', '## X\n\nx\n'))
		write(root, '.agents/references/tracker-a.md', doc('description: x', '## X\n\nx\n'))
		write(root, '.agents/references/my-tracker.md', doc('description: x', '## X\n\nx\n'))
		write(root, '.agents/references/aa-desc.md', doc('description: all about tracker', '## X\n\nx\n'))
		write(root, '.agents/references/bb-head.md', doc('description: x', '## Tracker\n\nx\n'))
		write(root, '.agents/references/cc-body.md', doc('description: x', '## X\n\nthe tracker is here\n'))

		expect(await search('tracker', { root })).toBe(0)
		expect(names(json())).toEqual([
			'tracker name',
			'tracker-a prefix',
			'tracker-b prefix',
			'my-tracker close name',
			'aa-desc description',
			'bb-head heading',
			'cc-body body',
		])
	})

	it('matches a close name by containing the query', async () => {
		const root = repo()
		write(root, '.agents/references/mytracker.md', '---\ndescription: x\n---\n\n## X\n\nx\n')

		expect(await search('racke', { root })).toBe(0)
		expect(names(json())).toEqual(['mytracker close name'])
	})

	it('matches within a distance of max(1, floor(n / 4)) characters, and no further', async () => {
		const root = repo()
		write(root, '.agents/references/testing.md', '---\ndescription: x\n---\n\n## X\n\nx\n')
		write(root, '.agents/references/documentation.md', '---\ndescription: x\n---\n\n## X\n\nx\n')

		// n = 6: floor(6 / 4) = 1, so the bound is 1
		expect(await search('testng', { root })).toBe(0)
		expect(names(json())).toEqual(['testing close name'])
		stdout.mockClear()
		expect(await search('tesxng', { root })).toBe(0)
		expect(written()).toMatch(/0 references match/)

		// n = 13: floor(13 / 4) = 3
		stdout.mockClear()
		expect(await search('dxcxmentxtion', { root })).toBe(0)
		expect(names(json())).toEqual(['documentation close name'])
		stdout.mockClear()
		expect(await search('dxcxmxntxtion', { root })).toBe(0)
		expect(written()).toMatch(/0 references match/)
	})
})

describe('names that are not names (R1, E1)', () => {
	it.each([
		['a leading dot', '.name'],
		['a trailing dot', 'name.'],
		['two dots', '..'],
		['a doubled dot', 'na..me'],
		['a leading dot after a plugin', 'a/.name'],
		['an empty segment', 'a//name'],
		['an empty name after the plugin', 'a/'],
		['an empty plugin', '/name'],
	])('reads %s as invalid, and the other names still resolve', async (_, value) => {
		const root = repo()
		plugins(root, { a: { name: 'plugin\n' } })
		write(root, '.agents/references/name.md', 'mine\n')

		expect(await load([value, 'name'], { root, format: 'json' })).toBe(0)
		expect(json()).toEqual([{ name: value, status: 'invalid', code: 'reference-invalid' }, 'mine\n'])
	})

	it('never reads references/../README.md for ..', async () => {
		const root = repo()
		write(root, '.agents/README.md', 'secret\n')
		write(root, '.agents/references/name.md', 'mine\n')

		expect(await load(['..'], { root })).toBe(0)
		expect(written()).not.toContain('secret')
		expect(written()).toContain('status="invalid"')
	})
})

describe('a compose failure in check (UC6.8)', () => {
	it('fails compose in check, while load of the same name still answers with its warning', async () => {
		const root = repo()
		write(root, '.agents/references/notes.md', '---\nmerge: bogus\n---\n\n## Notes\n\nbody\n')

		expect(await check(['notes'], { root })).toBe(0)
		expect(json<ReferenceCheckReport>().failed?.[0]?.failures.map(({ check }) => check)).toContain('compose')

		stdout.mockClear()
		expect(await load(['notes'], { root, format: 'json' })).toBe(0)
		expect(json()).toEqual([
			{
				name: 'notes',
				status: 'found',
				content: '## Notes\n\nbody\n',
				warnings: [{ code: 'merge-unknown', message: expect.any(String) }],
			},
		])
	})
})

describe('an implementation whose interface is not installed (UC15.6)', () => {
	it('fails interface-found in check, and still loads by its name', async () => {
		const root = repo()
		write(root, '.agents/references/p.capabilities.github.md', githubCapabilities.replace('project-tracker', 'p'))

		expect(await check(['p.capabilities.github'], { root })).toBe(0)
		expect(json<ReferenceCheckReport>().failed?.[0]?.failures.map(({ check }) => check)).toEqual(['interface-found'])

		stdout.mockClear()
		expect(await load(['p.capabilities.github'], { root })).toBe(0)
		expect(written()).toContain('## Tracker')
	})

	it('fails the same for a plugin implementation whose interface plugin is absent', async () => {
		const root = repo()
		plugins(root, { gh: { 'p.capabilities.github': githubCapabilities.replace('project-tracker', 'p') } })

		expect(await check(['gh/p.capabilities.github'], { root })).toBe(0)
		expect(json<ReferenceCheckReport>().failed?.[0]?.failures.map(({ check }) => check)).toEqual(['interface-found'])
		stdout.mockClear()
		expect(await load(['gh/p.capabilities.github'], { root })).toBe(0)
		expect(written()).toContain('## Tracker')
	})
})

describe('a malformed extends (R106)', () => {
	const setup = (extendsLine: string) => {
		const root = repo()
		plugins(root, { a: { name: '## Create\n\nplugin a\n' } })
		write(root, '.agents/references/name.md', `---\n${extendsLine}\n---\n\n## Create\n\nmine\n`)
		return root
	}

	it.each([
		['not a list', 'extends: 5'],
		['a step of a bad type', 'extends: [5]'],
		['a step with keys it does not take', 'extends:\n  - a:\n      bogus: 1'],
		['a step that is not a name', 'extends: ["a b"]'],
	])('reads %s as not written, warning extends-invalid', async (_, line) => {
		const root = setup(line)
		const unwritten = setup('merge: patch')

		expect(await load(['name'], { root, format: 'json' })).toBe(0)
		const [entry] = json<{ content: string; warnings?: { code: string }[] }[]>()
		stdout.mockClear()
		expect(await load(['name'], { root: unwritten, format: 'json' })).toBe(0)
		const [plain] = json<string[]>()
		expect(entry?.warnings?.map(({ code }) => code)).toContain('extends-invalid')
		expect(entry?.content).toBe(plain)
	})

	it('reads a bad merge in a step as patch, warning merge-unknown', async () => {
		const root = setup('extends:\n  - a:\n      merge: bogus')

		expect(await load(['name'], { root, format: 'json' })).toBe(0)
		const [entry] = json<{ content: string; warnings?: { code: string }[] }[]>()
		expect(entry?.warnings?.map(({ code }) => code)).toContain('merge-unknown')
		expect(entry?.warnings?.map(({ code }) => code)).not.toContain('extends-invalid')
	})
})

describe('a refused command’s error value in text output (R45)', () => {
	it('is on stdout with its code, and nothing is on stderr', async () => {
		const root = repo()

		expect(await create('a/name', { root })).toBe(2)
		expect(written()).toMatch(/^error: .+\ncode: reference-qualified$/m)
		expect(lastError().code).toBe('reference-qualified')
		expect(errors()).toBe('')
	})

	it('carries help when the error has some', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '## Create\n\nby hand\n')
		const request = write(root, 'request.md', 'shorter\n')
		const body = write(root, 'body.md', '## Create\n\nshort\n')

		expect(await customize('name', { root, request, body })).toBe(1)
		expect(written()).toMatch(/^error: .+\ncode: body-not-generated$/m)
		expect(written()).toMatch(/^help.*\n?.*Update mode/m)
		expect(errors()).toBe('')
	})
})

describe('list pattern (R16)', () => {
	it('takes everything but * literally, and is case-sensitive', async () => {
		const root = repo()
		for (const name of ['a.b', 'axb', 'A.b', 'a.B', 'a.c', 'a-b']) write(root, `.agents/references/${name}.md`, 'x\n')
		const found = async (pattern: string) => {
			stdout.mockClear()
			expect(await list({ root, pattern })).toBe(0)
			return (json<{ references?: { name: string }[] }>().references ?? []).map(({ name }) => name).sort()
		}

		expect(await found('a.b')).toEqual(['a.b'])
		expect(await found('a.B')).toEqual(['a.B'])
		expect(await found('A.*')).toEqual(['A.b'])
		expect(await found('a.*')).toEqual(['a.B', 'a.b', 'a.c'])
		expect(await found('a*b')).toEqual(['a-b', 'a.b', 'axb'])
		expect(await found('a.(b)')).toEqual([])
	})
})
