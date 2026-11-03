import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceWhereOutput } from './reference.command.js'
import {
	errors,
	failure,
	fakeHome,
	json,
	managed,
	plugins,
	repo,
	skill,
	where,
	write,
} from './reference-command.fixtures.js'

describe('where', () => {
	it('gives the repo and user files, who each reaches, the heading paths, and the read-only stack', async () => {
		const root = repo()
		plugins(root, { a: { name: '## Create\n\n### Steps\n\nsteps\n' } })
		write(fakeHome.value, '.agents/references/name.md', '## Close\n\nuser\n')

		expect(await where('name', { root })).toBe(0)
		expect(json<ReferenceWhereOutput>()).toEqual({
			name: 'name',
			status: 'found',
			files: [
				{ scope: 'repo', path: '.agents/references/name.md', reaches: 'everyone working in this repository' },
				{ scope: 'user', path: '~/.agents/references/name.md', reaches: 'only you, in every repository' },
			],
			headings: ['Create', 'Create > Steps', 'Close'],
			used: ['a'],
			hint: 'a is read-only; a customization goes in one of the files.',
		})
	})

	it('exits 0 on an ambiguous name, giving the options a selection chooses between (UC2.5)', async () => {
		const root = repo()
		plugins(root, { a: { name: 'a\n' }, b: { name: 'b\n' } })

		expect(await where('name', { root })).toBe(0)
		const report = json<ReferenceWhereOutput>()
		expect(report.status).toBe('ambiguous')
		expect(report.options).toEqual(['a/name', 'b/name'])
		expect(report.files.map(({ scope }) => scope)).toEqual(['repo', 'user'])
	})

	it('takes --default, so the headings include the default', async () => {
		const root = repo()
		const folder = skill(root, 'skills/tracker', { name: '## Default\n\nd\n' })

		expect(await where('name', { root, default: folder })).toBe(0)
		expect(json<ReferenceWhereOutput>()).toMatchObject({ headings: ['Default'], used: ['default'] })
	})

	it('takes --in, giving that folder’s project section file and the managed contribution that hides it (UC2.10)', async () => {
		const root = repo()
		const dir = managed({ name: '---\nmerge: remove\n---\n' })

		expect(await where('name', { root, in: join(root, 'packages/app') })).toBe(0)
		const files = json<ReferenceWhereOutput>().files
		expect(files.map(({ scope }) => scope)).toEqual(['repo', 'user', 'packages/app'])
		expect(files[2]).toEqual({
			scope: 'packages/app',
			path: 'packages/app/.agents/references/name.md',
			reaches: 'everyone working in packages/app',
			hiddenBy: `managed ${join(dir, 'references/name.md')} (remove)`,
		})
		expect(files[0]?.hiddenBy).toMatch(/^managed .*\(remove\)$/)
	})

	it('refuses an --in that is not below the root as a usage error', async () => {
		const root = repo()
		expect(await where('name', { root, in: root })).toBe(2)
		expect(json()).toMatchObject({ code: 'in-not-below-root' })
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
