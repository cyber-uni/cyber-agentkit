import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultsNotListed, listReferences, searchReferences } from './reference-catalog.js'
import type { ReferenceLayer } from './reference-layers.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string>, plugin?: string): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-catalog-'))
	for (const [file, content] of Object.entries(documents)) {
		mkdirSync(dirname(join(dir, file)), { recursive: true })
		writeFileSync(join(dir, file), content)
	}
	return plugin === undefined ? { tier, dir } : { tier, dir, plugin }
}

const doc = (description: string, body = '## A\n\nbody\n') => `---\ndescription: ${description}\n---\n\n${body}`

describe('listReferences', () => {
	it('gives one row per name, with its status and options when not found', () => {
		const layers = [
			layer('project', { 'testing.md': doc('project testing') }),
			layer('plugin', { 'testing.md': doc('plugin testing'), 'shared.md': doc('a') }, 'a'),
			layer('plugin', { 'shared.md': doc('b') }, 'b'),
		]

		const listing = listReferences(layers)

		expect(listing.references).toEqual([
			{ name: 'shared', description: '', status: 'ambiguous', options: ['a/shared', 'b/shared'] },
			{ name: 'testing', description: 'project testing', status: 'found' },
		])
		expect(listing.defaults).toBe(defaultsNotListed)
	})

	it('gives one layer row per name per layer holding it, with its outcome, marking a selection', () => {
		const layers = [
			layer('project', { 'shared.md': '---\nextends: [b]\n---\n' }),
			layer('plugin', { 'shared.md': doc('a') }, 'a'),
			layer('plugin', { 'shared.md': doc('b') }, 'b'),
		]

		const { layers: rows, references } = listReferences(layers)

		expect(references).toEqual([{ name: 'shared', description: 'b', status: 'found' }])
		expect(rows.map(({ tier, plugin, outcome, selection }) => [tier, plugin, outcome, selection])).toEqual([
			['project', undefined, 'used', true],
			['plugin', 'a', 'not used (not in extends)', undefined],
			['plugin', 'b', 'used', undefined],
		])
	})

	it('shows a name a remove turned off as missing, and the rows below as shadowed', () => {
		const layers = [
			layer('project', { 'x.md': '---\nmerge: remove\n---\n' }),
			layer('plugin', { 'x.md': doc('x') }, 'a'),
		]

		const listing = listReferences(layers)

		expect(listing.references).toEqual([{ name: 'x', description: '', status: 'missing' }])
		expect(listing.layers[1]?.outcome).toMatch(/^shadowed by project .*\(remove\)$/)
	})

	it('keeps exactly the names a pattern matches, * standing for any run of characters', () => {
		const layers = [
			layer('project', { 'tracker.github.md': doc('g'), 'tracker.jira.md': doc('j'), 'trackers.md': doc('t') }),
		]

		expect(listReferences(layers, { pattern: 'tracker.*' }).references.map(({ name }) => name)).toEqual([
			'tracker.github',
			'tracker.jira',
		])
	})

	it('collects each warning once', () => {
		const layers = [layer('project', { 'x.md': '---\nmerge: bogus\n---\n\n## A\n' })]

		expect(listReferences(layers).warnings.map(({ code }) => code)).toEqual(['merge-unknown'])
	})
})

describe('searchReferences', () => {
	const layers = () => [
		layer('project', {
			'testing.md': doc('How to write tests', '## Fixtures\n\nUse a temp folder.\n'),
			'release.md': doc('Release steps', '## Changelog\n\nWrite a changeset.\n'),
			'gone.md': '---\nmerge: remove\n---\n',
		}),
		layer('user', { 'gone.md': doc('testing gone') }),
	]

	it('ranks match kinds name, prefix, close name, description, heading, body, then by name', () => {
		expect(searchReferences('testing', layers()).matches.map(({ name, match }) => `${name} ${match}`)).toEqual([
			'testing name',
		])
		expect(searchReferences('test', layers()).matches.map(({ match }) => match)).toEqual(['prefix'])
		expect(searchReferences('fixtures', layers()).matches.map(({ match }) => match)).toEqual(['heading'])
		expect(searchReferences('changeset', layers()).matches.map(({ match }) => match)).toEqual(['body'])
		expect(searchReferences('release steps', layers()).matches.map(({ match }) => match)).toEqual(['description'])
	})

	it('leaves out a name a remove turned off', () => {
		expect(searchReferences('gone', layers()).matches).toEqual([])
	})

	it('searches a name no extends orders once per plugin, as its qualified name', () => {
		const plugins = [
			layer('plugin', { 'shared.md': doc('one') }, 'a'),
			layer('plugin', { 'shared.md': doc('two') }, 'b'),
		]

		expect(searchReferences('shared', plugins).matches).toEqual([
			{ name: 'a/shared', description: 'one', match: 'name', tier: 'plugin', plugin: 'a' },
			{ name: 'b/shared', description: 'two', match: 'name', tier: 'plugin', plugin: 'b' },
		])
	})

	it('matches tags as description', () => {
		const tagged = [layer('project', { 'x.md': '---\ntags: [deploy, ci]\n---\n\n## A\n' })]

		expect(searchReferences('deploy', tagged).matches.map(({ match }) => match)).toEqual(['description'])
	})
})
