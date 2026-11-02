import { describe, expect, it } from 'vitest'
import type { ReferenceCheckReport } from './reference.command.js'
import { check, errors, failure, json, plugins, repo, stdout, write } from './reference-command.fixtures.js'
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
