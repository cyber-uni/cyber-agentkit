import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { familyInterfaces, referenceImplementations } from './reference-implementations.js'
import {
	aspectImplementation,
	aspectInterface,
	capabilitiesInterface,
	githubCapabilities,
	recipeInterface,
	routingInterface,
	typescriptRecipe,
} from './reference-interface.fixtures.js'
import type { ReferenceLayer } from './reference-layers.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string>, plugin?: string): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-implementations-'))
	for (const [name, content] of Object.entries(documents)) {
		const path = join(dir, tier === 'default' ? `${name}.default.md` : `${name}.md`)
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, content)
	}
	return { tier, dir, ...(plugin === undefined ? {} : tier === 'default' ? { skill: plugin } : { plugin }) }
}

const recipe = (key: string, version = 1, body = '## Recipe\n\n- Name: x\n') =>
	`---\ndescription: ${key} recipe\nimplements: scaffold.recipe@${version}\n---\n\n${body}`

describe('referenceImplementations', () => {
	it('lists each implementation with its pin, description, and unsupported sections', () => {
		const layers = [
			layer(
				'plugin',
				{
					'project-tracker.capabilities.interface': capabilitiesInterface,
					'project-tracker.capabilities.github': githubCapabilities,
				},
				'repobuddy',
			),
		]

		const report = referenceImplementations('project-tracker.capabilities', layers)

		expect(report).toMatchObject({
			interface: 'project-tracker.capabilities',
			cardinality: 'many',
			accept: [1],
			excluded: [],
		})
		expect(report.implementations).toEqual([
			{
				pin: 'repobuddy/project-tracker.capabilities.github',
				description: 'What the GitHub tracker can do for issue, epic, and initiative skills.',
				unsupported: ['Retype'],
				name: 'project-tracker.capabilities.github',
				tier: 'plugin',
				version: 1,
			},
		])
	})

	it('leaves out every plugin holding a name no extends orders, until a customizer picks one (R87, UC15.3)', () => {
		const plugins = [
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.lib': typescriptRecipe }, 'a'),
			layer('plugin', { 'scaffold.recipe.lib': typescriptRecipe }, 'b'),
		]

		const unpicked = referenceImplementations('scaffold.recipe', plugins)
		expect(unpicked.implementations).toEqual([])
		expect(unpicked.excluded).toEqual([
			{
				name: 'a/scaffold.recipe.lib',
				reasons: [expect.stringMatching(/^ambiguous: .*until a customizer picks one$/)],
			},
			{ name: 'b/scaffold.recipe.lib', reasons: [expect.stringMatching(/^ambiguous: /)] },
		])

		const picked = referenceImplementations('scaffold.recipe', [
			layer('repo', { 'scaffold.recipe.lib': '---\nextends: [b]\n---\n' }),
			...plugins,
		])
		expect(picked.implementations.map(({ pin, tier }) => `${pin} ${tier}`)).toEqual(['b/scaffold.recipe.lib plugin'])
		expect(picked.excluded).toEqual([
			{ name: 'a/scaffold.recipe.lib', reasons: [expect.stringContaining('the pick; load b/scaffold.recipe.lib')] },
		])
	})

	it('lists a repo or user implementation by its bare name, and leaves out the plugin holding it too (C1, J3)', () => {
		const layers = [
			layer('repo', { 'scaffold.recipe.lib': recipe('lib') }),
			layer('user', { 'scaffold.recipe.mine': recipe('mine') }),
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.lib': typescriptRecipe }, 'a'),
		]

		const report = referenceImplementations('scaffold.recipe', layers)

		expect(report.implementations.map(({ pin, tier }) => `${pin} ${tier}`)).toEqual([
			'scaffold.recipe.lib repo',
			'scaffold.recipe.mine user',
		])
		expect(report.excluded).toEqual([
			{
				name: 'a/scaffold.recipe.lib',
				reasons: ['the repo implementation answers scaffold.recipe.lib; a consumer loads it by that name'],
			},
		])
	})

	it('lists an implementation declaring an older id of the interface (UC19.8)', () => {
		const renamed = recipeInterface.replace('interface:\n', 'aliases: [scaffold.template]\ninterface:\n')
		const layers = [
			layer('plugin', { 'scaffold.recipe.interface': renamed }, 'repobuddy'),
			layer(
				'plugin',
				{ 'scaffold.template.lib': recipe('lib').replace('scaffold.recipe@1', 'scaffold.template@1') },
				'a',
			),
		]

		const report = referenceImplementations('scaffold.recipe', layers)

		expect(report.implementations.map(({ pin }) => pin)).toEqual(['a/scaffold.template.lib'])
		expect(report.warnings.map(({ code }) => code)).toEqual(['reference-renamed'])
	})

	it('lists the implementations of an interface asked for by the plain name it replaces (UC19.10, R128)', () => {
		const contract = capabilitiesInterface.replace('interface:\n', 'aliases: [project-tracker.contract]\ninterface:\n')
		const layers = [
			layer(
				'plugin',
				{
					'project-tracker.capabilities.interface': contract,
					'project-tracker.capabilities.github': githubCapabilities,
				},
				'repobuddy',
			),
		]

		const report = referenceImplementations('project-tracker.contract', layers)

		expect(report.interface).toBe('project-tracker.capabilities')
		expect(report.implementations.map(({ pin }) => pin)).toEqual(['repobuddy/project-tracker.capabilities.github'])
		expect(report.warnings).toEqual([
			{
				code: 'reference-renamed',
				message:
					'project-tracker.contract is an older id of project-tracker.capabilities; ask for project-tracker.capabilities instead',
			},
		])
	})

	it('excludes candidates with why: a version not accepted, a name that does not fit, no implements', () => {
		const layers = [
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy'),
			layer('repo', {
				'scaffold.recipe.old': recipe('old', 2),
				'scaffold.recipe.plain': '---\ndescription: plain\n---\n\n## Recipe\n',
				misnamed: recipe('misnamed'),
			}),
		]

		expect(referenceImplementations('scaffold.recipe', layers).excluded).toEqual([
			{ name: 'misnamed', reasons: ['name: name misnamed is not scaffold.recipe.<key>'] },
			{ name: 'scaffold.recipe.old', reasons: ['version: unknown version 2'] },
			{ name: 'scaffold.recipe.plain', reasons: ['declares no implements scaffold.recipe@<version>'] },
		])
	})

	it("accepts the versions a consumer passes instead of the interface's own", () => {
		const layers = [
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy'),
			layer('repo', { 'scaffold.recipe.next': recipe('next', 2) }),
		]

		expect(
			referenceImplementations('scaffold.recipe', layers, { accept: [2] }).implementations.map(({ pin }) => pin),
		).toEqual(['scaffold.recipe.next'])
	})

	it('leaves out a name another interface owns', () => {
		const layers = [
			layer(
				'plugin',
				{
					'project-tracker.routing.interface': routingInterface,
					'project-tracker.interface':
						'---\ninterface:\n  cardinality: many\n  version: 1\n  sections: [Routes]\n---\n',
				},
				'repobuddy',
			),
			layer(
				'plugin',
				{ 'project-tracker.routing': '---\nimplements: project-tracker.routing@1\n---\n\n## Routes\n' },
				'tracker',
			),
		]

		expect(referenceImplementations('project-tracker', layers).implementations).toEqual([])
		expect(referenceImplementations('project-tracker.routing', layers).implementations.map(({ pin }) => pin)).toEqual([
			'tracker/project-tracker.routing',
		])
	})

	it("never lists a skill's default: it has no qualified name to pin (UC6.6)", () => {
		const layers = [
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.lib': typescriptRecipe }, 'a'),
			layer(
				'default',
				{ 'scaffold.recipe.lib': typescriptRecipe, 'scaffold.recipe.own': typescriptRecipe },
				'scaffold',
			),
		]

		const report = referenceImplementations('scaffold.recipe', layers)

		expect(report.implementations.map(({ pin }) => pin)).toEqual(['a/scaffold.recipe.lib'])
		expect(report.excluded).toEqual([])
	})

	it('throws when the interface is missing or malformed, or the id is not a name', () => {
		const malformed = [layer('plugin', { 'x.interface': '---\ninterface: {}\n---\n' }, 'p')]

		expect(() => referenceImplementations('gone', [])).toThrow(/no interface document gone.interface/)
		expect(() => referenceImplementations('x', malformed)).toThrow(/x.interface is malformed/)
		expect(() => referenceImplementations('../x', [])).toThrow(/is not an interface id/)
	})

	it('reports the warnings composing a candidate raised', () => {
		const layers = [
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy'),
			layer('repo', {
				'scaffold.recipe.lib': '---\nmerge: bogus\nimplements: scaffold.recipe@1\n---\n\n## Recipe\n',
			}),
		]

		const report = referenceImplementations('scaffold.recipe', layers)

		expect(report.warnings.map(({ code }) => code)).toEqual(['merge-unknown'])
		expect(report.excluded[0]?.reasons).toEqual([expect.stringMatching(/^compose: /)])
	})

	describe('the implementation in use (R129)', () => {
		const id = 'skill-design.aspects.tone'
		const owner = () => layer('plugin', { [`${id}.interface`]: aspectInterface() }, 'owner')

		it('is the default when a load of the name builds on the skill default only', () => {
			const layers = [owner(), layer('default', { [id]: '## Aspect\n\nown rule\n' }, 'skill-design')]

			const report = referenceImplementations(id, layers)

			expect(report.implementations).toEqual([])
			expect(report.inUse).toBe('default')
		})

		it('is the pin of the plugin a selection picks, and of the only plugin answering', () => {
			const plugins = [
				owner(),
				layer('plugin', { [id]: aspectImplementation(id, 'a') }, 'a'),
				layer('plugin', { [id]: aspectImplementation(id, 'b') }, 'b'),
			]

			const picked = referenceImplementations(id, [layer('repo', { [id]: '---\nextends: [b]\n---\n' }), ...plugins])
			expect(picked.inUse).toBe(`b/${id}`)
			expect(picked.implementations.map(({ pin }) => pin)).toEqual([`b/${id}`])

			expect(referenceImplementations(id, [owner(), plugins[1] as ReferenceLayer]).inUse).toBe(`a/${id}`)
		})

		it('is the default when a selection picks default over a plugin that also holds the name', () => {
			const layers = [
				layer('repo', { [id]: '---\nextends: [default]\n---\n' }),
				owner(),
				layer('plugin', { [id]: aspectImplementation(id, 'a') }, 'a'),
				layer('default', { [id]: '## Aspect\n\nown rule\n' }, 'skill-design'),
			]

			expect(referenceImplementations(id, layers).inUse).toBe('default')
		})

		it('is absent when the name is not found, and for a many interface', () => {
			expect(referenceImplementations(id, [owner()]).inUse).toBeUndefined()
			const many = [layer('plugin', { [`${id}.interface`]: aspectInterface('many') }, 'owner')]
			expect(referenceImplementations(id, many).inUse).toBeUndefined()
		})
	})

	describe('a family (R130, R134, R135, R136)', () => {
		const tone = 'skill-design.aspects.tone'
		const depth = 'skill-design.aspects.deep.length'
		const family = () => [
			layer(
				'plugin',
				{
					[`${tone}.interface`]: aspectInterface(),
					[`${depth}.interface`]: aspectInterface('many'),
					'skill-design.other.interface': aspectInterface(),
					'skill-design.aspects.interface': aspectInterface(),
					'skill-design.aspects.plain': '## Plain\n',
					[`${tone}.formal`]: aspectImplementation(tone, 'formal'),
					[tone]: aspectImplementation(tone, 'owner tone'),
				},
				'owner',
			),
			layer(
				'plugin',
				{ [`${depth}.short`]: '---\nimplements: skill-design.aspects.deep.length@1\n---\n\n## Aspect\n' },
				'a',
			),
		]

		it('matches every interface under the prefix at any depth, and no plain document or implementation (R130)', () => {
			expect(familyInterfaces('skill-design.aspects.*', family())).toEqual([depth, tone])
			expect(familyInterfaces('skill-design.*', family())).toEqual([
				'skill-design.aspects',
				depth,
				tone,
				'skill-design.other',
			])
			expect(() =>
				familyInterfaces('skill-design.aspects.tone.*', [
					layer(
						'plugin',
						{ [`${tone}.interface`]: aspectInterface(), [`${tone}.formal`]: aspectImplementation(tone) },
						'o',
					),
				]),
			).toThrow(/no interface document matches/)
		})

		it('lists each matched interface in name order, as the single call lists it (R134)', () => {
			const layers = family()

			const report = referenceImplementations('skill-design.aspects.*', layers)

			expect(report.family).toBe('skill-design.aspects.*')
			expect(report.interfaces.map(({ interface: name }) => name)).toEqual([depth, tone])
			expect(report.interfaces[0]).toEqual(referenceImplementations(depth, layers))
			expect(report.interfaces[1]).toEqual(referenceImplementations(tone, layers))
			expect(report.interfaces[0]?.cardinality).toBe('many')
		})

		it('throws when no interface matches, and is invalid with * anywhere but the last segment (R135, R136)', () => {
			expect(() => referenceImplementations('nothing.*', family())).toThrow(/no interface document matches nothing\.\*/)
			for (const bad of ['a.*.b', '*', '.*', 'a*.*', 'p/a.*', 'a..*']) {
				expect(() => referenceImplementations(bad, family()), bad).toThrow(/not a family|not an interface id/)
			}
		})
	})
})
