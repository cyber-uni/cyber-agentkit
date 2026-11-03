import { describe, expect, it } from 'vitest'
import type { ReferenceCheckReport } from './reference.command.js'
import {
	check,
	errors,
	failure,
	fakeHome,
	json,
	plugins,
	repo,
	stdout,
	write,
	written,
} from './reference-command.fixtures.js'
import {
	githubCapabilities,
	recipeInterface,
	routingInterface,
	typescriptRecipe,
} from './reference-interface.fixtures.js'

describe('check', () => {
	it('gives only the failures and the count that pass', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
		write(root, '.agents/references/scaffold.recipe.typescript-lib.md', typescriptRecipe)
		write(root, '.agents/references/scaffold.recipe.bad.md', '---\nimplements: scaffold.recipe@9\n---\n\n## Recipe\n')

		expect(await check(undefined, { root })).toBe(0)
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

	it('fails a name not found with its status code, exit 0 with no error value (R43, E12)', async () => {
		const root = repo()

		expect(await check(['gone'], { root, format: 'text' })).toBe(0)
		expect(errors()).toBe('')
		expect(written()).not.toMatch(/^error:/m)

		stdout.mockClear()
		expect(await check(['gone'], { root })).toBe(0)
		expect(json<ReferenceCheckReport>().failed).toEqual([
			{ name: 'gone', failures: [{ check: 'reference-missing', message: expect.any(String) }] },
		])
	})

	it('fails the compose check when composing raised a warning', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'project-tracker.routing.interface': routingInterface } })
		write(root, '.agents/references/project-tracker.routing.interface.md', '---\nmerge: patch\n---\n\nhigher\n')

		expect(await check(['project-tracker.routing.interface'], { root })).toBe(0)
		expect(json<ReferenceCheckReport>().failed?.[0]?.failures.map(({ check }) => check)).toEqual(['compose'])
	})

	it('passes a plain document and fails one whose composing raised a defect (R116)', async () => {
		const root = repo()
		write(root, '.agents/references/notes.md', '## Notes\n')
		write(root, '.agents/references/commit-style.md', '---\nmerge: bogus\n---\n\n## Style\n')

		expect(await check(['notes'], { root })).toBe(0)
		expect(json<ReferenceCheckReport>()).toEqual({ passed: 1 })

		stdout.mockClear()
		expect(await check(undefined, { root })).toBe(0)
		expect(json<ReferenceCheckReport>()).toEqual({
			failed: [
				{ name: 'commit-style', failures: [{ check: 'compose', message: expect.stringContaining('merge-unknown') }] },
			],
			passed: 1,
		})
	})

	it('lists a name a remove turned off as passing, with its warnings under warned (R117)', async () => {
		const root = repo()
		write(root, '.agents/references/notes.md', '---\nmerge: remove\n---\n')
		write(fakeHome.value, '.agents/references/notes.md', '## User\n')

		expect(await check(undefined, { root, trace: true })).toBe(0)
		expect(json<ReferenceCheckReport>()).toEqual({
			warned: [{ name: 'notes', warnings: [expect.objectContaining({ code: 'repo-hides-user' })] }],
			passed: 1,
			references: [
				{
					name: 'notes',
					kind: 'none',
					status: 'missing',
					warnings: [expect.objectContaining({ code: 'repo-hides-user' })],
				},
			],
		})
	})

	it('lists a hidden user file under warned with no names, and still passes (J2, R112)', async () => {
		const root = repo()
		write(root, '.agents/references/notes.md', '---\nmerge: replace\n---\n\n## Repo\n')
		write(fakeHome.value, '.agents/references/notes.md', '## User\n')

		expect(await check(undefined, { root })).toBe(0)
		expect(json<ReferenceCheckReport>()).toEqual({
			warned: [
				{ name: 'notes', warnings: [{ code: 'repo-hides-user', message: expect.stringContaining('is hidden') }] },
			],
			passed: 1,
		})

		stdout.mockClear()
		expect(await check(undefined, { root, trace: true })).toBe(0)
		expect(json<ReferenceCheckReport>().references).toEqual([
			{
				name: 'notes',
				kind: 'none',
				status: 'passed',
				warnings: [expect.objectContaining({ code: 'repo-hides-user' })],
			},
		])
	})

	it('reports a thrown failure', async () => {
		failure.value = 'nope'
		expect(await check(['x'], { root: repo() })).toBe(1)
		expect(json()).toEqual({ error: 'Reference check failed.', code: 'error' })
	})
})
