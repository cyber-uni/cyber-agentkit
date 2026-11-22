import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { frontmatterPattern } from './reference-document.js'
import { interfaceSuffix } from './reference-interface.js'
import { namePattern } from './reference-name.js'

const loadPhrase = ' with the `reference` skill'

/**
 * The clause of each load line: the text after `Load`, up to `with the reference skill`. It stops at a
 * sentence's final period but crosses a backticked name, so a dotted name such as
 * `project-tracker.levels` stays in the clause. A scan, not a regular expression, so it stays linear.
 */
function loadClauses(raw: string): string[] {
	const text = raw.replace(/\s+/g, ' ')
	const clauses: string[] = []
	// Each search resumes where the last left off, and the scan only moves forward, so it stays linear.
	const next = (needle: string) => {
		let found = -2
		return (from: number) => {
			if (found !== -1 && found < from) found = text.indexOf(needle, from)
			return found
		}
	}
	const nextLoad = next('Load ')
	const nextPhrase = next(loadPhrase)
	for (const [start, end] of sentences(text)) {
		let at = nextLoad(start)
		while (at >= 0 && at < end) {
			const phrase = nextPhrase(at + 4)
			if (phrase < 0 || phrase + loadPhrase.length > end) break
			clauses.push(text.slice(at + 5, phrase).trim())
			at = nextLoad(phrase + loadPhrase.length)
		}
	}
	return clauses
}

/** Each sentence's span: it ends at a period outside a backticked span, or at a backtick never closed. */
function sentences(text: string): [number, number][] {
	const spans: [number, number][] = []
	let start = 0
	let at = 0
	while (at < text.length) {
		if (text[at] === '.') {
			spans.push([start, at])
			start = ++at
		} else if (text[at] === '`') {
			const close = text.indexOf('`', at + 1)
			if (close < 0) {
				spans.push([start, at])
				return spans
			}
			at = close + 1
		} else at++
	}
	spans.push([start, text.length])
	return spans
}

/** The reference names a text loads with the `reference` skill, and the interfaces whose implementations it loads. */
export function loadsIn(text: string): { names: string[]; interfaces: string[] } {
	const names: string[] = []
	const interfaces: string[] = []
	for (const clause of loadClauses(text)) {
		const iface = /implementations\s+of\s+the\s+`([^`]+)`\s+interface/.exec(clause)
		if (iface) interfaces.push(iface[1] as string)
		else for (const name of clause.matchAll(/`([^`]+)`/g)) names.push(name[1] as string)
	}
	return { names, interfaces }
}

/**
 * The `metadata` key in `SKILL.md` front matter that lists the references a skill loads, and the key that
 * lists the interfaces whose implementations it loads. The Agent Skills spec makes `metadata` a map of
 * string to string, so each value is one string of names separated by spaces, as `allowed-tools` is.
 */
export const declaredReferencesKey = 'references'
export const declaredInterfacesKey = 'reference-interfaces'

/** The names a text loads, and the interfaces whose implementations it loads. */
export type Loads = { names: string[]; interfaces: string[] }

/**
 * Where a consumer's loads came from: `declared`, the `metadata` lists in its `SKILL.md`; or `detected`, read
 * from its text because it declares none.
 */
export type LoadSource = 'declared' | 'detected'

/** What a name is where the text is read: a reference, an interface (its `<id>.interface` document), or neither. */
export type KnownName = (name: string) => 'reference' | 'interface' | undefined

const fence = /^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm

const example = /<example>[\s\S]*?<\/example>/g

/** The text with its fenced code blocks and `<example>` spans taken out: an example is not a load. */
export function withoutFences(text: string): string {
	return text.replace(/\r\n/g, '\n').replace(fence, '').replace(example, '')
}

/** A reference name as written in text: a bare name, or one qualified with its plugin as `<plugin>/<name>`. */
function isNameLike(value: string): boolean {
	const slash = value.indexOf('/')
	if (slash < 0) return namePattern.test(value)
	return namePattern.test(value.slice(0, slash)) && namePattern.test(value.slice(slash + 1))
}

/** Each distinct backticked span outside fenced code that reads as a reference name, in order. */
export function backtickedNames(text: string): string[] {
	const names = new Set<string>()
	for (const match of withoutFences(text).matchAll(/`([^`\n]+)`/g)) {
		const value = (match[1] as string).trim()
		if (isNameLike(value)) names.add(value)
	}
	return [...names]
}

function words(value: unknown): string[] {
	return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : []
}

/** The `SKILL.md` front matter, or `undefined` when it has none or it is not a YAML mapping. */
export function skillFrontmatter(raw: string): Record<string, unknown> | undefined {
	const match = frontmatterPattern.exec(raw.replace(/\r\n/g, '\n'))
	if (!match) return undefined
	try {
		const value: unknown = parse(match[1] as string)
		return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
	} catch {
		return undefined
	}
}

/**
 * The loads a skill declares under `metadata` in its front matter, or `undefined` when it declares none: neither
 * `metadata.references` nor `metadata.reference-interfaces` is set.
 */
export function declaredLoads(frontmatter: Record<string, unknown> | undefined): Loads | undefined {
	const metadata = frontmatter?.['metadata']
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined
	const record = metadata as Record<string, unknown>
	if (!(declaredReferencesKey in record) && !(declaredInterfacesKey in record)) return undefined
	return {
		names: [...new Set(words(record[declaredReferencesKey]))],
		interfaces: [...new Set(words(record[declaredInterfacesKey]))],
	}
}

/**
 * The loads read from a text that declares none. A backticked name counts when it is known where the text is
 * read: a reference, or an interface. A load line (`Load … with the reference skill`) counts too, so a load
 * of a name that resolves nowhere is still found; that line is English, and is read only while skills move
 * to the declared list.
 */
export function detectedLoads(text: string, known: KnownName): Loads {
	const plain = withoutFences(text)
	const phrase = loadsIn(plain)
	const names = new Set(phrase.names)
	const interfaces = new Set(phrase.interfaces)
	for (const name of backtickedNames(plain)) {
		if (names.has(name) || interfaces.has(name)) continue
		const kind = known(name)
		if (kind === 'reference') names.add(name)
		else if (kind === 'interface') interfaces.add(name)
	}
	return { names: [...names], interfaces: [...interfaces] }
}

/** A `known` that asks a resolver: a name is a reference when it resolves, an interface when `<name>.interface` does. */
export function knownBy(resolves: (name: string) => boolean): KnownName {
	const cache = new Map<string, ReturnType<KnownName>>()
	return (name) => {
		if (!cache.has(name))
			cache.set(
				name,
				resolves(name)
					? 'reference'
					: !name.endsWith(interfaceSuffix) && resolves(`${name}${interfaceSuffix}`)
						? 'interface'
						: undefined,
			)
		return cache.get(name)
	}
}

/** The `SKILL.md` of a folder or a file, when it is one: the declared list covers every file of its skill. */
export function skillEntry(folder: string): string | undefined {
	const file = join(folder, 'SKILL.md')
	return existsSync(file) ? file : undefined
}

/**
 * The loads of a skill, or of any text an agent reads: the declared list when its `SKILL.md` sets one, else
 * what `detectedLoads` reads from each text.
 */
export function consumerLoads(
	entry: string | undefined,
	texts: readonly string[],
	known: KnownName,
): Loads & { source: LoadSource } {
	const declared = entry ? declaredLoads(skillFrontmatter(readFileSync(entry, 'utf8'))) : undefined
	if (declared) return { ...declared, source: 'declared' }
	const names = new Set<string>()
	const interfaces = new Set<string>()
	for (const text of texts) {
		const found = detectedLoads(text, known)
		for (const name of found.names) names.add(name)
		for (const id of found.interfaces) interfaces.add(id)
	}
	return { names: [...names], interfaces: [...interfaces], source: 'detected' }
}
