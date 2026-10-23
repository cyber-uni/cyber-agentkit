import { describe, expect, it } from 'vitest'
import { matchSentences, shared } from './align.js'

const s = (...texts: string[]) => texts.map((text) => ({ text, kind: 'text' as const, gap: ' ' as const }))

describe('matchSentences', () => {
	it('pairs the longest common subsequence, earliest first for repeats', () => {
		expect(matchSentences(s('x', 'a', 'b', 'a'), s('a', 'a'))).toEqual([
			[1, 0],
			[3, 1],
		])
		expect(matchSentences(s('a', 'a'), s('a'))).toEqual([[0, 0]])
	})

	it('treats runs of whitespace as one space', () => {
		expect(matchSentences(s('a  b'), s('a b'))).toEqual([[0, 0]])
	})

	it('pairs nothing when nothing is shared', () => {
		expect(matchSentences(s('a'), s('b'))).toEqual([])
		expect(matchSentences([], s('b'))).toEqual([])
	})
})

describe('shared', () => {
	it('counts the matched sentences', () => {
		expect(shared(s('a', 'b', 'c'), s('c', 'a', 'b'))).toBe(2)
	})
})
