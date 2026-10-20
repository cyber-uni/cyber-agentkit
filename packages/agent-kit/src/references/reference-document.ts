import { parse } from 'yaml'
import { isRecord } from '../plugins/json-file.js'
import type { WarnFn } from './reference-warning.js'

/**
 * How a contribution applies over what is below it. `replace` puts it in place of everything below;
 * `patch` keeps what is below and puts each section's text in place of the text it matches;
 * `combine` keeps what is below and adds each section's text after the text it matches; `remove`
 * drops what is below.
 */
export type MergeOperation = 'replace' | 'patch' | 'combine' | 'remove'

export const mergeOperations: readonly MergeOperation[] = ['replace', 'patch', 'combine', 'remove']

export function isMergeOperation(value: unknown): value is MergeOperation {
	return mergeOperations.includes(value as MergeOperation)
}

export type ParsedDocument = { metadata: Record<string, unknown>; body: string }

export const frontmatterPattern: RegExp = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

/** Frontmatter that is not a YAML mapping is dropped with a warning, never passed off as body text. */
export function parseDocument(raw: string, warn: WarnFn): ParsedDocument {
	const match = frontmatterPattern.exec(raw)
	if (!match) return { metadata: {}, body: raw }
	const body = raw.slice(match[0].length)
	try {
		const value: unknown = parse(match[1] as string)
		if (value === null || value === undefined) return { metadata: {}, body }
		if (isRecord(value)) return { metadata: value, body }
	} catch {}
	warn('frontmatter-invalid', 'frontmatter is not a YAML mapping; it is ignored')
	return { metadata: {}, body }
}

/** The contribution's own `merge`; `undefined` when it writes none. An unknown value reads as `patch`. */
export function readMergeOperation(metadata: Record<string, unknown>, warn: WarnFn): MergeOperation | undefined {
	const value = metadata['merge']
	if (value === undefined) return undefined
	if (isMergeOperation(value)) return value
	warn('merge-unknown', `unknown merge "${String(value)}"; read as patch`)
	return 'patch'
}

/** Whether a body holds anything but blank lines and merge markers. */
export function hasBody(body: string): boolean {
	return stripMergeMarkers(body).trim().length > 0
}

const markerPattern = /^\s*<!--\s*merge:\s*([\w-]*)\s*-->\s*$/
const headingPattern = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const fenceOpenPattern = /^ {0,3}(`{3,}|~{3,})/

/**
 * Tracks fenced code blocks line by line — a `#` or a merge marker inside one is body text, and the
 * one thing a Markdown-unaware split gets wrong.
 */
function fenceTracker() {
	let fence: string | undefined
	return (line: string): boolean => {
		if (fence) {
			const closing = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`)
			if (closing.test(line)) fence = undefined
			return true
		}
		const open = fenceOpenPattern.exec(line)
		if (open) {
			fence = open[1]
			return true
		}
		return false
	}
}

export function stripMergeMarkers(body: string): string {
	const inFence = fenceTracker()
	return body
		.split('\n')
		.filter((line) => inFence(line) || !markerPattern.test(line))
		.join('\n')
}

/** Each heading outside a code fence, as written. */
export function headingLines(body: string): string[] {
	const inFence = fenceTracker()
	return body.split('\n').filter((line) => !inFence(line) && headingPattern.test(line))
}

export type Section = {
	/** The heading level, minus its document's top heading level: `# Review` and `## Review` both read 0 at the top. */
	depth: number
	level: number
	title: string
	heading: string
	/** The operation its `<!-- merge: ... -->` marker names; `undefined` when it has none. */
	marker: MergeOperation | undefined
	text: string[]
	children: Section[]
}

export type SectionTree = { top: number | undefined; preamble: string[]; children: Section[] }

function sectionKey(title: string): string {
	return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

function topLevel(body: string): number | undefined {
	const inFence = fenceTracker()
	let top: number | undefined
	for (const line of body.split('\n')) {
		if (inFence(line)) continue
		const heading = headingPattern.exec(line)
		if (heading) top = Math.min(top ?? 6, (heading[1] as string).length)
	}
	return top
}

export function parseSections(body: string, warn: WarnFn): SectionTree {
	const top = topLevel(body)
	const tree: SectionTree = { top, preamble: [], children: [] }
	const stack: Section[] = []
	const inFence = fenceTracker()
	let awaitingMarker: Section | undefined
	for (const line of body.split('\n')) {
		const fenced = inFence(line)
		const heading = fenced ? null : headingPattern.exec(line)
		if (heading) {
			const level = (heading[1] as string).length
			const section: Section = {
				depth: level - (top ?? level),
				level,
				title: (heading[2] ?? '').trim(),
				heading: line.trimEnd(),
				marker: undefined,
				text: [],
				children: [],
			}
			while ((stack.at(-1)?.level ?? 0) >= level) stack.pop()
			;(stack.at(-1)?.children ?? tree.children).push(section)
			stack.push(section)
			awaitingMarker = section
			continue
		}
		if (awaitingMarker && !fenced) {
			if (!line.trim()) continue
			const marker = markerPattern.exec(line)
			if (marker) {
				const op = marker[1] as string
				if (isMergeOperation(op)) awaitingMarker.marker = op
				else {
					warn('marker-unknown', `unknown merge "${op}" on "${awaitingMarker.title}"; read as patch`)
					awaitingMarker.marker = 'patch'
				}
				awaitingMarker = undefined
				continue
			}
		}
		awaitingMarker = undefined
		;(stack.at(-1)?.text ?? tree.preamble).push(line)
	}
	return tree
}

function trimBlank(lines: readonly string[]): string[] {
	let start = 0
	let end = lines.length
	while (start < end && !(lines[start] as string).trim()) start++
	while (end > start && !(lines[end - 1] as string).trim()) end--
	return lines.slice(start, end)
}

/** Which contribution supplied a section's text, and how. */
export type SectionSource = { contribution: string; operation: MergeOperation }

/** A section of the composed document. */
export type ComposedSection = {
	depth: number
	title: string
	/** The heading as written, kept when it renders at the level it was written at. */
	heading: string
	level: number
	text: string[]
	sources: SectionSource[]
	children: ComposedSection[]
}

export type RemovedSection = { path: string; by: string }

export type Composed = {
	/** The heading level the composed document renders its top sections at. */
	top: number | undefined
	preamble: string[]
	preambleSources: SectionSource[]
	children: ComposedSection[]
	removed: RemovedSection[]
	/** Combined text was joined, so the output says once that the later text wins. */
	joined: boolean
}

export function emptyComposed(): Composed {
	return { top: undefined, preamble: [], preambleSources: [], children: [], removed: [], joined: false }
}

type Apply = { label: string; warn: WarnFn; composed: Composed }

function pathOf(parent: string, title: string): string {
	return parent ? `${parent} > ${title}` : title
}

function warnRepeats(sections: readonly Section[], parent: string, { warn }: Pick<Apply, 'warn'>) {
	const seen = new Set<string>()
	for (const section of sections) {
		const key = sectionKey(section.title)
		if (seen.has(key)) {
			warn(
				'heading-repeated',
				`heading path "${pathOf(parent, section.title)}" appears more than once; the first is matched`,
			)
		}
		seen.add(key)
		warnRepeats(section.children, pathOf(parent, section.title), { warn })
	}
}

function warnUnmatched(section: Section, parent: string, { warn }: Apply) {
	warn(
		'marker-unmatched',
		`"<!-- merge: ${section.marker} -->" on "${pathOf(parent, section.title)}" matches no section below`,
	)
}

/** A section placed whole has nothing below its subsections, so an explicit marker on one matches nothing. */
function place(section: Section, operation: MergeOperation, parent: string, apply: Apply): ComposedSection {
	const path = pathOf(parent, section.title)
	const children = section.children.flatMap((child) => {
		if (child.marker) warnUnmatched(child, path, apply)
		return child.marker === 'remove' ? [] : [place(child, child.marker ?? operation, path, apply)]
	})
	const text = trimBlank(section.text)
	return {
		depth: section.depth,
		title: section.title,
		heading: section.heading,
		level: section.level,
		text,
		sources: text.length ? [{ contribution: apply.label, operation }] : [],
		children,
	}
}

function join(below: readonly string[], above: readonly string[]): string[] {
	return below.length && above.length ? [...below, '', ...above] : [...below, ...above]
}

/** `inherited` is the operation an unmarked section at this level takes. */
function applyChildren(
	base: readonly ComposedSection[],
	sections: readonly Section[],
	inherited: MergeOperation,
	parent: string,
	apply: Apply,
): ComposedSection[] {
	const slots: (ComposedSection | undefined)[] = [...base]
	const appended: ComposedSection[] = []
	const matched = new Set<string>()
	for (const section of sections) {
		const operation = section.marker ?? inherited
		const key = sectionKey(section.title)
		const index = matched.has(key) ? -1 : base.findIndex((candidate) => sectionKey(candidate.title) === key)
		matched.add(key)
		if (index === -1) {
			if (section.marker) warnUnmatched(section, parent, apply)
			if (operation !== 'remove') appended.push(place(section, operation, parent, apply))
			continue
		}
		const target = base[index] as ComposedSection
		const path = pathOf(parent, target.title)
		if (operation === 'remove') {
			slots[index] = undefined
			apply.composed.removed.push({ path, by: apply.label })
			continue
		}
		if (operation === 'replace') {
			slots[index] = { ...place(section, 'replace', parent, apply), depth: target.depth }
			continue
		}
		const text = trimBlank(section.text)
		const source = text.length ? [{ contribution: apply.label, operation }] : []
		if (operation === 'combine') {
			if (text.length && target.text.length) apply.composed.joined = true
			slots[index] = {
				...target,
				text: join(target.text, text),
				sources: [...target.sources, ...source],
				children: applyChildren(target.children, section.children, 'combine', path, apply),
			}
			continue
		}
		slots[index] = {
			...target,
			text: text.length ? text : target.text,
			sources: text.length ? source : target.sources,
			children: applyChildren(target.children, section.children, 'replace', path, apply),
		}
	}
	return [...slots.filter((slot): slot is ComposedSection => slot !== undefined), ...appended]
}

/**
 * Applies one contribution's body over what is below it. `remove` and a body-less contribution are
 * the caller's to handle: this applies text.
 */
export function applyContribution(
	below: Composed,
	body: string,
	operation: Exclude<MergeOperation, 'remove'>,
	label: string,
	warn: WarnFn,
): Composed {
	const tree = parseSections(body, warn)
	const base = operation === 'replace' ? emptyComposed() : below
	const composed: Composed = { ...base, removed: [...base.removed] }
	const apply: Apply = { label, warn, composed }
	warnRepeats(tree.children, '', apply)
	const preamble = trimBlank(tree.preamble)
	if (operation === 'combine') {
		if (preamble.length && base.preamble.length) composed.joined = true
		composed.preamble = join(base.preamble, preamble)
		if (preamble.length) composed.preambleSources = [...base.preambleSources, { contribution: label, operation }]
	} else if (preamble.length) {
		composed.preamble = preamble
		composed.preambleSources = [{ contribution: label, operation }]
	}
	composed.top = base.top ?? tree.top
	composed.children = applyChildren(base.children, tree.children, operation, '', apply)
	return composed
}

export const joinedNotice = '> Where combined text conflicts, the later text wins.'

export function renderComposed(composed: Composed): string {
	const blocks: string[] = []
	if (composed.joined) blocks.push(joinedNotice)
	if (composed.preamble.length) blocks.push(composed.preamble.join('\n'))
	const top = composed.top ?? 1
	const visit = (section: ComposedSection) => {
		const level = Math.min(6, top + section.depth)
		const heading = level === section.level ? section.heading : `${'#'.repeat(level)} ${section.title}`.trimEnd()
		blocks.push(section.text.length ? `${heading}\n\n${section.text.join('\n')}` : heading)
		for (const child of section.children) visit(child)
	}
	for (const section of composed.children) visit(section)
	return blocks.length ? `${blocks.join('\n\n')}\n` : ''
}

/** Each section of the composed document by heading path, with the contributions that supplied its text. */
export function composedSections(composed: Composed): { path: string; sources: SectionSource[] }[] {
	const rows: { path: string; sources: SectionSource[] }[] = []
	if (composed.preambleSources.length)
		rows.push({ path: '(before the first heading)', sources: composed.preambleSources })
	const visit = (section: ComposedSection, parent: string) => {
		const path = pathOf(parent, section.title)
		rows.push({ path, sources: section.sources })
		for (const child of section.children) visit(child, path)
	}
	for (const section of composed.children) visit(section, '')
	return rows
}

/** Every heading path of a document, top first, each read from the document's own top level. */
export function headingPaths(body: string): string[] {
	const paths: string[] = []
	const visit = (section: Section, parent: string) => {
		const path = pathOf(parent, section.title)
		paths.push(path)
		for (const child of section.children) visit(child, path)
	}
	for (const section of parseSections(body, () => {}).children) visit(section, '')
	return paths
}
