import { describe, expect, it } from 'vitest'
import type { ReferenceImplementationsReport } from './reference.command.js'
import { errors, implementations, json, plugins, repo, write } from './reference-command.fixtures.js'
import { recipeInterface, typescriptRecipe } from './reference-interface.fixtures.js'

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
