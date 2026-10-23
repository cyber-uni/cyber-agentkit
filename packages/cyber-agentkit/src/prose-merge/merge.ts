import { matchSentences } from './align.js'
import { type Sentence, sameSentence } from './split-sentences.js'

/** A place where the owner and the offered wording each changed the same base sentences differently. */
export type Collision = { base: Sentence[]; found: Sentence[]; offered: Sentence[] }

export type Merge = {
	/** `append` when the offered wording holds every base sentence in order and only adds after them (K6). */
	revision: 'append' | 'rewrite'
	merged: Sentence[]
	collisions: Collision[]
}

function equal(a: readonly Sentence[], b: readonly Sentence[]): boolean {
	return a.length === b.length && a.every((sentence, index) => sameSentence(sentence.text, (b[index] as Sentence).text))
}

/** The revision kind of an offered part over its base part (K6). */
export function revisionKind(base: readonly Sentence[], offered: readonly Sentence[]): 'append' | 'rewrite' {
	return offered.length >= base.length && equal(base, offered.slice(0, base.length)) ? 'append' : 'rewrite'
}

function appendTo(base: readonly Sentence[], found: readonly Sentence[], added: readonly Sentence[]): Sentence[] {
	const last = matchSentences(base, found).find(([i]) => i === base.length - 1)
	const out = [...found]
	let at = last ? last[1] + 1 : out.length
	for (const sentence of added) {
		const had = out.findIndex((x, index) => index >= at && sameSentence(x.text, sentence.text))
		if (had === -1) out.splice(at++, 0, sentence)
		else at = had + 1
	}
	return out
}

/**
 * Three-way merge at sentence level of one part (R6 to R9). An append revision puts the new sentences after
 * the base's last sentence as found (R8) and never collides. A rewrite is merged between the sentences both
 * sides left alone; where both changed the same stretch differently the found sentences stay and the stretch
 * is reported as a collision.
 */
export function mergeSentences(
	base: readonly Sentence[],
	found: readonly Sentence[],
	offered: readonly Sentence[],
): Merge {
	const revision = revisionKind(base, offered)
	if (revision === 'append') {
		return { revision, merged: appendTo(base, found, offered.slice(base.length)), collisions: [] }
	}
	const inFound = new Map(matchSentences(base, found))
	const inOffered = new Map(matchSentences(base, offered))
	const anchors = [...inFound.keys()].filter((i) => inOffered.has(i)).sort((x, y) => x - y)
	const merged: Sentence[] = []
	const collisions: Collision[] = []
	let b = 0
	let f = 0
	let o = 0
	for (const anchor of [...anchors, base.length]) {
		const toB = anchor
		const toF = anchor === base.length ? found.length : (inFound.get(anchor) as number)
		const toO = anchor === base.length ? offered.length : (inOffered.get(anchor) as number)
		const segment = { base: base.slice(b, toB), found: found.slice(f, toF), offered: offered.slice(o, toO) }
		if (equal(segment.found, segment.base)) merged.push(...segment.offered)
		else if (equal(segment.offered, segment.base) || equal(segment.found, segment.offered))
			merged.push(...segment.found)
		else {
			merged.push(...segment.found)
			collisions.push(segment)
		}
		if (anchor < base.length) merged.push(found[toF] as Sentence)
		b = toB + 1
		f = toF + 1
		o = toO + 1
	}
	return { revision, merged, collisions }
}
