import { readFileSync, statSync } from 'node:fs'
import { escapeRegExp, providerTerms, providerTermsExact, toolNames } from './reference-advise-patterns.js'
import { consumerPaths, isEditable } from './reference-consumer-files.js'

export type AdviceCategory = 'provider' | 'workflow' | 'tool' | 'format' | 'policy' | 'environment'

/** Text that looks hard-coded. A lead is a suggestion for the author to judge, never a pass or fail. */
export type AdviceLead = {
	file: string
	line: number
	category: AdviceCategory
	kind: 'host' | 'term' | 'command' | 'path' | 'url' | 'steps' | 'block'
	match: string
	/** The line the lead was found on. */
	text: string
	/** For a run of lines (`steps`, `block`): how many. */
	lines?: number
	status: 'candidate'
}

export type ReferenceAdvice = {
	/** False when any path is an installed copy under `node_modules` or a plugin cache: not the author's to edit. */
	editable: boolean
	files: { path: string; bytes: number }[]
	leads: AdviceLead[]
}

export type AdviseOptions = {
	/** The files or folders to read. */
	paths: readonly string[]
	cwd: string
	/** Terms to flag as provider leads in this run, such as a tracker name. */
	also?: readonly string[] | undefined
}

/** The leads in one text: every line is read, front matter included, since the command does not know what kind of file it reads. */
export function leadsIn(file: string, text: string, also: readonly string[] = []): AdviceLead[] {
	const lines = text.split('\n')
	const leads: AdviceLead[] = []
	const add = (line: number, category: AdviceCategory, kind: AdviceLead['kind'], match: string, extra: object = {}) =>
		leads.push({
			file,
			line,
			category,
			kind,
			match,
			text: (lines[line - 1] ?? '').trim(),
			...extra,
			status: 'candidate',
		})
	const patterns: [RegExp, AdviceCategory, AdviceLead['kind']][] = [
		[new RegExp(`\\b(?:${providerTerms.map(escapeRegExp).join('|')})\\b`, 'gi'), 'provider', 'host'],
		[new RegExp(`\\b(?:${providerTermsExact.map(escapeRegExp).join('|')})\\b`, 'g'), 'provider', 'host'],
		[
			new RegExp(`(?<![\\w./~-])(?:${toolNames.map(escapeRegExp).join('|')})(?![\\w/-])(?: [a-z][\\w-]*){0,2}`, 'g'),
			'tool',
			'command',
		],
		[/(?<![\w/])(?:~|\/(?:home|Users|etc|var|usr|opt|tmp))\/[^\s`'")]*/g, 'environment', 'path'],
		[/https?:\/\/[^\s`'")>]*[^\s`'")>.,;]/g, 'environment', 'url'],
		...(also.length
			? ([[new RegExp(`\\b(?:${also.map(escapeRegExp).join('|')})\\b`, 'g'), 'provider', 'term']] as [
					RegExp,
					AdviceCategory,
					AdviceLead['kind'],
				][])
			: []),
	]
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] as string
		for (const [pattern, category, kind] of patterns) {
			for (const found of line.matchAll(pattern)) add(index + 1, category, kind, found[0].trim())
		}
	}
	// A run of two or more list items is a step list; a fenced block of two or more lines may be a template.
	const item = /^\s*(?:\d+[.)]|[-*])\s+/
	for (let index = 0; index < lines.length; ) {
		const line = lines[index] as string
		if (/^\s*```/.test(line)) {
			const close = lines.findIndex((next, at) => at > index && /^\s*```/.test(next))
			const end = close < 0 ? lines.length : close
			if (end - index - 1 >= 2) add(index + 1, 'format', 'block', line.trim(), { lines: end - index - 1 })
			index = end + 1
		} else if (item.test(line)) {
			let end = index
			while (end + 1 < lines.length && item.test(lines[end + 1] as string)) end++
			if (end > index) add(index + 1, 'workflow', 'steps', line.trim(), { lines: end - index + 1 })
			index = end + 1
		} else index++
	}
	return leads.sort((a, b) => a.line - b.line)
}

/**
 * What the given text hard-codes that could move into references: hosts, tools, paths, URLs, step
 * lists, and templates, each with its line. Every lead is a suggestion for the author to judge. Writes nothing.
 */
export function adviseReferences({ paths, cwd, also }: AdviseOptions): ReferenceAdvice {
	const consumers = consumerPaths(paths, cwd)
	const files = consumers.flatMap((consumer) => consumer.files)
	return {
		editable: consumers.every((consumer) => isEditable(consumer.absolute)),
		files: files.map((file) => ({ path: file.path, bytes: statSync(file.absolute).size })),
		leads: files.flatMap((file) => leadsIn(file.path, readFileSync(file.absolute, 'utf8'), also)),
	}
}
