import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkReferences } from './reference-check.js'
import {
	capabilitiesInterface,
	githubCapabilities,
	recipeInterface,
	routingInterface,
	typescriptRecipe,
} from './reference-interface.fixtures.js'
import type { ReferenceLayer } from './reference-layers.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string>, plugin?: string): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-check-'))
	for (const [name, content] of Object.entries(documents)) {
		const path = join(dir, `${name}.md`)
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, content)
	}
	return plugin === undefined ? { tier, dir } : { tier, dir, plugin }
}

function failures(layers: ReferenceLayer[], name: string) {
	const [entry] = checkReferences(layers, { names: [name] })
	return entry?.failures.map(({ check, message }) => `${check}: ${message}`)
}

const recipe = (body: string, implementsLine = 'implements: scaffold.recipe@1') =>
	`---\ndescription: r\n${implementsLine}\n---\n\n${body}`

describe('checkReferences', () => {
	it('passes an implementation that has the shape its interface lists, with its unsupported sections', () => {
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

		expect(checkReferences(layers, { names: ['project-tracker.capabilities.github'] })).toEqual([
			{
				name: 'project-tracker.capabilities.github',
				kind: 'implementation',
				status: 'passed',
				failures: [],
				unsupported: ['Retype'],
			},
		])
	})

	it('checks every interface document and implementation when no name is given', () => {
		const layers = [
			layer('project', { 'scaffold.recipe.typescript-lib': typescriptRecipe, notes: '## Notes\n' }),
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy'),
		]

		expect(checkReferences(layers).map(({ name, kind, status }) => `${name} ${kind} ${status}`)).toEqual([
			'scaffold.recipe.interface interface passed',
			'scaffold.recipe.typescript-lib implementation passed',
		])
	})

	it('treats every section as optional, and ignores a required mark and a tiers key', () => {
		const layers = [
			layer('plugin', { 'project-tracker.routing.interface': routingInterface }, 'repobuddy'),
			layer('user', { 'project-tracker.routing': '---\nimplements: project-tracker.routing@1\n---\n\n## Moves\n' }),
		]

		expect(failures(layers, 'project-tracker.routing')).toEqual([])
	})

	it('lets a section the interface does not list sit anywhere, and orders only the listed ones', () => {
		const iface = layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy')

		expect(
			failures(
				[layer('project', { 'scaffold.recipe.a': recipe('## Extra\n\n## Recipe\n\n## Notes\n\n## Files\n') }), iface],
				'scaffold.recipe.a',
			),
		).toEqual([])
		expect(
			failures(
				[layer('project', { 'scaffold.recipe.a': recipe('## Files\n\n## Recipe\n\n## Files\n') }), iface],
				'scaffold.recipe.a',
			),
		).toEqual([
			'order: section Recipe comes after Files',
			'order: section Files appears more than once',
			expect.stringMatching(/^compose: composing it raised a warning: heading-repeated: /),
		])
	})

	it('fails a version the interface does not accept, and a name that does not fit it', () => {
		const layers = [
			layer('project', { 'scaffold.recipe': recipe('## Recipe\n', 'implements: scaffold.recipe@2') }),
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy'),
		]

		expect(failures(layers, 'scaffold.recipe')).toEqual([
			'version: unknown version 2',
			'name: name scaffold.recipe is not scaffold.recipe.<key>',
		])
	})

	it('fails implements that is malformed, lists more than one interface, or names no interface document', () => {
		const layers = [
			layer('project', {
				'scaffold.recipe.a': recipe('## Recipe\n', 'implements: scaffold.recipe'),
				'scaffold.recipe.b': recipe('## Recipe\n', 'implements: [scaffold.recipe@1, other@1]'),
				'scaffold.recipe.c': recipe('## Recipe\n'),
			}),
		]

		expect(failures(layers, 'scaffold.recipe.a')).toEqual([
			'interface found: implements "scaffold.recipe" is not <id>@<version>',
		])
		expect(failures(layers, 'scaffold.recipe.b')).toEqual([
			'interface found: implements lists 2 interfaces; an implementation implements one',
		])
		expect(failures(layers, 'scaffold.recipe.c')).toEqual([
			'interface found: no interface document scaffold.recipe.interface',
		])
	})

	it('fails an interface document whose block is malformed, naming each problem', () => {
		const layers = [
			layer(
				'plugin',
				{
					'x.interface':
						'---\ninterface:\n  cardinality: some\n  version: 0\n  versions: [a]\n  sections: [A, A, {}]\n---\n',
				},
				'p',
			),
		]

		expect(failures(layers, 'x.interface')).toEqual([
			'interface: cardinality is "some"; it is one or many',
			'interface: version is 0; it is a positive integer',
			'interface: versions is not a list of positive integers',
			'interface: section "A" is listed more than once',
			'interface: section {} is not a heading name',
		])
	})

	it('fails the compose check when composing the document raised a warning', () => {
		const layers = [
			layer('project', { 'scaffold.recipe.a': '---\nmerge: bogus\n---\n\n## Recipe\n' }),
			layer(
				'plugin',
				{ 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.a': typescriptRecipe },
				'repobuddy',
			),
		]

		expect(failures(layers, 'scaffold.recipe.a')).toEqual([
			expect.stringMatching(/^compose: composing it raised a warning: merge-unknown: /),
		])
	})

	it('fails a name that is missing, ambiguous, invalid, or neither an interface nor an implementation', () => {
		const layers = [
			layer('project', { notes: '## Notes\n' }),
			layer('plugin', { shared: '## A\n' }, 'a'),
			layer('plugin', { shared: '## A\n' }, 'b'),
		]

		expect(
			checkReferences(layers, { names: ['gone', 'shared', 'a.md', 'notes'] }).map(
				({ status, failures: [first] }) => `${status} ${first?.check}`,
			),
		).toEqual([
			'missing reference-missing',
			'ambiguous reference-ambiguous',
			'invalid reference-invalid',
			'failed interface found',
		])
	})

	it('checks a name several plugins hold also as each <plugin>/<name> in a sweep', () => {
		const layers = [
			layer('project', { 'scaffold.recipe.lib': '---\nextends: [a]\n---\n' }),
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.lib': typescriptRecipe }, 'a'),
			layer('plugin', { 'scaffold.recipe.lib': typescriptRecipe }, 'b'),
		]

		expect(checkReferences(layers).map(({ name }) => name)).toEqual([
			'scaffold.recipe.interface',
			'scaffold.recipe.lib',
			'a/scaffold.recipe.lib',
			'b/scaffold.recipe.lib',
		])
	})
})

describe("checking a skill's default", () => {
	it('checks each default as its skill loads it, when it changes what the name composes to', () => {
		const folder = mkdtempSync(join(tmpdir(), 'reference-check-skill-'))
		writeFileSync(join(folder, 'SKILL.md'), '---\nname: scaffold\n---\n')
		mkdirSync(join(folder, 'references'))
		writeFileSync(
			join(folder, 'references', 'scaffold.recipe.lib.default.md'),
			recipe('## Recipe\n\n## Bogus\n<!-- merge: remove -->\n'),
		)
		const source = {
			layers: [layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy')],
			harnesses: [],
			skills: { skills: [{ name: 'scaffold', folder }] },
		}

		const entries = checkReferences(source)

		expect(entries.map(({ name, loadedBy, status }) => `${name} ${loadedBy} ${status}`)).toEqual([
			'scaffold.recipe.interface undefined passed',
			'scaffold.recipe.lib scaffold failed',
		])
		expect(entries[1]?.failures.map(({ check }) => check)).toEqual(['compose'])
	})
})
