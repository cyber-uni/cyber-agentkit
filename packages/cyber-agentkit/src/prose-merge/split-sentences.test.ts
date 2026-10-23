import { describe, expect, it } from 'vitest'
import { sameSentence, splitSentences } from './split-sentences.js'

const texts = (input: string) => splitSentences(input).map((sentence) => sentence.text)

describe('splitSentences', () => {
	it('splits at ., ;, ? and ! followed by whitespace or the end', () => {
		expect(texts('One. Two; three? Four! Five.')).toEqual(['One.', 'Two;', 'three?', 'Four!', 'Five.'])
	})

	it('does not split inside a word or number', () => {
		expect(texts('Use v1.2 and a.b here.')).toEqual(['Use v1.2 and a.b here.'])
	})

	it('does not split after e.g., i.e., etc. and vs.', () => {
		expect(texts('Use tools, e.g. git; i.e. the CLI, etc. and vs. others. Done.')).toEqual([
			'Use tools, e.g. git;',
			'i.e. the CLI, etc. and vs. others.',
			'Done.',
		])
	})

	it('splits at every blank line, and joins wrapped lines of a paragraph', () => {
		expect(texts('first line\nwraps here\n\nsecond')).toEqual(['first line wraps here', 'second'])
	})

	it('makes a heading line, a list item and a table row one sentence each', () => {
		const input = '## Title\nIntro. More.\n- item one. still one\n- item two\n| a | b |\n| - | - |\n1. numbered'
		expect(splitSentences(input)).toEqual([
			{ text: '## Title', kind: 'heading' },
			{ text: 'Intro.', kind: 'text' },
			{ text: 'More.', kind: 'text' },
			{ text: '- item one. still one', kind: 'item' },
			{ text: '- item two', kind: 'item' },
			{ text: '| a | b |', kind: 'row' },
			{ text: '| - | - |', kind: 'row' },
			{ text: '1. numbered', kind: 'item' },
		])
	})

	it('keeps a fenced code block whole, and never reads a heading inside one', () => {
		const input = 'Before.\n```sh\n# not a heading. nor split\n\nstill code\n```\nAfter.'
		expect(splitSentences(input)).toEqual([
			{ text: 'Before.', kind: 'text' },
			{ text: '```sh\n# not a heading. nor split\n\nstill code\n```', kind: 'fence' },
			{ text: 'After.', kind: 'text' },
		])
	})

	it('keeps a blockquote whole', () => {
		expect(splitSentences('> quoted. twice\n> more\nAfter.')).toEqual([
			{ text: '> quoted. twice\n> more', kind: 'quote' },
			{ text: 'After.', kind: 'text' },
		])
	})

	it('returns nothing for empty text', () => {
		expect(splitSentences('  \n\n')).toEqual([])
	})
})

describe('sameSentence', () => {
	it('ignores runs of whitespace only', () => {
		expect(sameSentence('a  b\n c', 'a b c')).toBe(true)
		expect(sameSentence('A b', 'a b')).toBe(false)
		expect(sameSentence('a b.', 'a b')).toBe(false)
		expect(sameSentence('*a* b', 'a b')).toBe(false)
	})
})
