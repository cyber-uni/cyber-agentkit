import type { InterfaceEntry } from './interface-entry.js'

/** An id as the lookup compares it: lower case, with `-`, `_`, and `.` read alike. */
export function normalizeInterfaceId(id: string): string {
	return id
		.trim()
		.toLowerCase()
		.replace(/[-_.]+/g, '-')
}

export type NearMatch = {
	id: string
	description?: string
	/** Why it matched, one plain reason each. */
	reasons: string[]
}

export type InterfaceLookup = {
	/** The entry whose id equals the new one once normalized. Changing it is an update, not a new entry. */
	same?: InterfaceEntry
	/** Entries that look close. The lookup never decides one is the same: the person running it does. */
	near: NearMatch[]
	/** How many entries were compared. */
	compared: number
}

/** Words too common to say anything about what an interface is. */
const stopWords = new Set(
	'a an and are as at be by can do does for from has have how in into is it its of on or that the their this to what when which with without'.split(
		' ',
	),
)

/** A word without a plain plural ending, so `trackers` and `tracker` compare equal. */
function singular(word: string): string {
	if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
	if (word.length > 4 && /(?:ss|sh|ch|x)es$/.test(word)) return word.slice(0, -2)
	if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
	return word
}

function idWords(id: string): string[] {
	return normalizeInterfaceId(id).split('-').filter(Boolean)
}

function meaningfulWords(text: string): Set<string> {
	return new Set(
		(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
			.filter((word) => word.length > 2 && !stopWords.has(word))
			.map(singular),
	)
}

/** Edits to turn one word into the other: insert, delete, or change one letter. */
function editDistance(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
	for (let i = 1; i <= a.length; i++) {
		const current = [i]
		for (let j = 1; j <= b.length; j++) {
			current[j] = Math.min(
				(previous[j] as number) + 1,
				(current[j - 1] as number) + 1,
				(previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
			)
		}
		previous = current
	}
	return previous[b.length] as number
}

/** Why `entry` looks close to the new id and description, or nothing when it does not. */
function nearReasons(id: string, description: string | undefined, entry: InterfaceEntry): string[] {
	const reasons: string[] = []
	const newId = normalizeInterfaceId(id)
	const oldId = normalizeInterfaceId(entry.id)
	const newWords = idWords(id).map(singular)
	const oldWords = idWords(entry.id).map(singular)

	if (newWords.join('-') === oldWords.join('-')) reasons.push('the id differs only by plural')
	else if (Math.min(newId.length, oldId.length) >= 5 && editDistance(newId, oldId) <= 2) {
		reasons.push('the id differs by a small spelling change')
	} else {
		const shared = [...new Set(newWords.filter((word) => oldWords.includes(word)))]
		if (shared.length) {
			reasons.push(`the id shares the word${shared.length > 1 ? 's' : ''} ${shared.map((w) => `\`${w}\``).join(', ')}`)
		}
	}

	if (description && entry.description) {
		const mine = meaningfulWords(description)
		const theirs = meaningfulWords(entry.description)
		const shared = [...mine].filter((word) => theirs.has(word))
		const smaller = Math.min(mine.size, theirs.size)
		if (shared.length >= 2 && shared.length * 2 > smaller) {
			reasons.push(
				`the description shares ${shared.length} of ${smaller} meaningful words: ${shared.map((w) => `\`${w}\``).join(', ')}`,
			)
		}
	}
	return reasons
}

/**
 * Looks a new interface up against the registry. An id equal once normalized is the same interface;
 * an id sharing words, differing by plural or a small spelling change, or a description sharing most
 * of its meaningful words is a near match, listed with why. Words only: nothing here guesses meaning.
 */
export function lookupInterface(
	id: string,
	description: string | undefined,
	entries: readonly InterfaceEntry[],
): InterfaceLookup {
	const key = normalizeInterfaceId(id)
	const same = entries.find((entry) => normalizeInterfaceId(entry.id) === key)
	const near: NearMatch[] = []
	for (const entry of entries) {
		if (entry === same) continue
		const reasons = nearReasons(id, description, entry)
		if (reasons.length)
			near.push(
				entry.description ? { id: entry.id, description: entry.description, reasons } : { id: entry.id, reasons },
			)
	}
	near.sort((a, b) => b.reasons.length - a.reasons.length || a.id.localeCompare(b.id))
	return same ? { same, near, compared: entries.length } : { near, compared: entries.length }
}
