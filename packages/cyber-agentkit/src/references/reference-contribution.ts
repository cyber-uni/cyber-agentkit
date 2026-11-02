import { type Dirent, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasBody, type MergeOperation, parseDocument, readMergeOperation } from './reference-document.js'
import { dataExtensions, formatOfFile, type ReferenceFormat } from './reference-format.js'
import type { ReferenceLayer } from './reference-layers.js'
import { defaultSuffix, parseReferenceName } from './reference-name.js'
import { type ExtendsStep, readExtends } from './reference-stack.js'
import type { WarnFn } from './reference-warning.js'
import type { ReferenceTraceLayer } from './resolve-reference.js'

export type Contribution = {
	layer: ReferenceLayer
	entry: ReferenceTraceLayer
	label: string
	path: string
	metadata: Record<string, unknown>
	body: string
	hasBody: boolean
	format: ReferenceFormat
	/** Read as written: a data file. It never merges or extends. */
	whole: boolean
	merge: MergeOperation | undefined
	/** Its own `extends`, when written and well formed. */
	steps: ExtendsStep[] | undefined
}

export function tryRead(path: string): string | undefined {
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return undefined
	}
}

/** The files that answer a name in a layer, in the order they answer. */
export function candidateFiles(layer: Pick<ReferenceLayer, 'tier'>, name: string): string[] {
	return layer.tier === 'default'
		? [`${name}${defaultSuffix}.md`, ...dataExtensions.map(({ extension }) => `${name}${defaultSuffix}${extension}`)]
		: [`${name}.md`, `${name}/README.md`, ...dataExtensions.map(({ extension }) => `${name}${extension}`)]
}

export function contributionLabel(layer: ReferenceLayer, path: string, display: (path: string) => string): string {
	if (layer.tier === 'plugin') return `plugin ${layer.plugin}`
	if (layer.tier === 'default') return `default of ${layer.skill}`
	return `${layer.tier} ${display(path)}`
}

type ReadContext = {
	display: (path: string) => string
	without: string | undefined
	warnAt: (where: string) => WarnFn
}

export function readContribution(
	layer: ReferenceLayer,
	name: string,
	entry: ReferenceTraceLayer,
	{ display, without, warnAt }: ReadContext,
): Contribution | undefined {
	if (layer.tier !== 'default') {
		const stray = join(layer.dir, `${name}${defaultSuffix}.md`)
		if (stray !== without && tryRead(stray) !== undefined) {
			warnAt(display(stray))('default-in-tier', "it is ignored: a default goes in a skill's references/ folder")
		}
	}
	const hits = candidateFiles(layer, name).flatMap((file) => {
		const path = join(layer.dir, file)
		const raw = path === without ? undefined : tryRead(path)
		return raw === undefined ? [] : [{ file, path, raw }]
	})
	const [hit, ...ignored] = hits
	if (!hit) return undefined
	for (const other of ignored) {
		warnAt(display(other.path))('file-ignored', `it is ignored: ${hit.file} answers first in that folder`)
	}
	const label = contributionLabel(layer, hit.path, display)
	const warn = warnAt(label)
	const format = formatOfFile(hit.file)
	if (format !== 'markdown') {
		Object.assign(entry, { path: hit.path, file: hit.file, outcome: '' })
		const held = hit.raw.trim().length > 0
		if (!held) entry.empty = true
		return {
			layer,
			entry,
			label,
			path: hit.path,
			metadata: {},
			body: hit.raw,
			hasBody: held,
			whole: true,
			format,
			merge: 'replace',
			steps: undefined,
		}
	}
	const { metadata, body } = parseDocument(hit.raw, warn)
	const merge = readMergeOperation(metadata, warn)
	const steps = readExtends(metadata['extends'], warn)
	Object.assign(entry, { path: hit.path, file: hit.file, frontmatter: metadata, outcome: '' })
	if (typeof metadata['description'] === 'string') entry.description = metadata['description']
	const bodyHeld = hasBody(body)
	if (!bodyHeld) entry.empty = true
	if (steps && !bodyHeld && merge !== 'remove') entry.selection = true
	return { layer, entry, label, path: hit.path, metadata, body, hasBody: bodyHeld, format, whole: false, merge, steps }
}

/** Every name a layer holds; empty for a layer that is missing, unreadable, or skipped. */
export function layerNames(layer: Pick<ReferenceLayer, 'tier' | 'dir' | 'skipped'>): string[] {
	if (layer.skipped) return []
	let entries: Dirent[]
	try {
		entries = readdirSync(layer.dir, { withFileTypes: true })
	} catch {
		return []
	}
	const names = new Set<string>()
	const isDefault = layer.tier === 'default'
	for (const entry of entries) {
		let name: string | undefined
		if (isDefault) {
			const suffix = [`${defaultSuffix}.md`, ...dataExtensions.map((item) => `${defaultSuffix}${item.extension}`)].find(
				(item) => entry.name.endsWith(item),
			)
			if (suffix) name = entry.name.slice(0, -suffix.length)
		} else if (
			!entry.isDirectory() &&
			['.md', ...dataExtensions.map((item) => item.extension)].some((extension) => entry.name.endsWith(extension))
		) {
			name = entry.name.slice(0, entry.name.lastIndexOf('.'))
		} else if (!entry.isFile() && tryRead(join(layer.dir, entry.name, 'README.md')) !== undefined) {
			name = entry.name
		}
		if (name === undefined || parseReferenceName(name).invalid) continue
		names.add(name)
	}
	return [...names]
}
