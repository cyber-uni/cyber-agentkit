import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listReferences } from './reference-catalog.js'
import type { ReferenceWarning } from './reference-codes.js'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import {
	compareSources,
	generatedFrontmatter,
	readGeneratedRecord,
	recordedSources,
	sourceCatalog,
} from './reference-sources.js'
import { resolveReference } from './resolve-reference.js'

function tempDir(prefix = 'reference-sources-'): string {
	return mkdtempSync(join(tmpdir(), prefix))
}

function write(root: string, relPath: string, content: string): string {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
	return path
}

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string> = {}): ReferenceLayer {
	const dir = tempDir()
	for (const [file, content] of Object.entries(documents)) write(dir, file, content)
	return { tier, dir }
}

function plugin(
	name: string,
	version: string | undefined,
	documents: Record<string, string> = {},
	origin: ReferenceLayer['origin'] = 'enabled',
): ReferenceLayer {
	return { ...layer('plugin', documents), plugin: name, version, origin }
}

const name = 'house-style'

const generated = (sources: string, request = 'Keep it short.\n') =>
	`---\nextends: [style-kit]\nsources:\n${sources}\nrequest: |\n  ${request}---\n\n## Style\n\nShort lines.\n`

const codes = (warnings: readonly ReferenceWarning[]) => warnings.map(({ code }) => code)

describe('the generated record (C4, K25)', () => {
	it('reads plugin and default sources, and the request', () => {
		const warnings: string[] = []
		const record = readGeneratedRecord(
			{
				sources: [
					{ plugin: 'style-kit', version: '1.2.0' },
					{ default: 'writer', plugin: 'writer-kit', version: 2 },
					{ default: 'loner' },
				],
				request: 'Keep it short.\n',
			},
			(code) => warnings.push(code),
		)

		expect(record).toEqual({
			sources: [
				{ plugin: 'style-kit', version: '1.2.0' },
				{ default: 'writer', plugin: 'writer-kit', version: '2' },
				{ default: 'loner' },
			],
			request: 'Keep it short.\n',
		})
		expect(warnings).toEqual([])
	})

	it('leaves out a malformed source with a warning, and reads a `sources` that is not a list as none', () => {
		const warnings: string[] = []
		const warn = (code: string) => warnings.push(code)

		expect(readGeneratedRecord({ sources: [{ version: '1.0.0' }, { plugin: 'a' }] }, warn)).toEqual({
			sources: [{ plugin: 'a' }],
		})
		expect(readGeneratedRecord({ sources: 'a' }, warn)).toEqual({})
		expect(warnings).toEqual(['frontmatter-invalid', 'frontmatter-invalid'])
	})

	it('writes `sources` then `request`, the request ending in a newline, for a writer (U7)', () => {
		expect(
			generatedFrontmatter({ sources: [{ plugin: 'a', version: '1.0.0' }, { default: 'w' }], request: 'Short.' }),
		).toEqual({ sources: [{ plugin: 'a', version: '1.0.0' }, { default: 'w' }], request: 'Short.\n' })
		expect(generatedFrontmatter({ request: 'Short.\n' })).toEqual({ request: 'Short.\n' })
	})

	it('records each stack step with its installed version, a default as its skill with its plugin (K34)', () => {
		const layers = [plugin('a', '1.0.0'), plugin('b', undefined), plugin('w', '3.0.0')]
		const catalog = sourceCatalog(layers, { tier: 'repo' })

		expect(recordedSources(['a', 'b', 'default'], catalog, { skill: 'writer', plugin: 'w' })).toEqual([
			{ plugin: 'a', version: '1.0.0' },
			{ plugin: 'b' },
			{ default: 'writer', plugin: 'w', version: '3.0.0' },
		])
		expect(recordedSources(['default'], catalog, { skill: 'loner' })).toEqual([{ default: 'loner' }])
	})

	it("records only the harness's enabled plugins, and the host, for a user document (R84, C6)", () => {
		const layers = [plugin('host', '1.0.0', {}, 'host'), plugin('a', '1.0.0'), plugin('dep', '1.0.0', {}, 'dependency')]

		expect(recordedSources(['dep', 'a', 'host'], sourceCatalog(layers, { tier: 'user' }))).toEqual([
			{ plugin: 'a', version: '1.0.0' },
			{ plugin: 'host', version: '1.0.0' },
		])
		expect(recordedSources(['dep'], sourceCatalog(layers, { tier: 'repo' }))).toEqual([
			{ plugin: 'dep', version: '1.0.0' },
		])
	})
})

describe('staleness (R101, UC1.14, UC2.8)', () => {
	it('marks a repo document stale when a recorded plugin version differs, still using it, with a warning', () => {
		const resolved = resolveReference(name, [
			layer('repo', { [`${name}.md`]: generated('  - plugin: style-kit\n    version: 1.0.0') }),
			plugin('style-kit', '1.2.0', { [`${name}.md`]: '## Style\n\nLong lines.\n' }),
		])

		expect(resolved.status).toBe('found')
		expect(resolved.content).toContain('Short lines.')
		const repo = resolved.trace.layers.find(({ tier }) => tier === 'repo')
		expect(repo?.outcome).toBe('stale')
		expect(repo?.sources).toEqual([{ plugin: 'style-kit', recorded: '1.0.0', installed: '1.2.0', status: 'changed' }])
		expect(repo?.request).toBe('Keep it short.\n')
		const [warning] = resolved.warnings.filter(({ code }) => code === 'reference-stale')
		expect(warning?.message).toMatch(/plugin style-kit is 1\.2\.0, recorded 1\.0\.0/)
		expect(warning?.message).toMatch(/Customize mode revises "house-style" from its recorded request/)
	})

	it('marks it stale when a recorded source is gone', () => {
		const resolved = resolveReference(name, [
			layer('user', { [`${name}.md`]: generated('  - plugin: gone-kit\n    version: 1.0.0') }),
		])

		const user = resolved.trace.layers.find(({ tier }) => tier === 'user')
		expect(user?.outcome).toBe('stale')
		expect(user?.sources).toEqual([{ plugin: 'gone-kit', recorded: '1.0.0', status: 'missing' }])
		expect(resolved.warnings.find(({ code }) => code === 'reference-stale')?.message).toMatch(
			/plugin gone-kit is not installed/,
		)
	})

	it('is used, not stale, when every recorded source matches what is installed', () => {
		const resolved = resolveReference(name, [
			layer('repo', { [`${name}.md`]: generated('  - plugin: style-kit\n    version: 1.2.0') }),
			plugin('style-kit', '1.2.0', { [`${name}.md`]: '## Style\n\nLong lines.\n' }),
		])

		const repo = resolved.trace.layers.find(({ tier }) => tier === 'repo')
		expect(repo?.outcome).toBe('used')
		expect(repo?.sources).toEqual([{ plugin: 'style-kit', recorded: '1.2.0', installed: '1.2.0', status: 'current' }])
		expect(codes(resolved.warnings)).not.toContain('reference-stale')
	})

	it('never makes a contribution recording no sources stale', () => {
		const resolved = resolveReference(name, [
			layer('repo', { [`${name}.md`]: '---\nrequest: |\n  Write it.\n---\n\n## Style\n\nShort.\n' }),
		])

		const repo = resolved.trace.layers.find(({ tier }) => tier === 'repo')
		expect(repo?.outcome).toBe('used')
		expect(repo?.sources).toBeUndefined()
		expect(repo?.request).toBe('Write it.\n')
		expect(codes(resolved.warnings)).not.toContain('reference-stale')
	})

	it("never makes a plugin's or a default's own file stale at load: only check compares it (R86)", () => {
		const recorded = '---\nsources:\n  - plugin: base-kit\n    version: 0.1.0\n---\n\n## Style\n\nShort.\n'
		const resolved = resolveReference(name, [
			plugin('style-kit', '1.0.0', { [`${name}.md`]: recorded }),
			plugin('base-kit', '2.0.0'),
			{ ...layer('default', { [`${name}.default.md`]: recorded }), skill: 'writer' },
		])

		expect(resolved.trace.layers.map(({ outcome }) => outcome)).not.toContain('stale')
		expect(resolved.trace.layers.some(({ sources }) => sources)).toBe(false)
		expect(codes(resolved.warnings)).not.toContain('reference-stale')
	})

	it('compares a default source by its plugin version alone (K34, N8)', () => {
		const sources = '  - default: writer\n    plugin: writer-kit\n    version: 1.0.0'
		const resolved = resolveReference(name, [
			layer('repo', { [`${name}.md`]: generated(sources) }),
			plugin('writer-kit', '1.1.0'),
		])

		expect(resolved.trace.layers.find(({ tier }) => tier === 'repo')?.sources).toEqual([
			{ default: 'writer', plugin: 'writer-kit', recorded: '1.0.0', installed: '1.1.0', status: 'changed' },
		])
		expect(resolved.warnings.find(({ code }) => code === 'reference-stale')?.message).toMatch(
			/the default of writer \(plugin writer-kit\) is 1\.1\.0, recorded 1\.0\.0/,
		)
	})

	it("makes a standalone skill's default stale only when it is gone, and only when every skill folder was read", () => {
		const doc = { [`${name}.md`]: generated('  - default: loner') }
		const catalog = (skills: string[], unverified?: string): ReferenceLayers => ({
			layers: [layer('repo', doc)],
			harnesses: ['claude-code'],
			skills: { skills: skills.map((skill) => ({ name: skill, folder: `/skills/${skill}` })), unverified },
		})
		const outcome = (source: ReferenceLayers) =>
			resolveReference(name, source).trace.layers.find(({ tier }) => tier === 'repo')?.outcome

		expect(outcome(catalog(['loner']))).toBe('used')
		expect(outcome(catalog([]))).toBe('stale')
		expect(outcome(catalog([], 'not verified'))).toBe('used')
		expect(resolveReference(name, [layer('repo', doc)]).trace.layers[0]?.outcome).toBe('used')
	})

	it('counts the default given with --default as present', () => {
		const rows = compareSources(
			[{ default: 'loner' }],
			sourceCatalog(
				{
					layers: [{ ...layer('default'), skill: 'loner' }],
					harnesses: [],
					skills: { skills: [] },
				},
				{ tier: 'repo' },
			),
		)

		expect(rows).toEqual([{ default: 'loner', status: 'current' }])
	})

	it('reads no recorded version as present when the plugin is installed, whatever its version', () => {
		expect(compareSources([{ plugin: 'a' }], sourceCatalog([plugin('a', '9.0.0')], { tier: 'repo' }))).toEqual([
			{ plugin: 'a', installed: '9.0.0', status: 'current' },
		])
	})

	it("compares a user document's sources to the enabled plugins only, never to a dependency plugin (R101, C6)", () => {
		const source: ReferenceLayers = {
			layers: [
				layer('user', { [`${name}.md`]: generated('  - plugin: style-kit\n    version: 1.0.0') }),
				plugin('host', '1.0.0', {}, 'host'),
				plugin('dep-kit', '1.0.0', { [`${name}.md`]: '## Extra\n\nMore.\n' }, 'dependency'),
			],
			harnesses: [],
			plugins: [
				{ plugin: 'host', version: '1.0.0', origin: 'host' },
				{ plugin: 'style-kit', version: '1.0.0', origin: 'enabled' },
				{ plugin: 'dep-kit', version: '1.0.0', origin: 'dependency' },
			],
		}
		const resolved = resolveReference(name, source)
		expect(resolved.trace.layers.find(({ tier }) => tier === 'user')?.outcome).toBe('used')

		const recordedDependency: ReferenceLayers = {
			...source,
			layers: [layer('user', { [`${name}.md`]: generated('  - plugin: dep-kit\n    version: 1.0.0') })],
		}
		expect(resolveReference(name, recordedDependency).trace.layers[0]?.outcome).toBe('stale')
	})

	it('compares sources to every installed plugin, including one with no references folder (ReferenceLayers.plugins)', () => {
		const source: ReferenceLayers = {
			layers: [layer('repo', { [`${name}.md`]: generated('  - default: w\n    plugin: w-kit\n    version: 1.0.0') })],
			harnesses: [],
			plugins: [{ plugin: 'w-kit', version: '1.0.0', origin: 'enabled' }],
		}

		expect(resolveReference(name, source).trace.layers[0]?.outcome).toBe('used')
	})

	it('reports no source on a document shadowed by a replace above it', () => {
		const resolved = resolveReference(name, [
			layer('repo', { [`${name}.md`]: '---\nmerge: replace\n---\n\n## Style\n\nMine.\n' }),
			layer('user', { [`${name}.md`]: generated('  - plugin: gone-kit\n    version: 1.0.0') }),
		])

		expect(resolved.trace.layers.find(({ tier }) => tier === 'user')?.outcome).toMatch(/^shadowed by/)
		expect(codes(resolved.warnings)).not.toContain('reference-stale')
	})
})

describe('metadata and listing (UC8, R38)', () => {
	it('leaves sources and request out of metadata, and the trace carries them as written', () => {
		const resolved = resolveReference(name, [
			layer('repo', {
				[`${name}.md`]: generated('  - plugin: style-kit\n    version: 1.0.0').replace(
					'---\nextends',
					'---\ndescription: House style\nextends',
				),
			}),
			plugin('style-kit', '1.0.0', { [`${name}.md`]: '## Style\n\nLong.\n' }),
		])

		expect(resolved.metadata).toEqual({ description: 'House style' })
		expect(resolved.trace.layers.find(({ tier }) => tier === 'repo')?.frontmatter).toMatchObject({
			sources: [{ plugin: 'style-kit', version: '1.0.0' }],
			request: 'Keep it short.\n',
		})
	})

	it('marks a generated document by its kind in the list trace', () => {
		const listing = listReferences([
			layer('repo', { [`${name}.md`]: generated('  - plugin: style-kit\n    version: 1.0.0') }),
			plugin('style-kit', '2.0.0', { [`${name}.md`]: '## Style\n\nLong.\n' }),
		])

		expect(listing.layers.map(({ tier, outcome, kind }) => [tier, outcome, kind])).toEqual([
			['repo', 'stale', 'generated'],
			['plugin', 'used', undefined],
		])
	})
})

describe('project sections (K24, K34, UC1.16)', () => {
	function rooted(sections: Record<string, string>, extra: ReferenceLayer[] = []): ReferenceLayers {
		const root = tempDir('reference-sources-root-')
		for (const [folder, content] of Object.entries(sections))
			write(root, join(folder, '.agents', 'references', `${name}.md`), content)
		return {
			layers: [{ tier: 'repo', dir: join(root, '.agents', 'references') }, ...extra],
			root,
			projects: new Map(),
			harnesses: [],
		}
	}
	const section = (sources: string) =>
		`---\ndescription: Web\nsources:\n${sources}\nrequest: |\n  Web only.\n---\n\n## Web\n\nUse JSX.\n`

	it('marks a project section stale like a main document, still delivering it, its metadata without the record', () => {
		const resolved = resolveReference(
			name,
			rooted({ web: section('  - plugin: style-kit\n    version: 1.0.0') }, [
				plugin('style-kit', '1.1.0', { [`${name}.md`]: '## Style\n\nLong.\n' }),
			]),
		)

		expect(resolved.projectSections).toEqual([
			expect.objectContaining({ folder: 'web', metadata: { description: 'Web' } }),
		])
		expect(resolved.trace.projectSections[0]).toMatchObject({
			outcome: 'stale',
			sources: [{ plugin: 'style-kit', recorded: '1.0.0', installed: '1.1.0', status: 'changed' }],
			request: 'Web only.\n',
		})
		expect(codes(resolved.warnings)).toContain('reference-stale')
	})

	it('is stale when the sources it records are gone and no main document answers (UC1.16)', () => {
		const resolved = resolveReference(name, rooted({ web: section('  - plugin: gone-kit\n    version: 1.0.0') }))

		expect(resolved.status).toBe('found')
		expect(resolved.trace.projectSections[0]?.outcome).toBe('stale')
		expect(codes(resolved.warnings)).toContain('reference-stale')
	})

	it('is used when its sources match', () => {
		const resolved = resolveReference(
			name,
			rooted({ web: section('  - plugin: style-kit\n    version: 1.1.0') }, [
				plugin('style-kit', '1.1.0', { [`${name}.md`]: '## Style\n\nLong.\n' }),
			]),
		)

		expect(resolved.trace.projectSections[0]?.outcome).toBe('used')
		expect(codes(resolved.warnings)).not.toContain('reference-stale')
	})
})
