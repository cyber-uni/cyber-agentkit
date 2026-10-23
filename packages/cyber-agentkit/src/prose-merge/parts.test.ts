import { describe, expect, it } from 'vitest'
import { alignParts, parseParts, renderPart } from './parts.js'

const view = (input: string) =>
	parseParts(input).map((part) => ({ path: part.path, key: part.key, texts: part.sentences.map((s) => s.text) }))

describe('parseParts', () => {
	it('divides a document by heading path', () => {
		expect(view('Intro.\n\n# A\nOne.\n## B\nTwo.\n# C\nThree.')).toEqual([
			{ path: [], key: '', texts: ['Intro.'] },
			{ path: ['A'], key: 'A', texts: ['One.'] },
			{ path: ['A', 'B'], key: 'A > B', texts: ['Two.'] },
			{ path: ['C'], key: 'C', texts: ['Three.'] },
		])
	})

	it('reads one document with no heading as one part with an empty path', () => {
		expect(view('Just text.')).toEqual([{ path: [], key: '', texts: ['Just text.'] }])
	})

	it('has no empty-path part when the document starts with a heading', () => {
		expect(view('## Only\nText.').map((part) => part.path)).toEqual([['Only']])
	})

	it('reads heading levels from the document, not as absolute', () => {
		expect(view('### Top\nA.\n#### Sub\nB.').map((part) => part.key)).toEqual(['Top', 'Top > Sub'])
		expect(view('## Top\nA.\n### Sub\nB.').map((part) => part.key)).toEqual(['Top', 'Top > Sub'])
	})

	it('never reads a heading inside a fence', () => {
		expect(view('# A\n```\n# not\n```\nAfter.').map((part) => part.key)).toEqual(['A'])
	})

	it('keeps a heading with no sentences as an empty part', () => {
		expect(view('# A\n# B\nText.')).toEqual([
			{ path: ['A'], key: 'A', texts: [] },
			{ path: ['B'], key: 'B', texts: ['Text.'] },
		])
	})

	it('numbers a repeated heading path by its order', () => {
		expect(view('# A\nx.\n# A\ny.').map((part) => part.key)).toEqual(['A', 'A #2'])
	})
})

describe('renderPart', () => {
	it('writes the heading, then the sentences with their own separators', () => {
		const [part] = parseParts('# A\n\nOne. Two.\n\n- item')
		expect(renderPart(part?.heading, part?.sentences ?? [])).toBe('# A\n\nOne. Two.\n\n- item')
	})
})

describe('alignParts', () => {
	it('matches parts across texts by key, and lists every key once', () => {
		const a = parseParts('# A\nx.\n# B\ny.')
		const b = parseParts('# B\ny.\n# C\nz.')
		expect(alignParts([a, b]).map((row) => [row.key, row.parts.map((part) => part?.key)])).toEqual([
			['A', ['A', undefined]],
			['B', ['B', 'B']],
			['C', [undefined, 'C']],
		])
	})
})
