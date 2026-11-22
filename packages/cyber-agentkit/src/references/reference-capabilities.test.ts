import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { capabilitySystemOf } from './reference-capabilities.js'
import { checkReferences } from './reference-check.js'
import { create, repo, write } from './reference-command.fixtures.js'
import { referenceImplementations } from './reference-implementations.js'
import { capabilitiesInterface, recipeInterface } from './reference-interface.fixtures.js'
import type { ReferenceLayer } from './reference-layers.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string>, plugin?: string): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-capabilities-'))
	for (const [name, content] of Object.entries(documents)) {
		const path = join(dir, `${name}.md`)
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, content)
	}
	return plugin === undefined ? { tier, dir } : { tier, dir, plugin }
}

function entryOf(documents: Record<string, string>, name: string) {
	const [entry] = checkReferences([layer('plugin', documents, 'house')], { names: [name] })
	return entry
}

const doc = (body: string, frontmatter = '') => `---\ndescription: d\n${frontmatter}---\n\n${body}`

const preamble =
	'## System\n\nAsana. Docs: https://developers.asana.com/docs\n\n## Detect\n\nRouting names Asana.\n\n## Verified\n\n- Advanced: run, 2026-11.\n'

describe('capabilitySystemOf (K40)', () => {
	it('reads <system> from <system>.capabilities, one segment, a plugin qualifier aside', () => {
		expect(capabilitySystemOf('asana.capabilities')).toBe('asana')
		expect(capabilitySystemOf('house/asana.capabilities')).toBe('asana')
		expect(capabilitySystemOf('project-tracker.capabilities')).toBe('project-tracker')
		expect(capabilitySystemOf('a.b.capabilities')).toBeUndefined()
		expect(capabilitySystemOf('capabilities')).toBeUndefined()
		expect(capabilitySystemOf('.capabilities')).toBeUndefined()
		expect(capabilitySystemOf('project-tracker.capabilities.github')).toBeUndefined()
	})
})

describe('a capability reference (UC29)', () => {
	it('passes when it opens with System, Detect, and Verified, its features in any shape (R137, R141)', () => {
		const body = `${preamble}\n## Custom fields\n\n**Partial.** Starter allows custom fields only on paid workspaces.\nSince: Starter.\n\n## Portfolios\n\n**Unsupported.** Starter has no portfolios.\nUntil: whatever.\n`
		expect(entryOf({ 'asana.capabilities': doc(body) }, 'asana.capabilities')).toMatchObject({
			kind: 'capability',
			status: 'passed',
			failures: [],
		})
	})

	it('passes with nothing in its sections: what a section says is never checked (R141)', () => {
		expect(
			entryOf({ 'asana.capabilities': doc('## System\n\n## Detect\n\n## Verified\n') }, 'asana.capabilities'),
		).toMatchObject({ status: 'passed' })
	})

	it('fails a missing opening section, naming it (R137, UC29.1)', () => {
		const entry = entryOf({ 'asana.capabilities': doc('## System\n\na\n\n## Verified\n\nb\n') }, 'asana.capabilities')
		expect(entry?.status).toBe('failed')
		expect(entry?.failures).toEqual([
			{ check: 'capability', message: expect.stringContaining('has no Detect section') },
		])
	})

	it('fails the opening sections out of order, or not first (R137, UC29.1)', () => {
		const swapped = doc('## Detect\n\na\n\n## System\n\nb\n\n## Verified\n\nc\n')
		expect(entryOf({ 'asana.capabilities': swapped }, 'asana.capabilities')?.failures).toEqual([
			{ check: 'capability', message: expect.stringContaining('opens with Detect, System, Verified') },
		])
		const late = doc(`## Overview\n\na\n\n${preamble}`)
		expect(entryOf({ 'asana.capabilities': late }, 'asana.capabilities')?.failures.map(({ check }) => check)).toEqual([
			'capability',
		])
	})

	it('fails one that declares implements (R139, UC29.3)', () => {
		const layers = [
			layer(
				'plugin',
				{
					'scaffold.recipe.interface': recipeInterface,
					'asana.capabilities': doc(preamble, 'implements: scaffold.recipe@1\n'),
				},
				'house',
			),
		]
		const [entry] = checkReferences(layers, { names: ['asana.capabilities'] })
		expect(entry?.kind).toBe('capability')
		expect(entry?.failures).toEqual([
			{ check: 'capability', message: expect.stringContaining('implements no interface') },
		])
	})

	it('is not a name with more than one segment before .capabilities (K40)', () => {
		expect(entryOf({ 'a.b.capabilities': doc('## Overview\n\na\n') }, 'a.b.capabilities')).toMatchObject({
			kind: 'none',
			status: 'passed',
		})
	})
})

describe('support levels (K42, R138)', () => {
	it('fails a **Partial.** or **Unsupported.** mark with no sentence after it, in any reference', () => {
		const entry = entryOf(
			{ notes: doc('## A\n\n**Partial.**\n\n## B\n\n**Unsupported.**\n\nlater text\n\n## C\n\n**Partial.** Fine.\n') },
			'notes',
		)
		expect(entry?.kind).toBe('none')
		expect(entry?.failures).toEqual([
			{ check: 'support-level', message: expect.stringContaining('section A is marked **Partial.**') },
			{ check: 'support-level', message: expect.stringContaining('section B is marked **Unsupported.**') },
		])
	})

	it('reads a sentence that wraps onto the next line of the paragraph', () => {
		expect(entryOf({ notes: doc('## A\n\n**Unsupported.**\nThe tier has none.\n') }, 'notes')?.failures).toEqual([])
	})

	it('fails a bare mark in a capability reference feature and in an implementation section', () => {
		const capability = entryOf(
			{ 'asana.capabilities': doc(`${preamble}\n## Portfolios\n\n**Unsupported.**\n`) },
			'asana.capabilities',
		)
		expect(capability?.failures.map(({ check }) => check)).toEqual(['support-level'])

		const implementation = entryOf(
			{
				'project-tracker.capabilities.interface': capabilitiesInterface,
				'project-tracker.capabilities.asana': doc(
					'## Tracker\n\na\n\n## Detect\n\nb\n\n## Kinds\n\n**Partial.**\n',
					'implements: project-tracker.capabilities@1\n',
				),
			},
			'project-tracker.capabilities.asana',
		)
		expect(implementation?.failures.map(({ check }) => check)).toEqual(['support-level'])
	})
})

describe('the partial mark on an implementation (R142)', () => {
	const asana = doc(
		'## Tracker\n\n**Partial.** Only workspaces, not organizations.\n\n## Detect\n\nb\n\n## Kinds\n\n**Partial.** No initiatives.\n\n## Search\n\n**Unsupported.** No search API on this tier.\n',
		'implements: project-tracker.capabilities@1\n',
	)
	const documents = {
		'project-tracker.capabilities.interface': capabilitiesInterface,
		'project-tracker.capabilities.asana': asana,
	}

	it('counts a required section marked partial as present, and lists partial beside unsupported in check', () => {
		const entry = entryOf(documents, 'project-tracker.capabilities.asana')
		expect(entry).toMatchObject({ status: 'passed', failures: [], partial: ['Tracker', 'Kinds'] })
		expect(entry?.unsupported).toContain('Search')
		expect(entry?.unsupported).not.toContain('Kinds')
	})

	it('lists partial sections beside unsupported ones in implementations', () => {
		const report = referenceImplementations('project-tracker.capabilities', [layer('plugin', documents, 'house')])
		expect(report.implementations).toEqual([
			expect.objectContaining({
				pin: 'house/project-tracker.capabilities.asana',
				partial: ['Tracker', 'Kinds'],
				unsupported: expect.arrayContaining(['Search']),
			}),
		])
	})
})

describe('an interface under a capability reference name (repobuddy/repobuddy#1000)', () => {
	it('warns on the interface document, naming the rename, and does not fail it', () => {
		const entry = entryOf(
			{ 'project-tracker.capabilities.interface': capabilitiesInterface },
			'project-tracker.capabilities.interface',
		)
		expect(entry).toMatchObject({ kind: 'interface', status: 'passed', failures: [] })
		expect(entry?.warnings).toEqual([
			{
				code: 'reference-renamed',
				message: expect.stringContaining('rename the interface to project-tracker.blueprints'),
			},
		])
	})

	it('checks a one implementation named <id>.capabilities as an implementation, with the warning', () => {
		const one = capabilitiesInterface.replace('cardinality: many', 'cardinality: one')
		const entry = entryOf(
			{
				'project-tracker.capabilities.interface': one,
				'project-tracker.capabilities': doc(
					'## Tracker\n\na\n\n## Detect\n\nb\n',
					'implements: project-tracker.capabilities@1\n',
				),
			},
			'project-tracker.capabilities',
		)
		expect(entry).toMatchObject({ kind: 'implementation', status: 'passed', failures: [] })
		expect(entry?.warnings.map(({ code }) => code)).toEqual(['reference-renamed'])
	})
})

describe('create <system>.capabilities (R140)', () => {
	it('stubs System, Detect, and Verified, in order, each saying what it holds, and the stub passes check', async () => {
		const root = repo()
		const folder = join(root, 'plugins/house')
		write(folder, 'plugin.json', JSON.stringify({ name: 'house' }))

		expect(await create('asana.capabilities', { root, plugin: folder })).toBe(0)
		const content = readFileSync(join(folder, 'references/asana.capabilities.md'), 'utf8')
		expect(content.match(/^## .*/gm)).toEqual(['## System', '## Detect', '## Verified'])
		expect(content).toContain('description: What asana can do')
		expect(content).toContain('`run`, `from docs`, or `untested`')

		const [entry] = checkReferences([{ tier: 'plugin', dir: join(folder, 'references'), plugin: 'house' }], {
			names: ['asana.capabilities'],
		})
		expect(entry).toMatchObject({ kind: 'capability', status: 'passed' })
	})

	it('writes a --template as given instead of the stub', async () => {
		const root = repo()
		const template = write(root, 't.md', '---\ndescription: d\n---\n\n## A\n\na\n')
		expect(await create('asana.capabilities', { root, template })).toBe(0)
		expect(readFileSync(join(root, '.agents/references/asana.capabilities.md'), 'utf8')).toContain('## A')
	})
})
