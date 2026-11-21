import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consumerPaths } from './reference-consumer-files.js'
import type { ReferenceLayers } from './reference-layers.js'
import { resolveReference } from './resolve-reference.js'
import { withDefault } from './skill-defaults.js'

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

/** One reference name the text loads, and how it is answered here. */
export type ReferenceUse = {
	name: string
	/** True when a bundled default of the name ships beside the text, at `references/<name>.default.<format>`. */
	default: boolean
	status: string
	/** The tiers whose contribution is used, bottom first. */
	answeredBy: string[]
	/** True when nothing but the bundled default answers: shipping it changes nothing. */
	defaultAnswers: boolean
	/** The files whose load lines name it. */
	files: string[]
}

export type ReferenceUses = {
	loads?: ReferenceUse[]
	/** The interfaces whose implementations the text loads. */
	interfaces?: string[]
	/** The names loaded with no bundled default beside them. */
	gaps?: string[]
}

export type UsesOptions = {
	/** The files or folders to read. */
	paths: readonly string[]
	cwd: string
}

const dataFormats = ['md', 'json', 'yaml', 'yml', 'toml', 'txt']

function holdsDefault(folder: string, name: string): boolean {
	return dataFormats.some((format) => existsSync(join(folder, 'references', `${name}.default.${format}`)))
}

/**
 * The references the given text loads, with whether a bundled default ships beside it and which tier
 * answers each name here. Writes nothing.
 */
export function referenceUses(layers: ReferenceLayers, { paths, cwd }: UsesOptions): ReferenceUses {
	const loads: ReferenceUse[] = []
	const interfaces = new Set<string>()
	for (const consumer of consumerPaths(paths, cwd)) {
		const files = new Map<string, string[]>()
		for (const file of consumer.files) {
			const loaded = loadsIn(readFileSync(file.absolute, 'utf8'))
			for (const name of loaded.names) files.set(name, [...(files.get(name) ?? []), file.path])
			for (const id of loaded.interfaces) interfaces.add(id)
		}
		const loadLayers = withDefault(layers, consumer.base)
		for (const [name, from] of files) {
			const resolved = resolveReference(name, loadLayers)
			const answeredBy = resolved.trace.layers
				.filter(({ outcome }) => outcome === 'used')
				.map((layer) => (layer.tier === 'plugin' && layer.plugin ? `plugin ${layer.plugin}` : layer.tier))
			const hasDefault = holdsDefault(consumer.base, name)
			loads.push({
				name,
				default: hasDefault,
				status: resolved.status,
				answeredBy,
				defaultAnswers: hasDefault && answeredBy.length === 1 && answeredBy[0] === 'default',
				files: [...new Set(from)],
			})
		}
	}
	const gaps = loads.filter((load) => !load.default).map((load) => load.name)
	return {
		...(loads.length ? { loads } : {}),
		...(interfaces.size ? { interfaces: [...interfaces] } : {}),
		...(gaps.length ? { gaps } : {}),
	}
}
