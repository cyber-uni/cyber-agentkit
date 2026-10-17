import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { referenceImplementations } from './reference-implementations.js'
import {
	capabilitiesInterface,
	githubCapabilities,
	recipeInterface,
	routingInterface,
	typescriptRecipe,
} from './reference-interface.fixtures.js'
import type { ReferenceLayer } from './reference-layers.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string>, plugin = ''): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-implementations-'))
	mkdirSync(dir, { recursive: true })
	for (const [name, content] of Object.entries(documents)) writeFileSync(join(dir, `${name}.md`), content)
	return { tier, dir, plugins: plugin ? [plugin] : [], status: '' }
}

const gitlab = githubCapabilities
	.replace('What the GitHub tracker', 'What the GitLab tracker')
	.replace('## Search', '## Search\n\n**Unsupported.** No search.\n\n## Search notes')

describe('referenceImplementations', () => {
	it('lists each compatible implementation with its pin, tier, description, and unsupported sections', () => {
		const layers = [
			layer('project', { 'project-tracker.capabilities.jira': githubCapabilities.replace('GitHub', 'Jira') }),
			layer(
				'plugin',
				{
					'project-tracker.capabilities.interface': capabilitiesInterface,
					'project-tracker.capabilities.github': githubCapabilities,
				},
				'repobuddy',
			),
		]

		expect(referenceImplementations('project-tracker.capabilities', layers)).toEqual({
			interface: 'project-tracker.capabilities',
			cardinality: 'many',
			accept: [1],
			implementations: [
				{
					pin: 'repobuddy/project-tracker.capabilities.github',
					name: 'project-tracker.capabilities.github',
					tier: 'plugin',
					version: 1,
					description: 'What the GitHub tracker can do for issue, epic, and initiative skills.',
					unsupported: ['Retype'],
				},
				{
					pin: 'project-tracker.capabilities.jira',
					name: 'project-tracker.capabilities.jira',
					tier: 'project',
					version: 1,
					description: 'What the Jira tracker can do for issue, epic, and initiative skills.',
					unsupported: ['Retype'],
				},
			],
			excluded: [],
		})
	})

	it('pins the plugin a project override sits on, and counts an absent optional section as unsupported', () => {
		const layers = [
			layer('project', {
				'scaffold.recipe.typescript-lib': '---\nmerge: merge-sections\n---\n\n## Verify\n\nRun the tests.\n',
			}),
			layer(
				'plugin',
				{ 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.typescript-lib': typescriptRecipe },
				'house',
			),
		]

		const [implementation] = referenceImplementations('scaffold.recipe', layers).implementations

		expect(implementation?.pin).toBe('house/scaffold.recipe.typescript-lib')
		expect(implementation?.tier).toBe('project')
		expect(implementation?.unsupported).toEqual(['Inputs', 'Config', 'Post'])
	})

	it('excludes candidates with why: version, required section, name, ambiguity, and a missing implements', () => {
		const layers = [
			layer('project', {
				'scaffold.recipe.v2': typescriptRecipe.replace('scaffold.recipe@1', 'scaffold.recipe@2'),
				'scaffold.recipe.empty': '---\nimplements: scaffold.recipe@1\n---\n\n## Files\n',
				'scaffold-recipe': typescriptRecipe,
				'scaffold.recipe.notes': '## Notes\n',
				'scaffold.other': typescriptRecipe,
			}),
			layer(
				'plugin',
				{ 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.shared': typescriptRecipe },
				'a',
			),
			layer('plugin', { 'scaffold.recipe.shared': typescriptRecipe }, 'b'),
		]

		const report = referenceImplementations('scaffold.recipe', layers)

		expect(report.implementations).toEqual([])
		expect(report.excluded).toEqual([
			{ name: 'scaffold-recipe', reasons: ['name scaffold-recipe is not scaffold.recipe.<key>'] },
			{ name: 'scaffold.other', reasons: ['name scaffold.other is not scaffold.recipe.<key>'] },
			{ name: 'scaffold.recipe.empty', reasons: ['missing required section Recipe'] },
			{ name: 'scaffold.recipe.notes', reasons: ['declares no implements scaffold.recipe@<version>'] },
			{
				name: 'scaffold.recipe.shared',
				reasons: ['ambiguous between a/scaffold.recipe.shared and b/scaffold.recipe.shared'],
			},
			{ name: 'scaffold.recipe.v2', reasons: ['unknown version 2'] },
		])
	})

	it("accepts the versions a consumer passes instead of the interface's own", () => {
		const layers = [
			layer('plugin', {
				'scaffold.recipe.interface': recipeInterface,
				'scaffold.recipe.v2': typescriptRecipe.replace('scaffold.recipe@1', 'scaffold.recipe@2'),
				'scaffold.recipe.typescript-lib': typescriptRecipe,
			}),
		]

		const report = referenceImplementations('scaffold.recipe', layers, { accept: [2] })

		expect(report.accept).toEqual([2])
		expect(report.implementations.map(({ name }) => name)).toEqual(['scaffold.recipe.v2'])
		expect(report.excluded).toEqual([{ name: 'scaffold.recipe.typescript-lib', reasons: ['unknown version 1'] }])
	})

	it('restricts a one-cardinality interface to its tiers, and leaves out a name another interface owns', () => {
		const routes = '---\nimplements: project-tracker.routing@1\n---\n\n## Routes\n\n| Level |\n'
		const layers = [
			layer('project', { 'project-tracker.routing': routes }),
			layer(
				'plugin',
				{
					'project-tracker.routing.interface': routingInterface,
					'project-tracker.routing.extra.interface':
						'---\ninterface:\n  cardinality: one\n  version: 1\n  sections: [A]\n---\n',
					'project-tracker.routing.extra': '---\nimplements: project-tracker.routing.extra@1\n---\n\n## A\n',
				},
				'repobuddy',
			),
		]

		expect(referenceImplementations('project-tracker.routing', layers)).toMatchObject({
			cardinality: 'one',
			implementations: [{ pin: 'project-tracker.routing', tier: 'project', unsupported: ['Moves'] }],
			excluded: [],
		})

		const shipped = [
			layer(
				'plugin',
				{ 'project-tracker.routing.interface': routingInterface, 'project-tracker.routing': routes },
				'repobuddy',
			),
		]
		expect(referenceImplementations('project-tracker.routing', shipped).excluded).toEqual([
			{
				name: 'project-tracker.routing',
				reasons: ['the plugin tier may not implement project-tracker.routing (tiers: project)'],
			},
		])
	})

	it('lists a reference outside the namespace that declares implements, as excluded by its name', () => {
		const layers = [
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface, 'recipe-ts': typescriptRecipe, gitlab }),
		]

		expect(referenceImplementations('scaffold.recipe', layers).excluded).toEqual([
			{ name: 'recipe-ts', reasons: ['name recipe-ts is not scaffold.recipe.<key>'] },
		])
	})

	it('throws when the interface is missing or malformed, or the id is not a name', () => {
		const layers = [layer('plugin', { 'x.interface': '---\ninterface: {}\n---\n' })]

		expect(() => referenceImplementations('scaffold.recipe', layers)).toThrow(
			'no interface document scaffold.recipe.interface',
		)
		expect(() => referenceImplementations('x', layers)).toThrow('x.interface is malformed')
		expect(() => referenceImplementations('../x', layers)).toThrow('is not a reference name')
	})

	it('reports the warnings resolving a candidate raised', () => {
		const layers = [
			layer('plugin', {
				'scaffold.recipe.interface': recipeInterface,
				'scaffold.recipe.a': `---\nmerge: sideways\n${typescriptRecipe.slice(4)}`,
			}),
		]

		const report = referenceImplementations('scaffold.recipe', layers)

		expect(report.implementations.map(({ name }) => name)).toEqual(['scaffold.recipe.a'])
		expect(report.warnings?.[0]).toContain('unknown merge mode "sideways"')
	})
})
