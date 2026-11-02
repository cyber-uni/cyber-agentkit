import { describe, expect, it } from 'vitest'
import type { ReferenceSearchReport } from './reference.command.js'
import { failure, json, plugins, repo, search, write } from './reference-command.fixtures.js'

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
		expect(json()).toEqual({
			empty: '0 references match "guide"',
			help: [expect.any(String), expect.stringContaining('reference list')],
		})
	})

	it('exits 2 on an empty query with query-missing', async () => {
		expect(await search('  ', { root: repo() })).toBe(2)
		expect(json()).toMatchObject({ code: 'query-missing' })
	})

	it('reports a thrown failure', async () => {
		const root = repo()
		write(root, '.agents/references/a.md', 'x\n')
		failure.value = 'nope'
		expect(await search('a', { root })).toBe(1)
		expect(json()).toEqual({ error: 'Reference search failed.', code: 'error' })
	})
})
