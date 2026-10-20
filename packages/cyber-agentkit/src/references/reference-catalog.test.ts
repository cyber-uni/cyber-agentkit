import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listReferences, searchReferences } from './reference-catalog.js'
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
		expect(listing.defaults).toBeUndefined()
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

describe("a skill's default", () => {
	function skill(name: string, documents: Record<string, string>) {
		const folder = mkdtempSync(join(tmpdir(), 'reference-catalog-skill-'))
		writeFileSync(join(folder, 'SKILL.md'), `---\nname: ${name}\n---\n`)
		mkdirSync(join(folder, 'references'))
		for (const [file, content] of Object.entries(documents)) writeFileSync(join(folder, 'references', file), content)
		return { name, folder }
	}

	it('lists a name only defaults hold, with a row per skill noting the default step reaches it', () => {
		const tracker = skill('tracker', { 'x.default.md': doc('from tracker') })
		const other = skill('tracker', { 'x.default.md': doc('same name, another folder') })
		const source = { layers: [layer('project', {})], harnesses: [], skills: { skills: [tracker, other] } }

		const listing = listReferences(source)

		expect(listing.references).toEqual([{ name: 'x', description: 'from tracker', status: 'found' }])
		expect(listing.layers.map(({ tier, skill: who, outcome, reachedBy }) => [tier, who, outcome, reachedBy])).toEqual([
			['default', 'tracker', 'used', 'the default step, when tracker loads x'],
			['default', 'tracker', 'used', 'the default step, when tracker loads x'],
		])
		expect(listing.defaults).toBeUndefined()
	})

	it("adds each skill's default to an ambiguous name's options", () => {
		const tracker = skill('tracker', { 'shared.default.md': doc('d') })
		const source = {
			layers: [layer('plugin', { 'shared.md': doc('a') }, 'a'), layer('plugin', { 'shared.md': doc('b') }, 'b')],
			harnesses: [],
			skills: { skills: [tracker] },
		}

		expect(listReferences(source).references[0]?.options).toEqual(['a/shared', 'b/shared', 'default of tracker'])
	})

	it('searches a default as its skill loads it, naming the skill, and gives why some are not listed', () => {
		const tracker = skill('tracker', { 'x.default.md': doc('tracker steps', '## Close\n\nclose it\n') })
		const source = {
			layers: [layer('plugin', { 'x.md': doc('plugin', '## Open\n\nopen it\n') }, 'a')],
			harnesses: [],
			skills: { skills: [tracker], unverified: 'kilo is not verified' },
		}

		const { matches, defaults } = searchReferences('close it', source)

		expect(matches).toEqual([
			{ name: 'x', description: 'plugin', match: 'body', tier: 'plugin', plugin: 'a', loadedBy: 'tracker' },
		])
		expect(defaults).toBe('kilo is not verified')
	})
})
