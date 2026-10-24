import { shared } from './align.js'
import { parseHistory } from './history.js'
import { type Collision, mergeSentences, revisionKind } from './merge.js'
import { alignParts, type Part, parseParts, renderPart } from './parts.js'
import { type Sentence, sameSentence, splitSentences } from './split-sentences.js'

export type Outcome = 'up-to-date' | 'update' | 'conflict' | 'owners' | 'undetermined'
export type Reason = 'no-history' | 'empty-section' | 'tied-base' | 'no-base'

/** The retired wording a found text descends from: its place in the history (0 is the newest) and its date. */
export type BaseRef = { index: number; date?: string | undefined }

export type PartResult = {
	path: string[]
	key: string
	outcome: Outcome
	reason?: Reason
	/** Set with `tied-base`: the places in the history of the wordings that tied. */
	tied?: number[]
	base?: BaseRef
	/** Sentences the found part shares with the base part (K10), and the base part's sentence count. */
	shared?: number
	baseSentences?: number
	revision?: 'append' | 'rewrite'
	/** The part's text: as found for `up-to-date` and `owners`, merged for `update` (empty when the part is removed). */
	text?: string
	collisions?: Collision[]
}

export type Classification = {
	outcome: Outcome
	reason?: Reason
	base?: BaseRef
	parts: PartResult[]
	/** The found text for every outcome but `update` and `conflict`; the merged text otherwise. */
	text: string
}

export type ClassifyInput = {
	found: string
	offered: string
	/** A history text (parsed by `parseHistory`), or retired wordings, newest first. */
	history: string | readonly string[]
}

/** The offered wording is empty, so nothing can be classified (R33). */
export class ProseUpdateError extends Error {
	constructor(
		readonly code: 'empty-offered',
		message: string,
	) {
		super(message)
		this.name = 'ProseUpdateError'
	}
}

const ORDER: Outcome[] = ['conflict', 'undetermined', 'update', 'owners', 'up-to-date']
const norm = (text: string) => text.replace(/\s+/g, ' ').trim()
const sameList = (a: readonly Sentence[], b: readonly Sentence[]) =>
	a.length === b.length && a.every((sentence, index) => sameSentence(sentence.text, (b[index] as Sentence).text))

type Retired = { text: string; date?: string | undefined; sentences: Sentence[]; index: number }

function retiredOf(history: ClassifyInput['history']): Retired[] {
	const list =
		typeof history === 'string'
			? parseHistory(history).entries.map(({ wording, date }) => ({ wording, date }))
			: history.map((wording) => ({ wording, date: undefined }))
	const seen = new Set<string>()
	return list
		.map(({ wording, date }, index) => ({ text: wording, date, sentences: splitSentences(wording), index }))
		.filter((retired) => {
			const key = retired.sentences.map((sentence) => norm(sentence.text)).join('\u0000')
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
}

function chooseBase(found: Sentence[], retired: Retired[]): { base?: Retired; tied?: Retired[] } {
	const counts = retired.map((r) => ({ r, count: shared(found, r.sentences) }))
	const most = Math.max(0, ...counts.map((c) => c.count))
	if (most < 1) return {}
	const top = counts.filter((c) => c.count === most).map((c) => c.r)
	return top.length > 1 ? { tied: top } : { base: top[0] as Retired }
}

function render(part: Part | undefined, heading: string | undefined, sentences: Sentence[]): string {
	return renderPart(heading ?? part?.heading, sentences)
}

/** Classifies each part of the found text against the offered wording and the history, and merges where it can. */
export function classify(input: ClassifyInput): Classification {
	const offeredSentences = splitSentences(input.offered)
	if (!offeredSentences.length) throw new ProseUpdateError('empty-offered', 'The offered wording is empty.')
	const foundSentences = splitSentences(input.found)
	const foundParts = parseParts(input.found)
	const offeredParts = parseParts(input.offered)
	const retired = retiredOf(input.history)

	const whole = (reason: Reason, extra: Partial<PartResult> = {}): Classification => {
		const keys = alignParts([foundParts, offeredParts])
		const rows = keys.length ? keys : [{ key: '', parts: [] as (Part | undefined)[] }]
		return {
			outcome: 'undetermined',
			reason,
			parts: rows.map((row) => ({
				path: (row.parts[0] ?? row.parts[1])?.path ?? [],
				key: row.key,
				outcome: 'undetermined',
				reason,
				...extra,
			})),
			text: input.found,
		}
	}
	if (!foundSentences.length) return whole('empty-section')
	if (!retired.length) return whole('no-history')
	const { base, tied } = chooseBase(foundSentences, retired)
	if (tied) return whole('tied-base', { tied: tied.map((r) => r.index) })

	const baseParts = base ? parseParts(base.text) : []
	const historySet = new Set(retired.flatMap((r) => r.sentences.map((sentence) => norm(sentence.text))))
	const baseRef: BaseRef | undefined = base && { index: base.index, date: base.date }
	const rows = alignParts([baseParts, foundParts, offeredParts])
	const results = new Map<string, PartResult>()
	const merged = new Map<string, string>()

	for (const row of rows) {
		const [b, f, o] = row.parts
		const path = (f ?? o ?? b)?.path ?? []
		const result: PartResult = { path, key: row.key, outcome: 'owners' }
		results.set(row.key, result)
		const withBase = (
			outcome: Outcome,
			baseSentences: Sentence[],
			foundSentencesOfPart: Sentence[],
			offeredSentencesOfPart: Sentence[],
		) => {
			result.outcome = outcome
			if (baseRef) result.base = baseRef
			result.shared = shared(foundSentencesOfPart, baseSentences)
			result.baseSentences = baseSentences.length
			result.revision = revisionKind(baseSentences, offeredSentencesOfPart)
		}
		if (!f && o) {
			if (!b) {
				result.outcome = 'update'
				result.text = o.raw
				merged.set(row.key, o.raw)
			} else if (sameList(b.sentences, o.sentences)) {
				result.outcome = 'up-to-date'
				result.text = ''
			} else {
				withBase('conflict', b.sentences, [], o.sentences)
				result.collisions = [{ base: b.sentences, found: [], offered: o.sentences }]
			}
		} else if (f && !o) {
			if (!b) result.text = f.raw
			else if (sameList(b.sentences, f.sentences)) {
				result.outcome = 'update'
				result.text = ''
				merged.set(row.key, '')
			} else {
				withBase('conflict', b.sentences, f.sentences, [])
				result.collisions = [{ base: b.sentences, found: f.sentences, offered: [] }]
			}
		} else if (f && o) {
			const stale = f.sentences.some(
				(sentence) =>
					historySet.has(norm(sentence.text)) && !o.sentences.some((x) => sameSentence(x.text, sentence.text)),
			)
			const common = shared(f.sentences, o.sentences)
			if (!f.sentences.length) {
				result.outcome = 'undetermined'
				result.reason = 'empty-section'
			} else if (common === o.sentences.length && !stale) {
				result.outcome = 'up-to-date'
				result.text = f.raw
			} else if (!base || !b?.sentences.length) {
				if (common > 0) {
					result.outcome = 'undetermined'
					result.reason = 'no-base'
				} else result.text = f.raw
			} else if (!shared(f.sentences, b.sentences) && common === 0) {
				result.text = f.raw
			} else {
				const merge = mergeSentences(b.sentences, f.sentences, o.sentences)
				withBase(merge.collisions.length ? 'conflict' : 'update', b.sentences, f.sentences, o.sentences)
				result.text = render(f, f.heading ?? o.heading, merge.merged)
				merged.set(row.key, result.text)
				if (merge.collisions.length) result.collisions = merge.collisions
			}
		}
	}

	const outcome = ORDER.find((o) => [...results.values()].some((r) => r.outcome === o)) as Outcome
	const changed = [...results.values()].some((r) => r.outcome === 'update' || r.outcome === 'conflict')
	const ordered = documentOrder(foundParts, offeredParts, results)
	const parts = ordered.map((key) => results.get(key) as PartResult)
	const text = changed ? assemble(input.found, foundParts, offeredParts, merged, results) : input.found
	const reason = outcome === 'undetermined' ? parts.find((part) => part.outcome === 'undetermined')?.reason : undefined
	return { outcome, ...(reason ? { reason } : {}), ...(baseRef ? { base: baseRef } : {}), parts, text }
}

/** Found parts in order, each added part after the nearest preceding offered part the found text holds (R22). */
function documentOrder(found: Part[], offered: Part[], results: Map<string, PartResult>): string[] {
	const inFound = new Set(found.map((part) => part.key))
	const after = new Map<string | undefined, string[]>()
	offered.forEach((part, index) => {
		if (inFound.has(part.key)) return
		const anchor = offered
			.slice(0, index)
			.reverse()
			.find((earlier) => inFound.has(earlier.key))?.key
		after.set(anchor, [...(after.get(anchor) ?? []), part.key])
	})
	const keys = [...(after.get(undefined) ?? [])]
	for (const part of found) keys.push(part.key, ...(after.get(part.key) ?? []))
	const rest = [...results.keys()].filter((key) => !keys.includes(key))
	return [...keys, ...rest]
}

function assemble(
	found: string,
	foundParts: Part[],
	offeredParts: Part[],
	merged: Map<string, string>,
	results: Map<string, PartResult>,
): string {
	const raw = new Map([...offeredParts, ...foundParts].map((part) => [part.key, part.raw]))
	const pieces = documentOrder(foundParts, offeredParts, results)
		.filter((key) => (results.get(key) as PartResult).outcome !== 'up-to-date' || foundParts.some((p) => p.key === key))
		.map((key) => merged.get(key) ?? (foundParts.some((p) => p.key === key) ? raw.get(key) : undefined))
		.filter((piece): piece is string => piece !== undefined && piece !== '')
	return pieces.join('\n\n') + (found.endsWith('\n') ? '\n' : '')
}
