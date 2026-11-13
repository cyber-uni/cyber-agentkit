import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'

/** One wording `instruction compare` measures: a whole file, or one section of it. */
export type Wording = {
	/** As the author named it, such as `AGENTS.md#Commit Discipline`. */
	source: string
	/** The file's absolute path. */
	path: string
	/** The heading the section was found under, as written in the file; absent for a whole file. */
	section?: string
	/** The text a run loads: the whole file, or the section from its heading to the next heading at its level or above. */
	text: string
}

export type WordingProblem = { code: 'wording-missing' | 'section-missing' | 'section-ambiguous'; problem: string }

type Heading = { line: number; level: number; title: string }

/** The Markdown headings of a text, outside fenced code blocks. */
export function headings(text: string): Heading[] {
	const found: Heading[] = []
	let fence: string | undefined
	text.split('\n').forEach((line, index) => {
		const opened = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
		if (opened) {
			const mark = opened[1] as string
			if (fence === undefined) fence = mark[0]
			else if (mark[0] === fence) fence = undefined
			return
		}
		if (fence !== undefined) return
		const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
		if (heading) found.push({ line: index, level: (heading[1] as string).length, title: heading[2] as string })
	})
	return found
}

/** A heading's anchor: lower case, punctuation dropped, spaces as hyphens, as GitHub writes it. */
export function slug(title: string): string {
	return title
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.replace(/\s+/g, '-')
}

/** The section under the heading named `name` (by its text or its anchor, ignoring case), with its heading line. */
export function sectionOf(
	text: string,
	name: string,
): { section: string; text: string } | { problem: 'missing' | 'ambiguous'; headings: string[] } {
	const all = headings(text)
	const wanted = name.trim().toLowerCase()
	const matches = all.filter((item) => item.title.toLowerCase() === wanted || slug(item.title) === slug(name))
	if (matches.length !== 1)
		return { problem: matches.length ? 'ambiguous' : 'missing', headings: all.map((item) => item.title) }
	const heading = matches[0] as Heading
	const next = all.find((item) => item.line > heading.line && item.level <= heading.level)
	const lines = text.split('\n').slice(heading.line, next?.line)
	return { section: heading.title, text: `${lines.join('\n').trimEnd()}\n` }
}

/**
 * Reads a wording named as a file, or as `<file>#<section>`. A name that is itself a file is the whole file, so a path
 * holding `#` still works; otherwise the part after the first `#` names the section.
 */
export function readWording(source: string, cwd: string): Wording | WordingProblem {
	const whole = resolve(cwd, source)
	const isFile = (path: string) => existsSync(path) && statSync(path).isFile()
	if (isFile(whole)) return { source, path: whole, text: readFileSync(whole, 'utf8') }
	const hash = source.indexOf('#')
	const file = hash < 0 ? source : source.slice(0, hash)
	const path = resolve(cwd, file)
	if (!isFile(path)) return { code: 'wording-missing', problem: `no file ${file}` }
	if (hash < 0 || source.slice(hash + 1).trim() === '') return { source, path, text: readFileSync(path, 'utf8') }
	const name = source.slice(hash + 1)
	const found = sectionOf(readFileSync(path, 'utf8'), name)
	if ('problem' in found) {
		const listed = found.headings.length ? found.headings.join(', ') : 'none'
		return found.problem === 'missing'
			? { code: 'section-missing', problem: `${file} has no heading ${name}; its headings are ${listed}` }
			: { code: 'section-ambiguous', problem: `${file} has more than one heading ${name}; name a file that holds one` }
	}
	return { source, path, section: found.section, text: found.text }
}

/** The name a comparison's cases and results go under: the first wording's section anchor, else its file's name. */
export function comparisonName(wording: Wording): string {
	if (wording.section) return slug(wording.section) || 'instruction'
	return slug(basename(wording.path, extname(wording.path))) || 'instruction'
}

/** The first 12 hex characters of the text's SHA-256, so a saved result tells which text it measured. */
export function textHash(text: string): string {
	return createHash('sha256').update(text).digest('hex').slice(0, 12)
}
