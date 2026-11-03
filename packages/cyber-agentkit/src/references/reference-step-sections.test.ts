import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pickSections } from './reference-document.js'
import type { ReferenceLayer } from './reference-layers.js'
import { readExtends, resolveReference } from './resolve-reference.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string> = {}): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-step-sections-'))
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

const house = '## Create\n\nhouse create\n\n## Close\n\nhouse close\n\n## Review\n\nhouse review\n'
const base = '## Create\n\nbase create\n\n## Close\n\nbase close\n'

describe('step sections (R52, UC9)', () => {
	it('reads a step’s sections, each a heading or {heading: operation}', () => {
		const warn = () => {}
		expect(readExtends([{ a: { merge: 'combine', sections: ['Create', { Close: 'replace' }] } }], warn)).toEqual([
			{ target: 'a', merge: 'combine', sections: [{ heading: 'Create' }, { heading: 'Close', merge: 'replace' }] },
		])
		expect(readExtends([{ a: { sections: 'Create' } }], warn)).toEqual([
			{ target: 'a', sections: [{ heading: 'Create' }] },
		])
	})

	it('reads sections that are not headings as a malformed extends (R106)', () => {
		const warnings: string[] = []
		expect(readExtends([{ a: { sections: [1] } }], (code) => warnings.push(code))).toBeUndefined()
		expect(warnings).toEqual(['extends-invalid'])
	})

	it('contributes only the listed sections of a step; its other sections are not used', () => {
		const resolved = resolveReference('name', [
			layer('repo', { 'name.md': '---\nextends:\n  - base\n  - house:\n      sections: [Close]\n---\n' }),
			plugin('house', { 'name.md': house }),
			plugin('base', { 'name.md': base }),
		])

		expect(resolved.status).toBe('found')
		expect(resolved.content).toBe('## Create\n\nbase create\n\n## Close\n\nhouse close\n')
		expect(resolved.warnings).toEqual([])
		expect(resolved.trace.sections).toEqual([
			{ path: 'Create', contributions: [{ contribution: 'plugin base', operation: 'patch' }] },
			{ path: 'Close', contributions: [{ contribution: 'plugin house', operation: 'patch' }] },
		])
	})

	it('applies each listed section with its own operation', () => {
		const resolved = resolveReference('name', [
			layer('repo', {
				'name.md': '---\nextends:\n  - base\n  - house:\n      sections: [{Create: combine}, Review]\n---\n',
			}),
			plugin('house', { 'name.md': house }),
			plugin('base', { 'name.md': base }),
		])

		expect(resolved.content).toBe(
			'Where these sections conflict, the later text wins.\n\n## Create\n\nbase create\n\nhouse create\n\n## Close\n\nbase close\n\n## Review\n\nhouse review\n',
		)
	})

	it('skips a listed section the step does not hold, with a warning', () => {
		const resolved = resolveReference('name', [
			layer('repo', { 'name.md': '---\nextends:\n  - base\n  - house:\n      sections: [Close, Missing]\n---\n' }),
			plugin('house', { 'name.md': house }),
			plugin('base', { 'name.md': base }),
		])

		expect(resolved.content).toBe('## Create\n\nbase create\n\n## Close\n\nhouse close\n')
		expect(codes(resolved)).toEqual(['section-not-held'])
		expect(resolved.warnings[0]?.message).toMatch(/plugin house: .*"Missing"/)
	})

	it('cuts a body to its listed top-level sections in document order, subsections kept, the preamble left out', () => {
		const body = 'intro\n\n## A\n\na\n\n### A1\n\na1\n\n## B\n\n<!-- merge: patch -->\nb\n\n## C\n\nc\n'

		expect(pickSections(body, [{ heading: 'C' }, { heading: 'a' }, { heading: 'B', merge: 'remove' }])).toEqual({
			body: '## A\n\na\n\n### A1\n\na1\n\n## B\n<!-- merge: remove -->\n\nb\n\n## C\n\nc\n',
			missing: [],
		})
		expect(pickSections(body, [{ heading: 'Z' }]).missing).toEqual(['Z'])
	})
})

describe('R6 fixture (patch example)', () => {
	it('patches the first document by the second to give the third', () => {
		const below = '# Checks\nRun lint.\n## Lint\nUse biome.\n## Tests\nRun vitest.\n# Style\nShort lines.\n'
		const over =
			'# Checks\nRun lint and types.\n## Tests\nRun vitest with coverage.\n## Types\nUse tsc.\n# Docs\nWrite docs.\n'
		const expected =
			'# Checks\nRun lint and types.\n## Lint\nUse biome.\n## Tests\nRun vitest with coverage.\n## Types\nUse tsc.\n# Style\nShort lines.\n# Docs\nWrite docs.\n'
		const resolved = resolveReference('checks', [
			layer('repo', { 'checks.md': over }),
			plugin('a', { 'checks.md': below }),
		])

		// The composed document puts a blank line between blocks; the fixture is written without them.
		expect(resolved.content?.replace(/\n\n/g, '\n')).toBe(expected)
		expect(resolved.warnings).toEqual([])
	})
})
