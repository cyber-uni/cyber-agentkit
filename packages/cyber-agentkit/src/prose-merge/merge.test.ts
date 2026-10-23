import { describe, expect, it } from 'vitest'
import { mergeSentences } from './merge.js'

const s = (...texts: string[]) => texts.map((text) => ({ text, kind: 'text' as const, gap: ' ' as const }))
const run = (base: string[], found: string[], offered: string[]) => {
	const result = mergeSentences(s(...base), s(...found), s(...offered))
	return {
		revision: result.revision,
		merged: result.merged.map((x) => x.text),
		collisions: result.collisions.map((c) => [c.base, c.found, c.offered].map((side) => side.map((x) => x.text))),
	}
}

describe('mergeSentences, append revisions', () => {
	it('puts the new sentences right after the found sentence that is the base last, keeping owner sentences after', () => {
		expect(run(['a', 'b'], ['a', 'b', 'mine'], ['a', 'b', 'new'])).toEqual({
			revision: 'append',
			merged: ['a', 'b', 'new', 'mine'],
			collisions: [],
		})
	})

	it('keeps an owner sentence between the base sentences', () => {
		expect(run(['a', 'b'], ['a', 'mine', 'b'], ['a', 'b', 'new']).merged).toEqual(['a', 'mine', 'b', 'new'])
	})

	it('puts them at the end when the owner replaced or deleted the base last sentence', () => {
		expect(run(['a', 'b'], ['a', 'B2', 'mine'], ['a', 'b', 'new']).merged).toEqual(['a', 'B2', 'mine', 'new'])
		expect(run(['a', 'b'], ['a'], ['a', 'b', 'new']).merged).toEqual(['a', 'new'])
		expect(run(['a', 'b'], ['mine'], ['a', 'b', 'new']).merged).toEqual(['mine', 'new'])
	})

	it('never collides, whatever the owner did', () => {
		expect(run(['a', 'b'], ['x', 'y'], ['a', 'b', 'new']).collisions).toEqual([])
	})
})

describe('mergeSentences, rewrites', () => {
	it('takes the offered text when the found text equals the base', () => {
		expect(run(['a', 'b'], ['a', 'b'], ['a', 'B'])).toEqual({ revision: 'rewrite', merged: ['a', 'B'], collisions: [] })
	})

	it('keeps owner additions and takes the offered change when they touch different places', () => {
		expect(run(['a', 'b', 'c'], ['a', 'b', 'c', 'mine'], ['a', 'B', 'c']).merged).toEqual(['a', 'B', 'c', 'mine'])
		expect(run(['a', 'b', 'c'], ['A', 'b', 'c'], ['a', 'b', 'C']).merged).toEqual(['A', 'b', 'C'])
	})

	it('takes the found change when the offered text left it alone', () => {
		expect(run(['a', 'b'], ['a', 'mine'], ['a', 'b']).merged).toEqual(['a', 'mine'])
	})

	it('treats two identical changes as one', () => {
		expect(run(['a', 'b'], ['a', 'B'], ['a', 'B']).collisions).toEqual([])
	})

	it('collides on two changes to the same base sentence, merging nothing there', () => {
		expect(run(['a', 'b', 'c'], ['a', 'B1', 'c'], ['a', 'B2', 'c'])).toEqual({
			revision: 'rewrite',
			merged: ['a', 'B1', 'c'],
			collisions: [[['b'], ['B1'], ['B2']]],
		})
	})

	it('collides on two changes with no unchanged base sentence between them', () => {
		expect(run(['a', 'b'], ['A', 'b'], ['a', 'B']).collisions).toHaveLength(1)
	})

	it('collides on two insertions in the same gap', () => {
		expect(run(['a', 'b'], ['a', 'mine', 'b'], ['a', 'theirs', 'b', 'c']).collisions).toEqual([
			[[], ['mine'], ['theirs']],
		])
	})

	it('merges the non-colliding sentences of a part that also has a collision', () => {
		const result = run(['a', 'x', 'b', 'c'], ['a', 'x', 'B1', 'c', 'mine'], ['A', 'x', 'B2', 'c'])
		expect(result.merged).toEqual(['A', 'x', 'B1', 'c', 'mine'])
		expect(result.collisions).toHaveLength(1)
	})
})
