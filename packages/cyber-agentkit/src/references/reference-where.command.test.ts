import { describe, expect, it } from 'vitest'
import type { ReferenceWhereOutput } from './reference.command.js'
import { errors, failure, fakeHome, json, plugins, repo, skill, where, write } from './reference-command.fixtures.js'

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
					scope: 'repo',
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
		expect(report.places.map(({ scope }) => scope)).toEqual(['repo', 'user'])
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

	it('exits 0 on an invalid name, answering its status (J1, E12)', async () => {
		expect(await where('a/b/c', { root: repo() })).toBe(0)
		expect(json()).toMatchObject({ name: 'a/b/c', status: 'invalid' })
		expect(errors()).toBe('')
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
		expect(json()).toEqual({ error: 'Reference placement lookup failed.', code: 'error' })
	})
})
