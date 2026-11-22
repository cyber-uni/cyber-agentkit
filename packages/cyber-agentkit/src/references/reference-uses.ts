import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { consumerPaths } from './reference-consumer-files.js'
import type { ReferenceLayers } from './reference-layers.js'
import {
	backtickedNames,
	consumerLoads,
	knownBy,
	type LoadSource,
	loadsIn,
	skillEntry,
	withoutFences,
} from './reference-loads.js'
import { resolveReference } from './resolve-reference.js'
import { withDefault } from './skill-defaults.js'

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
	/** The files that name it, or the `SKILL.md` that declares it when no file names it. */
	files: string[]
	/** `declared` when a `SKILL.md` lists it under `metadata.references`; `detected` when read from the text. */
	source: LoadSource
}

export { loadsIn }

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
		const loadLayers = withDefault(layers, consumer.base)
		const known = knownBy((name) => resolveReference(name, loadLayers).status === 'found')
		const single = consumer.files.length === 1 && consumer.files[0]?.absolute === consumer.absolute
		const entry = single
			? basename(consumer.absolute) === 'SKILL.md'
				? consumer.absolute
				: undefined
			: skillEntry(consumer.base)
		const texts = consumer.files.map((file) => ({ file, text: readFileSync(file.absolute, 'utf8') }))
		const found = consumerLoads(
			entry,
			texts.map(({ text }) => text),
			known,
		)
		for (const id of found.interfaces) interfaces.add(id)
		const entryPath = entry ? consumer.files.find((file) => file.absolute === entry)?.path : undefined
		for (const name of found.names) {
			const from = texts
				.filter(({ text }) => backtickedNames(text).includes(name) || loadsIn(withoutFences(text)).names.includes(name))
				.map(({ file }) => file.path)
			if (!from.length && entryPath) from.push(entryPath)
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
				source: found.source,
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
