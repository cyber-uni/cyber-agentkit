export type SentenceKind = 'text' | 'heading' | 'item' | 'row' | 'fence' | 'quote'

/** The unit prose-merge compares: see K4 in the prose-merge spec. */
export type Sentence = {
	text: string
	kind: SentenceKind
	/** What separated this sentence from the one before it: nothing, a space, a newline, or a blank line. */
	gap: '' | ' ' | '\n' | '\n\n'
}

const ABBREVIATIONS = ['e.g.', 'i.e.', 'etc.', 'vs.']
const FENCE = /^\s*(`{3,}|~{3,})/
const HEADING = /^#{1,6}\s/
const ITEM = /^\s*(?:[-*+]|\d+[.)])\s/
const ROW = /^\s*\|/
const QUOTE = /^\s*>/

function endsAbbreviation(before: string): boolean {
	return ABBREVIATIONS.some((abbreviation) => {
		if (!before.endsWith(abbreviation)) return false
		const start = before.length - abbreviation.length
		return start === 0 || /\s/.test(before[start - 1] as string)
	})
}

function splitParagraph(paragraph: string): string[] {
	const parts: string[] = []
	let start = 0
	for (let i = 0; i < paragraph.length; i++) {
		if (!'.;?!'.includes(paragraph[i] as string)) continue
		const next = paragraph[i + 1]
		if (next !== undefined && !/\s/.test(next)) continue
		if (paragraph[i] === '.' && endsAbbreviation(paragraph.slice(start, i + 1))) continue
		parts.push(paragraph.slice(start, i + 1))
		start = i + 1
	}
	parts.push(paragraph.slice(start))
	return parts.map((part) => part.trim()).filter(Boolean)
}

/**
 * Splits text into sentences (K4): at `.`, `;`, `?` or `!` before whitespace or the end, except after an
 * abbreviation; at every blank line; a heading line, list item and table row are one sentence each; a fenced
 * code block and a blockquote are each one sentence.
 */
export function splitSentences(input: string): Sentence[] {
	const lines = input.split(/\r?\n/)
	const out: Sentence[] = []
	let paragraph: string[] = []
	let blank = false
	const gapBefore = () => (out.length === 0 ? '' : blank ? '\n\n' : '\n')
	const add = (text: string, kind: SentenceKind) => {
		out.push({ text, kind, gap: gapBefore() })
		blank = false
	}
	const flush = () => {
		if (!paragraph.length) return
		splitParagraph(paragraph.join(' ')).forEach((text, index) => {
			if (index === 0) add(text, 'text')
			else out.push({ text, kind: 'text', gap: ' ' })
		})
		paragraph = []
	}
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string
		const fence = FENCE.exec(line)
		if (fence) {
			flush()
			const marker = (fence[1] as string)[0] as string
			const block = [line.trimEnd()]
			while (++i < lines.length) {
				block.push((lines[i] as string).trimEnd())
				const close = FENCE.exec(lines[i] as string)
				if (close && (close[1] as string)[0] === marker && (lines[i] as string).trim() === (close[1] as string)) break
			}
			add(block.join('\n'), 'fence')
		} else if (!line.trim()) {
			flush()
			blank = true
		} else if (HEADING.test(line)) {
			flush()
			add(line.trim(), 'heading')
		} else if (QUOTE.test(line)) {
			flush()
			const block = [line.trim()]
			while (i + 1 < lines.length && QUOTE.test(lines[i + 1] as string)) block.push((lines[++i] as string).trim())
			add(block.join('\n'), 'quote')
		} else if (ROW.test(line)) {
			flush()
			add(line.trim(), 'row')
		} else if (ITEM.test(line)) {
			flush()
			add(line.trim(), 'item')
		} else paragraph.push(line.trim())
	}
	flush()
	return out
}

/** Two sentences are equal when they match after each run of whitespace becomes one space (K4). */
export function sameSentence(a: string, b: string): boolean {
	return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()
}
