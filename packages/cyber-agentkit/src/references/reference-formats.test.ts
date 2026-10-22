import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceLayer } from './reference-layers.js'
import { parseReferenceName, referenceNames, resolveReference } from './resolve-reference.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string> = {}): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-formats-'))
	for (const [file, content] of Object.entries(documents)) {
		mkdirSync(dirname(join(dir, file)), { recursive: true })
		writeFileSync(join(dir, file), content)
	}
	return { tier, dir }
}

const json = '{"a": 1}\n'

describe('non-Markdown references (R65 to R71)', () => {
	it('answers a name with the file as written and reports its format (R65, R66)', () => {
		const resolved = resolveReference('checks', [layer('project', { 'checks.json': json })])
		expect(resolved).toMatchObject({ status: 'found', content: json, format: 'json' })
	})

	it('answers each extension (R65)', () => {
		for (const file of ['checks.yaml', 'checks.yml', 'checks.toml', 'checks.txt']) {
			expect(resolveReference('checks', [layer('user', { [file]: 'x: 1\n' })]).status).toBe('found')
		}
	})

	it('answers first by format order within one folder and warns about the rest (R67)', () => {
		const resolved = resolveReference('checks', [
			layer('project', { 'checks.md': '# Checks\n\nbody\n', 'checks.json': json }),
		])
		expect(resolved.format).toBe('markdown')
		expect(resolved.warnings.map(({ code }) => code)).toEqual(['file-ignored'])
	})

	it('lets the highest non-Markdown contribution replace everything below (R68)', () => {
		const resolved = resolveReference('checks', [
			layer('project', { 'checks.json': json }),
			layer('user', { 'checks.md': '# Checks\n\nlow\n' }),
		])
		expect(resolved).toMatchObject({ content: json, format: 'json' })
		expect(resolved.trace.layers[1]?.outcome).toBe(
			'shadowed by project ' + resolved.trace.layers[0]?.path + ' (replace)',
		)
	})

	it('ignores a Markdown contribution above a data file, with a warning (R68)', () => {
		const resolved = resolveReference('checks', [
			layer('project', { 'checks.md': '# Checks\n\nhigh\n' }),
			layer('user', { 'checks.json': json }),
		])
		expect(resolved).toMatchObject({ content: json, format: 'json' })
		expect(resolved.warnings.map(({ code }) => code)).toEqual(['format-mismatch'])
		expect(resolved.trace.layers[0]?.outcome).toBe('not used (format differs from json)')
	})

	it('lets a Markdown remove turn a data file off (R68)', () => {
		const resolved = resolveReference('checks', [
			layer('project', { 'checks.md': '---\nmerge: remove\n---\n' }),
			layer('user', { 'checks.json': json }),
		])
		expect(resolved.status).toBe('missing')
	})

	it('rejects a name that ends in a data extension (R69)', () => {
		expect(parseReferenceName('checks.json').invalid).toBeDefined()
	})

	it('lists data names and reads a skill default in a data format (UC13.6)', () => {
		const project = layer('project', { 'checks.json': json })
		const fallback = { ...layer('default', { 'other.default.yaml': 'a: 1\n' }), skill: 'tool' }
		expect(referenceNames([project, fallback])).toEqual(['checks', 'other'])
		expect(resolveReference('other', [fallback])).toMatchObject({ format: 'yaml' })
	})

	it('leaves Markdown answers marked markdown (R71)', () => {
		expect(resolveReference('doc', [layer('project', { 'doc.md': '# Doc\n\nbody\n' })]).format).toBe('markdown')
	})

	it('lets a selection choose which plugin supplies a data file (inversion of control)', () => {
		const layers = [
			layer('user', { 'permissions.md': '---\nextends: [plugin-b]\n---\n' }),
			{ ...layer('plugin', { 'permissions.json': '{"who":"a"}\n' }), plugin: 'plugin-a' },
			{ ...layer('plugin', { 'permissions.json': '{"who":"b"}\n' }), plugin: 'plugin-b' },
		]
		const resolved = resolveReference('permissions', layers)
		expect(resolved).toMatchObject({ status: 'found', content: '{"who":"b"}\n', format: 'json' })
		expect(resolved.warnings).toEqual([])
	})
})
