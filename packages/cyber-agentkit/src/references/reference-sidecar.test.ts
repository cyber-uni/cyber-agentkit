import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listReferences } from './reference-catalog.js'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import { referenceNames, resolveReference } from './resolve-reference.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string> = {}): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-sidecar-'))
	for (const [file, content] of Object.entries(documents)) {
		mkdirSync(dirname(join(dir, file)), { recursive: true })
		writeFileSync(join(dir, file), content)
	}
	return { tier, dir }
}

function plugin(name: string, documents: Record<string, string>): ReferenceLayer {
	return { ...layer('plugin', documents), plugin: name }
}

const codes = (resolved: ReturnType<typeof resolveReference>) => resolved.warnings.map(({ code }) => code)

const json = '{"a": 1}\n'

describe('metadata files (K31, R65, R70, R93, R94)', () => {
	it('gives a non-Markdown name the metadata file’s frontmatter, without extends and the record, plus format (R70)', () => {
		const resolved = resolveReference('conf', [
			layer('repo', {
				'conf.json': json,
				'conf.meta.md':
					'---\ndescription: The checks\ntags: [ci]\nextends: [a]\nsources:\n  - plugin: a\nrequest: |\n  x\n---\n',
			}),
			plugin('a', { 'conf.json': '{}\n' }),
		])

		expect(resolved).toMatchObject({
			status: 'found',
			content: json,
			format: 'json',
			metadata: { description: 'The checks', tags: ['ci'] },
		})
		expect(resolved.trace.layers[0]).toMatchObject({
			file: 'conf.json',
			description: 'The checks',
			frontmatter: expect.objectContaining({ extends: ['a'] }),
		})
	})

	it('gives a non-Markdown name with no metadata file only its format and empty metadata (UC13.5)', () => {
		const resolved = resolveReference('conf', [layer('repo', { 'conf.json': json })])
		expect(resolved).toMatchObject({ status: 'found', format: 'json', metadata: {} })
	})

	it('never answers a name with a metadata file, and reserves a name ending .meta (R65, K31)', () => {
		const repo = layer('repo', { 'conf.meta.md': '---\ndescription: d\n---\n\n## A\n\na\n' })

		expect(resolveReference('conf', [repo]).status).toBe('missing')
		expect(resolveReference('conf.meta', [repo])).toMatchObject({ status: 'invalid', code: 'reference-invalid' })
		expect(referenceNames([repo])).toEqual([])
	})

	it('ignores merge and implements in a metadata file, with metadata-ignored (R94, UC13.10)', () => {
		const resolved = resolveReference('conf', [
			layer('repo', { 'conf.json': json, 'conf.meta.md': '---\ndescription: d\nmerge: patch\nimplements: x@1\n---\n' }),
		])

		expect(resolved.metadata).toEqual({ description: 'd' })
		expect(codes(resolved)).toEqual(['metadata-ignored', 'metadata-ignored'])
	})

	it('ignores a body in a metadata file, with a warning, and still applies its frontmatter (R94)', () => {
		const resolved = resolveReference('conf', [
			layer('repo', { 'conf.json': json, 'conf.meta.md': '---\ndescription: d\n---\n\nnotes\n' }),
		])

		expect(resolved.metadata).toEqual({ description: 'd' })
		expect(codes(resolved)).toEqual(['metadata-ignored'])
	})

	it('ignores a metadata file beside a Markdown contribution, with a warning (R94)', () => {
		const resolved = resolveReference('name', [
			layer('repo', { 'name.md': '## A\n\na\n', 'name.meta.md': '---\ndescription: d\n---\n' }),
		])

		expect(resolved).toMatchObject({ status: 'found', content: '## A\n\na\n', metadata: {} })
		expect(codes(resolved)).toEqual(['metadata-ignored'])
	})

	it('ignores a metadata file with neither a non-Markdown file nor extends, with a warning (R94)', () => {
		const resolved = resolveReference('conf', [
			layer('repo', { 'conf.meta.md': '---\ndescription: d\n---\n' }),
			plugin('a', { 'conf.json': json }),
		])

		expect(resolved).toMatchObject({ status: 'found', content: json, metadata: {} })
		expect(codes(resolved)).toEqual(['metadata-ignored'])
	})

	it('reads a metadata file with extends and no data file as that tier’s selection; the top step answers whole (R93, UC13.9)', () => {
		const resolved = resolveReference('conf', [
			layer('repo', { 'conf.meta.md': '---\ndescription: picked\nextends: [b]\ndeclined: [a]\n---\n' }),
			plugin('a', { 'conf.json': '{"a": true}\n' }),
			plugin('b', { 'conf.yaml': 'b: true\n' }),
		])

		expect(resolved).toMatchObject({
			status: 'found',
			content: 'b: true\n',
			format: 'yaml',
			metadata: { description: 'picked' },
		})
		expect(resolved.trace.stack).toEqual(['b'])
		expect(resolved.trace.layers[0]).toMatchObject({ file: 'conf.meta.md', selection: true, outcome: 'used' })
		expect(resolved.warnings).toEqual([])
	})

	it('marks a metadata-file selection in the list trace', () => {
		const repo = layer('repo', { 'conf.meta.md': '---\nextends: [b]\n---\n' })
		const listing = listReferences([repo, plugin('a', { 'conf.json': '{}\n' }), plugin('b', { 'conf.json': '{}\n' })])

		expect(listing.references).toEqual([{ name: 'conf', description: '', status: 'found', format: 'json' }])
		expect(listing.layers.find(({ tier }) => tier === 'repo')).toMatchObject({ kind: 'selection' })
	})

	it('reads a default’s metadata file as <name>.default.meta.md', () => {
		const resolved = resolveReference('conf', [
			{
				...layer('default', { 'conf.default.json': json, 'conf.default.meta.md': '---\ndescription: d\n---\n' }),
				skill: 's',
			},
		])

		expect(resolved).toMatchObject({ status: 'found', format: 'json', metadata: { description: 'd' } })
	})

	it('reads a generated non-Markdown document’s record from its metadata file, and reports it stale (R92, R101)', () => {
		const layers: ReferenceLayers = {
			layers: [
				layer('repo', {
					'conf.json': json,
					'conf.meta.md': '---\nsources:\n  - plugin: a\n    version: 1.0.0\nrequest: |\n  Shorter.\n---\n',
				}),
				{ ...plugin('a', { 'conf.json': '{}\n' }), version: '2.0.0' },
			],
			harnesses: [],
			plugins: [{ plugin: 'a', version: '2.0.0' }],
		}
		const resolved = resolveReference('conf', layers)

		expect(resolved.status).toBe('found')
		expect(codes(resolved)).toEqual(['reference-stale'])
		expect(resolved.trace.layers[0]).toMatchObject({ outcome: 'stale', request: 'Shorter.\n' })
		expect(listReferences(layers).layers[0]).toMatchObject({ tier: 'repo', kind: 'generated' })
	})
})
