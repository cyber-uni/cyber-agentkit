import { type Sentence, splitSentences } from './split-sentences.js'

/** One heading path and the sentences under it before the next heading (K9). */
export type Part = {
	path: string[]
	/** The path as one string, with ` #n` after it when the same path occurs again (R32). */
	key: string
	/** The heading line as written; absent for text before the first heading. */
	heading?: string | undefined
	sentences: Sentence[]
	/** The part as written: the heading line and the lines under it, without the blank lines around them. */
	raw: string
}

const HEADING = /^(#{1,6})\s+(.*)$/
const FENCE = /^\s*(`{3,}|~{3,})/

function titleOf(text: string): string {
	let end = text.trimEnd().length
	while (end > 0 && text[end - 1] === '#') end--
	return text.slice(0, end).trim()
}

/** Divides a document into parts by heading path. A heading inside a fence is not a heading. */
export function parseParts(input: string): Part[] {
	const lines = input.split(/\r?\n/)
	const raw: { heading?: string; level: number; title: string; body: string[] }[] = [{ level: 0, title: '', body: [] }]
	let fence: string | undefined
	for (const line of lines) {
		const open = FENCE.exec(line)
		if (fence) {
			if (open && (open[1] as string)[0] === fence[0] && line.trim() === open[1]) fence = undefined
		} else if (open) {
			fence = open[1]
		} else {
			const heading = HEADING.exec(line)
			if (heading) {
				raw.push({
					heading: line.trim(),
					level: (heading[1] as string).length,
					title: titleOf(heading[2] as string),
					body: [],
				})
				continue
			}
		}
		raw[raw.length - 1]?.body.push(line)
	}
	const stack: { level: number; title: string }[] = []
	const seen = new Map<string, number>()
	const parts: Part[] = []
	for (const entry of raw) {
		const sentences = splitSentences(entry.body.join('\n'))
		const first = sentences[0]
		if (entry.heading !== undefined && first) first.gap = entry.body[0]?.trim() === '' ? '\n\n' : '\n'
		if (entry.heading === undefined) {
			if (!sentences.length) continue
		} else {
			while (stack.length && (stack[stack.length - 1] as { level: number }).level >= entry.level) stack.pop()
			stack.push({ level: entry.level, title: entry.title })
		}
		const path = stack.map((item) => item.title)
		const base = path.join(' > ')
		const count = (seen.get(base) ?? 0) + 1
		seen.set(base, count)
		parts.push({
			path,
			key: count === 1 ? base : `${base} #${count}`,
			heading: entry.heading,
			sentences,
			raw: [entry.heading, ...entry.body]
				.filter((line) => line !== undefined)
				.join('\n')
				.trimEnd()
				.replace(/^\n+/, ''),
		})
	}
	return parts
}

/** Writes a part: its heading, then each sentence after the separator it came with. */
export function renderPart(heading: string | undefined, sentences: readonly Sentence[]): string {
	let out = heading ?? ''
	sentences.forEach((sentence, index) => {
		if (index > 0) out += sentence.gap || ' '
		else if (heading !== undefined) out += sentence.gap === '\n' ? '\n' : '\n\n'
		out += sentence.text
	})
	return out
}

export type PartRow = { key: string; parts: (Part | undefined)[] }

/** Lines the parts of several texts up by key. Keys keep the order of their first appearance. */
export function alignParts(texts: readonly (readonly Part[])[]): PartRow[] {
	const rows = new Map<string, PartRow>()
	texts.forEach((parts, column) => {
		for (const part of parts) {
			const row = rows.get(part.key) ?? { key: part.key, parts: texts.map(() => undefined) }
			row.parts[column] = part
			rows.set(part.key, row)
		}
	})
	return [...rows.values()]
}
