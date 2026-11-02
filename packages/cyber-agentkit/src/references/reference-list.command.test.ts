import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceListReport } from './reference.command.js'
import { base, failure, json, list, plugins, repo, stdout, write, written } from './reference-command.fixtures.js'

describe('list', () => {
	it('gives one row per name, its status and options when not found, and a defaults note', async () => {
		const root = repo()
		plugins(root, { a: { amb: 'a\n', gone: base }, b: { amb: 'b\n' } })
		write(root, '.agents/references/doc.md', '---\ndescription: |\n  First line.\n  Second.\n---\n\nbody\n')
		write(root, '.agents/references/gone.md', '---\nmerge: remove\n---\n')

		expect(await list({ root })).toBe(0)
		const report = json<ReferenceListReport>()
		expect(report.references).toEqual([
			{ name: 'amb', status: 'ambiguous', code: 'reference-ambiguous', options: ['a/amb', 'b/amb'] },
			{ name: 'doc', description: 'First line.' },
			{ name: 'gone', status: 'missing', code: 'reference-removed' },
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
		expect(report.references).toEqual([{ name: 'name', status: 'missing', code: 'reference-removed' }])
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

	it("states an explicit zero with axi's empty state and help, exit 0 (R43)", async () => {
		const root = repo()

		expect(await list({ root })).toBe(0)
		expect(json()).toEqual({
			empty: '0 references — no layer holds one',
			help: [expect.stringMatching(/no harness detected/), expect.stringContaining('reference create <name>')],
		})

		stdout.mockClear()
		write(root, '.agents/references/a.md', 'x\n')
		expect(await list({ root, pattern: 'zzz*', format: 'text' })).toBe(0)
		expect(written()).toMatch(/^empty: 0 references match "zzz\*"\n/)
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
		expect(json()).toEqual({ error: 'Reference listing failed.', code: 'error' })
	})
})
