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
import { parseReferenceName, resolveReference } from './resolve-reference.js'

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), 'reference-check-'))
}

function write(root: string, name: string, content: string): void {
	const path = join(root, `${name}.md`)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
}

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string>, plugin = ''): ReferenceLayer {
	const dir = tempDir()
	for (const [name, content] of Object.entries(documents)) write(dir, name, content)
	return { tier, dir, plugins: plugin ? [plugin] : [], status: '' }
}

function failures(layers: ReferenceLayer[], name: string) {
	const [entry] = checkReferences(layers, { names: [name] })
	return entry?.failures.map(({ check, message }) => `${check}: ${message}`)
}

describe('checkReferences', () => {
	it('passes an implementation that has the shape its interface requires', () => {
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
				tier: 'plugin',
				failures: [],
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

	it('fails when implements names no interface document, or is not <id>@<version>', () => {
		const layers = [
			layer('project', {
				'scaffold.recipe.a': '---\nimplements: scaffold.recipe@1\n---\n\n## Recipe\n',
				'scaffold.recipe.b': '---\nimplements: scaffold.recipe\n---\n\n## Recipe\n',
			}),
		]

		expect(failures(layers, 'scaffold.recipe.a')).toEqual([
			'interface found: no interface document scaffold.recipe.interface',
		])
		expect(failures(layers, 'scaffold.recipe.b')).toEqual([
			'interface found: implements "scaffold.recipe" is not <id>@<version>',
		])
	})

	it('fails a version the interface does not accept', () => {
		const layers = [
			layer('plugin', {
				'scaffold.recipe.interface': recipeInterface,
				'scaffold.recipe.typescript-lib': typescriptRecipe.replace('scaffold.recipe@1', 'scaffold.recipe@2'),
			}),
		]

		expect(failures(layers, 'scaffold.recipe.typescript-lib')).toEqual(['version: unknown version 2'])
	})

	it('fails a name that is not <id>.<key> for many, or <id> for one', () => {
		const layers = [
			layer('project', {
				'scaffold.recipe': typescriptRecipe,
				'project-tracker.routing.main': '---\nimplements: project-tracker.routing@1\n---\n\n## Routes\n',
			}),
			layer('plugin', {
				'scaffold.recipe.interface': recipeInterface,
				'project-tracker.routing.interface': routingInterface,
			}),
		]

		expect(failures(layers, 'scaffold.recipe')).toEqual(['name: name scaffold.recipe is not scaffold.recipe.<key>'])
		expect(failures(layers, 'project-tracker.routing.main')).toEqual([
			'name: name project-tracker.routing.main is not project-tracker.routing',
		])
	})

	it('fails every used layer in a tier the interface does not allow', () => {
		const routing = '---\nimplements: project-tracker.routing@1\n---\n\n## Routes\n\n| Level |\n'
		const layers = [
			layer('project', { 'project-tracker.routing': '---\nmerge: merge-sections\n---\n\n## Moves\n\nNone.\n' }),
			layer('plugin', { 'project-tracker.routing.interface': routingInterface, 'project-tracker.routing': routing }),
		]

		expect(failures(layers, 'project-tracker.routing')).toEqual([
			'tier: the plugin tier may not implement project-tracker.routing (tiers: project)',
		])
	})

	it('fails a required section that is absent or marked unsupported', () => {
		const layers = [
			layer('plugin', {
				'scaffold.recipe.interface': recipeInterface,
				'scaffold.recipe.a': '---\nimplements: scaffold.recipe@1\n---\n\n## Files\n',
				'scaffold.recipe.b':
					'---\nimplements: scaffold.recipe@1\n---\n\n## Recipe\n\n**Unsupported.** Nothing to say.\n',
			}),
		]

		expect(failures(layers, 'scaffold.recipe.a')).toEqual(['required: missing required section Recipe'])
		expect(failures(layers, 'scaffold.recipe.b')).toEqual([
			'required: required section Recipe is marked **Unsupported.**',
		])
	})

	it('checks the resolved document, so an override that removes a required section fails', () => {
		const layers = [
			layer('project', {
				'scaffold.recipe.typescript-lib': '---\nmerge: merge-sections\n---\n\n## Recipe\n<!-- merge: remove -->\n',
			}),
			layer('plugin', {
				'scaffold.recipe.interface': recipeInterface,
				'scaffold.recipe.typescript-lib': typescriptRecipe,
			}),
		]

		expect(failures(layers, 'scaffold.recipe.typescript-lib')).toEqual(['required: missing required section Recipe'])
	})

	it('fails a heading the interface does not declare, and sections out of order', () => {
		const layers = [
			layer('plugin', {
				'scaffold.recipe.interface': recipeInterface,
				'scaffold.recipe.a':
					'---\nimplements: scaffold.recipe@1\n---\n\n## Recipe\n\n## Extras\n\n## Verify\n\n## Files\n',
				'scaffold.recipe.b': '---\nimplements: scaffold.recipe@1\n---\n\n## Recipe\n\n## Files\n\n## Files\n',
			}),
		]

		expect(failures(layers, 'scaffold.recipe.a')).toEqual([
			'known: unknown section Extras',
			'order: section Files comes after Verify',
		])
		expect(failures(layers, 'scaffold.recipe.b')).toEqual(['order: section Files appears more than once'])
	})

	it('ignores headings inside a code fence and below ##', () => {
		const layers = [
			layer('plugin', {
				'scaffold.recipe.interface': recipeInterface,
				'scaffold.recipe.a':
					'---\nimplements: scaffold.recipe@1\n---\n\n## Recipe\n\n### Notes\n\n```md\n## Fenced\n```\n',
			}),
		]

		expect(failures(layers, 'scaffold.recipe.a')).toEqual([])
	})

	it('fails an interface document whose frontmatter is malformed', () => {
		const layers = [
			layer('plugin', {
				'a.interface':
					'---\ninterface:\n  cardinality: few\n  version: 0\n  versions: [one]\n  tiers: [team]\n  sections:\n    - A: optional\n    - B\n    - B\n    - 3\n---\n',
				'b.interface': '---\ndescription: no block\n---\n',
				'c.interface': '---\ninterface: [1]\n---\n',
				'd.interface': '---\ninterface:\n  cardinality: one\n  version: 1\n---\n',
				'e.contract': '---\ninterface:\n  cardinality: one\n  version: 1\n  sections: [A]\n---\n',
			}),
		]

		expect(failures(layers, 'a.interface')).toEqual([
			'interface: cardinality is "few"; it is one or many',
			'interface: version is 0; it is a positive integer',
			'interface: versions is not a list of positive integers',
			'interface: tiers is not a list of managed, project, user, plugin',
			'interface: section "A" is marked "optional"; the only mark is required',
			'interface: section "B" is listed more than once',
			'interface: section 3 is not a heading name, or a heading name marked required',
		])
		expect(failures(layers, 'b.interface')).toEqual(['interface: has no `interface:` block in its frontmatter'])
		expect(failures(layers, 'c.interface')).toEqual(['interface: `interface:` is not a mapping'])
		expect(failures(layers, 'd.interface')).toEqual(['interface: sections is not a list of headings'])
		expect(failures(layers, 'e.contract')).toEqual([
			'interface: e.contract has an `interface:` block; an interface document is named <id>.interface',
		])
	})

	it('fails an implementation whose interface document is malformed', () => {
		const layers = [
			layer('plugin', { 'x.interface': '---\ninterface: {}\n---\n', 'x.a': '---\nimplements: x@1\n---\n' }),
		]

		expect(failures(layers, 'x.a')).toEqual([
			'interface found: x.interface is malformed: cardinality is undefined; it is one or many; version is undefined; it is a positive integer; sections is not a list of headings',
		])
	})

	it('checks each interface a document implements', () => {
		const layers = [
			layer('plugin', {
				'scaffold.recipe.interface': recipeInterface,
				'x.interface': '---\ninterface:\n  cardinality: many\n  version: 1\n  sections: [Recipe, Files]\n---\n',
				'scaffold.recipe.typescript-lib': typescriptRecipe.replace(
					'implements: scaffold.recipe@1',
					'implements: [scaffold.recipe@1, x@1]',
				),
			}),
		]

		expect(checkReferences(layers, { names: ['scaffold.recipe.typescript-lib'] })[0]?.failures).toEqual([
			{ check: 'name', interface: 'x', message: 'name scaffold.recipe.typescript-lib is not x.<key>' },
		])
	})

	it('fails a name that is missing, ambiguous, or neither an interface nor an implementation', () => {
		const layers = [
			layer('project', { notes: '## Notes\n' }),
			layer('plugin', { shared: '## A\n' }, 'a'),
			layer('plugin', { shared: '## B\n' }, 'b'),
		]

		expect(checkReferences(layers, { names: ['nothing', 'shared', 'notes'] })).toEqual([
			{
				name: 'nothing',
				kind: 'none',
				status: 'missing',
				failures: [{ check: 'interface found', message: 'no reference named nothing' }],
			},
			{
				name: 'shared',
				kind: 'none',
				status: 'ambiguous',
				failures: [{ check: 'interface found', message: 'shared is ambiguous between a/shared and b/shared' }],
			},
			{
				name: 'notes',
				kind: 'none',
				status: 'failed',
				tier: 'project',
				failures: [
					{ check: 'interface found', message: 'notes declares no `implements` and is not an interface document' },
				],
			},
		])
	})

	it('checks each plugin copy of an ambiguous implementation in a sweep, and fails an ambiguous interface', () => {
		const layers = [
			layer('plugin', { 'x.interface': recipeInterface, 'x.y': '---\nimplements: x@1\n---\n\n## Recipe\n' }, 'a'),
			layer('plugin', { 'x.interface': recipeInterface, 'x.y': '---\nimplements: x@1\n---\n\n## Recipe\n' }, 'b'),
		]

		expect(checkReferences(layers).map(({ name, status }) => `${name} ${status}`)).toEqual([
			'a/x.interface passed',
			'b/x.interface passed',
			'a/x.y failed',
			'b/x.y failed',
		])
		expect(failures(layers, 'a/x.y')).toEqual([
			'interface found: x.interface is ambiguous between a/x.interface and b/x.interface',
		])
	})
})

describe('interface documents', () => {
	it('answer from the lowest layer; a higher copy is ignored with a warning', () => {
		const layers = [
			layer('project', { 'scaffold.recipe.interface': recipeInterface.replace('Recipe: required', 'Recipe') }),
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy'),
		]

		const resolved = resolveReference(parseReferenceName('scaffold.recipe.interface'), layers)

		expect(resolved.status).toBe('found')
		expect(resolved.tier).toBe('plugin')
		expect(resolved.trace.map(({ outcome }) => outcome)).toEqual([
			'ignored (an interface document is not overridable)',
			'used',
		])
		expect(resolved.warnings).toEqual([
			`${join(layers[0]?.dir as string, 'scaffold.recipe.interface.md')} is ignored: an interface document is not overridable; define a new interface id instead`,
		])
		expect(resolved.content).toContain('## Ownership')
	})

	it('are ambiguous when two plugins ship one, whatever the tiers above hold', () => {
		const layers = [
			layer('project', { 'x.interface': recipeInterface }),
			layer('plugin', { 'x.interface': recipeInterface }, 'a'),
			layer('plugin', { 'x.interface': recipeInterface }, 'b'),
		]

		const resolved = resolveReference(parseReferenceName('x.interface'), layers)

		expect(resolved.status).toBe('ambiguous')
		expect(resolved.plugins).toEqual(['a/x.interface', 'b/x.interface'])
		expect(resolveReference(parseReferenceName('a/x.interface'), layers).tier).toBe('plugin')
	})
})
