import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkReferences } from './reference-check.js'
import { checkWarningClass } from './reference-check-warnings.js'
import { referenceCodes } from './reference-codes.js'
import {
	capabilitiesInterface,
	githubCapabilities,
	recipeInterface,
	routingInterface,
	typescriptRecipe,
} from './reference-interface.fixtures.js'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import { resolveReference } from './resolve-reference.js'

function layer(
	tier: ReferenceLayer['tier'],
	documents: Record<string, string>,
	plugin?: string,
	version?: string,
): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-check-'))
	for (const [name, content] of Object.entries(documents)) {
		const path = join(dir, `${name}.md`)
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, content)
	}
	if (plugin === undefined) return { tier, dir }
	return version === undefined ? { tier, dir, plugin } : { tier, dir, plugin, version }
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
				warnings: [],
			},
		])
	})

	it('checks every interface document and implementation when no name is given', () => {
		const layers = [
			layer('repo', { 'scaffold.recipe.typescript-lib': typescriptRecipe, notes: '## Notes\n' }),
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy'),
		]

		expect(checkReferences(layers).map(({ name, kind, status }) => `${name} ${kind} ${status}`)).toEqual([
			'scaffold.recipe.interface interface passed',
			'scaffold.recipe.typescript-lib implementation passed',
		])
	})

	it('fails a required section left out or marked unsupported, naming each, and lists an optional one (R64, R34)', () => {
		const layers = [
			layer('plugin', { 'project-tracker.routing.interface': routingInterface }, 'repobuddy'),
			layer('user', {
				'project-tracker.routing': '---\nimplements: project-tracker.routing@1\n---\n\n## Moves\n',
				'project-tracker.routing.x':
					'---\nimplements: project-tracker.routing@1\n---\n\n## Routes\n\n**Unsupported.** No.\n',
			}),
			layer('plugin', { 'project-tracker.capabilities.interface': capabilitiesInterface }, 'repobuddy'),
		]
		const capabilities = layer('repo', {
			'project-tracker.capabilities.x': '---\nimplements: project-tracker.capabilities@1\n---\n\n## Search\n',
			'project-tracker.capabilities.y':
				'---\nimplements: project-tracker.capabilities@1\n---\n\n## Tracker\n\n## Detect\n',
		})

		expect(failures(layers, 'project-tracker.routing')).toEqual([
			'required: required section Routes is left out or marked **Unsupported.**',
		])
		expect(failures(layers, 'project-tracker.routing.x')).toEqual([
			'name: name project-tracker.routing.x is not project-tracker.routing',
			'required: required section Routes is left out or marked **Unsupported.**',
		])
		expect(failures([capabilities, ...layers], 'project-tracker.capabilities.x')).toEqual([
			'required: required sections Tracker, Detect are left out or marked **Unsupported.**',
		])
		const [passing] = checkReferences([capabilities, ...layers], { names: ['project-tracker.capabilities.y'] })
		expect(passing).toMatchObject({
			status: 'passed',
			unsupported: ['Kinds', 'Search', 'Create', 'Link', 'Retype', 'Close', 'Url'],
		})
	})

	it('lets a section the interface does not list sit anywhere, and orders only the listed ones', () => {
		const iface = layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy')

		expect(
			failures(
				[layer('repo', { 'scaffold.recipe.a': recipe('## Extra\n\n## Recipe\n\n## Notes\n\n## Files\n') }), iface],
				'scaffold.recipe.a',
			),
		).toEqual([])
		expect(
			failures(
				[layer('repo', { 'scaffold.recipe.a': recipe('## Files\n\n## Recipe\n\n## Files\n') }), iface],
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
			layer('repo', { 'scaffold.recipe': recipe('## Recipe\n', 'implements: scaffold.recipe@2') }),
			layer('plugin', { 'scaffold.recipe.interface': recipeInterface }, 'repobuddy'),
		]

		expect(failures(layers, 'scaffold.recipe')).toEqual([
			'version: unknown version 2',
			'name: name scaffold.recipe is not scaffold.recipe.<key>',
		])
	})

	it('fails implements that is malformed, lists more than one interface, or names no interface document', () => {
		const layers = [
			layer('repo', {
				'scaffold.recipe.a': recipe('## Recipe\n', 'implements: scaffold.recipe'),
				'scaffold.recipe.b': recipe('## Recipe\n', 'implements: [scaffold.recipe@1, other@1]'),
				'scaffold.recipe.c': recipe('## Recipe\n'),
			}),
		]

		expect(failures(layers, 'scaffold.recipe.a')).toEqual([
			'interface-found: implements "scaffold.recipe" is not <id>@<version>',
		])
		expect(failures(layers, 'scaffold.recipe.b')).toEqual([
			'interface-found: implements lists 2 interfaces; an implementation implements one',
		])
		expect(failures(layers, 'scaffold.recipe.c')).toEqual([
			'interface-found: no interface document scaffold.recipe.interface',
		])
	})

	it('fails an interface document whose block is malformed, naming each problem', () => {
		const layers = [
			layer(
				'plugin',
				{
					'x.interface':
						'---\ninterface:\n  cardinality: some\n  version: 0\n  versions: [a]\n  sections: [A, A, {}, {heading: B, required: yes, holds: [x]}]\n---\n',
				},
				'p',
			),
		]

		expect(failures(layers, 'x.interface')).toEqual([
			'interface: cardinality is "some"; it is one or many',
			'interface: version is 0; it is a positive integer',
			'interface: versions is not a list of positive integers',
			'interface: section "A" is listed more than once',
			'interface: section {} has no heading',
			'interface: section "B": required is "yes"; it is true or false',
			'interface: section "B": holds is ["x"]; it is one line of text',
		])
	})

	it('fails an interface block missing a key, and ignores a key it does not know (R63)', () => {
		const layers = [
			layer(
				'plugin',
				{
					'x.interface': '---\ninterface:\n  version: 1\n---\n',
					'y.interface': '---\ninterface:\n  cardinality: one\n  version: 1\n  tiers: [repo]\n  sections: [A]\n---\n',
				},
				'p',
			),
		]

		expect(failures(layers, 'x.interface')).toEqual([
			'interface: cardinality is undefined; it is one or many',
			'interface: sections is not a list of headings',
		])
		expect(failures(layers, 'y.interface')).toEqual([])
	})

	it('fails the old single-key section form, showing the new one (C7)', () => {
		const layers = [
			layer(
				'plugin',
				{
					'x.interface':
						'---\ninterface:\n  cardinality: one\n  version: 1\n  sections:\n    - A: required\n    - B\n---\n',
				},
				'p',
			),
		]

		expect(failures(layers, 'x.interface')).toEqual([
			'interface: section {"A":"required"} is in the old form; write it as {heading: A, required: true}',
		])
	})

	it('passes on a warning that depends on what is installed, without failing compose (UC6.8)', () => {
		const layers = [
			layer('repo', { 'scaffold.recipe.a': '---\nextends: [gone]\n---\n' }),
			layer(
				'plugin',
				{ 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.a': typescriptRecipe },
				'repobuddy',
			),
		]

		const [entry] = checkReferences(layers, { names: ['scaffold.recipe.a'] })

		expect(entry?.status).toBe('passed')
		expect(entry?.warnings.map(({ code }) => code)).toEqual(['extends-step-missing', 'extends-all-missing'])
	})

	it('classifies every warning code as a defect, an environment warning, or a project-section one', () => {
		const warnings = Object.entries(referenceCodes).flatMap(([code, { kind }]) => (kind === 'warning' ? [code] : []))
		expect(Object.keys(checkWarningClass).sort()).toEqual(warnings.sort())
		expect(
			Object.entries(checkWarningClass)
				.filter(([, kind]) => kind === 'environment')
				.map(([code]) => code)
				.sort(),
		).toEqual(
			[
				'extends-step-missing',
				'extends-all-missing',
				'extends-not-used',
				'section-not-held',
				'alias-not-used',
				'default-not-selected',
				'plugin-not-selected',
				'default-folder-missing',
				'reference-stale',
				'reference-renamed',
				'repo-hides-user',
				'interface-check',
				'base-moved',
				'reference-hidden',
			].sort(),
		)
	})

	it('fails the compose check when composing the document raised a warning', () => {
		const layers = [
			layer('repo', { 'scaffold.recipe.a': '---\nmerge: bogus\n---\n\n## Recipe\n' }),
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

	it('fails a name that is missing, removed, ambiguous, invalid, or neither an interface nor an implementation', () => {
		const layers = [
			layer('managed', { off: '---\nmerge: remove\n---\n' }),
			layer('repo', { notes: '## Notes\n', off: '## Off\n' }),
			layer('plugin', { shared: '## A\n' }, 'a'),
			layer('plugin', { shared: '## A\n' }, 'b'),
		]

		expect(
			checkReferences(layers, { names: ['gone', 'off', 'shared', 'a.md', 'notes'] }).map(
				({ status, failures: [first] }) => `${status} ${first?.check}`,
			),
		).toEqual([
			'missing reference-missing',
			'missing reference-removed',
			'ambiguous reference-ambiguous',
			'invalid reference-invalid',
			'failed kind',
		])
	})

	it('checks a name several plugins hold also as each <plugin>/<name> in a sweep', () => {
		const layers = [
			layer('repo', { 'scaffold.recipe.lib': '---\nextends: [a]\n---\n' }),
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

describe('interface aliases (UC19.8, R96)', () => {
	it("passes implements naming an interface's older id, with a reference-renamed warning", () => {
		const renamed = recipeInterface.replace('interface:\n', 'aliases: [scaffold.template]\ninterface:\n')
		const layers = [
			layer('repo', { 'scaffold.template.lib': recipe('## Recipe\n', 'implements: scaffold.template@1') }),
			layer('plugin', { 'scaffold.recipe.interface': renamed }, 'repobuddy'),
		]

		const [entry] = checkReferences(layers, { names: ['scaffold.template.lib'] })

		expect(entry).toMatchObject({ status: 'passed', failures: [] })
		expect(entry?.warnings).toEqual([
			{ code: 'reference-renamed', message: expect.stringContaining('implements: scaffold.recipe@1') },
		])
	})
})

describe('hidden files (J2, R112, UC6.11)', () => {
	it('warns of a repo file a managed replace hides, and a user file the repo one hides, never failing', () => {
		const layers = [
			layer('managed', { notes: '---\nmerge: replace\n---\n\n## Managed\n' }),
			layer('repo', { notes: '## Repo\n', mine: '---\nmerge: replace\n---\n\n## Repo\n' }),
			layer('user', { notes: '## User\n', mine: '## User\n' }),
		]

		const entries = checkReferences(layers)

		expect(
			entries.map(({ name, kind, status, failures: failed }) => `${name} ${kind} ${status} ${failed.length}`),
		).toEqual(['mine none passed 0', 'notes none passed 0'])
		expect(entries[0]?.warnings).toEqual([
			{ code: 'repo-hides-user', message: expect.stringMatching(/mine\.md is hidden: repo .*mine\.md \(replace\)/) },
		])
		expect(entries[1]?.warnings.map(({ code }) => code)).toEqual(['reference-hidden', 'reference-hidden'])
	})

	it('warns of a project section a managed replace hides', () => {
		const root = mkdtempSync(join(tmpdir(), 'reference-check-root-'))
		mkdirSync(join(root, 'app', '.agents', 'references'), { recursive: true })
		writeFileSync(join(root, 'app', '.agents', 'references', 'notes.md'), '## App\n')
		const source: ReferenceLayers = {
			layers: [
				layer('managed', { notes: '---\nmerge: replace\n---\n\n## Managed\n' }),
				{ tier: 'repo', dir: join(root, '.agents', 'references') },
			],
			root,
			projects: new Map(),
			harnesses: [],
		}

		expect(checkReferences(source)).toEqual([
			expect.objectContaining({
				name: 'notes',
				status: 'passed',
				warnings: [{ code: 'reference-hidden', message: expect.stringContaining('app/.agents/references/notes.md') }],
			}),
		])
	})
})

describe('a moved base (R86, UC6.9)', () => {
	const delta = '---\nextends: [a]\nsources:\n  - plugin: a\n    version: 1.0.0\n---\n\n## More\n'

	it("warns when a plugin's file records a base version other than the installed one, and passes", () => {
		const layers = [
			layer(
				'plugin',
				{ 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.lib': typescriptRecipe },
				'a',
				'2.0.0',
			),
			layer('plugin', { 'scaffold.recipe.lib': delta, notes: delta }, 'b'),
			layer('plugin', { notes: '## Notes\n' }, 'a', '2.0.0'),
		]

		const [entry] = checkReferences(layers, { names: ['scaffold.recipe.lib'] })

		expect(entry).toMatchObject({ status: 'passed', failures: [] })
		expect(entry?.warnings).toEqual([
			{
				code: 'base-moved',
				message: expect.stringMatching(/^plugin b: it records plugin a at 1\.0\.0, and 2\.0\.0 is installed/),
			},
		])
		expect(
			checkReferences(layers)
				.find(({ name }) => name === 'notes')
				?.warnings.map(({ code }) => code),
		).toEqual(['base-moved'])
	})

	it('says nothing at load', () => {
		const layers = [
			layer(
				'plugin',
				{ 'scaffold.recipe.interface': recipeInterface, 'scaffold.recipe.lib': typescriptRecipe },
				'a',
				'2.0.0',
			),
			layer('plugin', { 'scaffold.recipe.lib': delta }, 'b'),
		]

		expect(resolveReference('scaffold.recipe.lib', layers).warnings).toEqual([])
	})
})
