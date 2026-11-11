import { describe, expect, it } from 'vitest'
import type { ReferenceImplementationsReport } from './reference.command.js'
import { errors, implementations, json, plugins, repo, stdout, write } from './reference-command.fixtures.js'
import {
	aspectImplementation,
	aspectInterface,
	recipeInterface,
	typescriptRecipe,
} from './reference-interface.fixtures.js'

describe('implementations', () => {
	function fixture(): string {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
		write(root, '.agents/references/scaffold.recipe.typescript-lib.md', typescriptRecipe)
		write(root, '.agents/references/scaffold.recipe.bad.md', '---\nimplements: scaffold.recipe@9\n---\n\n## Recipe\n')
		return root
	}

	it('gives each pin, its tier when repo or user, description, and unsupported sections', async () => {
		expect(await implementations('scaffold.recipe', { root: fixture() })).toBe(0)
		expect(json<ReferenceImplementationsReport>()).toEqual({
			implementations: [
				{
					pin: 'scaffold.recipe.typescript-lib',
					tier: 'repo',
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
			expect.objectContaining({ name: 'scaffold.recipe.typescript-lib', tier: 'repo', version: 1 }),
		])
	})

	it("states an explicit zero with axi's empty state, and takes --accept (R43)", async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })

		expect(await implementations('scaffold.recipe', { root, accept: '1, 2' })).toBe(0)
		expect(json()).toEqual({
			empty: '0 implementations of scaffold.recipe',
			help: [expect.stringContaining('reference implementations scaffold.recipe --trace')],
		})
	})

	it('exits 2 on a malformed --accept, and 1 on an unknown interface', async () => {
		expect(await implementations('scaffold.recipe', { root: repo(), accept: 'one' })).toBe(2)
		expect(json()).toMatchObject({ code: 'option-invalid', option: '--accept', value: 'one' })

		stdout.mockClear()
		expect(await implementations('nope', { root: repo() })).toBe(1)
		expect(json()).toEqual({
			error: expect.stringMatching(/no interface document nope\.interface/),
			code: 'interface-unknown',
		})
		expect(errors()).toBe('')
	})

	describe('the implementation in use (R129)', () => {
		const id = 'skill-design.aspects.tone'

		it('reports it for a one interface, even when nothing is listed, and not for a many one', async () => {
			const root = repo()
			plugins(root, { owner: { [`${id}.interface`]: aspectInterface() }, a: { [id]: aspectImplementation(id) } })
			write(root, `.agents/references/${id}.md`, '---\nextends: [a]\n---\n')

			expect(await implementations(id, { root })).toBe(0)
			expect(json<ReferenceImplementationsReport>()).toMatchObject({ inUse: `a/${id}` })

			write(root, `.agents/references/${id}.md`, '---\nextends: [default]\n---\n')
			stdout.mockClear()
			expect(await implementations(id, { root, trace: true })).toBe(0)
			expect(json<ReferenceImplementationsReport>()).toMatchObject({ interface: id, cardinality: 'one' })

			const bare = repo()
			plugins(bare, { owner: { [`${id}.interface`]: aspectInterface() } })
			stdout.mockClear()
			expect(await implementations(id, { root: bare })).toBe(0)
			expect(json()).toMatchObject({ empty: `0 implementations of ${id}` })

			const many = repo()
			plugins(many, { owner: { [`${id}.interface`]: aspectInterface('many') } })
			stdout.mockClear()
			expect(await implementations(id, { root: many })).toBe(0)
			expect(json()).toMatchObject({ empty: `0 implementations of ${id}` })
		})
	})

	describe('a family (R130, R134, R135, R136)', () => {
		const tone = 'skill-design.aspects.tone'
		const length = 'skill-design.aspects.length'
		const fixture = () => {
			const root = repo()
			plugins(root, {
				owner: {
					[`${tone}.interface`]: aspectInterface(),
					[`${length}.interface`]: aspectInterface('many'),
					'skill-design.aspects.plain': '## Plain\n',
				},
				a: { [tone]: aspectImplementation(tone, 'a tone') },
			})
			return root
		}

		it('lists each matched interface in name order with its in-use implementation (R130, R134)', async () => {
			expect(await implementations('skill-design.aspects.*', { root: fixture() })).toBe(0)
			expect(json<{ family: string; interfaces: unknown[] }>()).toEqual({
				family: 'skill-design.aspects.*',
				interfaces: [
					{ interface: length, implementations: [] },
					{
						interface: tone,
						inUse: `a/${tone}`,
						implementations: [{ pin: `a/${tone}`, description: 'a tone' }],
					},
				],
			})
		})

		it('is an error with no match, and invalid for * elsewhere (R135, R136)', async () => {
			expect(await implementations('nothing.*', { root: fixture() })).toBe(1)
			expect(json<{ code: string }>().code).toBe('interface-unknown')
			stdout.mockClear()
			expect(await implementations('skill-design.*.tone', { root: fixture() })).toBe(2)
			expect(json<{ code: string }>().code).toBe('name-invalid')
		})
	})
})
