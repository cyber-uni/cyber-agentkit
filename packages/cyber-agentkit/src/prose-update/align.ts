import { type Sentence, sameSentence } from './split-sentences.js'

/**
 * Pairs of indexes `[a, b]` of the longest common subsequence of two sentence lists (K10). Equal sentences
 * repeated in both lists are matched in order, earliest first.
 */
export function matchSentences(a: readonly Sentence[], b: readonly Sentence[]): [number, number][] {
	const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
	const at = (i: number, j: number) => (table[i] as number[])[j] as number
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			;(table[i] as number[])[j] = sameSentence((a[i] as Sentence).text, (b[j] as Sentence).text)
				? at(i + 1, j + 1) + 1
				: Math.max(at(i + 1, j), at(i, j + 1))
		}
	}
	const pairs: [number, number][] = []
	let i = 0
	let j = 0
	while (i < a.length && j < b.length) {
		if (sameSentence((a[i] as Sentence).text, (b[j] as Sentence).text) && at(i, j) === at(i + 1, j + 1) + 1) {
			pairs.push([i++, j++])
		} else if (at(i + 1, j) >= at(i, j + 1)) i++
		else j++
	}
	return pairs
}

/** The number of sentences two lists share (K10). */
export function shared(a: readonly Sentence[], b: readonly Sentence[]): number {
	return matchSentences(a, b).length
}
