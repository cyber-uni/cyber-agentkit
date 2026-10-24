export type RetiredWording = { wording: string; date: string; reason: string }

/** An entry that did not parse: its place among the `Superseded` headings (from 0), its line (from 1), and its heading. */
export type InvalidEntry = { position: number; line: number; heading: string }

export type ParsedHistory = { entries: RetiredWording[]; invalid: InvalidEntry[] }

const HEADING = /^## Superseded(?:\s+(.*))?$/
const FENCE = /^(`{3,}|~{3,})(.*)$/
const SEPARATOR = ' — '

type Line = { text: string; start: number; end: number }

function linesOf(text: string): Line[] {
	const lines: Line[] = []
	let start = 0
	while (start <= text.length) {
		const newline = text.indexOf('\n', start)
		const end = newline === -1 ? text.length : newline
		lines.push({ text: text.slice(start, end), start, end })
		if (newline === -1) break
		start = newline + 1
	}
	return lines
}

/** Each line index that opens a `## Superseded` entry, outside fences. */
function entryHeadings(lines: Line[]): number[] {
	const found: number[] = []
	let fence: string | undefined
	lines.forEach((line, index) => {
		const open = FENCE.exec(line.text)
		if (fence) {
			if (open && open[1] === fence && !open[2]?.trim()) fence = undefined
		} else if (open) fence = open[1]
		else if (HEADING.test(line.text)) found.push(index)
	})
	return found
}

/**
 * Reads the retired wordings of a history text, newest first. Each entry is a `## Superseded <date> — <reason>`
 * heading followed by the wording in a fence. An entry that does not parse is returned in `invalid`.
 */
export function parseHistory(text: string): ParsedHistory {
	const lines = linesOf(text)
	const headings = entryHeadings(lines)
	const entries: RetiredWording[] = []
	const invalid: InvalidEntry[] = []
	headings.forEach((headingIndex, position) => {
		const heading = lines[headingIndex] as Line
		const limit = headings[position + 1] ?? lines.length
		const bad = () => {
			invalid.push({ position, line: headingIndex + 1, heading: heading.text })
		}
		const openIndex = lines.findIndex((line, index) => index > headingIndex && index < limit && FENCE.test(line.text))
		if (openIndex === -1) {
			bad()
			return
		}
		const open = lines[openIndex] as Line
		const marker = (FENCE.exec(open.text) as RegExpExecArray)[1] as string
		const closeIndex = lines.findIndex(
			(line, index) => index > openIndex && index < limit && line.text.trimEnd() === marker,
		)
		const close = lines[closeIndex]
		if (!close) {
			bad()
			return
		}
		const rest = (HEADING.exec(heading.text) as RegExpExecArray)[1] ?? ''
		const split = rest.indexOf(SEPARATOR)
		const wording = text.slice(open.end + 1, Math.max(open.end + 1, close.start - 1))
		entries.push({
			wording,
			date: split === -1 ? rest.trim() : rest.slice(0, split).trim(),
			reason: split === -1 ? '' : rest.slice(split + SEPARATOR.length).trim(),
		})
	})
	return { entries, invalid }
}

function fenceFor(wording: string): string {
	const longest = Math.max(0, ...(wording.match(/^\s*`{3,}/gm) ?? []).map((run) => run.trim().length))
	return '`'.repeat(Math.max(3, longest + 1))
}

/**
 * Returns the history text with the outgoing wording added as its newest entry and every other byte unchanged.
 * The wording equal to the newest retired one changes nothing.
 */
export function retire(history: string, wording: string, date: string, reason: string): string {
	if (parseHistory(history).entries[0]?.wording === wording) return history
	const fence = fenceFor(wording)
	const entry = `## Superseded ${date} ${SEPARATOR.trim()} ${reason}\n\n${fence}markdown\n${wording}\n${fence}\n`
	const lines = linesOf(history)
	const first = entryHeadings(lines)[0]
	if (first !== undefined) {
		const at = (lines[first] as Line).start
		return `${history.slice(0, at)}${entry}\n${history.slice(at)}`
	}
	const body = history.endsWith('\n') || history === '' ? history : `${history}\n`
	return `${body}${body ? '\n' : ''}${entry}`
}
